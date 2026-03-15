import json
from collections import defaultdict

r = json.load(open('i18n_missing_by_page.json', encoding='utf-8'))
locales = r.get('locales', {})
print('Locales summary:')
for lf, v in sorted(locales.items(), key=lambda x: x[0]):
    print(f"- {lf}: {v.get('total_untranslated',0)} untranslated keys")

# Aggregate per-file across locales
file_counts = defaultdict(set)
for lf, v in locales.items():
    for f, keys in v.get('by_file', {}).items():
        for k in keys:
            file_counts[f].add(k)

agg = [(f, len(keys)) for f, keys in file_counts.items()]
agg.sort(key=lambda x: x[1], reverse=True)
print('\nTop files with most unique missing keys (across locales):')
for f, cnt in agg[:20]:
    print(f"- {f}: {cnt} keys")

# Show small sample per top file
print('\nSample missing keys for top files:')
for f, cnt in agg[:6]:
    sample = set()
    for lf, v in locales.items():
        ks = v.get('by_file', {}).get(f, [])
        for k in ks:
            sample.add(k)
    print(f"\n{f} ({len(sample)} unique keys):")
    for k in list(sample)[:20]:
        print(f"  - {k}")

print('\nReport file: i18n_missing_by_page.json')
