# Migration frontend JellyTrack

Branche : `codex/frontend-sveltekit`, créée depuis `develop` au commit
`325af151d16d267c5a1c6d32712daca5c45c9051`.

## Socle et conversion progressive de l'interface

La référence visuelle est le frontend courant de `develop`, pas une nouvelle
maquette. Les styles, polices, icônes, traductions et HTML sont repris depuis
`web/dist`. Les corrections et ajouts Go actuels doivent être conservés.

Le layout, la structure principale, la barre latérale complète, la page
À propos et la connexion sont des composants Svelte 5. Thème, traductions et
client API sont des modules TypeScript. Une passerelle temporaire
conserve le routeur existant pour les autres pages. Le script de préparation copie
les assets publics et raccorde le démarrage, le routeur et les services de la
copie de `app.js` aux composants et modules nouveaux. Les sources historiques restent la
référence. Ne pas modifier les copies générées.

Le tableau de bord est partiellement converti : structure, bandeau du jour et
cinq cartes KPI sont en Svelte. Les graphiques, analyses, flux et autres blocs
conservent leur contrôleur historique. Les composants KPI sont démontés avant
chaque réordonnancement ou actualisation pour éviter des composants détachés.

Versions stables vérifiées dans le registre npm le 14 octobre 2026 :

| Dépendance | Version retenue |
|---|---|
| SvelteKit | 3.0.1 |
| Svelte | 5.57.2 |
| TypeScript | 6.0.3 |
| Vite | 8.3.4 |
| Plugin Svelte Vite | 7.3.1 |
| Adaptateur statique | 4.0.0 |
| Svelte Check | 4.7.6 |

TypeScript 7.0.2 est la dernière stable absolue, mais les peer dependencies de
SvelteKit 3.0.1 et Svelte Check 4.7.6 excluent encore cette version. La dernière
stable compatible retenue est donc 6.0.3, sans contournement des dépendances.
Les versions exactes et le verrou npm assurent une installation reproductible.

## Commandes

Depuis la racine du dépôt, avec Node >= 22.17 :

```powershell
cd frontend
npm ci
npm run check
npm run build
npm run dev
```

La compilation produit `frontend/build`, sans remplacer `web/dist`. Aucun
serveur Node n'est nécessaire pour la livraison statique future. Le serveur Go
reste responsable des sessions, droits, données, API et événements plugin.

Le build externalise le démarrage JavaScript généré par SvelteKit pour respecter
la politique Go `script-src 'self'`, sans autoriser les scripts inline.

Tests de présentation reproductibles (dans un second terminal si le serveur de
développement est utilisé) :

```powershell
npx playwright install chromium
npm run test:browser
npm run test:browser -- --production
npm run test:browser -- --production --smoke
npm run test:browser -- --production --sidebar
npm run test:login
npm run test:login -- --contracts
npm run test:runtime
npm run test:dashboard
npm run test:dashboard -- --production
npm run test:backups
npm run test:accounts
python scripts/compare-page-pixels.py backups
python scripts/compare-page-pixels.py accounts
```

Les pages Sauvegardes et Mes comptes sont désormais des composants Svelte.
Leurs 24 scénarios comparatifs couvrent les mutations simulées, les erreurs et
le démontage ; les captures complètes ont zéro pixel différent. Les contrôles
SvelteKit et ces comparaisons sont ajoutés à `.github/workflows/ci.yml`.
La migration reste partielle ; `DEV_STATE.md` précise les vues encore historiques.

Le second test sert uniquement le build local sous une CSP stricte. Toutes les
réponses API sont simulées. Les résultats et captures sont écrits dans
`scratch/frontend-sveltekit-qa`. Ces scénarios comparent liens du menu, titres,
fonctionnalités, largeurs et positions horizontales des cartes sur quatre
largeurs, deux thèmes et deux rôles. Ils vérifient aussi thème, langue et reload.
Ils ne constituent pas une certification pixel par pixel des pages restantes.
Le contrôle `--smoke` exerce aussi la navigation interne et les boutons
précédent/suivant après passage à l'historique compatible SvelteKit.

Le développement écoute sur 127.0.0.1:5173 et transmet `/api` à un backend Go
sur 127.0.0.1:8080. Il faut lancer un backend de test séparé pour les données.
Ne pas utiliser la configuration ou la base de production. Les mutations,
cookies et OIDC demandent une validation de même origine avant de considérer
ce mode comme fonctionnel ; ne pas désactiver la protection Origin pour le tester.
`npm run preview` sert seulement les fichiers compilés, sans proxy API.

## Suite prévue, avec validation entre les phases

1. Valider ce socle : compilation, démarrage navigateur, session et comparaison
   des captures de la référence et de la passerelle. Contrôler thèmes clair/sombre,
   langues, administrateur/utilisateur et largeurs 320, 390, 768 et 1440 px.
2. Convertir le layout, navigation, thème et traductions en composants Svelte
   et client API typé. Retirer progressivement les responsabilités équivalentes
   du routeur historique ; ne pas laisser deux routeurs gérer les mêmes liens.
3. Migrer les pages par famille : connexion, dashboard, médias, utilisateurs,
   historique, paramètres, administration, Wrapped. Préserver filtres, graphiques,
   interactions, permissions et isolation par serveur. Relever pour chaque page
   les critères de `docs/final-audit/PARITY_MATRIX.md`, en utilisant le frontend
   courant comme nouvelle référence.
4. Intégrer le build statique aux images Docker et à Go après validation des
   routes directes, erreurs assets, CSP, cookies, Origin et retours OIDC.
   Prévoir le retour vers le frontend précédent avant la bascule.

## Validation actuelle et limites

Installation npm : zéro vulnérabilité signalée. Vérification Svelte/TypeScript :
zéro erreur et zéro avertissement. Compilation frontend, `go test ./...`,
`go vet ./...` et `go build ./...` réussis.

La navigation par rôle et À propos passent 16 scénarios de présentation sur le
serveur de développement et 16 sur le build statique avec CSP stricte. Les captures
ont été inspectées sur mobile. Les contrôles comparent les textes et la géométrie
horizontale, sans revendiquer une égalité pixel par pixel de toute l'application.
Le libellé de technologie sur À propos décrit désormais SvelteKit/Svelte/TypeScript.

La connexion passe 20 comparaisons d'affichage (local, SSO manuel, SSO seul, erreur
groupe, déconnexion ; mobile/desktop ; clair/sombre) et 14 scénarios API simulés
(remember/serverId, callback autorisé/refusé, échec, SSO sélectionné/automatique).
Les preuves sont dans `scratch/frontend-sveltekit-login-qa`. Elles ne valident pas
une session ou un fournisseur OIDC réel.
La barre latérale, la recherche et les menus sont désormais en Svelte ; thème,
traductions et client API sont en TypeScript. Huit scénarios comparatifs couvrent
les contrôles de recherche, clavier, focus, langue, thème et repli du menu.
Sept contrats API isolés couvrent CSRF, données binaires/formulaires, annulation,
signal explicite, expiration de session, erreurs HTTP et délai de 30 secondes
avec une horloge accélérée. Aucun appel réseau réel n'est effectué dans ce test.

Les pages restantes et les raccords session/routeur demeurent dans le code
historique. Quelques listeners de démarrage raccordent encore les boutons
thème, repli et déconnexion à ces services. Les images Docker et le frontend
servi actuellement par Go ne sont pas basculés. Cette phase ne valide ni Jellyfin,
ni OIDC réel, ni les données de production.
