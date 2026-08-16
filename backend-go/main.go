// Command backend-go is the PocketBase implementation of the Onam treasure
// hunt backend - a straight port of the Django/DRF service in ../../onam-treasure-hunt,
// built so the same React frontend can be pointed at either one and the two
// compared.
//
// Auth, the realtime team feed and the admin UI come from PocketBase itself;
// this binary adds the game rules (see game.go) and the endpoints the frontend
// calls (see api.go).
package main

import (
	"log"
	"os"
	"strconv"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "treasurehunt/backend-go/migrations"
)

type settings struct {
	createTeams   bool
	teamCount     int
	maxTeamHealth int
}

// config mirrors the CREATE_TEAM/TEAM_COUNT/MAX_TEAM_HEALTH settings of the
// Django backend.
var config = settings{
	createTeams:   envBool("CREATE_TEAM", true),
	teamCount:     envInt("TEAM_COUNT", 3),
	maxTeamHealth: envInt("MAX_TEAM_HEALTH", 5),
}

func envInt(key string, fallback int) int {
	if raw := os.Getenv(key); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil {
			return value
		}
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if raw := os.Getenv(key); raw != "" {
		if value, err := strconv.ParseBool(raw); err == nil {
			return value
		}
	}
	return fallback
}

func main() {
	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		TemplateLang: migratecmd.TemplateLangGo,
		// The schema is hand-written in ./migrations; automigrate would fight
		// with it every time a collection is touched in the admin UI.
		Automigrate: false,
	})

	registerHooks(app)
	registerImportCommands(app)

	app.OnServe().BindFunc(registerRoutes)

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
