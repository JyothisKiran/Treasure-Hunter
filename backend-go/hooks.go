package main

import (
	"sort"
	"strconv"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Team roster management, ported from the Django UserManager/receivers:
// signing up drops you into a team, and a team can only have one captain.

// assignTeamOnSignup mirrors Django's `teams[user.id % team_count]`: players are
// dealt round-robin into the teams in creation order, which are themselves
// created lazily on the first signup.
//
// It runs *after* the insert because the integer `uid` is the row's SQLite
// rowid - taking it from the database instead of a MAX(uid)+1 read makes
// concurrent signups safe to hand out ids for.
func assignTeamOnSignup(app core.App, record *core.Record) error {
	if record.GetInt("uid") != 0 {
		return nil
	}

	var uid int
	err := app.DB().
		NewQuery("SELECT rowid FROM users WHERE id = {:id}").
		Bind(dbx.Params{"id": record.Id}).
		Row(&uid)
	if err != nil {
		return err
	}
	record.Set("uid", uid)

	teams, err := ensureTeams(app)
	if err != nil {
		return err
	}
	if len(teams) > 0 {
		record.Set("team", teams[uid%len(teams)].Id)
	}

	return app.Save(record)
}

// ensureTeams returns the teams in id order, creating the configured number of
// them the first time anyone signs up.
func ensureTeams(app core.App) ([]*core.Record, error) {
	teams, err := app.FindAllRecords("teams")
	if err != nil {
		return nil, err
	}

	if len(teams) == 0 && config.createTeams {
		collection, err := app.FindCollectionByNameOrId("teams")
		if err != nil {
			return nil, err
		}
		for i := 1; i <= config.teamCount; i++ {
			team := core.NewRecord(collection)
			team.Id = strconv.Itoa(i)
			team.Set("name", "Team "+strconv.Itoa(i))
			team.Set("life", config.maxTeamHealth)
			if err := app.Save(team); err != nil {
				return nil, err
			}
			teams = append(teams, team)
		}
	}

	sort.Slice(teams, func(i, j int) bool { return intID(teams[i].Id) < intID(teams[j].Id) })

	return teams, nil
}

// demoteOtherCaptains keeps at most one captain per team.
func demoteOtherCaptains(app core.App, record *core.Record) error {
	teamID := record.GetString("team")
	if teamID == "" || !record.GetBool("is_captain") {
		return nil
	}

	others, err := app.FindRecordsByFilter(
		"users",
		"team = {:team} && is_captain = true && id != {:id}",
		"", 0, 0,
		dbx.Params{"team": teamID, "id": record.Id},
	)
	if err != nil {
		return err
	}

	for _, other := range others {
		other.Set("is_captain", false)
		if err := app.Save(other); err != nil {
			return err
		}
	}

	return nil
}

func registerHooks(app core.App) {
	app.OnRecordAfterCreateSuccess("users").BindFunc(func(e *core.RecordEvent) error {
		if err := assignTeamOnSignup(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordAfterUpdateSuccess("users").BindFunc(func(e *core.RecordEvent) error {
		if err := demoteOtherCaptains(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})
}
