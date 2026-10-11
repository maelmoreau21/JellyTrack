"""Restore the two original synthetic live rows just before the live UI checks.

The real telemetry cleaner expires fixture streams without recurring heartbeats.
No history or production database is changed, and no additional stream is created.
"""
import datetime as dt
import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[2]
target = (root / 'scratch/media-pages-qa/media-pages.db').resolve()
assert target == root / 'scratch/media-pages-qa/media-pages.db'
fixture = json.loads((root / 'scratch/navigation-qa/main-reference/qa-users-fixture.json').read_text(encoding='utf-8'))
rows = fixture['ActiveStream']
assert len(rows) == 2 and all(row['id'] in ('qa-primary-active', 'qa-secondary-active') for row in rows)
now = dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
with sqlite3.connect(target) as db:
    columns = {row[1] for row in db.execute('PRAGMA table_info(ActiveStream)')}
    for original in rows:
        row = {key: value for key, value in original.items() if key in columns}
        row['lastPingAt'] = now
        keys = list(row)
        db.execute('INSERT OR REPLACE INTO ActiveStream (' + ','.join('"' + key + '"' for key in keys) + ') VALUES (' + ','.join('?' for _ in keys) + ')', [row[key] for key in keys])
print('Refreshed only the two original QA live streams; history unchanged.')
