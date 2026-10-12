package stats

import (
	"context"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
	"testing"
)

func TestMetadataAuditExcludesMusicContainersAndArchivedVideo(t *testing.T) {
	db := testdb.Open(t, "sqlite")
	db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('s','js','S','http://s')`)
	if _, err := db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","resolution","isAvailable") VALUES('music','s','music','Music','Audio',NULL,1),('album','s','album','Album','MusicAlbum',NULL,1),('series','s','series','Series','Series',NULL,1),('gone','s','gone','Gone','Movie',NULL,0),('current','s','current','Movie','Movie','Unknown',1)`); err != nil {
		t.Fatal(err)
	}
	audit, err := GetMetadataAudit(context.Background(), db)
	if err != nil || audit["missingResolution"] != int64(1) || audit["totalMedia"] != int64(4) {
		t.Fatal(audit, err)
	}
}
