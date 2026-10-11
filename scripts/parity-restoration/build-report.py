"""Consolidate the preserved baseline and individually evidenced corrections.

This does not execute tests and must run after the final integration checks.
Unknown / not applicable cells are preserved unless specifically verified.
"""
import collections
import copy
import csv
import hashlib
import json
import io
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
out = root / 'docs/parity-restoration'
baseline = json.loads((out / 'PARITY_MATRIX.before.json').read_text(encoding='utf-8'))
matrix = copy.deepcopy(baseline)
faithful, justified, pending = matrix['states'][:3]
date = '2026-10-11'

def read(name):
    return json.loads((out / name).read_text(encoding='utf-8-sig'))

for name, minimum in [('core-runtime.json', 50), ('users-settings-runtime.json', 79), ('media-runtime.json', 142)]:
    evidence = read(name)
    assert len(evidence['checks']) >= minimum, (name, 'incomplete evidence')
    assert all(c['ok'] for c in evidence['checks']), (name, 'failed checks')
assert all(read('go-quality-final.json')[kind] == 0 for kind in ('test', 'vet', 'build'))

users_document = read('users-settings-cells.json')
ledger = {c['id']: c for c in users_document['cells']}
profile = ledger['/users/[id]#Apparence']
previous_profile = copy.deepcopy(profile)
profile.update(recommendedStatus=faithful, resolution='corrected', correction='Donut : survol central, rayons 60/90, placement des secteurs et légende alphabétique; barres genres 20px, marges 40/30, grilles pointillées, graduations et couleur horaire historiques.', tests='Contrôles utilisateurs/paramètres, profils/historique/préférences navigateur; comparaison directe des graphiques après défilement; mesure réelle des rayons du donut.', proofs=['users-settings-runtime.json', 'visual-validation.md', 'visual-profile-geometry.json', 'visual-profile-completion-source.json'], limitations='Canvas et SVG ne sont pas identiques au pixel; comptage 13/2 main versus 14/1 Go documenté : bug du seuil Audio historique, règle musique Go préservée.')

route_changes = {
    '/login': (['web/dist/assets/app.js', 'web/dist/assets/wrapped-recovery.css'], 'KeyRound et thème Sun en sombre / Moon en clair restaurés.', ['core-runtime.json', 'navigation.md']),
    '/logs': (['web/dist/assets/history.js', 'web/dist/assets/history-recovery.css', 'web/dist/assets/navigation.js', 'internal/api/history_recovery.go'], 'Terminal, contrôles SVG, tableau de largeurs historiques, dates sur deux lignes, liens cyan, reset conditionnel et vrai débit audio.', ['core-runtime.json', 'functional.md', 'visual-validation.md']),
    '/newsletter': (['internal/api/handlers.go', 'web/api_integration_test.go', 'web/dist/assets/app.js', 'web/dist/assets/analytics-recovery.css'], 'Lecture standard autorisée; envoi Discord réservé admin, PNG1080x1350 testé. Positions, icônes, dimensions du podium et textes restaurés.', ['core-runtime.json', 'navigation.md', 'visual-validation.md']),
    '/': (['web/dist/assets/app.js', 'web/dist/assets/analytics-recovery.css', 'web/dist/assets/messages/fr.json'], 'Regroupement et dimensions des métriques, pictogrammes Activity/PlayCircle, filtre Tout et état moniteur traduits.', ['core-runtime.json', 'visual-main-stable-dashboard.json', 'visual-validation.md']),
    '/wrapped/[userId]': (['web/dist/assets/app.js', 'web/dist/assets/wrapped-recovery.css', 'web/dist/index.html', 'internal/api/analytics_recovery.go'], 'SVG, rangs proportionnels et graphique genres, ordre de configuration, anneau Clock128px, fermeture, footer GENERAL et encart du client favori par durée.', ['core-runtime.json', 'visual-validation.md', 'functional.md']),
    '/media/collections': (['internal/api/media_recovery.go', 'internal/api/media_collection_parity_test.go', 'web/dist/assets/media-recovery.js', 'web/dist/assets/media-recovery.css'], 'Groupes normalisés inter-serveurs sans collisions, scopes de liens, fantômes, inventaire et leaders corrigés; KPI1+2+1, unités historiques, filtre pilules et padding interne restaurés.', ['media-runtime.json', 'media.md', 'visual-validation.md']),
    '/media/all': (['internal/api/media_recovery.go', 'web/dist/assets/media-recovery.js', 'web/dist/assets/media-recovery.css'], 'Cartes, badges et fallbacks Film/Music, titre simple, tris temps visionné/DirectPlay et filtres serveurs historiques. Tris supplémentaires Go conservés.', ['media-runtime.json', 'media.md', 'visual-validation.md']),
    '/recent': (['web/dist/assets/media-recovery.js', 'web/dist/assets/media-recovery.css'], 'Dates calendaires, Sparkles/Clock/type, espacement mobile et métadonnées des cartes restaurés.', ['media-runtime.json', 'media.md', 'visual-validation.md']),
    '/media/popular': (['web/dist/assets/media-recovery.js', 'web/dist/assets/media-recovery.css'], 'Descriptions et lecture(s), SVG des six classements et statistiques, pilules serveurs restaurés.', ['media-runtime.json', 'media.md', 'visual-validation.md']),
    '/media/analysis': (['web/dist/assets/media-recovery.js', 'web/dist/assets/media-recovery.css', 'internal/api/handlers.go', 'internal/api/catalogue_deep_parity.go', 'internal/api/catalogue_deep_parity_test.go'], 'Sections Binge3résumés, SmartInsights/suggestions/genres et3cartes deep fidèles; compte des titres Movie/Series via catalogue=true distinct des lectures dashboard; graphe genres horizontal historique.', ['media-runtime.json', 'media.md', 'functional.md', 'visual-validation.md']),
    '/media/[id]': (['web/dist/assets/media-recovery.js', 'web/dist/assets/media-recovery.css', 'internal/api/proxy_handlers.go', 'internal/api/handlers_test.go'], 'SVG des sections/compteurs, cast rond112px, badges bruts, hero36/30px, fallbacks, breadcrumbs et liens artiste; barres langues, spectateurs en ligne, vignettes enfants et versions en cartes restaurés.', ['media-runtime.json', 'media.md', 'visual-validation.md']),
}
for row in baseline['rows']:
    for criterion, state in row['criteria'].items():
        if state != pending:
            continue
        identifier = row['route'] + '#' + criterion
        if identifier in ledger:
            continue
        files, correction, proofs = route_changes[row['route']]
        record = dict(id=identifier, route=row['route'], criterion=criterion, initialStatus=state, recommendedStatus=faithful, resolution='corrected', files=files, correction=correction, proofs=proofs, tests='Tests Go test/vet/build, syntaxe JavaScript, contrôles réels API/navigateur et captures ciblées après intégration.', limitations='Preuves ciblées en SQLite synthétique et composants main avec adaptateur; aucune certification de tous les pixels ou services réels.')
        if row['route'] == '/newsletter' and criterion in ('Position navigation', 'Menu parent'):
            record.update(resolution='already_faithful_revalidated', files=[], correction='Main ne possède pas de sous-onglet Newsletter dans MediaHeaderNav; les parents et placement existants concordent. Constat initial trop large revalidé par source et navigateur.')
        if row['route'] == '/media/[id]' and criterion == 'Apparence':
            record.update(recommendedStatus=pending, resolution='partially_corrected', limitations='Géométrie de la timeline interactive Go avec regroupement des événements encore distincte de main. Cast, versions, logos/backdrops distants et rotation réelle non exercés faute de Jellyfin. Les corrections réelles ne certifient pas toute la fiche.')
        ledger[identifier] = record

records = list(ledger.values())
assert len(records) == 63 and all(c['initialStatus'] == pending for c in records)
for row in matrix['rows']:
    updates = [c for c in records if c['route'] == row['route']]
    if not updates:
        continue
    row['history'] = row.get('history', []) + [dict(date='2026-10-10', source='e3a669f:docs/final-audit/PARITY_MATRIX.json', criteria=copy.deepcopy(row['criteria']), note=row['note'], proofs=copy.deepcopy(row['proofs']))]
    for change in updates:
        row['criteria'][change['criterion']] = change['recommendedStatus']
    row['revisions'] = row.get('revisions', []) + [dict(date=date, changes=updates)]
    row['proofs'] += ['../parity-restoration/CORRECTIONS.json', '../parity-restoration/RESTORATION_REPORT.md']
    row['note'] += ' Reprise2026-10-11: voir historique conservé et registre par cellule; statut limité aux preuves ciblées.'
cell_counts = collections.Counter(v for row in matrix['rows'] for v in row['criteria'].values())
matrix['counts'] = {state: cell_counts[state] for state in matrix['states']}
matrix['revision'] = dict(date=date, baseline='e3a669f', referenceMain=subprocess.check_output(['git', 'rev-parse', 'main'], cwd=root, text=True).strip(), unresolved=[c['id'] for c in records if c['recommendedStatus'] == pending], scope='Les critères Non testé/sans objet initiaux restent distincts des nouveaux contrôles partiels; aucun pourcentage global de parité.')
counts = dict(collections.Counter(c['resolution'] for c in records))
summary = dict(date=date, baselineOpen=63, counts=counts, closed=sum(c['recommendedStatus'] != pending for c in records), stillOpen=len(matrix['revision']['unresolved']), cells=records,
    previouslyUntestedSubsets=[
        dict(id='/media/analysis#Données', verified='Classements du catalogue : 110 titres sur la fixture alignée; décompte indépendant des lectures, exclusions et scopes testés en Go et par HTTP.', retainedStatus='Non testé', reason='Sous-ensemble vérifié; les suggestions et toutes les sources externes ne sont pas intégralement comparées.'),
        dict(id='/media/analysis#Graphiques', verified='Genres : orientation horizontale, valeurs API, barres 20px, hauteur 300px et drilldown par clic réel; comparaison main/Go après défilement.', retainedStatus='Non testé', reason='Ne certifie pas tous les tracés et états combinatoires de la page.'),
        dict(id='/logs#Données', verified='Débit audio réel issu de la télémétrie; débit vidéo non présenté comme audio; séparation par serveur et export supérieur à 500 lignes testés.', retainedStatus='Non testé', reason='Sous-ensemble vérifié et correction justifiée du débit; toutes les données réelles de production ne sont pas comparées.'),
    ])

def write(path, text):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(text, encoding='utf-8')
    tmp.replace(path)

if previous_profile['recommendedStatus'] != profile['recommendedStatus']:
    users_document.setdefault('history', []).append(dict(date=users_document['date'], counts=users_document['counts'], profileAppearance=previous_profile))
    users_document['date'] = date
    users_document['counts'] = dict(collections.Counter(c['resolution'] for c in users_document['cells']))
    write(out / 'users-settings-cells.json', json.dumps(users_document, ensure_ascii=False, indent=2) + '\n')
write(out / 'CORRECTIONS.json', json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
write(root / 'docs/final-audit/PARITY_MATRIX.json', json.dumps(matrix, ensure_ascii=False, indent=2) + '\n')
letters = dict(zip(matrix['states'], ['F', 'J', 'C', 'M', 'N']))
md = '# Matrice de parité — reprise du 11 octobre 2026\n\n' + matrix['scope'] + '\n\nHistorique original conservé dans chaque ligne JSON et [snapshot initial](../parity-restoration/PARITY_MATRIX.before.json). [Registre des 63 cellules](../parity-restoration/CORRECTIONS.json).\n\nF = fidèle · J = justifié · C = à corriger · M = manquant · N = non testé/sans objet.\n\n'
md += '| Route | ' + ' | '.join(matrix['criteria']) + ' |\n|' + '---|' * 17 + '\n'
for row in matrix['rows']:
    md += '| `' + row['route'] + '` | ' + ' | '.join(letters[row['criteria'][c]] for c in matrix['criteria']) + ' |\n'
md += '\nComptes actuels: ' + ', '.join(f'{s}: {matrix["counts"].get(s,0)}' for s in matrix['states']) + '. Aucun pourcentage de fidélité.\n'
write(root / 'docs/final-audit/PARITY_MATRIX.md', md)
stream = io.StringIO(newline='')
writer = csv.writer(stream); writer.writerow(['Route'] + matrix['criteria'])
for row in matrix['rows']:
    writer.writerow([row['route']] + [row['criteria'][c] for c in matrix['criteria']])
write(root / 'docs/final-audit/PARITY_MATRIX.csv', stream.getvalue())
details = '# Registre des corrections de parité\n\nChaque cellule possède son ancien statut, ses fichiers, sa correction, ses preuves, ses tests et ses limites dans [CORRECTIONS.json](CORRECTIONS.json).\n\n'
details += '| Identifiant | Statut final | Correction | Fichiers | Preuves / tests |\n|---|---|---|---|---|\n'
for c in records:
    details += '| `' + c['id'] + '` | ' + c['recommendedStatus'] + ' (' + c['resolution'] + ') | ' + c['correction'] + ' | ' + ', '.join('`' + f + '`' for f in c['files']) + ' | ' + ', '.join('[' + p + '](' + p + ')' for p in c['proofs']) + '; ' + c['tests'] + ' |\n'
write(out / 'CORRECTIONS.md', details)
snapshot = {str(p.relative_to(root)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for folder in ('web/dist', 'internal/api', 'scripts/parity-restoration') for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in str(p)}
write(out / 'SOURCE_SNAPSHOT.json', json.dumps(dict(date=date, head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(), workingTree=True, files=snapshot), indent=2) + '\n')
print(json.dumps(dict(counts=counts, matrix=matrix['counts'], unresolved=matrix['revision']['unresolved']), ensure_ascii=False))
