from pathlib import Path
import sqlite3,sys
root=Path(__file__).resolve().parents[2];target=root/'scratch/users-qa/users.db'
assert target.is_file()
db=sqlite3.connect(target,timeout=10)
for i in range(26):
 uid=f'qa-pager-{i:02}'
 if sys.argv[1]=='create':
  db.execute('INSERT OR IGNORE INTO User(id,serverId,jellyfinUserId,username) VALUES(?,?,?,?)',(uid,'audit-primary',uid,f'Pagination QA {i:02}'))
 elif sys.argv[1]=='restore':
  db.execute('DELETE FROM User WHERE id=? AND jellyfinUserId=? AND serverId=?',(uid,uid,'audit-primary'))
 else:raise ValueError('create or restore only')
db.commit()
