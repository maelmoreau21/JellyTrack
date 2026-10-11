package plugin

import (
	"context"
	"database/sql"
	"net/http"
	"sync"
	"testing"
)

func TestConcurrentSessionStartsKeepSingleHistory(t *testing.T) {
	db, handler := testServer(t)
	if response := send(t, handler, testKey, baseEvent("PlaybackStart")); response.Code != http.StatusOK {
		t.Fatal(response.Body)
	}
	var serverID string
	if err := db.QueryRow(`SELECT "id" FROM "Server" LIMIT 1`).Scan(&serverID); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{`DELETE FROM "ActiveStream"`, `DELETE FROM "PlaybackHistory"`} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	var group sync.WaitGroup
	results := make(chan error, 12)
	for i := 0; i < 12; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			_, _, err := handler.playbackStart(context.Background(), baseEvent("PlaybackStart"), serverID)
			results <- err
		}()
	}
	group.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "PlaybackHistory"`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("concurrent starts created duplicate history: count=%d err=%v", count, err)
	}
}

func TestSessionResumeKeepsHistoryAndWatchTime(t *testing.T) {
	db, handler := testServer(t)
	for _, event := range []string{"PlaybackStart", "PlaybackStop", "PlaybackStart"} {
		payload := baseEvent(event)
		payload["positionTicks"] = int64(60 * 10_000_000)
		response := send(t, handler, testKey, payload)
		if response.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", event, response.Code, response.Body)
		}
		if event == "PlaybackStop" {
			if _, err := db.Exec(`UPDATE "PlaybackHistory" SET "durationWatched"=42`); err != nil {
				t.Fatal(err)
			}
		}
	}
	var count, duration int
	var ended sql.NullString
	if err := db.QueryRow(`SELECT COUNT(*),MAX("durationWatched"),MAX("endedAt") FROM "PlaybackHistory"`).Scan(&count, &duration, &ended); err != nil {
		t.Fatal(err)
	}
	if count != 1 || duration != 42 || ended.Valid {
		t.Fatalf("resume created or reset history: count=%d duration=%d ended=%v", count, duration, ended)
	}
}

func TestSessionResumeDoesNotMergeReplaysParallelClientsOrDisabledWindow(t *testing.T) {
	for _, scenario := range []string{"replay", "parallel", "different-device", "disabled", "expired"} {
		t.Run(scenario, func(t *testing.T) {
			db, handler := testServer(t)
			start := baseEvent("PlaybackStart")
			start["positionTicks"] = int64(60 * 10_000_000)
			if response := send(t, handler, testKey, start); response.Code != http.StatusOK {
				t.Fatal(response.Body)
			}
			if scenario != "parallel" {
				if response := send(t, handler, testKey, baseEvent("PlaybackStop")); response.Code != http.StatusOK {
					t.Fatal(response.Body)
				}
			}
			next := baseEvent("PlaybackStart")
			next["positionTicks"] = int64(60 * 10_000_000)
			if scenario == "replay" {
				next["positionTicks"] = int64(0)
			}
			if scenario == "parallel" || scenario == "different-device" {
				next["sessionId"] = "second-session"
				next["session"].(map[string]any)["sessionId"] = "second-session"
				next["session"].(map[string]any)["deviceName"] = "Second Browser"
			}
			if scenario == "disabled" {
				if _, err := db.Exec(`UPDATE "GlobalSettings" SET "pluginTelemetrySettings"='{"mergeWindowSeconds":0}'`); err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "expired" {
				if _, err := db.Exec(`UPDATE "PlaybackHistory" SET "endedAt"='2000-01-01T00:00:00Z'`); err != nil {
					t.Fatal(err)
				}
			}
			if response := send(t, handler, testKey, next); response.Code != http.StatusOK {
				t.Fatal(response.Body)
			}
			var count int
			if err := db.QueryRow(`SELECT COUNT(*) FROM "PlaybackHistory"`).Scan(&count); err != nil || count != 2 {
				t.Fatalf("distinct playback merged: count=%d err=%v", count, err)
			}
		})
	}
}

func TestSessionMediaChangeClosesPreviousHistoryForStartAndProgress(t *testing.T) {
	for _, event := range []string{"PlaybackStart", "PlaybackProgress"} {
		t.Run(event, func(t *testing.T) {
			db, handler := testServer(t)
			if response := send(t, handler, testKey, baseEvent("PlaybackStart")); response.Code != http.StatusOK {
				t.Fatal(response.Body)
			}
			next := baseEvent(event)
			next["media"].(map[string]any)["jellyfinMediaId"] = "second-media"
			if response := send(t, handler, testKey, next); response.Code != http.StatusOK {
				t.Fatal(response.Body)
			}
			var total, open, linked int
			if err := db.QueryRow(`SELECT COUNT(*),SUM(CASE WHEN "endedAt" IS NULL THEN 1 ELSE 0 END) FROM "PlaybackHistory"`).Scan(&total, &open); err != nil {
				t.Fatal(err)
			}
			if err := db.QueryRow(`SELECT COUNT(*) FROM "ActiveStream" a JOIN "PlaybackHistory" p ON p."id"=a."playbackId" WHERE a."mediaId"=p."mediaId" AND p."endedAt" IS NULL`).Scan(&linked); err != nil {
				t.Fatal(err)
			}
			if total != 2 || open != 1 || linked != 1 {
				t.Fatalf("incorrect media transition: total=%d open=%d linked=%d", total, open, linked)
			}
		})
	}
}
