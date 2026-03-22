from pathlib import Path
import json

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


en = json.loads((messages_dir / 'en.json').read_text(encoding='utf-8'))
en_map = flatten(en)

report = {}
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
            untranslated.append({'key': k, 'reason': 'missing'})
        else:
            try:
                if isinstance(lv, str) and (lv.strip() == ev.strip() or lv.startswith('TODO:') or lv == f"TODO: {k}"):
                    untranslated.append({'key': k, 'reason': 'same-as-en' if lv.strip() == ev.strip() else 'todo'})
            except Exception:
                pass
    report[p.name] = {'count': len(untranslated), 'sample': untranslated[:30]}

out_path = root / 'i18n_untranslated_report.json'
out_path.write_text(json.dumps({'generatedAt': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'report': report}, ensure_ascii=False, indent=2), encoding='utf-8')

for lf, v in report.items():
    print(f"{lf}: {v['count']} untranslated (sample {len(v['sample'])})")

print('\nWrote', out_path)
