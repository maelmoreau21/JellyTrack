"""Synthetic users fixtures: requires isolated scratch/users-qa/users.db."""
import sqlite3,datetime,json,hmac,hashlib,base64,os,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
target=root/'scratch/users-qa/users.db'
assert target.is_file(), 'Start the isolated Go server first to create scratch/users-qa/users.db'
subprocess.run([sys.executable,str(root/'scripts/users-qa/seed-reference-base.py'),'--database',str(target)],check=True)
db=sqlite3.connect(target); db.row_factory=sqlite3.Row
now=datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
iso=lambda d:d.isoformat().replace('+00:00','Z')
for uid,name in [('qa-empty','Empty QA'),('qa-many','Many Sessions QA'),('qa-partial','Partial Data QA')]:
 db.execute('INSERT OR IGNORE INTO User(id,serverId,jellyfinUserId,username,lastActive) VALUES(?,?,?,?,?)',(uid,'audit-primary',uid,name,None))
for i in range(135):
 start=now-datetime.timedelta(days=i%37,hours=i%24)
 db.execute('INSERT OR IGNORE INTO PlaybackHistory(id,serverId,userId,mediaId,playMethod,clientName,deviceName,durationWatched,startedAt,endedAt,bitrate) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(f'qa-many-{i}','audit-primary','qa-many',f'audit-primary-m{i%4}',['DirectPlay','Transcode','DirectStream'][i%3],['Jellyfin Web','Android TV','Finamp'][i%3],'QA device',[5400,1800,180,2400][i%4],iso(start),iso(start+datetime.timedelta(minutes=30)),12000000))
db.execute('INSERT OR IGNORE INTO PlaybackHistory(id,serverId,userId,mediaId,playMethod,durationWatched,startedAt) VALUES(?,?,?,?,?,?,?)',('qa-partial-0','audit-primary','qa-partial','audit-primary-m0','Unknown',120,iso(now)))
cookies={}
secret=os.environ.get('JELLYTRACK_SECRET','Users-QA-only-secret-2026-0123456789abcdef').encode()
enc=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')
for uid,name in [('jf-0','Alice Audit'),('qa-empty','Empty QA'),('qa-many','Many Sessions QA'),('qa-partial','Partial Data QA')]:
 sid='users-qa-session-'+uid; expiry=iso(now+datetime.timedelta(days=1))
 identity={'username':name,'role':'user','jellyfinUserId':uid,'authServerId':'audit-primary','identityVersion':1,'authServerName':'Audit principal','authServerIsPrimary':True}
 db.execute('INSERT OR REPLACE INTO AuthSession(id,username,role,expiresAt,createdAt,identity) VALUES(?,?,?,?,?,?)',(sid,name,'user',expiry,iso(now),json.dumps(identity)))
 payload=sid+'.'+enc(expiry.encode()); cookies[uid]=payload+'.'+enc(hmac.new(secret,payload.encode(),hashlib.sha256).digest())
db.commit()
fixture={}
for table in ['User','Server','Media','PlaybackHistory','TelemetryEvent']:
 fixture[table]=[dict(r) for r in db.execute('SELECT * FROM "'+table+'"')]
for media in fixture['Media']:
 for field in ['genres','directors','actors','studios']:media[field]=json.loads(media[field] or '[]')
(root/'scratch/users-qa/fixture.json').write_text(json.dumps(fixture),encoding='utf-8')
(root/'scratch/users-qa/standard-cookies.json').write_text(json.dumps(cookies),encoding='utf-8')
reference_root=Path(os.environ.get('REFERENCE_ROOT',str(root/'scratch/navigation-qa/main-reference'))).resolve()
if reference_root.is_dir() and (root/'scratch').resolve() in reference_root.parents:
 (reference_root/'qa-users-fixture.json').write_text(json.dumps(fixture),encoding='utf-8')
print('Isolated fixture:',len(fixture['User']),'users;',len(fixture['PlaybackHistory']),'sessions; signed standard-role sessions created.')
