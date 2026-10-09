"""Temporarily toggle Wrapped ONLY in the dedicated QA database, restoring exact values."""
from pathlib import Path
import sqlite3,json,sys
root=Path(__file__).resolve().parents[2];target=root/'scratch/users-qa/users.db'
assert target.is_file()
snapshot=root/'scratch/users-qa/wrapped-original.json'
db=sqlite3.connect(target,timeout=10)
if sys.argv[1]=='restore':
 if snapshot.exists():
  values=json.loads(snapshot.read_text())
  db.execute('UPDATE GlobalSettings SET wrappedVisible=?,wrappedPeriodEnabled=? WHERE id=?',(*values,'global'))
  db.commit();snapshot.unlink()
else:
 if not snapshot.exists():
  values=db.execute("SELECT wrappedVisible,wrappedPeriodEnabled FROM GlobalSettings WHERE id='global'").fetchone()
  snapshot.write_text(json.dumps(values))
 db.execute("UPDATE GlobalSettings SET wrappedVisible=?,wrappedPeriodEnabled=0 WHERE id='global'",(int(sys.argv[1]),));db.commit()
print('QA Wrapped settings '+sys.argv[1])
