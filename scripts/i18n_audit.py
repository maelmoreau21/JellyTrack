from pathlib import Path
import re, json, sys
from datetime import datetime

root = Path('.').resolve()
messages_dir = root / 'messages'
if not messages_dir.exists():
    print('ERROR: messages directory not found at', messages_dir)
    sys.exit(1)

# Load and flatten locale files
def flatten(d, prefix=''):
    items = []
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            items.extend(flatten(v, key))
        else:
            items.append(key)
    return items

locale_files = sorted([p for p in messages_dir.glob('*.json')])
locales = {}
for p in locale_files:
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:
        print(f'ERROR reading {p}: {e}')
        data = {}
    locales[p.name] = set(flatten(data))

# Collect source files
ignore_dirs = {'node_modules', '.next', 'out', 'dist', 'public', 'migrations'}
sources = []
for p in root.rglob('*'):
    if p.is_file() and p.suffix in {'.ts', '.tsx', '.js', '.jsx', '.mdx'}:
        parts = set(p.parts)
        if parts & ignore_dirs:
            continue
        # skip messages dir
        if 'messages' in p.parts:
            continue
        sources.append(p)

# Patterns to find translation usages
assign_pattern = re.compile(r"\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*useTranslations\(\s*['\"]([^'\"]+)['\"]\s*\)")
immediate_pattern = re.compile(r"useTranslations\(\s*['\"]([^'\"]+)['\"]\s*\)\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")
var_call_template = r"\b{var}\(\s*['\"]([^'\"]+)['\"]\s*\)"
formatted_pattern = re.compile(r"<FormattedMessage[^>]*\bid\s*=\s*['\"]([^'\"]+)['\"]")
format_message_pattern = re.compile(r"\b(?:formatMessage|intl\.formatMessage)\(\s*\{[^}]*\bid\s*:\s*['\"]([^'\"]+)['\"]", re.S)
# Generic t('key') fallback (may include false positives)
t_fallback = re.compile(r"\b(t|T)\(\s*['\"]([A-Za-z0-9_.\-]+)['\"]\s*\)")

used_keys = set()
for src in sources:
    try:
        text = src.read_text(encoding='utf-8')
    except Exception:
        continue
    # immediate useTranslations('ns')('key')
    for m in immediate_pattern.finditer(text):
        ns, key = m.group(1), m.group(2)
        if '.' in key:
            used_keys.add(key)
        else:
            used_keys.add(f"{ns}.{key}")

    # assignments like: const t = useTranslations('ns')
    assigns = {}
    for m in assign_pattern.finditer(text):
        varname, ns = m.group(1), m.group(2)
        assigns[varname] = ns
    # For each assigned var, find calls var('key')
    for varname, ns in assigns.items():
        pat = re.compile(var_call_template.format(var=re.escape(varname)))
        for m in pat.finditer(text):
            key = m.group(1)
            if '.' in key:
                used_keys.add(key)
            else:
                used_keys.add(f"{ns}.{key}")

    # FormattedMessage id="..."
    for m in formatted_pattern.finditer(text):
        used_keys.add(m.group(1))

    # formatMessage({ id: '...' }) etc.
    for m in format_message_pattern.finditer(text):
        used_keys.add(m.group(1))

    # fallback: direct t('some.key') where t may be translation function
    for m in t_fallback.finditer(text):
        key = m.group(2)
        used_keys.add(key)

# Normalize used keys: remove duplicates and ensure no empty
used_keys = {k for k in used_keys if k and not k.startswith('http')}

# Compare per-locale
report = {
    'generatedAt': datetime.utcnow().isoformat() + 'Z',
    'usedKeysCount': len(used_keys),
    'usedKeysSample': sorted(list(used_keys))[:200],
    'locales': {}
}
for locale_file, keys in locales.items():
    missing = sorted(list(used_keys - keys))
    extra = sorted(list(keys - used_keys))
    report['locales'][locale_file] = {
        'localeKeyCount': len(keys),
        'missingCount': len(missing),
        'missingSample': missing[:200],
        'extraCount': len(extra),
        'extraSample': extra[:200]
    }

# Write report files
out_json = root / 'i18n_audit_report.json'
out_md = root / 'i18n_audit_report.md'
out_json.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')

# Write a short markdown summary
lines = []
lines.append('# i18n Audit Report')
lines.append('Generated: ' + report['generatedAt'])
lines.append('')
lines.append(f"Used translation keys discovered: **{report['usedKeysCount']}**")
lines.append('')
lines.append('| Locale file | Locale keys | Missing | Extra |')
lines.append('|---|---:|---:|---:|')
for lf, v in report['locales'].items():
    lines.append(f"| {lf} | {v['localeKeyCount']} | {v['missingCount']} | {v['extraCount']} |")
lines.append('')
lines.append('## Notes')
lines.append('- The tool attempts to statically detect translation keys. Dynamic keys (template literals, concatenation) may be missed.')
lines.append('- It also uses a loose fallback for `t(\'...\')` which may include false positives if `t` is used for other purposes.')
lines.append('')
lines.append('## Per-locale missing keys (first 200 shown)')
for lf, v in report['locales'].items():
    lines.append(f"### {lf} — missing: {v['missingCount']}")
    if v['missingSample']:
        lines.append('')
        for k in v['missingSample']:
            lines.append(f'- {k}')
    else:
        lines.append('\n- (none)')
    lines.append('')

out_md.write_text('\n'.join(lines), encoding='utf-8')

print('OK')
print('Report written to', out_json)
print('Also wrote', out_md)
