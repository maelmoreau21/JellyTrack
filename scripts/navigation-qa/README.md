# Validation de la navigation

Ces scripts sont des outils de test. Ils ajoutent **aucune dépendance Node au produit Go**. Ils utilisent Playwright/Chromium et une base SQLite synthétique isolée. Les variantes d'identité et de configuration interceptent uniquement les réponses de présentation `/api/auth/me` et `/api/navigation` ; les autorisations backend sont vérifiées par les tests Go.

## Vérifications backend et syntaxe

Depuis la racine du dépôt :

```powershell
go test ./...
go vet ./...
node --check web/dist/assets/app.js
node --check web/dist/assets/navigation.js
node --check web/dist/assets/history.js
git diff --check
```

## Serveur Go de test

Dans un premier terminal PowerShell, depuis le dépôt, démarrer un serveur sur une base de test dédiée :

```powershell
New-Item -ItemType Directory -Path scratch/navigation-qa -Force
$env:DATABASE_DRIVER='sqlite'
$env:DATABASE_PATH=Join-Path (Get-Location).Path 'scratch/navigation-qa/navigation.db'
$env:JELLYTRACK_PORT='3310'
$env:JELLYTRACK_SECRET='Navigation-QA-only-secret-2026-0123456789abcdef'
$env:JELLYTRACK_LOCAL_ADMIN_USER='navigationadmin'
$env:JELLYTRACK_LOCAL_ADMIN_PASSWORD='Navigation-QA-test-2026!'
$env:JELLYTRACK_MODE='single'
$env:TZ='Europe/Paris'
$env:JELLYFIN_URL=''
$env:JELLYFIN_API_KEY=''
go build -o scratch/navigation-qa/jellytrack-qa.exe .
./scratch/navigation-qa/jellytrack-qa.exe
```

Les variables ne valent que dans ce terminal. Arrêter ce serveur avec Ctrl+C après les tests.

## Navigateur et données synthétiques

Dans un deuxième terminal, utiliser un module Playwright déjà installé via `PLAYWRIGHT_MODULE`, ou installer les dépendances de QA dans `scratch` :

```powershell
npm install --prefix scratch/navigation-qa-tools playwright
./scratch/navigation-qa-tools/node_modules/.bin/playwright.cmd install chromium
$env:PLAYWRIGHT_MODULE=Join-Path (Get-Location).Path 'scratch/navigation-qa-tools/node_modules/playwright'
$env:GO_QA_URL='http://localhost:3310'
$env:GO_QA_USER='navigationadmin'
$env:GO_QA_PASSWORD='Navigation-QA-test-2026!'
python scripts/navigation-qa/seed-qa.py --database scratch/navigation-qa/navigation.db
node scripts/navigation-qa/go-navigation-qa.cjs
node scripts/navigation-qa/focused-final.cjs
```

Le seed nécessite une base `navigation.db` déjà créée par Go. Il ajoute deux serveurs **désactivés**, huit médias, six utilisateurs et 144 lectures ; leurs URL sont `127.0.0.1:9`. Aucun serveur réel n'est utilisé. La suite principale teste huit scénarios et échoue si un contrôle, une erreur console ou un statut HTTP d'erreur est rencontré. La suite ciblée vérifie les régressions d'actifs, recherche, paramètres d'URL, Wrapped, scroll et mobile.

Les résultats et captures vont dans `scratch/navigation-qa`, ou dans `GO_QA_OUTPUT` si cette variable est renseignée. Les preuves de la livraison du 9 octobre 2026 sont dans [docs/navigation-validation](../../docs/navigation-validation) et [docs/navigation-captures](../../docs/navigation-captures).

## Référence historique

`reference-capture.cjs` attend une archive isolée de `main`, ses dépendances historiques et un serveur Next en fonctionnement. Variables : `REFERENCE_ROOT` (chemin absolu de l'archive), `REFERENCE_URL` (par défaut `http://localhost:3323`) et `REFERENCE_SECRET` (le `NEXTAUTH_SECRET` du serveur de test). Sans secret fourni, le script utilise exclusivement le secret synthétique `navigation-qa-reference-secret-at-least-32-characters`. Les sessions NextAuth synthétiques sont vérifiées après hydratation.

Le serveur de référence de cette livraison a utilisé `PRISMA_USE_STUB=true`, Next `--webpack`, un cache SWC isolé, de vraies polices Sora en cache local et un scanner Tailwind borné dans la **copie QA**. Le [rapport principal](../../docs/NAVIGATION_RESTORATION.md#validation-et-captures) détaille ces adaptations et les timeouts de compilation qui empêchent de déclarer toutes les anciennes routes testées en exécution.

Le script de capture historique a été conservé pour reproduction ; sa version portable n'a pas été relancée après l'arrêt de Next. Les captures et preuves jointes viennent de l'exécution effective de son original, dont seuls les chemins d'import et de sortie ont été rendus configurables.
