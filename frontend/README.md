# Frontend JellyTrack — SvelteKit

Le frontend livré est compilé avec SvelteKit 3 / Svelte 5 / TypeScript puis
embarqué dans le binaire Go. Node/npm servent uniquement à la compilation et aux
tests. Les trois Dockerfiles compilent ces sources avant le binaire ; le runtime
reste Go, sans serveur Node.

## Sources

- `src/document.html` : document de l'application, avec les styles historiques.
- `static/assets` : CSS, polices, icônes et traductions, sans anciens scripts.
- `src/lib/components` : structure, navigation, connexion, À propos, widgets du
  dashboard, comptes, sauvegardes et utilisateurs en composants Svelte.
- `src/lib/runtime/application.js` et `src/lib/pages` : contrôleurs JavaScript
  historiques repris comme modules compilés et chargés par SvelteKit. Ils gardent
  les graphiques, filtres, télémétrie, profils, médias, Wrapped, paramètres et
  administration. Toutes les vues ne sont pas réécrites en templates Svelte.
- `src/lib/view-renderers.ts` : montage, actualisation et démontage des composants.
- `src/lib/runtime/modules.ts` : chargement différé des modules de pages.

Les sources ne sont plus produites par remplacement de texte dans `web/dist`.
`sync-legacy.mjs` et le chargement de scripts DOM ont été supprimés.
`web/dist` reste une référence historique pour les tests, hors du frontend livré.
Les droits, sessions, données et API restent gérés par Go.

## Compiler

Depuis la racine, Node 24 et les dépendances verrouillées :

```powershell
npm ci --prefix frontend
npm run check --prefix frontend
npm run build --prefix frontend
go build ./...
```

Le build produit `frontend/build` et installe le résultat dans `web/svelte`,
avec un manifeste SHA-256. Go embarque uniquement `web/svelte`. Les modules
`/_app` sont servis avec la même CSP stricte, gzip et revalidation que les assets
publics. Les modules inexistants renvoient 404.

```powershell
npm run dev --prefix frontend
```

Le développement écoute sur 127.0.0.1:5173 et transmet les API à un backend Go
sur 127.0.0.1:8080. Utiliser un backend et une base de test séparés.

## Validation

```powershell
npm run test:runtime --prefix frontend
npm run test:browser --prefix frontend -- --production --sidebar
npm run test:login --prefix frontend -- --production --contracts
npm run test:dashboard --prefix frontend -- --production --widgets
npm run test:backups --prefix frontend
npm run test:accounts --prefix frontend
npm run test:users --prefix frontend
python frontend/scripts/compare-dashboard-pixels.py --widgets
python frontend/scripts/compare-page-pixels.py backups
python frontend/scripts/compare-page-pixels.py accounts
python frontend/scripts/compare-page-pixels.py users
```

L'intégration complète construit un serveur Go puis compare 34 routes à la
référence, avec une base SQLite jetable et des réponses API enregistrées :

```powershell
go build -o scratch/frontend-integration-qa/jellytrack.exe ./cmd/jellytrack
npm run test:integration --prefix frontend
```

Les preuves vont dans `scratch/frontend-sveltekit-*-qa`, ignoré par Git, et dans
les artefacts CI. Les tests contrôlent les API, textes, liens, graphiques et
interactions. Les comparaisons strictes des pages converties ont zéro pixel
modifié dans les scénarios testés. Les captures intégrales conservent quelques
variations de rasterisation/états transitoires ; elles ne certifient pas chaque
pixel de chaque page, ni une instance réelle Jellyfin/SSO.
