from pathlib import Path
import sqlite3,sys,datetime,json
root=Path(__file__).resolve().parents[2];target=root/'scratch/users-qa/users.db'
assert target.is_file()
db=sqlite3.connect(target,timeout=10)
events=[('pause',15000,{}),('resume',15800,{}),('seek',6000000000,{'fromMs':12000,'toMs':600000}),('audio_change',90000,{'from':{'language':'fra','codec':'aac','index':0},'to':{'language':'eng','codec':'dts','index':1}}),('speed_change',120000,{'fromRate':1,'toRate':1.5})]
for i,(kind,position,metadata) in enumerate(events):
 eid=f'users-qa-event-{i}'
 if sys.argv[1]=='create':
  now=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
  db.execute('INSERT OR REPLACE INTO TelemetryEvent(id,serverId,playbackId,eventType,positionMs,metadata,createdAt) VALUES(?,?,?,?,?,?,?)',(eid,'audit-primary','qa-many-0',kind,position,json.dumps(metadata),now))
 elif sys.argv[1]=='restore':
  db.execute('DELETE FROM TelemetryEvent WHERE id=? AND playbackId=?',(eid,'qa-many-0'))
 else:raise ValueError('create or restore only')
db.commit()
