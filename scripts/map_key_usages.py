from pathlib import Path
import re, json, sys

root = Path('.').resolve()
messages_dir = root / 'messages'
if not messages_dir.exists():
    print('ERROR: messages directory not found at', messages_dir)
    sys.exit(1)

ignore_dirs = {'node_modules', '.next', 'out', 'dist', 'public', 'migrations'}
source_suffixes = {'.ts', '.tsx', '.js', '.jsx', '.mdx'}

# Patterns (similar to other i18n helpers)
assign_pattern = re.compile(r"\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*useTranslations\(\s*['\"]([^'\"]+)['\"]\s*\)")
immediate_pattern = re.compile(r"useTranslations\(\s*['\"]([^'\"]+)['\"]\s*\)\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")
formatted_pattern = re.compile(r"<FormattedMessage[^>]*\bid\s*=\s*['\"]([^'\"]+)['\"]")
format_message_pattern = re.compile(r"\b(?:formatMessage|intl\.formatMessage)\(\s*\{[^}]*\bid\s*:\s*['\"]([^'\"]+)['\"]", re.S)
t_fallback = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\(\s*['\"]([A-Za-z0-9_.\-]+)['\"]\s*\)")

key_usages = {}
files_map = {}
seen = set()

for p in root.rglob('*'):
    if not p.is_file():
        continue
    if p.suffix not in source_suffixes:
        continue
    parts = set(p.parts)
    if parts & ignore_dirs:
        continue
    if 'messages' in p.parts:
        continue

    try:
        text = p.read_text(encoding='utf-8')
    except Exception:
        continue
    lines = text.splitlines()

    # find assigned vars (varname -> namespace)
    assigns = {}
    for m in assign_pattern.finditer(text):
        varname, ns = m.group(1), m.group(2)
        assigns[varname] = ns

    rel = str(p.relative_to(root)).replace('\\','/')
    files_map.setdefault(rel, set())

    # immediate pattern
    for m in immediate_pattern.finditer(text):
        ns, key = m.group(1), m.group(2)
        full = key if '.' in key else f"{ns}.{key}"
        pos = m.start()
        line_no = text.count('\n', 0, pos) + 1
        snippet = lines[line_no-1].strip() if 0 <= line_no-1 < len(lines) else ''
        rid = (full, rel, line_no)
        if rid in seen: continue
        seen.add(rid)
        key_usages.setdefault(full, []).append({'file': rel, 'line': line_no, 'snippet': snippet})
        files_map[rel].add(full)

    # var calls like t('key') for assigned vars
    for varname, ns in assigns.items():
        pat = re.compile(rf"\b{re.escape(varname)}\(\s*['\"]([^'\"]+)['\"]\s*\)")
        for m in pat.finditer(text):
            key = m.group(1)
            full = key if '.' in key else f"{ns}.{key}"
            pos = m.start()
            line_no = text.count('\n', 0, pos) + 1
            snippet = lines[line_no-1].strip() if 0 <= line_no-1 < len(lines) else ''
            rid = (full, rel, line_no)
            if rid in seen: continue
            seen.add(rid)
            key_usages.setdefault(full, []).append({'file': rel, 'line': line_no, 'snippet': snippet})
            files_map[rel].add(full)

    # formatMessage / intl.formatMessage
    for m in format_message_pattern.finditer(text):
        key = m.group(1)
        full = key
        pos = m.start()
        line_no = text.count('\n', 0, pos) + 1
        snippet = lines[line_no-1].strip() if 0 <= line_no-1 < len(lines) else ''
        rid = (full, rel, line_no)
        if rid in seen: continue
        seen.add(rid)
        key_usages.setdefault(full, []).append({'file': rel, 'line': line_no, 'snippet': snippet})
        files_map[rel].add(full)

    # FormattedMessage id
    for m in formatted_pattern.finditer(text):
        key = m.group(1)
        full = key
        pos = m.start()
        line_no = text.count('\n', 0, pos) + 1
        snippet = lines[line_no-1].strip() if 0 <= line_no-1 < len(lines) else ''
        rid = (full, rel, line_no)
        if rid in seen: continue
        seen.add(rid)
        key_usages.setdefault(full, []).append({'file': rel, 'line': line_no, 'snippet': snippet})
        files_map[rel].add(full)

    # t-style fallback calls (generic)
    for m in t_fallback.finditer(text):
        varname = m.group(1)
        key = m.group(2)
        # if key has dot, use as-is
        if '.' in key:
            full = key
        else:
            ns = assigns.get(varname)
            if ns:
                full = f"{ns}.{key}"
            else:
                full = key
        pos = m.start()
        line_no = text.count('\n', 0, pos) + 1
        snippet = lines[line_no-1].strip() if 0 <= line_no-1 < len(lines) else ''
        rid = (full, rel, line_no)
        if rid in seen: continue
        seen.add(rid)
        key_usages.setdefault(full, []).append({'file': rel, 'line': line_no, 'snippet': snippet})
        files_map[rel].add(full)

# convert sets to lists
files_map_serializable = {f: sorted(list(v)) for f, v in files_map.items()}

out = {'generatedAt': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'keys': key_usages, 'files': files_map_serializable}
open('i18n_key_usages.json','w',encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=2))
print('Wrote i18n_key_usages.json with', len(key_usages), 'unique keys and', len(files_map_serializable), 'files')
