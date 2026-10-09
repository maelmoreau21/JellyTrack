"""Seed only the named isolated settings/admin QA database."""
import base64, datetime, hashlib, hmac, json, sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[2]
target = root / 'scratch/settings-admin-qa/settings-admin.db'
assert target.is_file(), 'Start run-isolated.py first'
db = sqlite3.connect(target)
now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
iso = lambda value: value.isoformat().replace('+00:00','Z')
for sid, name in [('qa-primary', 'QA principal'), ('qa-secondary', 'QA secondaire')]:
    db.execute('INSERT OR IGNORE INTO Server(id,jellyfinServerId,name,url,isActive) VALUES(?,?,?,?,0)', (sid,sid,name,'http://127.0.0.1:9'))
    db.execute('INSERT OR IGNORE INTO User(id,serverId,jellyfinUserId,username,lastActive) VALUES(?,?,?,?,?)', (sid+'-user',sid,'qa-user','QA utilisateur',iso(now)))
    db.execute('UPDATE Server SET jellyfinApiKey=? WHERE id=?', ('QA-server-secret-'+sid,sid))
    db.execute('UPDATE Server SET url=? WHERE id=?', ('http://127.0.0.1:9' if sid=='qa-primary' else 'http://localhost:9',sid))
    db.execute('INSERT OR IGNORE INTO Media(id,serverId,jellyfinMediaId,title,type,libraryName,collectionType,dateAdded) VALUES(?,?,?,?,?,?,?,?)', (sid+'-movie',sid,sid+'-movie','Film QA '+name,'Movie','Films QA','movies',iso(now)))
    old=iso(now-datetime.timedelta(days=45))
    db.execute('INSERT OR IGNORE INTO Media(id,serverId,jellyfinMediaId,title,type,libraryName,collectionType,dateAdded,createdAt,resolution,size) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(sid+'-duplicate',sid,'qa-duplicate-jid','Double QA','Movie','Films QA','movies',old,old,'1080p',1048576))
for i in range(30):
    old=iso(now-datetime.timedelta(days=800+i))
    mid=f'qa-ghost-{i:02d}'
    db.execute('INSERT OR IGNORE INTO Media(id,serverId,jellyfinMediaId,title,type,libraryName,collectionType,dateAdded,createdAt,size) VALUES(?,?,?,?,?,?,?,?,?,?)',(mid,'qa-primary',mid,f'Été QA fantôme {i:02d}','Movie','Films QA','movies',old,old,1048576))
old=iso(now-datetime.timedelta(days=800))
db.execute('INSERT OR IGNORE INTO Media(id,serverId,jellyfinMediaId,title,type,libraryName,collectionType,dateAdded,createdAt,size) VALUES(?,?,?,?,?,?,?,?,?,?)',('qa-csv-formula','qa-primary','qa-csv-formula','=2+2','Audio','Films QA','music',old,old,1000))
db.execute("UPDATE Media SET type='Movie',collectionType='movies' WHERE id='qa-csv-formula'")
db.execute('INSERT OR IGNORE INTO Media(id,serverId,jellyfinMediaId,title,type,libraryName,collectionType,durationMs,dateAdded) VALUES(?,?,?,?,?,?,?,?,?)',('qa-abandoned','qa-primary','qa-abandoned','Abandonné QA','Movie','Films QA','movies',3600000,iso(now-datetime.timedelta(days=45))))
db.execute('INSERT OR IGNORE INTO PlaybackHistory(id,serverId,userId,mediaId,playMethod,durationWatched,startedAt,endedAt) VALUES(?,?,?,?,?,?,?,?)',('qa-abandoned-playback','qa-primary','qa-primary-user','qa-abandoned','DirectPlay',540,iso(now),None))
db.execute("UPDATE PlaybackHistory SET durationWatched=540,endedAt=? WHERE id='qa-abandoned-playback'",(iso(now+datetime.timedelta(seconds=540)),))
assert db.execute("SELECT COUNT(*) FROM PlaybackHistory WHERE id='qa-abandoned-playback'").fetchone()[0]==1,'Required playback fixture not inserted'
db.execute("INSERT OR IGNORE INTO GlobalSettings(id) VALUES('global')")
db.execute("UPDATE GlobalSettings SET defaultLocale='fr' WHERE id='global'")
resolution={'completionRules':{'libraries':{'photos':{'completionEnabled':False,'abandonedThreshold':7,'partialThreshold':17,'completedThreshold':87}}},'schedulerIntervals':{'recentSyncEveryHours':6,'fullSyncEveryHours':48,'integrityCheckEveryHours':6,'backupEveryHours':24,'logRetentionDays':30},'qaPreserve':{'fixture':True}}
sso={'enabled':False,'url':'','clientId':'qa-client','clientSecret':'QA-sso-secret-keep-2026','userGroup':'qa-users','adminGroup':'qa-admins','autoRedirect':True,'tokenAlg':'RS256'}
db.execute("UPDATE GlobalSettings SET resolutionThresholds=?,excludedLibraries=?,ssoSettings=?,pluginApiKey=? WHERE id='global'",(json.dumps(resolution),json.dumps(['legacy-qa-library','srvlib|qa-orphan|Films%20QA']),json.dumps(sso),'QA-plugin-global-key-2026-'+('a'*40)))
sid = 'settings-admin-qa-user-session'
expiry = iso(now + datetime.timedelta(days=1))
identity = {'username':'QA utilisateur','role':'user','jellyfinUserId':'qa-user','authServerId':'qa-primary','identityVersion':1,'authServerName':'QA principal','authServerIsPrimary':True}
db.execute('INSERT OR REPLACE INTO AuthSession(id,username,role,expiresAt,createdAt,identity) VALUES(?,?,?,?,?,?)', (sid,'QA utilisateur','user',expiry,iso(now),json.dumps(identity)))
enc = lambda value: base64.urlsafe_b64encode(value).decode().rstrip('=')
payload = sid + '.' + enc(expiry.encode())
cookie = payload + '.' + enc(hmac.new(b'Settings-admin-QA-only-secret-2026-0123456789abcdef',payload.encode(),hashlib.sha256).digest())
db.commit()
(target.parent / 'standard-cookie.json').write_text(json.dumps({'cookie':cookie}))
print('Synthetic fixture: two disabled localhost servers and one standard session. No real server or database used.')
