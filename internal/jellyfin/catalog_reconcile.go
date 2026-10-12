package jellyfin

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/maelmoreau21/jellytrack/internal/database"
)

// Provider keys identify works, not individual episodes or tracks. Never match
// by title, or across servers. Multiple versions remain separate.
func ProviderKeys(kind string, ids map[string]string) []string {
	if kind != "Movie" && kind != "Series" {
		return nil
	}
	var keys []string
	for provider, id := range ids {
		provider = strings.ToLower(strings.TrimSpace(provider))
		id = strings.ToLower(strings.TrimSpace(id))
		if id != "" && (provider == "tmdb" || provider == "imdb" || provider == "tvdb") {
			keys = append(keys, kind+":"+provider+":"+id)
		}
	}
	return keys
}

type ProviderIndex map[string][]Item

func NewProviderIndex(items []Item) ProviderIndex {
	index := ProviderIndex{}
	for _, item := range items {
		for _, key := range ProviderKeys(item.Type, item.ProviderIDs) {
			index[key] = append(index[key], item)
		}
	}
	return index
}
func (index ProviderIndex) Match(kind string, ids map[string]string) (Item, bool) {
	return providerMatch(kind, ids, index)
}
func providerMatch(kind string, ids map[string]string, candidates map[string][]Item) (Item, bool) {
	var match Item
	for _, key := range ProviderKeys(kind, ids) {
		found := candidates[key]
		if len(found) > 1 {
			return Item{}, false
		}
		if len(found) == 1 {
			if match.ID != "" && match.ID != found[0].ID {
				return Item{}, false
			}
			match = found[0]
		}
	}
	// Conflicting provider identifiers prevent an otherwise unique match.
	if match.ID != "" {
		for provider, value := range ids {
			for rp, rv := range match.ProviderIDs {
				if strings.EqualFold(provider, rp) && value != "" && rv != "" && !strings.EqualFold(value, rv) {
					return Item{}, false
				}
			}
		}
	}
	return match, match.ID != ""
}

func catalogKey(id string) string {
	compact := strings.ReplaceAll(strings.TrimSpace(id), "-", "")
	if jellyfinUUID.MatchString(compact) {
		return strings.ToLower(compact)
	}
	return strings.TrimSpace(id)
}

func reconcileReplacementIDs(ctx context.Context, db *sql.DB, driver, server string, items []Item) error {
	present := map[string]bool{}
	index := map[string][]Item{}
	for _, item := range items {
		present[catalogKey(item.ID)] = true
		for _, key := range ProviderKeys(item.Type, item.ProviderIDs) {
			index[key] = append(index[key], item)
		}
	}
	rows, err := db.QueryContext(ctx, database.Bind(`SELECT "id","jellyfinMediaId","type","providerIds" FROM "Media" WHERE "serverId"=?`, driver), server)
	if err != nil {
		return err
	}
	type replacement struct {
		id, old string
		item    Item
	}
	var candidates []replacement
	existing := map[string]bool{}
	counts := map[string]int{}
	for rows.Next() {
		var id, remote, kind, raw string
		if err = rows.Scan(&id, &remote, &kind, &raw); err != nil {
			rows.Close()
			return err
		}
		existing[catalogKey(remote)] = true
		if present[catalogKey(remote)] {
			continue
		}
		var ids map[string]string
		_ = json.Unmarshal([]byte(raw), &ids)
		if match, ok := providerMatch(kind, ids, index); ok {
			candidates = append(candidates, replacement{id, remote, match})
			counts[catalogKey(match.ID)]++
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, c := range candidates {
		if counts[catalogKey(c.item.ID)] != 1 {
			continue
		}
		// Active sessions continue using their original Jellyfin identity.
		var active int
		if err = tx.QueryRowContext(ctx, database.Bind(`SELECT COUNT(*) FROM "ActiveStream" WHERE "mediaId"=?`, driver), c.id).Scan(&active); err != nil {
			return err
		}
		if active > 0 {
			continue
		}
		if existing[catalogKey(c.item.ID)] {
			var target string
			if err = tx.QueryRowContext(ctx, database.Bind(`SELECT "id" FROM "Media" WHERE "serverId"=? AND "jellyfinMediaId"=?`, driver), server, c.item.ID).Scan(&target); err != nil {
				// The stored ID can have legacy UUID formatting. Resolve it safely.
				compact := catalogKey(c.item.ID)
				if !jellyfinUUID.MatchString(compact) {
					return err
				}
				if err = tx.QueryRowContext(ctx, database.Bind(`SELECT "id" FROM "Media" WHERE "serverId"=? AND LOWER(REPLACE("jellyfinMediaId",'-',''))=?`, driver), server, compact).Scan(&target); err != nil {
					return err
				}
			}
			if driver == "postgres" {
				locked, e := tx.QueryContext(ctx, database.Bind(`SELECT "id" FROM "Media" WHERE "id" IN (?,?) ORDER BY "id" FOR UPDATE`, driver), c.id, target)
				if e != nil {
					return e
				}
				locked.Close()
			}
			if err = tx.QueryRowContext(ctx, database.Bind(`SELECT COUNT(*) FROM "ActiveStream" WHERE "mediaId"=?`, driver), target).Scan(&active); err != nil {
				return err
			}
			if active > 0 {
				continue
			}
			var unsafe int
			if err = tx.QueryRowContext(ctx, database.Bind(`SELECT COUNT(*) FROM "PlaybackHistory" WHERE "mediaId" IN (?,?) AND "serverId"<>?`, driver), target, c.id, server).Scan(&unsafe); err != nil {
				return err
			}
			if unsafe > 0 {
				continue
			}
			if _, err = tx.ExecContext(ctx, database.Bind(`UPDATE "PlaybackHistory" SET "mediaId"=? WHERE "mediaId"=? AND "serverId"=?`, driver), c.id, target, server); err != nil {
				return err
			}
			if _, err = tx.ExecContext(ctx, database.Bind(`UPDATE "Media" SET "parentId"=? WHERE "parentId"=? AND "serverId"=?`, driver), c.id, target, server); err != nil {
				return err
			}
			if _, err = tx.ExecContext(ctx, database.Bind(`DELETE FROM "Media" WHERE "id"=? AND "serverId"=? AND NOT EXISTS(SELECT 1 FROM "PlaybackHistory" WHERE "mediaId"=?) AND NOT EXISTS(SELECT 1 FROM "ActiveStream" WHERE "mediaId"=?)`, driver), target, server, target, target); err != nil {
				return err
			}
		}
		changed, e := tx.ExecContext(ctx, database.Bind(`UPDATE "Media" SET "jellyfinMediaId"=? WHERE "id"=? AND "serverId"=? AND "jellyfinMediaId"=?`, driver), c.item.ID, c.id, server, c.old)
		if e != nil {
			return e
		}
		n, e := changed.RowsAffected()
		if e != nil {
			return e
		}
		if n != 1 {
			return fmt.Errorf("media changed during replacement reconciliation; retry full synchronization")
		}

		if _, err = tx.ExecContext(ctx, database.Bind(`UPDATE "Media" SET "parentId"=? WHERE "serverId"=? AND "parentId"=?`, driver), c.item.ID, server, c.old); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Called only after the complete, authoritative catalogue has been fetched and
// saved successfully. Archived metadata remains available to playback history.
func reconcilePresence(ctx context.Context, db *sql.DB, driver, server string, items []Item) error {
	present := map[string]bool{}
	for _, item := range items {
		present[catalogKey(item.ID)] = true
	}
	rows, err := db.QueryContext(ctx, database.Bind(`SELECT "id","jellyfinMediaId" FROM "Media" WHERE "serverId"=?`, driver), server)
	if err != nil {
		return err
	}
	type state struct {
		id        string
		available int
	}
	var states []state
	for rows.Next() {
		var id, remote string
		if err = rows.Scan(&id, &remote); err != nil {
			rows.Close()
			return err
		}
		available := 0
		if present[catalogKey(remote)] {
			available = 1
		}
		states = append(states, state{id, available})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, s := range states {
		if _, err = tx.ExecContext(ctx, database.Bind(`UPDATE "Media" SET "isAvailable"=? WHERE "id"=? AND "serverId"=? AND "isAvailable"<>?`, driver), s.available, s.id, server, s.available); err != nil {
			return err
		}
	}
	return tx.Commit()
}
