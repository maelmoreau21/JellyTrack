package plugin

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

func TestCachedPluginKeyStillChecksRevocationAndPreviousExpiry(t *testing.T) {
	db, h := testServer(t)
	current, _, _, err := h.readKeySnapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, _, ok := h.verifyKey(testKey, current, "", sql.NullString{}); !ok {
		t.Fatal("valid key rejected")
	}
	if _, _, ok := h.verifyKey(testKey, "", "", sql.NullString{}); ok {
		t.Fatal("revoked cached key accepted")
	}
	future := sql.NullString{String: time.Now().Add(time.Minute).UTC().Format(time.RFC3339Nano), Valid: true}
	if old, _, ok := h.verifyKey(testKey, "", current, future); !ok || !old {
		t.Fatal("valid previous key rejected")
	}
	expired := sql.NullString{String: time.Now().Add(-time.Minute).UTC().Format(time.RFC3339Nano), Valid: true}
	if _, _, ok := h.verifyKey(testKey, "", current, expired); ok {
		t.Fatal("expired cached previous key accepted")
	}
	if h.verifyRepeatedHash("invalid", current) {
		t.Fatal("invalid key accepted")
	}
	if len(h.verifiedKeys) != 1 {
		t.Fatalf("failed keys retained: %d", len(h.verifiedKeys))
	}
	if _, err = db.Exec(`UPDATE "GlobalSettings" SET "pluginApiKey"=NULL WHERE "id"='global'`); err != nil {
		t.Fatal(err)
	}
	response := send(t, h, testKey, baseEvent("Heartbeat"))
	if response.Code != 401 {
		t.Fatalf("revoked key status=%d", response.Code)
	}
}

func TestPlaybackProgressKeepsPluginPresenceFresh(t *testing.T) {
	db, h := testServer(t)
	response := send(t, h, testKey, baseEvent("PlaybackProgress"))
	if response.Code != 200 {
		t.Fatalf("progress %d: %s", response.Code, response.Body)
	}
	var seen string
	if err := db.QueryRow(`SELECT "pluginLastSeen" FROM "GlobalSettings" WHERE "id"='global'`).Scan(&seen); err != nil {
		t.Fatal(err)
	}
	stamp, err := time.Parse(time.RFC3339Nano, seen)
	if err != nil || time.Since(stamp) > time.Minute {
		t.Fatalf("plugin presence=%s err=%v", seen, err)
	}
}

func TestWarmPluginKeyAvoidsScryptAllocations(t *testing.T) {
	_, h := testServer(t)
	current, _, _, _ := h.readKeySnapshot(context.Background())
	if !h.verifyRepeatedHash(testKey, current) {
		t.Fatal("valid key rejected")
	}
	allocations := testing.AllocsPerRun(20, func() {
		if !h.verifyRepeatedHash(testKey, current) {
			panic("key rejected")
		}
	})
	t.Logf("cached verification allocations: %.0f", allocations)
	if allocations > 5 {
		t.Fatalf("unexpected costly cached verification: %.0f allocations", allocations)
	}
}
