package media

import (
	"context"
	"github.com/maelmoreau21/jellytrack/internal/testdb"
	"testing"
)

func TestLibraryNameTraversesNestedAndUUIDParentsWithServerIsolation(t *testing.T) {
	db := testdb.Open(t, "sqlite")
	for _, query := range []string{
		`INSERT INTO "Server"("id","jellyfinServerId","name","url") VALUES('a','ja','A','http://a'),('b','jb','B','http://b')`,
		`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","parentId") VALUES('root','a','00112233-4455-6677-8899-aabbccddeeff','Root','Series','Séries',NULL),('folder','a','jf','Folder','Folder',NULL,'00112233445566778899AABBCCDDEEFF'),('season','a','js','Season','Season',NULL,'jf'),('episode','a','je','Episode','Episode','Unknown','js'),('foreign','b','00112233445566778899aabbccddeeff','Foreign','Series','Autre',NULL),('cycle-a','a','jca','Cycle','Folder',NULL,'jcb'),('cycle-b','a','jcb','Cycle','Folder',NULL,'jca')`,
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	for id, want := range map[string]string{"episode": "Séries", "folder": "Séries", "cycle-a": "Unknown"} {
		var got string
		if err := db.QueryRowContext(context.Background(), `SELECT `+LibraryNameSQL("m")+` FROM "Media" m WHERE m."id"=?`, id).Scan(&got); err != nil || got != want {
			t.Fatalf("%s got=%q expected=%q %v", id, got, want, err)
		}
	}
}
