from pathlib import Path
import json, sys

root = Path('.').resolve()
messages_dir = root / 'messages'
if not messages_dir.exists():
    print('messages/ not found')
    raise SystemExit(1)


def flatten(d, prefix=''):
    items = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            items.update(flatten(v, key))
        else:
            items[key] = v
    return items

# load english
en = json.loads((messages_dir / 'en.json').read_text(encoding='utf-8'))
en_map = flatten(en)

# load key usages
try:
    key_usages = json.loads((root / 'i18n_key_usages.json').read_text(encoding='utf-8'))
    usages = key_usages.get('keys', {})
except Exception:
    usages = {}

report = {'generatedAt': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'locales': {}}

for p in sorted(messages_dir.glob('*.json')):
    if p.name == 'en.json':
        continue
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:
        print('Error reading', p.name, e)
        continue
    loc_map = flatten(data)
    untranslated = []
    for k, ev in en_map.items():
        lv = loc_map.get(k)
        if lv is None:
            untranslated.append(k)
        else:
            try:
                if isinstance(lv, str) and (lv.strip() == ev.strip() or lv.startswith('TODO:') or lv == f"TODO: {k}"):
                    untranslated.append(k)
            except Exception:
                pass

    # map untranslated keys to files
    per_file = {}
    no_usage = []
    for key in untranslated:
        found = usages.get(key)
        if not found:
            # try suffix match
            suffix = key.split('.')[-1]
            matches = []
            for ku, occ in usages.items():
                if ku == suffix or ku.endswith('.' + suffix):
                    matches.extend(occ)
            found = matches if matches else None
        if found:
            for occ in found:
                f = occ.get('file')
                per_file.setdefault(f, []).append(key)
        else:
            no_usage.append(key)

    report['locales'][p.name] = {
        'total_untranslated': len(untranslated),
        'by_file': {f: sorted(v) for f, v in per_file.items()},
        'no_usage': sorted(no_usage)
    }

out_path = root / 'i18n_missing_by_page.json'
out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('Wrote', out_path)
