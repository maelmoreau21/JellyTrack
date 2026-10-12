from contextlib import closing
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


class RepairTest(unittest.TestCase):
    def test_audit_backup_scope_and_idempotence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "data.db"
            with closing(sqlite3.connect(path)) as db:
                db.executescript('CREATE TABLE Media(id TEXT PRIMARY KEY,serverId TEXT,libraryName TEXT,collectionType TEXT,type TEXT); CREATE TABLE PlaybackHistory(id TEXT PRIMARY KEY,mediaId TEXT REFERENCES Media(id)); INSERT INTO Media VALUES(\'a\',\'s\',NULL,\'movies\',\'Movie\'),(\'b\',\'other\',NULL,\'movies\',\'Movie\'); INSERT INTO PlaybackHistory VALUES(\'p\',\'a\');')
                db.commit()
            mapping = root / "mapping.json"
            mapping.write_text(json.dumps([{"serverId": "s", "from": None, "to": "Films"}]), encoding="utf-8")
            command = [sys.executable, str(Path(__file__).with_name("repair-library-names.py")), str(path), "--mapping", str(mapping)]
            audit = json.loads(subprocess.check_output(command))
            self.assertFalse(audit["applied"])
            self.assertEqual(audit["changes"][0]["mediaCount"], 1)
            result = json.loads(subprocess.check_output(command + ["--apply"]))
            with closing(sqlite3.connect(result["backup"])) as backup:
                self.assertIsNone(backup.execute("SELECT libraryName FROM Media WHERE id='a'").fetchone()[0])
                self.assertEqual(backup.execute("PRAGMA quick_check").fetchone()[0], "ok")
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(db.execute("SELECT libraryName FROM Media WHERE id='a'").fetchone()[0], "Films")
                self.assertIsNone(db.execute("SELECT libraryName FROM Media WHERE id='b'").fetchone()[0])
                self.assertEqual(db.execute("SELECT * FROM PlaybackHistory").fetchall(), [("p", "a")])
            rerun = json.loads(subprocess.check_output(command + ["--apply"]))
            self.assertEqual(rerun["changes"][0]["mediaCount"], 0)
            mapping.write_text(json.dumps([{"serverId": "s", "from": "Films", "to": "movies"}, {"serverId": "s", "from": "movies", "to": "Films"}]), encoding="utf-8")
            rejected = subprocess.run(command + ["--apply"], capture_output=True)
            self.assertNotEqual(rejected.returncode, 0)


if __name__ == "__main__":
    unittest.main()
