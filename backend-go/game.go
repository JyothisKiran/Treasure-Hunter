package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"maps"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Game rules ported from the Django backend's users/services.py. The response
// bodies (and their exact wording) are part of the contract: the frontend keys
// off substrings of `detail` to decide which result screen to show.

// setLastEvent stamps a message onto a team so that PocketBase's realtime feed
// carries it out with the record update the caller is about to save.
//
// `seq` increments on every event: an update to any other field (a score change
// on submit, say) re-broadcasts the whole record including a stale last_event,
// and the sequence number is how a subscriber tells a fresh notification from
// one it has already shown.
func setLastEvent(team *core.Record, kind string, data map[string]any) {
	seq := 0
	if previous, ok := team.Get("last_event").(types.JSONRaw); ok && len(previous) > 0 {
		var decoded struct {
			Seq int `json:"seq"`
		}
		if json.Unmarshal(previous, &decoded) == nil {
			seq = decoded.Seq
		}
	}

	event := map[string]any{"seq": seq + 1, "kind": kind}
	maps.Copy(event, data)
	team.Set("last_event", event)
}

func teamOf(app core.App, user *core.Record) (*core.Record, error) {
	teamID := user.GetString("team")
	if teamID == "" {
		return nil, nil
	}

	team, err := app.FindRecordById("teams", teamID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return team, nil
}

// recordVisit is the get_or_create of the Django TeamNode table.
func recordVisit(app core.App, teamID, nodeID string) error {
	visited, err := hasVisited(app, teamID, nodeID)
	if err != nil || visited {
		return err
	}

	collection, err := app.FindCollectionByNameOrId("team_nodes")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("team", teamID)
	record.Set("node", nodeID)

	return app.Save(record)
}

func hasVisited(app core.App, teamID, nodeID string) (bool, error) {
	count, err := app.CountRecords("team_nodes", dbx.HashExp{"team": teamID, "node": nodeID})
	return count > 0, err
}

func recordHistory(app core.App, teamID, nodeID, action string) error {
	collection, err := app.FindCollectionByNameOrId("game_history")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("team", teamID)
	record.Set("node", nodeID)
	record.Set("action", action)

	return app.Save(record)
}

// processSubmit handles a scanned QR code (or a picked junction branch) and
// returns the HTTP status plus the body to send back.
func processSubmit(app core.App, user *core.Record, nodeID string) (int, any, error) {
	node, err := app.FindRecordById("nodes", nodeID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 404, detailJSON{Detail: "Node not found."}, nil
		}
		return 0, nil, err
	}

	team, err := teamOf(app, user)
	if err != nil {
		return 0, nil, err
	}
	if team == nil {
		return 400, detailJSON{Detail: "User is not part of any team."}, nil
	}

	if team.GetInt("life") <= 0 {
		return 400, detailJSON{Detail: "Game Over! Your team has no lives left."}, nil
	}

	serializer := newNodeSerializer(app, team)
	currentID := team.GetString("current_node")

	// First scan of the game: wherever the team started becomes its head.
	if currentID == "" {
		if node.GetString("effects") == effectsJunction {
			return 400, detailJSON{Detail: "You cannot start with a junction node."}, nil
		}

		team.Set("current_node", node.Id)
		team.Set("head", node.Id)
		team.Set("last_checkpoint", node.Id)
		if err := app.Save(team); err != nil {
			return 0, nil, err
		}
		if err := recordVisit(app, team.Id, node.Id); err != nil {
			return 0, nil, err
		}
		if err := recordHistory(app, team.Id, node.Id, "Started game"); err != nil {
			return 0, nil, err
		}

		return 200, detailJSON{Detail: "Game started successfully.", Data: serializer.serialize(node)}, nil
	}

	if currentID == node.Id {
		return 400, detailJSON{
			Detail: "You’ve already submitted this answer. Please choose another one.",
		}, nil
	}

	current, err := app.FindRecordById("nodes", currentID)
	if err != nil {
		return 0, nil, err
	}
	serializer.put(current)

	// Wrong answer: lose a life and fall back to the last checkpoint.
	if node.Id != current.GetString("next_node") && node.Id != current.GetString("alt_next_node") {
		life := team.GetInt("life") - 1
		if life < 0 {
			life = 0
		}
		team.Set("life", life)
		team.Set("current_node", team.GetString("last_checkpoint"))
		if err := app.Save(team); err != nil {
			return 0, nil, err
		}
		if err := recordHistory(app, team.Id, current.Id, "Answered incorrectly"); err != nil {
			return 0, nil, err
		}

		return 400, detailJSON{Detail: "Wrong answer"}, nil
	}

	// Correct answer.
	team.Set("current_node", node.Id)
	if node.GetString("effects") == effectsJunction {
		team.Set("last_checkpoint", node.Id)
	}

	visited, err := hasVisited(app, team.Id, node.Id)
	if err != nil {
		return 0, nil, err
	}
	isHead := team.GetString("head") == node.Id

	// Rewards are only handed out the first time a node is reached (the head is
	// the exception: reaching it again closes the loop and wins the game).
	alreadyVisited := visited && !isHead
	if !alreadyVisited {
		team.Set("score", team.GetInt("score")+node.GetInt("score"))

		// Attack/bonus/life pickups are one-shot for the *whole game*: the first
		// team to reach the node takes them and the node is emptied.
		nodeDirty := false
		if bounty := node.GetInt("attack"); bounty > 0 {
			team.Set("attack", team.GetInt("attack")+bounty)
			node.Set("attack", 0)
			nodeDirty = true
		}
		if bounty := node.GetInt("bonus"); bounty > 0 {
			team.Set("score", team.GetInt("score")+bounty)
			node.Set("bonus", 0)
			nodeDirty = true
		}
		if bounty := node.GetInt("life"); bounty > 0 {
			team.Set("life", team.GetInt("life")+bounty)
			node.Set("life", 0)
			nodeDirty = true
		}
		if nodeDirty {
			if err := app.Save(node); err != nil {
				return 0, nil, err
			}
		}
	}

	if err := app.Save(team); err != nil {
		return 0, nil, err
	}
	if err := recordVisit(app, team.Id, node.Id); err != nil {
		return 0, nil, err
	}
	if err := recordHistory(app, team.Id, node.Id, "Answered correctly"); err != nil {
		return 0, nil, err
	}

	// Win condition: the trail loops back around to the node the team started on.
	if current.GetString("next_node") == node.Id && isHead {
		team.Set("is_won", true)
		if err := app.Save(team); err != nil {
			return 0, nil, err
		}
		payload, err := serializeTeam(app, team)
		if err != nil {
			return 0, nil, err
		}
		return 200, detailJSON{Detail: "You Win!", Data: payload}, nil
	}

	data := serializer.serialize(node)
	if alreadyVisited {
		data.Score = 0
	}

	return 200, detailJSON{Detail: "Correct answer", Data: data}, nil
}

// targetAttack spends the attacking team's attack points to drain another
// team's life. Both teams get a last_event stamped on them, which PocketBase's
// realtime feed delivers to whoever is subscribed - that is how the defenders
// see their life drop without polling.
func targetAttack(app core.App, attacking *core.Record, targetTeamID string, attackValue int) (int, any, error) {
	target, err := app.FindRecordById("teams", targetTeamID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 400, detailJSON{
				Detail: "Target team does not exist.",
				Data:   map[string]any{"target_team_id": intID(targetTeamID)},
			}, nil
		}
		return 0, nil, err
	}

	if attacking.Id == target.Id {
		return 400, detailJSON{
			Detail: "You cannot attack your own team.",
			Data:   map[string]any{"target_team": target.GetString("name")},
		}, nil
	}

	if attacking.GetInt("attack") < attackValue {
		return 400, detailJSON{
			Detail: "Not enough attack points to perform this attack.",
			Data:   map[string]any{"available_attack_points": attacking.GetInt("attack")},
		}, nil
	}

	life := target.GetInt("life") - attackValue
	if life < 0 {
		life = 0
	}
	target.Set("life", life)
	setLastEvent(target, "team_attacked", map[string]any{
		"attacked_by": attacking.GetString("name"),
		"damage":      attackValue,
		"detail": fmt.Sprintf(
			"%s attacked you for %d life points.", attacking.GetString("name"), attackValue,
		),
	})
	if err := app.Save(target); err != nil {
		return 0, nil, err
	}

	attacking.Set("attack", attacking.GetInt("attack")-attackValue)
	setLastEvent(attacking, "team_update", map[string]any{
		"detail": fmt.Sprintf(
			"You attacked %s for %d life points.", target.GetString("name"), attackValue,
		),
	})
	if err := app.Save(attacking); err != nil {
		return 0, nil, err
	}

	action := fmt.Sprintf("Attacked %s for %d life points", target.GetString("name"), attackValue)
	if err := recordHistory(app, attacking.Id, attacking.GetString("current_node"), action); err != nil {
		return 0, nil, err
	}

	body := detailJSON{
		Detail: fmt.Sprintf("Successfully attacked %s for %d life points.", target.GetString("name"), attackValue),
		Data: map[string]any{
			"target_team":    target.GetString("name"),
			"remaining_life": target.GetInt("life"),
		},
	}

	return 200, body, nil
}
