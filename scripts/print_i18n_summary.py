import json
r=json.load(open('i18n_audit_report.json', encoding='utf-8'))
print('Used keys:', r.get('usedKeysCount'))
for lf,v in r['locales'].items():
    print(f"{lf}: missing={v['missingCount']}, keys={v['localeKeyCount']}")
