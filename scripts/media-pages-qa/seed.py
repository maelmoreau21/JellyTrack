"""Synthetic media parity fixture, confined to scratch/media-pages-qa."""
import base64, datetime as dt, hashlib, hmac, json, sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'scratch/media-pages-qa'
WORK.mkdir(parents=True, exist_ok=True)
target = WORK / 'media-pages.db'
assert target.resolve().parent == WORK.resolve()
db = sqlite3.connect(target)
# Allow fixture preparation before the application is built.
db.execute('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)')
for migration in sorted((ROOT / 'migrations/sqlite').glob('*.sql')):
    version=int(migration.name.split('_')[0])
    if db.execute('SELECT 1 FROM schema_migrations WHERE version=?',(version,)).fetchone():continue
    try: db.executescript(migration.read_text(encoding='utf-8'))
    except sqlite3.OperationalError as error:
        if 'duplicate column' not in str(error): raise
    db.execute('INSERT OR IGNORE INTO schema_migrations(version) VALUES(?)',(version,))
now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
iso = lambda v: v.isoformat().replace('+00:00', 'Z')
def insert(table, values):
    keys=list(values)
    db.execute('INSERT OR REPLACE INTO "'+table+'"('+','.join('"'+k+'"' for k in keys)+') VALUES('+','.join('?' for _ in keys)+')',[values[k] for k in keys])
for sid, name, url in [('qa-primary','QA principal','http://127.0.0.1:9'),('qa-secondary','QA secondaire','http://localhost:9')]:
    insert('Server',dict(id=sid,jellyfinServerId=sid,name=name,url=url,isActive=0))
    for uid,username in [('alice','Alice QA'),('bob','Bob QA')]:
        insert('User',dict(id=sid+'-'+uid,serverId=sid,jellyfinUserId=uid,username=username,lastActive=iso(now)))
    media=[]
    def item(mid,title,kind,library='Films QA',parent=None,artist=None,duration=5400000):
        row=dict(id=sid+'-'+mid,serverId=sid,jellyfinMediaId=mid,title=title,type=kind,libraryName=library,collectionType='tvshows' if kind in ('Series','Season','Episode') else 'music' if kind in ('Audio','MusicAlbum') else 'books' if kind=='Book' else 'movies',parentId=parent,artist=artist,durationMs=duration,size=104857600 if kind not in ('Series','MusicAlbum','Season') else None,genres=json.dumps(['Drama','QA'] if kind not in ('Audio','MusicAlbum') else ['Rock']),directors=json.dumps(['Réalisateur QA']),actors=json.dumps(['Actrice QA']),studios=json.dumps(['Studio QA']),resolution='4K' if kind=='Movie' else '1080p' if kind=='Episode' else None,dateAdded=iso(now-dt.timedelta(days=len(media)%12)))
        insert('Media',row);media.append(row);return row
    movie=item('movie','Film principal QA','Movie')
    series=item('series','Série principale QA','Series','Séries QA',duration=None)
    item('season','Saison 1','Season','Séries QA','series',duration=None)
    episodes=[item('episode'+str(n),'Épisode '+str(n),'Episode','Séries QA','season',duration=1800000) for n in range(1,4)]
    album=item('album','Album principal QA','MusicAlbum','Musique QA',artist='Artiste QA',duration=None)
    tracks=[item('track'+str(n),'Piste '+str(n),'Audio','Musique QA','album','Artiste QA',240000) for n in range(1,4)]
    book=item('book','Livre principal QA','Book','Livres QA',duration=7200000)
    for n in range(53):item('movie'+str(n),'Film QA '+str(n).zfill(2),'Movie')
    for n in range(135 if sid=='qa-primary' else 12):
        m=([movie]+episodes+tracks+[book])[n%8]
        start=now-dt.timedelta(days=(n//8)%30,hours=n%8,minutes=n%5)
        duration=([4800,1800,1800,1800,230,180,120,5000])[n%8]
        insert('PlaybackHistory',dict(id=sid+'-play'+str(n),serverId=sid,userId=sid+('-alice' if n%3 else '-bob'),mediaId=m['id'],playMethod=['DirectPlay','DirectStream','Transcode'][n%3],clientName=['Jellyfin Web','Android TV','Finamp'][n%3],deviceName=['Browser','TV','Phone'][n%3],ipAddress='8.8.8.8' if n%2 else '192.168.1.3',country='France',city='Paris',durationWatched=duration,startedAt=iso(start),endedAt=iso(start+dt.timedelta(seconds=duration)),audioLanguage='fre' if n%2 else 'eng',audioCodec='aac',subtitleLanguage='eng' if n%2 else None,subtitleCodec='subrip' if n%2 else None,bitrate=12000000,pauseCount=2,seekCount=1,audioChanges=1,subtitleChanges=1,rewatchCount=0,speedChangeCount=1,maxPlaybackRate=1.25))
        if n<6:
            for e,position,metadata in [('pause',30000,{}),('seek',90000,{'fromMs':30000,'toMs':90000}),('audio_change',120000,{'from':{'language':'eng'},'to':{'language':'fre'}})]:
                insert('TelemetryEvent',dict(id=sid+'-play'+str(n)+'-'+e,serverId=sid,playbackId=sid+'-play'+str(n),eventType=e,positionMs=position,metadata=json.dumps(metadata),createdAt=iso(start)))
    insert('ActiveStream',dict(id=sid+'-active',serverId=sid,sessionId='session-qa',userId=sid+'-alice',mediaId=movie['id'],playbackId=sid+'-play1',playMethod='DirectPlay',clientName='Jellyfin Web',deviceName='QA browser',audioCodec='aac',videoCodec='h264',audioLanguage='fre',subtitleLanguage='eng',bitrate=12000000,positionTicks=0,startedAt=iso(now),lastPingAt=iso(now)))
db.execute("INSERT OR IGNORE INTO GlobalSettings(id) VALUES('global')")
db.execute("UPDATE GlobalSettings SET defaultLocale='fr',wrappedVisible=1,wrappedPeriodEnabled=0 WHERE id='global'")
expiry=iso(now+dt.timedelta(days=1));sid='media-pages-qa-user-session'
identity=dict(username='Alice QA',role='user',jellyfinUserId='alice',authServerId='qa-primary',identityVersion=2,authMethod='jellyfin',authServerName='QA principal',authServerIsPrimary=True)
insert('AuthSession',dict(id=sid,username='Alice QA',role='user',expiresAt=expiry,createdAt=iso(now),identity=json.dumps(identity)))
enc=lambda value:base64.urlsafe_b64encode(value).decode().rstrip('=')
payload=sid+'.'+enc(expiry.encode());cookie=payload+'.'+enc(hmac.new(b'Media-pages-QA-only-secret-2026-0123456789abcdef',payload.encode(),hashlib.sha256).digest())
db.commit()
(WORK/'standard-cookie.json').write_text(json.dumps(dict(cookie=cookie)))
logs=WORK/'logs';logs.mkdir(exist_ok=True)
(logs/'qa-media.log').write_text('\n'.join(json.dumps(dict(timestamp=iso(now),level=level,message='QA synthetic '+level,category='media-qa')) for level in ['INFO','WARN','ERROR'])+'\n',encoding='utf-8')
print(json.dumps({table:db.execute('SELECT COUNT(*) FROM "'+table+'"').fetchone()[0] for table in ['Media','PlaybackHistory','TelemetryEvent','ActiveStream']},sort_keys=True))
