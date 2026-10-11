"""Build the runtime issue register only from complete browser evidence."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
out = root / 'docs/runtime-regressions'
validation = []
for filename, expected in [('browser-results.json', 24), ('settings-browser.json', 10), ('core-runtime.json', 50)]:
    result = json.loads((out / filename).read_text(encoding='utf-8'))
    checks = result['checks']
    assert len(checks) == expected, (filename, len(checks))
    assert all(check['ok'] for check in checks), filename
    assert not result.get('failure') and not result.get('errors') and not result.get('pageErrors'), filename
    validation.append({'file': filename, 'passed': expected})
core = json.loads((out / 'core-runtime.json').read_text(encoding='utf-8'))
assert core['assets'] and all(asset['same'] and asset['status'] == 200 for asset in core['assets'])
entries = []
for line in (out / 'README.md').read_text(encoding='utf-8').splitlines():
    if line.startswith('| R'):
        identifier, correction, files, proof, status = [part.strip() for part in line.split('|')[1:-1]]
        entries.append({'id': identifier, 'files': files.split(', '), 'correction': correction, 'proofAndTests': proof,
                        'status': 'fixed_locally', 'history': [{'date': '2026-10-11', 'status': 'reported'}, {'date': '2026-10-11', 'status': 'fixed_locally', 'evidence': proof}]})
assert len(entries) == 13
entries.extend([
    {'id': 'R014', 'status': 'production_validation_pending', 'correction': 'Mesurer les chargements et CPU/RAM sur la véritable instance.', 'files': [], 'proofAndTests': 'Aucune mesure de production disponible.'},
    {'id': 'R015', 'status': 'historical_data_review_pending', 'correction': 'Examiner les anciens orphelins sans effacer ni clôturer massivement des données.', 'files': [], 'proofAndTests': 'Les tests confirment la préservation des anciennes lignes ; leur cause en production reste à examiner.'},
])
report = {'date': '2026-10-11', 'scope': 'Runtime bug fixes, not a new historical parity audit.', 'base': '0356455', 'branch': 'codex/frontend-recovery',
          'fixedLocally': 13, 'followupsRemaining': 2, 'browserChecksPassed': 84, 'validation': validation, 'entries': entries}
target = out / 'ISSUE_MATRIX.json'
temporary = target.with_suffix('.json.tmp')
temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
temporary.replace(target)
print('Runtime register: 13 fixes, 2 follow-ups, 84 complete browser checks.')
