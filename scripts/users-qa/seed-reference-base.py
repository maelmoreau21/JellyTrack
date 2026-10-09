import sqlite3, datetime, json
import argparse
from pathlib import Path
parser=argparse.ArgumentParser(description='Seed isolated navigation QA data only')
parser.add_argument('--database',required=True)
args=parser.parse_args()
fixture_path=Path(args.database).resolve()
if fixture_path != Path(__file__).resolve().parents[2] / 'scratch/users-qa/users.db' or not fixture_path.is_file():
    parser.error('Use an existing isolated scratch/users-qa/users.db created by the QA Go server')
db=sqlite3.connect(str(fixture_path))
now=datetime.datetime.now(datetime.timezone.utc)
for sid,name in [('audit-primary','Audit principal'),('audit-secondary','Audit secondaire')]:
    db.execute('INSERT OR IGNORE INTO Server(id,jellyfinServerId,name,url,isActive) VALUES(?,?,?,?,0)',(sid,sid,name,'http://127.0.0.1:9'))
    for idx,username in enumerate(['Alice Audit','Bob Audit','auditadmin']):
        uid=f'{sid}-u{idx}'
        db.execute('INSERT OR IGNORE INTO User(id,serverId,jellyfinUserId,username,lastActive) VALUES(?,?,?,?,?)',(uid,sid,f'jf-{idx}',username,now.isoformat().replace('+00:00','Z')))
    for idx,kind in enumerate(['Movie','Episode','Audio','Book']):
        mid=f'{sid}-m{idx}'
        db.execute('INSERT OR IGNORE INTO Media(id,serverId,jellyfinMediaId,title,type,libraryName,collectionType,durationMs,resolution,genres,directors,actors,studios,parentId,artist,dateAdded) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(mid,sid,f'jf-media-{idx}',f'{kind} de validation {name}',kind,['Cinéma','Séries','Musique','Livres'][idx],['movies','tvshows','music','books'][idx],[7200000,2700000,240000,3600000][idx],['2160p','1080p','Audio','SD'][idx],json.dumps(['Audit','Drama']),json.dumps(['Réalisateur Audit']),json.dumps(['Actrice Audit']),json.dumps(['Studio Audit']),None,'Artiste Audit',now.isoformat().replace('+00:00','Z')))
    for i in range(72):
        pid=f'{sid}-p{i}'
        offset=[0,1,3,6,14,35,70,150,370][i%9]
        started=(now-datetime.timedelta(days=offset,hours=i%22,minutes=i%50)).replace(microsecond=0)
        kind=i%4
        duration=[5400,1800,180,2400][kind]
        if i%13==0:duration=30
        db.execute('INSERT OR IGNORE INTO PlaybackHistory(id,serverId,userId,mediaId,playMethod,clientName,deviceName,durationWatched,startedAt,endedAt,audioLanguage,audioCodec,subtitleLanguage,subtitleCodec,pauseCount,seekCount,country,city) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(pid,sid,f'{sid}-u{i%3}',f'{sid}-m{kind}',['DirectPlay','Transcode','DirectStream'][i%3],['Jellyfin Web','Android TV','Finamp'][i%3],'Audit device',duration,started.isoformat().replace('+00:00','Z'),(started+datetime.timedelta(seconds=duration)).isoformat().replace('+00:00','Z'),'fr','aac','fr' if i%2 else None,'srt',i%4,i%3,'France','Paris'))
        if i%10==0:
            for event,pos in [('pause',30000),('resume',30000),('seek',90000)]:
                db.execute('INSERT OR IGNORE INTO TelemetryEvent(id,serverId,playbackId,eventType,positionMs,metadata,createdAt) VALUES(?,?,?,?,?,?,?)',(f'{pid}-{event}',sid,pid,event,pos,'{}',started.isoformat().replace('+00:00','Z')))
db.execute("INSERT OR IGNORE INTO GlobalSettings(id) VALUES('global')")
db.execute('INSERT OR REPLACE INTO ActiveStream(id,serverId,sessionId,userId,mediaId,playbackId,playMethod,clientName,deviceName,videoCodec,audioCodec,transcodeFps,bitrate,positionTicks,startedAt,lastPingAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',('audit-live','audit-primary','audit-session-valid','audit-primary-u0','audit-primary-m0','audit-primary-p1','Transcode','Jellyfin Web','Audit Browser','h264','aac',48,12000000,6000000000,(now-datetime.timedelta(minutes=10)).isoformat().replace('+00:00','Z'),now.isoformat().replace('+00:00','Z')))
db.commit()
print('Seed synthétique: deux serveurs inactifs, huit médias, six utilisateurs, 144 lectures, 48 événements télémétrie. Aucun serveur réel appelé.')
