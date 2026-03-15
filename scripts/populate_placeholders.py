from pathlib import Path
import re, json, sys

root = Path('.').resolve()
messages_dir = root / 'messages'
if not messages_dir.exists():
    print('ERROR: messages directory not found at', messages_dir)
    sys.exit(1)

# Flatten / unflatten helpers

def flatten(d, prefix=''):
    items = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            items.update(flatten(v, key))
        else:
            items[key] = v
    return items


def unflatten(mapping):
    root = {}
    for full_key, val in mapping.items():
        parts = full_key.split('.')
        node = root
        for p in parts[:-1]:
            if p not in node or not isinstance(node[p], dict):
                node[p] = {}
            node = node[p]
        node[parts[-1]] = val
    return root

# Load English source
en_path = messages_dir / 'en.json'
try:
    en = json.loads(en_path.read_text(encoding='utf-8'))
except Exception as e:
    print('ERROR reading en.json:', e)
    en = {}
en_map = flatten(en)

# Collect source files to detect used keys
ignore_dirs = {'node_modules', '.next', 'out', 'dist', 'public', 'migrations'}
sources = []
for p in root.rglob('*'):
    if p.is_file() and p.suffix in {'.ts', '.tsx', '.js', '.jsx', '.mdx'}:
        parts = set(p.parts)
        if parts & ignore_dirs:
            continue
        if 'messages' in p.parts:
            continue
        sources.append(p)

# Patterns
assign_pattern = re.compile(r"\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*useTranslations\(\s*['\"]([^'\"]+)['\"]\s*\)")
immediate_pattern = re.compile(r"useTranslations\(\s*['\"]([^'\"]+)['\"]\s*\)\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")
var_call_template = r"\b{var}\(\s*['\"]([^'\"]+)['\"]\s*\)"
formatted_pattern = re.compile(r"<FormattedMessage[^>]*\bid\s*=\s*['\"]([^'\"]+)['\"]")
format_message_pattern = re.compile(r"\b(?:formatMessage|intl\.formatMessage)\(\s*\{[^}]*\bid\s*:\s*['\"]([^'\"]+)['\"]", re.S)
# Generic t('key') fallback
t_fallback = re.compile(r"\b(t|T)\(\s*['\"]([A-Za-z0-9_.\-]+)['\"]\s*\)")

used_keys = set()
for src in sources:
    try:
        text = src.read_text(encoding='utf-8')
    except Exception:
        continue
    for m in immediate_pattern.finditer(text):
        ns, key = m.group(1), m.group(2)
        if '.' in key:
            used_keys.add(key)
        else:
            used_keys.add(f"{ns}.{key}")
    assigns = {}
    for m in assign_pattern.finditer(text):
        varname, ns = m.group(1), m.group(2)
        assigns[varname] = ns
    for varname, ns in assigns.items():
        pat = re.compile(var_call_template.format(var=re.escape(varname)))
        for m in pat.finditer(text):
            key = m.group(1)
            if '.' in key:
                used_keys.add(key)
            else:
                used_keys.add(f"{ns}.{key}")
    for m in formatted_pattern.finditer(text):
        used_keys.add(m.group(1))
    for m in format_message_pattern.finditer(text):
        used_keys.add(m.group(1))
    for m in t_fallback.finditer(text):
        key = m.group(2)
        used_keys.add(key)

used_keys = {k for k in used_keys if k and not k.startswith('http')}
print('Detected', len(used_keys), 'used translation keys')

# Update each locale file
locale_files = sorted([p for p in messages_dir.glob('*.json')])
summary = {}
for p in locale_files:
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:
        print('ERROR reading', p.name, e)
        data = {}
    loc_map = flatten(data)
    added = 0
    for key in used_keys:
        if key not in loc_map:
            if key in en_map:
                loc_map[key] = en_map[key]
            else:
                loc_map[key] = f"TODO: {key}"
            added += 1
    if added > 0:
        # backup
        bak = str(p) + '.bak'
        try:
            p.write_text(json.dumps(unflatten(loc_map), ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception as e:
            print('ERROR writing', p.name, e)
    summary[p.name] = added

print('\nAdded keys per locale:')
for lf, cnt in summary.items():
    print(f"- {lf}: +{cnt}")

print('\nDone. You can re-run scripts/i18n_audit.py to verify the audit.')
