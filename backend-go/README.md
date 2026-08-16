# backend-go

The treasure hunt backend on PocketBase + Go — a port of the Django/DRF service
in `../../onam-treasure-hunt/backend`, built so the same frontend can be pointed
at either one and the two compared.

PocketBase supplies auth, the realtime feed, the admin UI and the SQLite layer.
This binary adds the game rules and the endpoints the frontend calls.

## Run

`npm run dev` in the repo root starts this alongside the frontend and stops both
together. On its own:

```sh
go run . serve --http=127.0.0.1:8090      # migrations are applied on startup
go run . superuser upsert admin@example.com <password>   # admin UI at /_/
```

Seed the node graph — the printed QR codes encode the node ids, so the graph has
to come over unchanged rather than be regenerated:

```sh
go run . import-django ../../onam-treasure-hunt/backend/db.sqlite3
# or, from the mapped-questions CSV (no clues/pickups in that format):
go run . import-csv "../../onam-treasure-hunt/backend/mapped question.csv"
```

Teams are created on the first signup, as in Django. `CREATE_TEAM`, `TEAM_COUNT`
and `MAX_TEAM_HEALTH` are read from the environment (defaults `true`, `3`, `5`).

For a benchmark, build first — `go run` puts PocketBase in dev mode, which logs
every SQL statement:

```sh
go build -o pb . && ./pb serve --http=127.0.0.1:8090
```

## API

Auth and realtime are PocketBase's own endpoints:

| | |
|---|---|
| `POST /api/collections/users/auth-with-password` | login → `{token, record}` |
| `POST /api/collections/users/records` | signup (`email`, `password`, `passwordConfirm`) |
| `POST /api/collections/users/auth-refresh` | renew the token in place |
| `GET /api/realtime` | live team state (see below) |

The game routes are defined in [api.go](api.go) and answer with the same bodies
the Django backend did, down to the wording of `detail` (the frontend keys off
it to pick a result screen):

| | |
|---|---|
| `GET /api/me` | caller + their team, with members |
| `POST /api/nodes/{id}/submit` | scan a QR code / pick a junction branch |
| `GET /api/nodes/current` | the node the team is standing on |
| `GET /api/nodes/visited?path=` | the team's trail, one branch at a time |
| `GET /api/nodes/target-teams` | teams that can be attacked |
| `POST /api/nodes/target-attack` | spend attack points to drain a team's life |

## Realtime

Django needed a hand-rolled SSE endpoint plus single-use tickets to keep the JWT
out of the stream URL. PocketBase already has all of that, so instead:

- the `teams` collection has a view rule of `@request.auth.team = id`, so a
  client subscribing to the whole collection is only ever sent its own team;
- life/score/attack ride along on the record itself;
- an attack also stamps `last_event` (`{seq, kind, detail, attacked_by, damage}`)
  onto both teams, which is what raises the "you were attacked" toast.

`seq` matters because *any* write to a team re-broadcasts the whole record: a
notification is only new when the sequence number advances.

## Layout

| | |
|---|---|
| [`migrations/`](migrations) | collection schema (`nodes`, `teams`, `team_nodes`, `game_history`, extra `users` fields) |
| [`game.go`](game.go) | the rules — port of Django's `users/services.py` |
| [`api.go`](api.go) | the game routes |
| [`serialize.go`](serialize.go) | JSON shapes, from Django's `users/serializers.py` |
| [`hooks.go`](hooks.go) | team assignment on signup, one captain per team |
| [`importer.go`](importer.go) | the `import-django` / `import-csv` commands |

## Differences from the Django backend

- Node and team ids stay integers (record ids are numeric strings) because the
  printed QR codes encode them. User ids are the `uid` field.
- Endpoints the frontend never calls were not ported: the `qr_generator` PDF/CSV
  generators, `GET /nodes/{id}`, and the rest of the Djoser account routes
  (password reset, email change) — PocketBase provides equivalents for the
  latter if they are ever needed.
- Submitting an unknown node id answers `404 {"detail": "Node not found."}`
  where Django raised `Node.DoesNotExist` and returned a 500.
- A `?path=` that is not a visited node is always `404`; Django distinguished a
  non-integer value with a `400 Invalid path parameter.`
