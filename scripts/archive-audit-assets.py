"""Archive tracked audit images, verify every byte, then optionally prune the checkout.

The Git history is never rewritten. README illustrations stay in the repository.
Markdown references to archived images use the immutable source revision.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import quote, unquote
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--apply", action="store_true")
args = parser.parse_args()
revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
readme = (root / "README.md").read_text(encoding="utf-8")
keep = set(re.findall(r"(?:\]\(|src=\")((?:docs/)[^\)\"\s]+)", readme))
suffixes = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".webm", ".mp4"}
assets = [name for name in tracked if name.startswith("docs/") and Path(name).suffix.lower() in suffixes and name not in keep]
archive = args.output.resolve()
if archive.is_relative_to(root):
    raise SystemExit("The archive must be outside the repository.")
if archive.exists():
    raise SystemExit("Archive already exists; refusing to overwrite.")
archive.parent.mkdir(parents=True, exist_ok=True)
entries = []
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
    for name in assets:
        file = (root / name).resolve()
        if not file.is_relative_to(root) or file.is_symlink():
            raise SystemExit("Unsafe asset path: " + name)
        content = file.read_bytes()
        entries.append({"path": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
        target.writestr(name, content)
    target.writestr("archive-manifest.json", json.dumps({"revision": revision, "files": entries}, indent=2))
with zipfile.ZipFile(archive) as source:
    for entry in entries:
        if hashlib.sha256(source.read(entry["path"])).hexdigest() != entry["sha256"]:
            raise SystemExit("Archive verification failed: " + entry["path"])
manifest = {"revision": revision, "archiveName": archive.name, "archiveSHA256": hashlib.sha256(archive.read_bytes()).hexdigest(), "files": entries}
if args.apply:
    archived = set(assets)
    for name in tracked:
        if not name.endswith(".md"):
            continue
        file = root / name
        if not file.exists():
            continue
        text = file.read_text(encoding="utf-8")
        def replace_link(match):
            ref = match.group(1).strip("<>")
            if "://" in ref or ref.startswith("#"):
                return match.group(0)
            resolved = (file.parent / unquote(ref.split("#")[0])).resolve()
            if resolved.is_relative_to(root):
                relative = resolved.relative_to(root).as_posix()
                if relative in archived:
                    url = "https://raw.githubusercontent.com/maelmoreau21/JellyTrack/" + revision + "/" + quote(relative, safe="/")
                    return match.group(0).replace(match.group(1), url)
            return match.group(0)
        updated = re.sub(r"\[[^\]\n]*\]\(([^)\n]+)\)", replace_link, text)
        if updated != text:
            file.write_text(updated, encoding="utf-8")
    for name in assets:
        file = (root / name).resolve()
        if not file.is_relative_to(root):
            raise SystemExit("Unsafe deletion target: " + name)
        file.unlink()
    (root / "docs" / "AUDIT_ASSET_ARCHIVE.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"archive": str(archive), "files": len(assets), "bytes": sum(entry["bytes"] for entry in entries), "verified": True, "applied": args.apply}))
