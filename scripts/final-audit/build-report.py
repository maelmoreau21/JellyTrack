"""Consolidate existing evidence, keeping untested parity explicit."""
import csv, hashlib, json, subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/final-audit'
def read(name): return json.loads((OUT/name).read_text(encoding='utf-8'))
def write(name,value): (OUT/name).write_text(value,encoding='utf-8')
F='Identique ou fidèle'; J='Différence justifiée'; D='Différence à corriger'; M='Fonctionnalité manquante'; N='Non testé'
criteria=['Présence','Position navigation','Menu parent','Apparence','Sections','Ordre','Textes','Icônes','Tableaux','Graphiques','Filtres','Boutons','Interactions','Données','Permissions','Responsive']
inventory=read('routes.json')
for p in inventory['historicalPages']:
 if p['route']=='/setup':
  p['aliasDestination']='/';p['status']=F;p['notes']=['Redirection historique restaurée. Assistant Go conservé sous /setup/go.']
inventory['currentAdditionalPages']=[p for p in inventory['currentAdditionalPages'] if p['route']!='/setup/go']+[{'route':'/setup/go','parent':'Compléments Go','kind':'explicit','destination':'Pages.setup()','notes':'Assistant Go préservé, API et permissions inchangées.'}]
inventory['counts']['additionalCurrentPagePaths']=len(inventory['currentAdditionalPages'])
write('routes.json',json.dumps(inventory,ensure_ascii=False,indent=2))

visual=read('visual-final-results.json'); reference=read('visual-results.json'); accessibility=read('accessibility-final.json')
aliases={p['route']:p.get('aliasDestination') for p in inventory['historicalPages'] if p.get('aliasDestination')}
aliases['/setup']='/'
notes={
 '/':'Filtres et KPI corrigés ; écarts mineurs d’espacement/densité restent. Cache/adaptateur historique limitent la comparaison des flux et données.',
 '/about':'Hiérarchie, 11 fonctionnalités et ordre restaurés. Six cartes technologiques adaptées à Go ; version réelle, compléments préservés.',
 '/login':'Remember 30 jours, callback sûr et langue initiale restaurés. Admin local et sessions Go ajoutés. Jellyfin/OIDC vivants non testés.',
 '/logs':'Responsive, noms de dialogues et export historique corrigés ; disposition fine des filtres/tableau et iconographie restent différentes.',
 '/media/all':'Catalogue et filtres fonctionnels ; ligne de tri supplémentaire, espacement/grille et fallback restent différents.',
 '/media/popular':'Pistes top5, metadata Series même serveur, titres/traductions, badges et cartes corrigés. Portraits Jellyfin réels non testés.',
 '/media/collections':'Types/KPI/comptage corrigés. Go garde 8 cartes par serveur contre 4 bibliothèques normalisées historiques : regroupement/ghost names non restaurés.',
 '/media/analysis':'Trois sous-cartes, résolutions et suggestions historiques corrigées ; champs mesurés Go conservés. Graphiques bas de page non tous comparés visuellement.',
 '/media/[id]':'Cinq types concrets capturés ; épisode paysage, KPI/icônes/temps corrigés. Fallback poster et métadonnées supplémentaires diffèrent ; actions distantes simulées.',
 '/media/artist/[name]':'Portrait carré, titre30 et résumé restaurés. Traduction FR conservée ; images et genres incomplets selon métadonnées, état vide testé.',
 '/newsletter':'Podium/plage/zapping Discord restaurés. Hauteur/fallback visuels restent différents ; lecture standard historique interdite par permissions Go conservées.',
 '/recent':'Parents, tri, pagination et navigation testés. Différences de densité, couleurs et icônes à finir.',
 '/users':'Liste/actions/pagination/chargement contrôlés ; état desktop proche. Retours à la ligne des filtres mobile restent différents.',
 '/users/[id]':'Profil/historique/filtres/export/modales testés ; cinq graphiques Go. Totalité des sept SVG historiques et données des flux non prouvées comparables.',
 '/wrapped/[userId]':'18 slides conditionnelles confirmées ; anciens16 non reproductibles. Intro, fonds, carte partage/heure/catégories restaurés ; copie Go conservée.',
 '/settings/jellyfin':'Structure, onglets et formulaires contrôlés. Adaptateur référence settings a 1 serveur contre 2 Go : parité des données non démontrée.',
 '/settings/sso':'Positions badges/Actualiser/switches corrigées et formulaires testés. Callback Go/PKCE justifiés ; fournisseur réel non testé.',
 '/settings/plugin/security':'Position h1 et grille4 colonnes corrigées. Sécurité Go préservée ; fournisseur externe non testé.',
 '/settings/plugin':'Route historique autonome réutilisant JellyfinServersSettings, sans redirection. Go réutilise le rendu Jellyfin avec le même chemin ; données Settings non comparables.',
 '/settings/media':'Grille historique2x2 rétablie, clés bibliothèque par serveur préservées. Normalisation historique des collections reste ouverte.',
 '/settings/dataBackups':'Nesting, tailles KPI, import violet et alignements restaurés. Export ZIP/integrité testés ; restauration de base production non testée.',
 '/settings/notifications':'Position carte et save gauche restaurés ; alertes plugin ALL/TRANSCODE/NEW_IP et capacité testées via transport en mémoire.',
 '/settings/scheduler':'Icônes/pillules/couleurs/hauteurs restaurées ; actions et paramètres testés. Exécution longue avec Jellyfin réel non testée.',
 '/settings/scheduler/tasks':'Même module tâches restauré ; boutons réellement reliés aux endpoints ; effets Jellyfin réel non testés.',
 '/settings/scheduler/schedules':'Save gauche et largeur restaurés ; réglages intervalles/rétention testés et vérification atomicité.',
 '/admin/health':'Onglets étendus, diagnostics/actions validés sur SQLite. Quelques couleurs/contrôles restent différentes ; statistiques production non testées.',
 '/admin/cleanup':'Onglets étendus ; compte110 doublons comparable. Empty-state/table vide et styles diffèrent. Suppression réelle Jellyfin non testée.',
 '/admin/server-compare':'Scope et données API testés. Espacements, hauteur KPI et badges restent différents ; inventaire Go additionnel préservé.'
}
functional=set(notes)
appearance_faithful={'/settings/notifications','/settings/plugin/security','/settings/scheduler','/settings/scheduler/tasks','/settings/scheduler/schedules'}
appearance_adapted={'/about','/settings/sso','/settings/dataBackups','/settings/media','/media/artist/[name]'}
sections_different={'/media/collections','/users/[id]'}
data_verified={'/media/[id]','/media/popular','/newsletter','/admin/cleanup'}
rows=[]
for p in inventory['historicalPages']+inventory['currentAdditionalPages']:
 route=p['route']; historical='historicalFile' in p; alias=aliases.get(route)
 states={key:N for key in criteria}
 states.update({'Présence':F,'Position navigation':F,'Menu parent':F})
 if historical:
  effective=alias or route
  states.update({'Apparence':D,'Sections':F,'Ordre':F,'Textes':D,'Icônes':D,'Filtres':F,'Boutons':F,'Interactions':F if effective in functional else N,'Permissions':F,'Responsive':F})
  if effective in appearance_faithful: states.update({'Apparence':F,'Textes':F,'Icônes':F})
  if effective in appearance_adapted: states.update({'Apparence':J,'Textes':J,'Icônes':J})
  if effective in sections_different: states.update({'Sections':D,'Ordre':D})
  if effective in data_verified: states['Données']=F
  if effective.startswith('/settings/'): states['Données']=N
  if effective in {'/logs','/users','/users/[id]','/media/[id]','/admin/server-compare','/admin/cleanup','/settings/dataBackups'}: states['Tableaux']=D if effective in {'/logs','/admin/server-compare','/admin/cleanup'} else F
  if effective=='/newsletter': states.update({'Permissions':D,'Position navigation':D,'Menu parent':D})
  if effective=='/users': states['Responsive']=D
  if alias: states.update({'Apparence':J,'Sections':J,'Ordre':J,'Textes':J,'Icônes':J});
  if route=='/login': states.update({'Apparence':J,'Sections':J,'Textes':J,'Permissions':J,'Responsive':N})
  note=notes.get(effective,'Redirection historique vérifiée, sans écran propre ; les limites de destination restent applicables.')
  if alias: note='Redirection vers '+alias+'. '+note
  proofs=['routes.json','navigation-agent.md','functional-agent.md','accessibility-final.json','visual-final-results.json']
 else:
  states.update({'Présence':J,'Position navigation':J,'Menu parent':J,'Permissions':F if route.startswith(('/admin/','/settings/')) else N})
  states['Responsive']=F
  if route=='/setup/go': states.update({'Interactions':F,'Sections':J,'Boutons':J});
  note='Complément Go conservé ; sans équivalent main. ' + p.get('destination','')+'. Couverture visuelle complète de ce complément non réalisée.'
  proofs=['routes.json','final-controls.json','go-extras.json']
 rows.append({'route':route,'historical':historical,'parent':p.get('parent','Route directe'),'alias':alias,'criteria':states,'note':note,'proofs':proofs})
counter=Counter(state for row in rows for state in row['criteria'].values())
matrix={'scope':'États limités aux preuves décrites : fidèle source/contrôle ciblé ne certifie pas tous les pixels ni toutes les branches. Non testé inclut critères sans objet, faute de catégorie N/A autorisée. Les compléments Go sont comptés séparément.','criteria':criteria,'states':[F,J,D,M,N],'counts':{state:counter[state] for state in [F,J,D,M,N]},'rows':rows}
write('PARITY_MATRIX.json',json.dumps(matrix,ensure_ascii=False,indent=2))
with (OUT/'PARITY_MATRIX.csv').open('w',encoding='utf-8-sig',newline='') as file:
 writer=csv.writer(file);writer.writerow(['Route','Historique','Parent','Alias']+criteria+['Preuves','Limites'])
 for row in rows: writer.writerow([row['route'],row['historical'],row['parent'],row['alias']]+list(row['criteria'].values())+['; '.join(row['proofs']),row['note']])
codes={F:'F',J:'J',D:'C',M:'M',N:'N'}
lines=['# Matrice finale de parité','',matrix['scope'],'','F = Identique ou fidèle · J = Différence justifiée · C = Différence à corriger · M = Fonctionnalité manquante · N = Non testé.','', '| Route | '+' | '.join(criteria)+' |', '|---|'+'---|'*len(criteria)]
lines += ['| `'+row['route']+'` | '+' | '.join(codes[x] for x in row['criteria'].values())+' |' for row in rows]
lines+=['','## Preuves et réserves par route','']
lines+=['- `'+row['route']+'` — '+row['note'] for row in rows]
write('PARITY_MATRIX.md','\n'.join(lines)+'\n')

test_rows=[]
for suite in (OUT/'suites').iterdir():
 for file in suite.glob('*.json'):
  obj=json.loads(file.read_text(encoding='utf-8'))
  if not isinstance(obj,dict) or 'checks' not in obj:continue
  checks=obj['checks'];test_rows.append({'suite':suite.name,'report':str(file.relative_to(OUT)).replace('\\','/'),'checks':len(checks),'failed':[x for x in checks if x.get('ok') is False],'fatal':obj.get('fatal'),'errors':obj.get('pageErrors',obj.get('errors',[]))})
for name in ['final-controls.json','visual-settings-after.json','visual-settings-residuals-after.json','go-extras.json']:
 obj=read(name);test_rows.append({'suite':'final-native','report':name,'checks':len(obj['checks']),'failed':[x for x in obj['checks'] if x.get('ok') is False],'fatal':obj.get('fatal'),'errors':obj.get('errors',[])})
tests={'date':datetime.now(timezone.utc).isoformat(),'go':read('go-checks.json'),'browser':test_rows,'totalAssertions':sum(r['checks'] for r in test_rows),'failedAssertions':sum(len(r['failed']) for r in test_rows),'accessibility':{'cases':len(accessibility['cases']),'variants':sum(len(c.get('variants',[])) for c in accessibility['cases']),'pageErrors':sum(len(c.get('errors',[])) for c in accessibility['cases']),'failures':[c for c in accessibility['cases'] if c.get('failure')],'overflow':sum(bool(v.get('rootOverflow') or v.get('mainOverflow')) for c in accessibility['cases'] for v in c.get('variants',[]))},'visual':{'mainCases':len(reference['cases']),'goCases':len(visual['cases']),'mainCaptures':sum(len(c.get('variants',[])) for c in reference['cases']),'goCaptures':sum(len(c.get('variants',[])) for c in visual['cases']),'goFailedRenders':[c['route'] for c in visual['cases'] if not c.get('rendered')],'goPageErrors':sum(len(c.get('errors',[])) for c in visual['cases']),'assetsMatch':all(a['same'] for a in visual['embeddedAssets'])}}
write('TEST_RESULTS.json',json.dumps(tests,ensure_ascii=False,indent=2))
tests['static']=read('static-checks.json')
write('TEST_RESULTS.json',json.dumps(tests,ensure_ascii=False,indent=2))
changed=subprocess.check_output(['git','diff','--name-only'],cwd=ROOT,text=True).splitlines()
changed+=subprocess.check_output(['git','ls-files','--others','--exclude-standard','internal','web','scripts/final-audit'],cwd=ROOT,text=True).splitlines()
snapshot={'date':tests['date'],'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'reference':subprocess.check_output(['git','rev-parse','main'],cwd=ROOT,text=True).strip(),'files':[{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()} for p in changed if p.startswith(('internal/','web/','scripts/')) and (ROOT/p).is_file()]}
write('SOURCE_SNAPSHOT.json',json.dumps(snapshot,indent=2))

# Comparison sheets preserve original screenshots and show equal-size viewports.
try:
 from PIL import Image, ImageDraw
 for case in visual['cases']:
  slug='dashboard' if case['canonical']=='/' else case['canonical'][1:].replace('/','-').replace('%20','-')
  for variant in case['variants']:
   name=slug+'-'+variant['viewport']+'-'+variant['theme']
   before=OUT/'captures'/('main-'+name+'.png');after=OUT/'captures'/variant['file']
   if not before.exists() or not after.exists():continue
   width=1440 if variant['viewport']=='desktop' else 390;height=900 if width==1440 else 844
   scale=.5 if width==1440 else 1
   w=int(width*scale);h=int(height*scale)
   sheet=Image.new('RGB',(w*2,h+30),'#172033');draw=ImageDraw.Draw(sheet)
   draw.text((8,8),'main / '+case['canonical'],fill='white');draw.text((w+8,8),'Go final / '+case['route'],fill='white')
   for x,file in [(0,before),(w,after)]:
    image=Image.open(file).convert('RGB').crop((0,0,width,height)).resize((w,h))
    sheet.paste(image,(x,30))
   sheet.save(OUT/'captures'/('pair-final-'+name+'.png'))
except ImportError: pass
index=['# Captures comparatives','', 'Chaque lien est une capture réelle ; les paires montrent uniquement le haut du viewport. Captures originales fullPage conservées. FR, rôle admin, 1440×900/390×844, sombre/clair. Les rôles standard/anonyme sont couverts séparément dans accessibility-final.json. Référence exécutée avec adaptateur Prisma synthétique, pas une base historique native.','', '| Route canonique | main sombre desktop | Go final sombre desktop | Paire |','|---|---|---|---|']
for case in visual['cases']:
 slug='dashboard' if case['canonical']=='/' else case['canonical'][1:].replace('/','-').replace('%20','-')
 prefix=slug+'-desktop-dark.png';index.append('| `'+case['canonical']+'` | [main](main-'+prefix+') | [Go](go-final-'+prefix+') | [comparaison](pair-final-'+prefix+') |')
write('captures/README.md','\n'.join(index)+'\n')
print(json.dumps({'matrixRows':len(rows),'states':dict(counter),'tests':tests},ensure_ascii=False))
