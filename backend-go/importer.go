package main

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"

	_ "modernc.org/sqlite"
)

// Seeding commands. The printed QR codes encode node ids, so the node graph has
// to come over from the Django side unchanged rather than being regenerated.

func registerImportCommands(app *pocketbase.PocketBase) {
	app.RootCmd.AddCommand(&cobra.Command{
		Use:   "import-django [path/to/db.sqlite3]",
		Short: "Copy the node graph out of the Django backend's SQLite database",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			if err := importFromDjango(app, args[0]); err != nil {
				log.Fatalf("import-django: %v", err)
			}
		},
	})

	app.RootCmd.AddCommand(&cobra.Command{
		Use:   "import-csv [path/to/mapped-questions.csv]",
		Short: "Create/update nodes from a mapped-questions CSV (id,next_node,question,answer,syn,alt_node,score,effects)",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			if err := importFromCSV(app, args[0]); err != nil {
				log.Fatalf("import-csv: %v", err)
			}
		},
	})
}

// nodeRow is one row of the incoming graph, from either source.
type nodeRow struct {
	id          string
	data        string
	answer      string
	altAnswer   string
	clue        string
	effects     string
	score       int
	bonus       int
	attack      int
	life        int
	isNearest   bool
	nextNode    string
	altNextNode string
}

func importFromDjango(app core.App, path string) error {
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("could not read %s: %w", path, err)
	}

	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		return err
	}
	defer db.Close()

	result, err := db.Query(`
		SELECT id, data, answer, alt_answer, COALESCE(clue, ''), effects,
		       score, bonus, attack, life, is_nearest,
		       COALESCE(next_node_id, 0), COALESCE(alt_next_node_id, 0)
		FROM users_node
		ORDER BY id
	`)
	if err != nil {
		return err
	}
	defer result.Close()

	rows := []nodeRow{}
	for result.Next() {
		var (
			row           nodeRow
			id, next, alt int64
			isNearest     bool
		)
		if err := result.Scan(
			&id, &row.data, &row.answer, &row.altAnswer, &row.clue, &row.effects,
			&row.score, &row.bonus, &row.attack, &row.life, &isNearest, &next, &alt,
		); err != nil {
			return err
		}
		row.id = strconv.FormatInt(id, 10)
		row.isNearest = isNearest
		if next != 0 {
			row.nextNode = strconv.FormatInt(next, 10)
		}
		if alt != 0 {
			row.altNextNode = strconv.FormatInt(alt, 10)
		}
		rows = append(rows, row)
	}
	if err := result.Err(); err != nil {
		return err
	}

	return saveNodes(app, rows)
}

func importFromCSV(app core.App, path string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("could not read %s: %w", path, err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1
	records, err := reader.ReadAll()
	if err != nil {
		return err
	}
	if len(records) < 2 {
		return fmt.Errorf("csv has no data rows")
	}

	columns := map[string]int{}
	for i, name := range records[0] {
		columns[strings.TrimSpace(strings.TrimPrefix(name, "\ufeff"))] = i
	}
	for _, required := range []string{"id", "next_node", "question", "answer", "syn", "alt_node", "score"} {
		if _, ok := columns[required]; !ok {
			return fmt.Errorf("csv missing column %q", required)
		}
	}

	value := func(record []string, name string) string {
		index, ok := columns[name]
		if !ok || index >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[index])
	}

	rows := []nodeRow{}
	for _, record := range records[1:] {
		id := value(record, "id")
		if id == "" {
			continue
		}

		question := value(record, "question")
		row := nodeRow{
			id:          id,
			data:        question,
			answer:      value(record, "answer"),
			altAnswer:   value(record, "syn"),
			effects:     effectsUnlocked,
			score:       10,
			nextNode:    value(record, "next_node"),
			altNextNode: value(record, "alt_node"),
		}
		// A row whose question is literally "JUNCTION" is a fork in the trail.
		if strings.EqualFold(question, effectsJunction) {
			row.effects = effectsJunction
		}
		if score := value(record, "score"); score != "" {
			parsed, err := strconv.Atoi(score)
			if err != nil {
				return fmt.Errorf("node %s: invalid score %q", id, score)
			}
			row.score = parsed
		}
		rows = append(rows, row)
	}

	return saveNodes(app, rows)
}

// saveNodes upserts the graph in two passes: next_node/alt_next_node can point
// at rows that don't exist yet, so relations are only wired up once every node
// is in place.
func saveNodes(app core.App, rows []nodeRow) error {
	collection, err := app.FindCollectionByNameOrId("nodes")
	if err != nil {
		return err
	}

	created, updated := 0, 0
	err = app.RunInTransaction(func(tx core.App) error {
		for _, row := range rows {
			record, err := tx.FindRecordById(collection, row.id)
			if err != nil {
				record = core.NewRecord(collection)
				record.Id = row.id
				created++
			} else {
				updated++
			}

			record.Set("data", row.data)
			record.Set("answer", row.answer)
			record.Set("alt_answer", row.altAnswer)
			record.Set("clue", row.clue)
			record.Set("effects", row.effects)
			record.Set("score", row.score)
			record.Set("bonus", row.bonus)
			record.Set("attack", row.attack)
			record.Set("life", row.life)
			record.Set("is_nearest", row.isNearest)

			if err := tx.Save(record); err != nil {
				return fmt.Errorf("node %s: %w", row.id, err)
			}
		}

		dangling := map[string]bool{}
		for _, row := range rows {
			record, err := tx.FindRecordById(collection, row.id)
			if err != nil {
				return err
			}
			record.Set("next_node", keepExisting(tx, collection, row.nextNode, dangling))
			record.Set("alt_next_node", keepExisting(tx, collection, row.altNextNode, dangling))
			if err := tx.Save(record); err != nil {
				return fmt.Errorf("node %s links: %w", row.id, err)
			}
		}

		if len(dangling) > 0 {
			missing := make([]string, 0, len(dangling))
			for id := range dangling {
				missing = append(missing, id)
			}
			fmt.Printf("warning: referenced node ids that do not exist: %s\n", strings.Join(missing, ", "))
		}

		return nil
	})
	if err != nil {
		return err
	}

	fmt.Printf("Created %d node(s), updated %d node(s).\n", created, updated)

	return nil
}

func keepExisting(app core.App, collection *core.Collection, id string, dangling map[string]bool) string {
	if id == "" {
		return ""
	}
	if _, err := app.FindRecordById(collection, id); err != nil {
		dangling[id] = true
		return ""
	}
	return id
}
