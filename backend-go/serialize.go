package main

import (
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// JSON shapes reproduced from the Django serializers (users/serializers.py) so
// the frontend sees byte-identical payloads from either backend.

const (
	effectsJunction = "JUNCTION"
	effectsUnlocked = "UNLOCKED"

	statusCompleted  = "completed"
	statusInProgress = "in-progress"
	statusLocked     = "locked"
)

type answerJSON struct {
	ID        int    `json:"id"`
	Answer    string `json:"answer"`
	IsNearest bool   `json:"is_nearest"`
}

type nodeJSON struct {
	ID            int          `json:"id"`
	Data          string       `json:"data"`
	Clue          string       `json:"clue"`
	EncodedAnswer string       `json:"encoded_answer"`
	Answers       []answerJSON `json:"answers"`
	Effects       string       `json:"effects"`
	Score         int          `json:"score"`
	Bonus         int          `json:"bonus"`
	Life          int          `json:"life"`
	Attack        int          `json:"attack"`
	CreatedAt     string       `json:"created_at"`
	Status        string       `json:"status"`
}

type memberJSON struct {
	ID    int    `json:"id"`
	Email string `json:"email"`
}

// basicTeamJSON matches BasicTeamSerializer (no members).
type basicTeamJSON struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Score  int    `json:"score"`
	Life   int    `json:"life"`
	Attack int    `json:"attack"`
	IsWon  bool   `json:"is_won"`
}

// teamJSON matches TeamSerializer (with members).
type teamJSON struct {
	ID      int          `json:"id"`
	Name    string       `json:"name"`
	Score   int          `json:"score"`
	Life    int          `json:"life"`
	Attack  int          `json:"attack"`
	IsWon   bool         `json:"is_won"`
	Members []memberJSON `json:"members"`
}

type meJSON struct {
	ID    int       `json:"id"`
	Email string    `json:"email"`
	Team  *teamJSON `json:"team"`
}

// detailJSON matches SubmitResponseSerializer: `data` is omitted when unset,
// exactly like a DRF serializer with `required=False`.
type detailJSON struct {
	Detail string `json:"detail"`
	Data   any    `json:"data,omitempty"`
}

// intID converts a numeric record id back to the integer the frontend expects.
// Returns 0 for the ids PocketBase generated itself (shouldn't happen for
// nodes/teams, which are always seeded with numeric ids).
func intID(id string) int {
	n, err := strconv.Atoi(id)
	if err != nil {
		return 0
	}
	return n
}

// intToID is the inverse of intID: the frontend still speaks in integer team
// ids, which are the record ids here.
func intToID(id int) string {
	return strconv.Itoa(id)
}

func formatTime(dt types.DateTime) string {
	if dt.IsZero() {
		return ""
	}
	return dt.Time().UTC().Format(time.RFC3339Nano)
}

// encodeAnswer masks each word of the answer, e.g. "Great Hall" -> "***** ****".
func encodeAnswer(answer string) string {
	words := strings.Fields(answer)
	masked := make([]string, 0, len(words))
	for _, word := range words {
		masked = append(masked, strings.Repeat("*", len([]rune(word))))
	}
	return strings.Join(masked, " ")
}

// nodeSerializer renders nodes for one team, caching the lookups that the
// Django serializer resolved lazily through the ORM.
type nodeSerializer struct {
	app  core.App
	team *core.Record

	// Populated by the visited-nodes endpoint, which already has the whole
	// visit map in hand; nil elsewhere, in which case the status falls back to
	// per-node queries (mirroring the Django serializer's two code paths).
	visitedAt        map[string]types.DateTime
	currentVisitedAt *types.DateTime

	cache map[string]*core.Record
}

func newNodeSerializer(app core.App, team *core.Record) *nodeSerializer {
	return &nodeSerializer{app: app, team: team, cache: map[string]*core.Record{}}
}

func (s *nodeSerializer) node(id string) *core.Record {
	if id == "" {
		return nil
	}
	if cached, ok := s.cache[id]; ok {
		return cached
	}
	record, err := s.app.FindRecordById("nodes", id)
	if err != nil {
		record = nil
	}
	s.cache[id] = record
	return record
}

func (s *nodeSerializer) put(record *core.Record) {
	if record != nil {
		s.cache[record.Id] = record
	}
}

// answers lists the two branches of a junction; every other node gets [].
func (s *nodeSerializer) answers(node *core.Record) []answerJSON {
	answers := []answerJSON{}
	if node.GetString("effects") != effectsJunction {
		return answers
	}

	next := s.node(node.GetString("next_node"))
	alt := s.node(node.GetString("alt_next_node"))
	if next == nil || alt == nil {
		return answers
	}

	return []answerJSON{
		{ID: intID(next.Id), Answer: node.GetString("answer"), IsNearest: next.GetBool("is_nearest")},
		{ID: intID(alt.Id), Answer: node.GetString("alt_answer"), IsNearest: alt.GetBool("is_nearest")},
	}
}

func (s *nodeSerializer) visitTime(nodeID string) (types.DateTime, bool) {
	record, err := s.app.FindFirstRecordByFilter(
		"team_nodes",
		"team = {:team} && node = {:node}",
		dbx.Params{"team": s.team.Id, "node": nodeID},
	)
	if err != nil || record == nil {
		return types.DateTime{}, false
	}
	return record.GetDateTime("created"), true
}

// status reproduces NodeSerializer.get_status: the node the team is standing on
// is in-progress, anything visited after it is locked (the team fell back to a
// checkpoint), everything else is completed.
func (s *nodeSerializer) status(node *core.Record) string {
	if s.team == nil {
		return statusCompleted
	}

	currentID := s.team.GetString("current_node")
	if currentID != "" && currentID == node.Id {
		return statusInProgress
	}

	if s.visitedAt == nil {
		nodeAt, ok := s.visitTime(node.Id)
		if !ok {
			return statusCompleted
		}
		if currentID != "" {
			if currentAt, ok := s.visitTime(currentID); ok && nodeAt.Time().After(currentAt.Time()) {
				return statusLocked
			}
		}
		return statusCompleted
	}

	nodeAt, ok := s.visitedAt[node.Id]
	if ok && s.currentVisitedAt != nil && nodeAt.Time().After(s.currentVisitedAt.Time()) {
		return statusLocked
	}
	return statusCompleted
}

func (s *nodeSerializer) serialize(node *core.Record) nodeJSON {
	s.put(node)

	return nodeJSON{
		ID:            intID(node.Id),
		Data:          node.GetString("data"),
		Clue:          node.GetString("clue"),
		EncodedAnswer: encodeAnswer(node.GetString("answer")),
		Answers:       s.answers(node),
		Effects:       node.GetString("effects"),
		Score:         node.GetInt("score"),
		Bonus:         node.GetInt("bonus"),
		Life:          node.GetInt("life"),
		Attack:        node.GetInt("attack"),
		CreatedAt:     formatTime(node.GetDateTime("created")),
		Status:        s.status(node),
	}
}

func serializeBasicTeam(team *core.Record) basicTeamJSON {
	return basicTeamJSON{
		ID:     intID(team.Id),
		Name:   team.GetString("name"),
		Score:  team.GetInt("score"),
		Life:   team.GetInt("life"),
		Attack: team.GetInt("attack"),
		IsWon:  team.GetBool("is_won"),
	}
}

func serializeTeam(app core.App, team *core.Record) (teamJSON, error) {
	result := teamJSON{
		ID:      intID(team.Id),
		Name:    team.GetString("name"),
		Score:   team.GetInt("score"),
		Life:    team.GetInt("life"),
		Attack:  team.GetInt("attack"),
		IsWon:   team.GetBool("is_won"),
		Members: []memberJSON{},
	}

	members, err := app.FindRecordsByFilter("users", "team = {:team}", "uid", 0, 0, dbx.Params{"team": team.Id})
	if err != nil {
		return result, err
	}
	for _, member := range members {
		result.Members = append(result.Members, memberJSON{ID: member.GetInt("uid"), Email: member.Email()})
	}

	return result, nil
}
