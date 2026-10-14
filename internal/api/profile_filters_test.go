package api

import (
	"github.com/maelmoreau21/jellytrack/internal/testdb"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestProfileFilterOptionsStayCompleteAndServerScoped(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			db := testdb.Open(t, driver)
			for _, query := range []string{
				`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','s','Test','http://test'),('other','other','Other','http://other')`,
				`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES('u','s','same-id','Alice'),('private','other','same-id','Alice')`,
				`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","resolution") VALUES('m','s','m','Film','Movie','1080p'),('audio','s','a','Music','Audio',NULL),('private','other','p','Private','Book','4K')`,
				`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","clientName","audioLanguage","audioCodec","subtitleLanguage","subtitleCodec") VALUES('one','s','u','m','DirectPlay','Web','fra','aac','eng','srt'),('duplicate','s','u','m','DirectPlay','Web','fra','aac','eng','srt'),('two','s','u','audio','Transcode','App','eng','flac',NULL,NULL),('private','other','private','private','Download','Secret','deu','private','private','private')`,
			} {
				if _, err := db.Exec(query); err != nil {
					t.Fatal(err)
				}
			}
			// Limit/filter the visible history, while keeping options from all the
			// authorized account's sessions, including a different media type.
			r := httptest.NewRequest("GET", "/api/users/u?type=Movie&limit=1", nil)
			data, err := New(db, driver).profileHistory(r, "u", "s")
			if err != nil {
				t.Fatal(err)
			}
			expected := map[string][]string{
				"clients": {"App", "Web"}, "audio": {"aac", "eng", "flac", "fra"},
				"subtitles": {"eng", "srt"}, "resolutions": {"1080p"},
				"types": {"Audio", "Movie"}, "playMethods": {"DirectPlay", "Transcode"},
			}
			if !reflect.DeepEqual(data["filters"], expected) {
				t.Fatalf("filter options differ: %#v", data["filters"])
			}
		})
	}
}
