package api

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestMonthlyDiscordRestoresPodiumDatesAndExcludesZapping(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','Server','http://server')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','Alice')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jm','Movie','Movie')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","durationWatched","startedAt","endedAt","eventSource","playMethod") VALUES('p','s','u','m',6000,'2026-10-09T12:00:00Z','2026-10-09T14:00:00Z','playback','DirectPlay'),('zap','s','u','m',20,'2026-10-09T12:00:00Z','2026-10-09T12:01:00Z','playback','DirectPlay'),('download','s','u','m',10,'2026-10-09T12:00:00Z','2026-10-09T12:01:00Z','download','Download')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	payload, err := New(db, "sqlite").monthlyDiscordPayload(context.Background(), time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	embed := payload["embeds"].([]map[string]any)[0]
	fields := embed["fields"].([]map[string]any)
	if len(fields) != 4 || fields[0]["value"] != "**2 heures**" || fields[1]["value"] != "**2 sessions**" || !strings.Contains(fmt.Sprint(fields[3]["value"]), "Movie** (Movie) — *1.7h*") || !strings.Contains(fmt.Sprint(embed["description"]), "10 sept. 2026 au 10 oct. 2026") {
		t.Fatalf("payload=%v", payload)
	}
}
