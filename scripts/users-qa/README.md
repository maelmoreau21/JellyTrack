# Vérifier les interfaces utilisateurs

Les scripts utilisent exclusivement `scratch/users-qa/users.db`, initialisée par Go. Les identités de test sont synthétiques : connexion réelle de l'administrateur, sessions standard enregistrées dans SQLite et signées avec le secret du serveur. Les contrôles de rôle ne remplacent aucune réponse de l'API. Les tests de chargement retardent une réponse réelle sans en changer le contenu.

## Démarrer la copie Go isolée

Depuis la racine du dépôt, dans un premier terminal PowerShell :

```powershell
New-Item -ItemType Directory -Force scratch/users-qa
$env:DATABASE_DRIVER='sqlite'
$env:DATABASE_PATH=Join-Path (Get-Location).Path 'scratch/users-qa/users.db'
$env:JELLYTRACK_PORT='3330'
$env:JELLYTRACK_SECRET='Users-QA-only-secret-2026-0123456789abcdef'
$env:JELLYTRACK_LOCAL_ADMIN_USER='usersadmin'
$env:JELLYTRACK_LOCAL_ADMIN_PASSWORD='Users-QA-test-2026!'
$env:JELLYTRACK_MODE='single'
$env:TZ='UTC'
$env:JELLYFIN_URL=''
$env:JELLYFIN_API_KEY=''
go build -o scratch/users-qa/jellytrack-users-qa.exe .
./scratch/users-qa/jellytrack-users-qa.exe
```

Arrêter ce serveur avec Ctrl+C après les tests. Ne jamais employer une base ou un compte de production.

## Préparer et lancer les tests

Dans un deuxième terminal PowerShell :

```powershell
npm install --prefix scratch/users-qa-tools playwright
./scratch/users-qa-tools/node_modules/.bin/playwright.cmd install chromium
$env:PLAYWRIGHT_MODULE=Join-Path (Get-Location).Path 'scratch/users-qa-tools/node_modules/playwright'
$env:GO_QA_URL='http://localhost:3330'
$env:GO_QA_USER='usersadmin'
$env:GO_QA_PASSWORD='Users-QA-test-2026!'
$env:JELLYTRACK_SECRET='Users-QA-only-secret-2026-0123456789abcdef'
python scripts/users-qa/seed-users.py
node scripts/users-qa/browser-users.cjs
node scripts/users-qa/profile-controls.cjs
node scripts/users-qa/list-pagination.cjs
node scripts/users-qa/wrapped-theme.cjs
node scripts/users-qa/historical-preferences.cjs
node scripts/users-qa/audiobook.cjs
node scripts/users-qa/telemetry.cjs
```

Sans `PLAYWRIGHT_MODULE`, les scripts recherchent le module standard `playwright`. Les URL, l'identifiant et le mot de passe ont les valeurs synthétiques ci-dessus par défaut. `PYTHON` peut désigner un autre exécutable Python. Les scripts ne créent aucune dépendance pour le produit Go.

Le seed crée deux serveurs désactivés pointant vers `127.0.0.1:9`, huit médias, neuf utilisateurs et 280 lectures. Il contient un compte vide, un compte avec métadonnées partielles et un compte avec 135 sessions. Les tests de pagination ajoutent temporairement 26 comptes, puis les retirent dans un bloc `finally`. Le test Wrapped sauvegarde et restaure exactement ses deux paramètres. Le livre audio utilise trois enregistrements temporaires, supprimés dans `finally`. La télémétrie utilise cinq événements temporaires, supprimés dans `finally` ; les permissions de presse-papiers concernent uniquement le navigateur de test sans fenêtre.

Les preuves sont écrites dans `docs/users-validation` et `docs/users-captures`. Les exportations et secrets synthétiques restent dans `scratch/users-qa`. Chaque suite Go signale un échec par son code de sortie.

## Capturer l'ancienne interface

Employer une archive **ignorée par Git**, extraite de `main`, et aucun fichier de la branche principale :

```powershell
New-Item -ItemType Directory -Force scratch/users-qa/main-reference
git archive main -o scratch/users-qa/main-reference.zip
Expand-Archive -LiteralPath scratch/users-qa/main-reference.zip -DestinationPath scratch/users-qa/main-reference -Force
$env:REFERENCE_ROOT=Join-Path (Get-Location).Path 'scratch/users-qa/main-reference'
python scripts/users-qa/prepare-reference.py
```

Installer les dépendances de cette archive et démarrer Next sur le port 3331, avec `PRISMA_USE_STUB=true`, `NEXTAUTH_SECRET=navigation-qa-reference-secret-at-least-32-characters`, `TZ=UTC` et `next dev --webpack`. `prepare-reference.py` copie l'adaptateur synthétique et le même jeu de données, puis remplace uniquement le stub Prisma de l'archive. Il refuse un chemin extérieur à `scratch` ou non ignoré par Git. Les composants et styles utilisateurs historiques restent intacts.

```powershell
$env:REFERENCE_URL='http://localhost:3331'
$env:REFERENCE_SECRET='navigation-qa-reference-secret-at-least-32-characters'
node scripts/users-qa/browser-users.cjs reference
node scripts/users-qa/style-metrics.cjs
```

La livraison a réutilisé l'archive QA historique dans `scratch/navigation-qa/main-reference`. Le runtime disponible était Next 16.4, alors que le manifeste historique demandait 16.3.7. La copie QA utilisait un cache de polices Sora et un scan Tailwind borné aux fichiers applicatifs. Un avertissement récupérable `window is not defined` apparaît sur la liste historique : il est conservé dans les résultats. La suite de référence peut donc sortir en échec tout en fournissant des captures utilisables. Ce problème du serveur de référence ne constitue pas un succès de validation de son exécution.

Les captures principales montrent le viewport, car le contenu historique défile à l'intérieur de `main`. Les fichiers `-activity`, `-charts` et `-history` montrent les sous-sections après défilement. Une capture ne prouve pas une égalité de tous les pixels.
