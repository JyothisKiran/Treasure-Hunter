package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// The game endpoints. Auth (login/signup/refresh) and the realtime team feed
// are PocketBase's own APIs and need no routes here:
//
//	POST /api/collections/users/auth-with-password
//	POST /api/collections/users/records          (signup)
//	POST /api/collections/users/auth-refresh
//	GET  /api/realtime                           (team life/score/attack push)
func registerRoutes(e *core.ServeEvent) error {
	auth := apis.RequireAuth("users")

	e.Router.GET("/api/me", handleMe).Bind(auth)
	e.Router.GET("/api/nodes/current", handleCurrentNode).Bind(auth)
	e.Router.GET("/api/nodes/visited", handleVisitedNodes).Bind(auth)
	e.Router.GET("/api/nodes/target-teams", handleTargetTeams).Bind(auth)
	e.Router.POST("/api/nodes/target-attack", handleTargetAttack).Bind(auth)
	e.Router.POST("/api/nodes/{id}/submit", handleSubmit).Bind(auth)

	// The built frontend, when there is one (see `npm run deploy`). The catch-all
	// is matched only after the /api routes above and PocketBase's own, and the
	// index fallback is what makes the client-side router's pretty URLs survive
	// a page reload.
	if publicDir := publicDir(); publicDir != "" {
		e.Router.GET("/{path...}", apis.Static(os.DirFS(publicDir), true))
	}

	return e.Next()
}

// publicDir locates the static frontend next to the binary, mirroring where
// PocketBase's own prebuilt executable looks. Returns "" when the directory is
// absent, so an API-only run (`go run .`, dev mode) stays unaffected.
func publicDir() string {
	dir := "./pb_public"
	// Under `go run` the binary lives in a temp dir; fall back to the cwd.
	if !strings.HasPrefix(os.Args[0], os.TempDir()) {
		dir = filepath.Join(filepath.Dir(os.Args[0]), "pb_public")
	}

	if stat, err := os.Stat(dir); err != nil || !stat.IsDir() {
		return ""
	}

	return dir
}

// handleMe returns the caller plus their team, the shape the frontend's `me`
// query expects (Djoser's /auth/users/me/ with the nested team serializer).
func handleMe(e *core.RequestEvent) error {
	team, err := teamOf(e.App, e.Auth)
	if err != nil {
		return err
	}

	body := meJSON{ID: e.Auth.GetInt("uid"), Email: e.Auth.Email()}
	if team != nil {
		payload, err := serializeTeam(e.App, team)
		if err != nil {
			return err
		}
		body.Team = &payload
	}

	return e.JSON(200, body)
}

func handleCurrentNode(e *core.RequestEvent) error {
	team, err := teamOf(e.App, e.Auth)
	if err != nil {
		return err
	}
	if team == nil {
		return e.JSON(400, detailJSON{Detail: "User is not part of any team."})
	}

	currentID := team.GetString("current_node")
	if currentID == "" {
		return e.JSON(400, detailJSON{Detail: "Game not started yet."})
	}

	node, err := e.App.FindRecordById("nodes", currentID)
	if err != nil {
		return err
	}

	serializer := newNodeSerializer(e.App, team)

	return e.JSON(200, detailJSON{
		Detail: "Details fetched successfully",
		Data:   serializer.serialize(node),
	})
}

// handleVisitedNodes returns the team's trail: starting at the head (or at the
// junction branch named by ?path=), walking next_node through the nodes the
// team has actually visited, and stopping at the next junction so the map shows
// one branch at a time.
func handleVisitedNodes(e *core.RequestEvent) error {
	team, err := teamOf(e.App, e.Auth)
	if err != nil {
		return err
	}
	if team == nil {
		return e.JSON(400, detailJSON{Detail: "User is not part of any team."})
	}

	teamNodes, err := e.App.FindRecordsByFilter(
		"team_nodes", "team = {:team}", "created", 0, 0, dbx.Params{"team": team.Id},
	)
	if err != nil {
		return err
	}
	if len(teamNodes) == 0 {
		return e.JSON(200, []nodeJSON{})
	}

	visitedAt := make(map[string]types.DateTime, len(teamNodes))
	ids := make([]string, 0, len(teamNodes))
	for _, teamNode := range teamNodes {
		nodeID := teamNode.GetString("node")
		visitedAt[nodeID] = teamNode.GetDateTime("created")
		ids = append(ids, nodeID)
	}

	nodes, err := e.App.FindRecordsByIds("nodes", ids)
	if err != nil {
		return err
	}
	visited := make(map[string]*core.Record, len(nodes))
	for _, node := range nodes {
		visited[node.Id] = node
	}

	var start *core.Record
	if path := e.Request.URL.Query().Get("path"); path != "" {
		start = visited[path]
		if start == nil {
			return e.JSON(404, detailJSON{Detail: "Path node not found in visited nodes."})
		}
	} else {
		start = visited[team.GetString("head")]
		if start == nil {
			// No head yet (or its visit row is gone): fall back to whatever the
			// team reached first.
			start = visited[teamNodes[0].GetString("node")]
		}
	}
	if start == nil {
		return e.JSON(200, []nodeJSON{})
	}

	serializer := newNodeSerializer(e.App, team)
	serializer.visitedAt = visitedAt
	if currentAt, ok := visitedAt[team.GetString("current_node")]; ok {
		serializer.currentVisitedAt = &currentAt
	}

	body := []nodeJSON{}
	seen := map[string]bool{}
	for current := start; current != nil && !seen[current.Id]; {
		seen[current.Id] = true
		body = append(body, serializer.serialize(current))

		if current.GetString("effects") == effectsJunction {
			break
		}
		current = visited[current.GetString("next_node")]
	}

	return e.JSON(200, body)
}

func handleTargetTeams(e *core.RequestEvent) error {
	team, err := teamOf(e.App, e.Auth)
	if err != nil {
		return err
	}
	if team == nil {
		return e.JSON(400, detailJSON{Detail: "User is not part of any team."})
	}

	teams, err := e.App.FindAllRecords("teams",
		dbx.NewExp("id != {:id}", dbx.Params{"id": team.Id}),
		dbx.NewExp("life > 0"),
	)
	if err != nil {
		return err
	}
	sort.Slice(teams, func(i, j int) bool { return intID(teams[i].Id) < intID(teams[j].Id) })

	data := make([]basicTeamJSON, 0, len(teams))
	for _, target := range teams {
		data = append(data, serializeBasicTeam(target))
	}

	return e.JSON(200, detailJSON{Detail: "Details fetched successfully", Data: data})
}

type targetAttackRequest struct {
	TargetTeam  int `json:"target_team"`
	AttackValue int `json:"attack_value"`
}

func handleTargetAttack(e *core.RequestEvent) error {
	payload := targetAttackRequest{}
	if err := e.BindBody(&payload); err != nil {
		return e.JSON(400, detailJSON{Detail: "Invalid request body."})
	}
	if payload.TargetTeam <= 0 {
		return e.JSON(400, detailJSON{Detail: "A target team is required."})
	}
	if payload.AttackValue < 1 {
		return e.JSON(400, detailJSON{Detail: "Attack value must be at least 1."})
	}

	team, err := teamOf(e.App, e.Auth)
	if err != nil {
		return err
	}
	if team == nil {
		return e.JSON(400, detailJSON{Detail: "User is not part of any team."})
	}

	var status int
	var body any
	err = e.App.RunInTransaction(func(tx core.App) error {
		attacking, err := tx.FindRecordById("teams", team.Id)
		if err != nil {
			return err
		}
		status, body, err = targetAttack(tx, attacking, intToID(payload.TargetTeam), payload.AttackValue)
		return err
	})
	if err != nil {
		return err
	}

	return e.JSON(status, body)
}

func handleSubmit(e *core.RequestEvent) error {
	var status int
	var body any

	// One transaction for the whole move: a wrong answer costs a life *and*
	// rewinds to the checkpoint, and a correct one hands out pickups that are
	// only ever awarded once - neither can be left half-applied.
	err := e.App.RunInTransaction(func(tx core.App) error {
		var err error
		status, body, err = processSubmit(tx, e.Auth, e.Request.PathValue("id"))
		return err
	})
	if err != nil {
		return err
	}

	return e.JSON(status, body)
}
