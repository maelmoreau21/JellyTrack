from pathlib import Path
import sqlite3,sys,datetime
root=Path(__file__).resolve().parents[2];target=root/'scratch/users-qa/users.db'
assert target.is_file()
db=sqlite3.connect(target,timeout=10)
uid='qa-audiobook-fixture';mid='qa-audiobook-media';pid='qa-audiobook-playback'
if sys.argv[1]=='create':
 now=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
 db.execute('INSERT OR IGNORE INTO User(id,serverId,jellyfinUserId,username) VALUES(?,?,?,?)',(uid,'audit-primary',uid,'AudioBook QA'))
 db.execute('INSERT OR IGNORE INTO Media(id,serverId,jellyfinMediaId,title,type,durationMs) VALUES(?,?,?,?,?,?)',(mid,'audit-primary',mid,'AudioBook QA','AudioBook',3600000))
 db.execute('INSERT OR IGNORE INTO PlaybackHistory(id,serverId,userId,mediaId,playMethod,durationWatched,startedAt,endedAt) VALUES(?,?,?,?,?,?,?,?)',(pid,'audit-primary',uid,mid,'DirectPlay',1800,now,now))
elif sys.argv[1]=='restore':
 db.execute('DELETE FROM PlaybackHistory WHERE id=? AND userId=?',(pid,uid));db.execute('DELETE FROM Media WHERE id=?',(mid,));db.execute('DELETE FROM User WHERE id=? AND jellyfinUserId=?',(uid,uid))
else:raise ValueError('create or restore only')
db.commit()
