// Disposable browser fixture. It never opens the configured production database.
package main

import (
 "context"
 "encoding/json"
 "flag"
 "fmt"
 "io"
 "log/slog"
 "net/http"
 "net/http/httptest"
 "os"
 "path/filepath"
 "time"

 "github.com/maelmoreau21/jellytrack/internal/config"
 "github.com/maelmoreau21/jellytrack/internal/database"
 "github.com/maelmoreau21/jellytrack/web"
)

func main(){
 port:=flag.String("port","3358","test listener");single:=flag.Bool("single",false,"one configured server");flag.Parse()
 dir,err:=os.MkdirTemp("","jellytrack-multi-browser-");must(err)
 defer os.RemoveAll(dir)
 os.Setenv("JELLYTRACK_SECRET","multiserver-browser-test-secret-0123456789")
 os.Setenv("JELLYTRACK_LOCAL_ADMIN_USER","multiadmin");os.Setenv("JELLYTRACK_LOCAL_ADMIN_PASSWORD","Multi-test-only-2026!")
 os.Setenv("JELLYFIN_URL","");os.Setenv("JELLYFIN_API_KEY","");os.Setenv("JELLYTRACK_MODE","single")
 db,err:=database.Open(context.Background(),config.Config{DatabaseDriver:"sqlite",DatabasePath:filepath.Join(dir,"fixture.db")});must(err);defer db.Close()
 _,err=db.Exec(`INSERT INTO "GlobalSettings"("id","wrappedPeriodEnabled") VALUES('global',FALSE)`);must(err)
 count:=2;if *single {count=1;os.Setenv("JELLYTRACK_MODE","multi")}
 for i:=0;i<count;i++ {
  id:=string(rune('a'+i));name:="Serveur "+string(rune('A'+i))
  remote:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
   if r.URL.Path=="/System/Info"{fmt.Fprintf(w,`{"Id":%q,"ServerName":%q,"Version":"10.11.0"}`,id,name);return}
   if r.URL.Path=="/Users"{fmt.Fprint(w,`[{"Id":"shared-user","Name":"Alice"}]`);return}
   if r.URL.Path=="/Items/shared-media"{fmt.Fprint(w,`{"Id":"shared-media","Name":"Film identique","Type":"Movie","Overview":"Fixture multi-serveur","ProviderIds":{"Imdb":"tt123"}}`);return}
   http.NotFound(w,r)
  }));defer remote.Close()
  _,err=db.Exec(`INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey") VALUES(?,?,?,?,?)`,id,id,name,remote.URL,"qa-key");must(err)
  _,err=db.Exec(`INSERT INTO "User"("id","serverId","jellyfinUserId","username") VALUES(?,?,?,'Alice')`,"u"+id,id,"shared-user");must(err)
  _,err=db.Exec(`INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName","collectionType","durationMs","resolution","providerIds") VALUES(?,?,?,'Film identique','Movie','Films','movies',3600000,'1080p','{"Imdb":"tt123"}')`,"m"+id,id,"shared-media");must(err)
  start:=time.Now().UTC().Add(-time.Hour).Format(time.RFC3339Nano);end:=time.Now().UTC().Add(-40*time.Minute).Format(time.RFC3339Nano)
  _,err=db.Exec(`INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt") VALUES(?,?,?,?,'DirectPlay',?,?,?)`,"p"+id,id,"u"+id,"m"+id,1200*(i+1),start,end);must(err)
  _,err=db.Exec(`INSERT INTO "ActiveStream"("id","serverId","sessionId","userId","mediaId","playMethod","clientName","deviceName") VALUES(?,?,'same-session',?,?,'DirectPlay','Web','Browser')`,"s"+id,id,"u"+id,"m"+id);must(err)
  must(database.RecordServerConnection(context.Background(),db,"sqlite",id,true,int64(5+i)))
 }
 logger:=slog.New(slog.NewTextHandler(io.Discard,nil))
 mux:=http.NewServeMux();mux.Handle("/",web.NewHandler(logger,db,"sqlite"));mux.HandleFunc("/qa/context",func(w http.ResponseWriter,r *http.Request){json.NewEncoder(w).Encode(map[string]any{"single":*single})})
 fmt.Println("Fixture ready at http://127.0.0.1:"+*port)
 must(http.ListenAndServe("127.0.0.1:"+*port,mux))
}
func must(err error){if err!=nil{panic(err)}}
