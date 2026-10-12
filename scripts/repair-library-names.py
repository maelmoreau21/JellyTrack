"""Temporary SQLite library repair. Audit by default; explicit per-server mapping."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
from datetime import datetime, timezone


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--mapping", type=Path, help='JSON array: [{"serverId":"...","from":null,"to":"Films"}]')
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    path = args.database.resolve(strict=True)
    if args.apply and not args.mapping:
        parser.error("--apply requires --mapping")
    mode = "rw" if args.apply else "ro"
    db = sqlite3.connect(path.as_uri() + "?mode=" + mode, uri=True, timeout=30)
    db.execute("PRAGMA foreign_keys=ON")
    if db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
        raise RuntimeError("SQLite integrity check failed; no repair performed")
    violations = db.execute("PRAGMA foreign_key_check").fetchall()
    libraries = db.execute('SELECT "serverId","libraryName","collectionType","type",COUNT(*) FROM "Media" GROUP BY "serverId","libraryName","collectionType","type" ORDER BY "serverId","libraryName"').fetchall()
    report = {"integrity": "ok", "foreignKeyViolations": len(violations), "libraries": libraries, "changes": []}
    mappings = json.loads(args.mapping.read_text(encoding="utf-8-sig")) if args.mapping else []
    if not isinstance(mappings, list):
        raise ValueError("Mapping must be a JSON array")
    seen = set()
    for entry in mappings:
        sid, old, new = entry["serverId"], entry["from"], entry["to"]
        if not isinstance(sid, str) or not sid or (old is not None and not isinstance(old, str)) or not isinstance(new, str) or not new.strip() or new != new.strip() or old == new:
            raise ValueError("Invalid server or library mapping")
        if (sid, old) in seen:
            raise ValueError("Duplicate mapping source")
        seen.add((sid, old))
    if any((entry["serverId"], entry["to"]) in seen for entry in mappings):
        raise ValueError("Chained mappings are not allowed")
    if args.apply:
        if violations:
            raise RuntimeError("Foreign key violations exist; inspect the import before repair")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup_path = path.with_name(path.name + ".before-library-repair-" + stamp)
        with sqlite3.connect(backup_path) as backup:
            db.backup(backup)
            if backup.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                raise RuntimeError("Backup integrity check failed")
        report["backup"] = str(backup_path)
        with backup_path.open("rb") as backup_file:
            report["backupSHA256"] = hashlib.file_digest(backup_file, "sha256").hexdigest()
        # Lock writes before counting and modifying. Playback history is untouched.
        db.execute("BEGIN IMMEDIATE")
    else:
        db.execute("BEGIN")
    try:
        history_before = db.execute('SELECT COUNT(*) FROM "PlaybackHistory"').fetchone()[0]
        media_before = db.execute('SELECT COUNT(*) FROM "Media"').fetchone()[0]
        for entry in mappings:
            count = db.execute('SELECT COUNT(*) FROM "Media" WHERE "serverId"=? AND "libraryName" IS ?', (entry["serverId"], entry["from"])).fetchone()[0]
            report["changes"].append({**entry, "mediaCount": count})
            if args.apply:
                db.execute('UPDATE "Media" SET "libraryName"=? WHERE "serverId"=? AND "libraryName" IS ?', (entry["to"], entry["serverId"], entry["from"]))
                if db.execute('SELECT COUNT(*) FROM "Media" WHERE "serverId"=? AND "libraryName" IS ?', (entry["serverId"], entry["from"])).fetchone()[0]:
                    raise RuntimeError("Repair reread failed")
        if history_before != db.execute('SELECT COUNT(*) FROM "PlaybackHistory"').fetchone()[0] or media_before != db.execute('SELECT COUNT(*) FROM "Media"').fetchone()[0]:
            raise RuntimeError("Unexpected row count change")
        if args.apply:
            if db.execute("PRAGMA foreign_key_check").fetchall() or db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                raise RuntimeError("Post-repair integrity check failed")
            db.commit()
        else:
            db.rollback()
        report["applied"] = args.apply
        print(json.dumps(report, ensure_ascii=True, indent=2))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
