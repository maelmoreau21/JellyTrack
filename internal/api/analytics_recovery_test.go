package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/maelmoreau21/jellytrack/internal/auth"
)

func TestWrappedRestoresYearsCategoriesParentsAndHours(t *testing.T) {
	db := apiDB(t)
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Fixture','http://127.0.0.1:9'),('other','otherjf','Other','http://127.0.0.1:9')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","parentId","artist","genres") VALUES('series','s','seriesjf','Series','Series',NULL,NULL,'[]'),('season','s','seasonjf','Season','Season','seriesjf',NULL,'[]'),('ep','s','epjf','Episode','Episode','seasonjf',NULL,'["Drama"]'),('album','s','albumjf','Album','MusicAlbum',NULL,'Artist','[]'),('track','s','trackjf','Track','Audio','albumjf','Artist','[]'),('book','s','bookjf','Book','Book',NULL,NULL,'[]'),('wrong','other','seriesjf','Wrong server series','Series',NULL,NULL,'[]')`,
		`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt","clientName","deviceName") VALUES('p1','s','u','ep','DirectPlay',3600,'2025-01-02T10:00:00Z','2025-01-02T11:00:00Z','Web','TV'),('p2','s','u','track','DirectPlay',1800,'2025-01-03T10:00:00Z','2025-01-03T11:00:00Z','Phone','Phone'),('p3','s','u','book','DirectPlay',900,'2025-02-03T10:00:00Z','2025-02-03T11:00:00Z','Reader','Reader'),('zap','s','u','ep','DirectPlay',10,'2025-01-04T10:00:00Z','2025-01-04T10:00:10Z','Web','TV')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	h := New(db, "sqlite")
	call := func(query string) map[string]any {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/wrapped/u?"+query, nil)
		r.SetPathValue("id", "u")
		r = r.WithContext(context.WithValue(r.Context(), auth.PrincipalContextKey, auth.Principal{Username: "Admin", Role: "admin"}))
		h.userWrapped(w, r)
		if w.Code != 200 {
			t.Fatalf("wrapped %d: %s", w.Code, w.Body.String())
		}
		var data map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
			t.Fatal(err)
		}
		return data
	}
	data := call("year=2025")
	if data["totalSeconds"] != float64(6300) || data["totalPlays"] != float64(3) || data["topDevice"] != "TV" {
		t.Fatalf("wrapped totals: %+v", data)
	}
	series := data["topSeries"].([]any)
	if len(series) != 1 || series[0].(map[string]any)["title"] != "Series" {
		t.Fatalf("series parent: %v", series)
	}
	months := data["monthlyHours"].([]any)
	if months[0].(map[string]any)["hours"] != 1.5 || months[1].(map[string]any)["hours"] != 0.25 {
		t.Fatalf("monthly hours: %v", months)
	}
	data = call("year=2025&type=Music")
	if data["totalPlays"] != float64(1) || len(data["topAlbums"].([]any)) != 1 || len(data["topArtists"].([]any)) != 1 {
		t.Fatalf("music type: %+v", data)
	}
}

func TestNewsletterExcludesZappingButPreservesDownloads(t *testing.T) {
	db := apiDB(t)
	for _, q := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','jf','Fixture','http://127.0.0.1:9')`,
		`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','ju','User')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type") VALUES('m','s','jm','Film','Movie')`,
		fmt.Sprintf(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","eventSource","durationWatched","startedAt","endedAt") VALUES('p','s','u','m','DirectPlay','playback',3600,'%s','%s'),('zap','s','u','m','DirectPlay','playback',5,'%s','%s'),('download','s','u','m','Download','download',0,'%s','%s')`, time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339)),
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	New(db, "sqlite").newsletterData(w, httptest.NewRequest("GET", "/api/newsletter", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"totalPlays":2`) || !strings.Contains(w.Body.String(), `"totalHours":1`) {
		t.Fatalf("newsletter: %d %s", w.Code, w.Body.String())
	}
}
