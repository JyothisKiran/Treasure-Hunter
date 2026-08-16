// Package migrations holds the PocketBase schema for the treasure hunt.
//
// The collections mirror the Django models one-for-one (users/models.py in the
// original backend) so the two implementations can be benchmarked against the
// same frontend and the same game data.
package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// The QR codes printed for the hunt encode the *integer* node ids from the
// Django database, and the frontend posts whatever it scanned straight to
// /api/nodes/{id}/submit. So node (and team) record ids have to stay numeric
// instead of PocketBase's usual random 15-char strings.
func numericIds(c *core.Collection) {
	field, _ := c.Fields.GetByName(core.FieldNameId).(*core.TextField)
	if field == nil {
		return
	}
	field.Min = 1
	field.Max = 15
	field.Pattern = `^[0-9]+$`
	field.AutogeneratePattern = `[1-9][0-9]{14}`
}

func init() {
	core.AppMigrations.Register(up, down)
}

func up(app core.App) error {
	nodes := core.NewBaseCollection("nodes")
	numericIds(nodes)
	nodes.Fields.Add(
		&core.TextField{Name: "data", Max: 100000},
		&core.TextField{Name: "answer", Max: 5000},
		&core.TextField{Name: "alt_answer", Max: 5000},
		&core.TextField{Name: "clue", Max: 100000},
		&core.SelectField{Name: "effects", MaxSelect: 1, Values: []string{"UNLOCKED", "JUNCTION"}},
		&core.NumberField{Name: "score", OnlyInt: true},
		&core.NumberField{Name: "bonus", OnlyInt: true},
		&core.NumberField{Name: "attack", OnlyInt: true},
		&core.NumberField{Name: "life", OnlyInt: true},
		&core.BoolField{Name: "is_nearest"},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	if err := app.Save(nodes); err != nil {
		return err
	}

	// next_node/alt_next_node are self-relations, so they can only be wired up
	// once the collection exists and has an id to point at.
	nodes.Fields.Add(
		&core.RelationField{Name: "next_node", CollectionId: nodes.Id, MaxSelect: 1},
		&core.RelationField{Name: "alt_next_node", CollectionId: nodes.Id, MaxSelect: 1},
	)
	if err := app.Save(nodes); err != nil {
		return err
	}

	teams := core.NewBaseCollection("teams")
	numericIds(teams)
	teams.Fields.Add(
		&core.TextField{Name: "name", Max: 100, Required: true},
		&core.NumberField{Name: "life", OnlyInt: true},
		&core.NumberField{Name: "score", OnlyInt: true},
		&core.NumberField{Name: "attack", OnlyInt: true},
		&core.BoolField{Name: "is_won"},
		&core.RelationField{Name: "head", CollectionId: nodes.Id, MaxSelect: 1},
		&core.RelationField{Name: "current_node", CollectionId: nodes.Id, MaxSelect: 1},
		&core.RelationField{Name: "last_checkpoint", CollectionId: nodes.Id, MaxSelect: 1},
		// Carries the human-readable message for the last thing that happened
		// to this team ({seq, kind, detail, attacked_by, damage}). Life/score
		// are on the record already, so a realtime subscriber gets the numbers
		// for free; this is what lets it also raise the "you were attacked"
		// toast without a second channel.
		&core.JSONField{Name: "last_event", MaxSize: 5000},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	// Readable only by its own members. This is also what scopes PocketBase's
	// built-in realtime feed: a client subscribing to the whole `teams`
	// collection is only ever delivered its own team's changes.
	teams.ViewRule = types.Pointer("@request.auth.team = id")
	teams.ListRule = types.Pointer("@request.auth.team = id")
	if err := app.Save(teams); err != nil {
		return err
	}

	// The Django TeamNode join table: which nodes a team has already visited,
	// and when. The timestamps drive the completed/locked status in the UI.
	teamNodes := core.NewBaseCollection("team_nodes")
	teamNodes.Fields.Add(
		&core.RelationField{Name: "team", CollectionId: teams.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "node", CollectionId: nodes.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.AutodateField{Name: "created", OnCreate: true},
	)
	teamNodes.AddIndex("idx_team_nodes_unique", true, "team, node", "")
	teamNodes.AddIndex("idx_team_nodes_team", false, "team", "")
	if err := app.Save(teamNodes); err != nil {
		return err
	}

	history := core.NewBaseCollection("game_history")
	history.Fields.Add(
		&core.RelationField{Name: "team", CollectionId: teams.Id, MaxSelect: 1, CascadeDelete: true},
		&core.RelationField{Name: "node", CollectionId: nodes.Id, MaxSelect: 1, CascadeDelete: true},
		&core.TextField{Name: "action", Max: 5000},
		&core.AutodateField{Name: "created", OnCreate: true},
	)
	history.AddIndex("idx_game_history_team", false, "team", "")
	if err := app.Save(history); err != nil {
		return err
	}

	// Extend the stock `users` auth collection rather than rolling our own, so
	// login/signup/refresh keep using PocketBase's built-in auth endpoints.
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	users.Fields.Add(
		// Django exposed integer user ids; `uid` reproduces them (and drives
		// the round-robin team assignment, which was `user.id % team_count`).
		&core.NumberField{Name: "uid", OnlyInt: true},
		&core.RelationField{Name: "team", CollectionId: teams.Id, MaxSelect: 1},
		&core.BoolField{Name: "is_captain"},
	)
	users.AddIndex("idx_users_uid", true, "uid", "")

	return app.Save(users)
}

func down(app core.App) error {
	users, err := app.FindCollectionByNameOrId("users")
	if err == nil {
		users.Fields.RemoveByName("uid")
		users.Fields.RemoveByName("team")
		users.Fields.RemoveByName("is_captain")
		users.RemoveIndex("idx_users_uid")
		if err := app.Save(users); err != nil {
			return err
		}
	}

	for _, name := range []string{"game_history", "team_nodes", "teams", "nodes"} {
		collection, err := app.FindCollectionByNameOrId(name)
		if err != nil {
			continue
		}
		if err := app.Delete(collection); err != nil {
			return err
		}
	}

	return nil
}
