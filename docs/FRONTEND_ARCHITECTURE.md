# Architecture Frontend JellyTrack (Go Native)

## Vue d'ensemble

Le frontend de JellyTrack a été entièrement reconstruit pour être servi directement par le serveur Go, sans aucune dépendance envers Node.js, Next.js, React, TypeScript, npm ou pnpm au moment de l'exécution ou du déploiement.

L'application fonctionne en tant que **binaire Go unique et autonome** intégrant l'ensemble des fichiers statiques, templates, styles CSS, scripts JavaScript vanilla, bibliothèques graphiques et dictionnaires de traduction.

---

## 1. Technologies Utilisées

| Composant | Technologie | Description |
|---|---|---|
| **Serveur & Routage** | Go (`net/http`, `embed.FS`) | Embarque et sert l'ensemble du frontend via `embed.FS`. Fallback automatique sur `index.html` pour le routage SPA. |
| **Structure** | HTML5 sémantique | `internal/web/dist/index.html` avec navigation accessible, modales et conteneurs d'alertes. |
| **Style & Design** | CSS Vanilla Moderne | `internal/web/dist/assets/app.css` : glassmorphism, variables CSS pour thèmes sombre/clair, responsive mobile/desktop. |
| **Logique Client** | JavaScript Vanilla ES6+ | `internal/web/dist/assets/app.js` : routeur d'historique HTML5, moteur i18n, client API avec CSRF, gestionnaire de thème. |
| **Graphiques** | Chart.js 4 (UMD autonome) | `internal/web/dist/assets/chart.min.js` : courbe d'activité, histogramme horaire, proportions par type, thermocarte annuelle SVG. |
| **Traductions** | JSON natif | 11 langues intégrées dans `internal/web/dist/assets/messages/*.json` (FR, EN, DE, ES, IT, NL, PL, PT-BR, RU, ZH). |

---

## 2. Structure des Fichiers

```text
internal/web/
├── static.go                  # Serveur HTTP Go + //go:embed all:dist
├── static_test.go             # Tests Go vérifiant les routes frontend et headers CSP
└── dist/                      # Fichiers statiques embarqués dans le binaire Go
    ├── index.html             # Shell SPA principal
    └── assets/
        ├── app.css            # Feuille de style complète
        ├── app.js             # Routeur et contrôleurs de pages Vanilla JS
        ├── chart.min.js       # Bibliothèque graphique autonome
        ├── logo.svg           # Logo JellyTrack
        ├── icon.svg           # Favicon & icône application
        └── messages/          # Dictionnaires de traduction i18n
            ├── fr.json
            ├── en.json
            ├── de.json
            ├── es.json
            ├── it.json
            ├── nl.json
            ├── pl.json
            ├── pt-BR.json
            ├── ru.json
            ├── zh.json
            └── fallback.json
```

---

## 3. Fonctionnalités & Pages Couvertes

Toutes les pages de JellyTrack sont gérées de manière réactive par le routeur HTML5 dans `app.js` et connectées aux API REST de Go :

- **`/` (Dashboard)** :
  - Métriques clés (lectures, heures de visionnage, utilisateurs actifs, total médias).
  - Sélecteur de période temporelle (24h, 7j, 30j, 90j, 365j).
  - Panneau des flux en direct avec polling toutes les 5s, jauge de progression et bouton d'arrêt forcé.
  - Graphique d'activité temporelle (aire avec dégradé Chart.js).
  - Graphique des heures de pointe (histogramme 24h).
  - Carte thermique d'activité annuelle style GitHub avec modale de drilldown sur chaque case.
- **`/login`** : Formulaire de connexion sécurisé avec option 30 jours et redirection SSO / OIDC.
- **`/setup`** : Assistant de premier démarrage pour connecter un serveur Jellyfin.
- **`/about`** : Informations sur l'application, technologies Go et liens utiles.
- **`/recent`** : Historique récent de lecture avec vignettes, utilisateur, lecteur et durée.
- **`/newsletter`** : Bilan mensuel sur 30 jours et publication directe sur webhook Discord.
- **`/users`** : Répertoire des utilisateurs Jellyfin avec statut d'activité et accès au profil.
- **`/users/{id}`** : Fiche utilisateur détaillée, statistiques cumulées et sessions récentes.
- **`/wrapped/{userId}`** : JellyTrack Wrapped annuel interactif sous forme de diapositives animées.
- **`/media` & `/media/all`** : Catalogue complet avec recherche en temps réel, filtres (Films, Séries, Musique, Livres), tri et pagination.
- **`/media/popular`** : Titres les plus consultés.
- **`/media/collections`** : Répartition par bibliothèque Jellyfin.
- **`/media/analysis`** : Analyse approfondie (top réalisateurs, acteurs, studios).
- **`/media/artist/{name}`** : Titres et albums filtrés par artiste.
- **`/media/{id}`** : Détail média (jaquette, métadonnées, acteurs, historique des lectures, rotation de jaquette).
- **`/logs`** : Journaux système avec filtre par niveau, téléchargement de log brut et export CSV.
- **`/settings`** (et sous-onglets : overview, jellyfin, dataBackups, sso, notifications, plugin, scheduler) :
  - Gestion des serveurs Jellyfin (ajout, test, suppression, rotation de clé plugin).
  - Sauvegardes manuelles, automatiques, téléchargement, restauration et export JSON.
  - Configuration SSO / OpenID Connect (Authentik, Keycloak).
  - Webhooks Discord d'alertes automatiques.
  - Déclenchement manuel des tâches planifiées.
- **`/admin/health`** : État de santé du système, latence DB, processus et sondes.
- **`/admin/server-compare`** : Tableau comparatif multi-serveurs.
- **`/admin/cleanup`** : Nettoyage des films obsolètes et synchronisation des utilisateurs supprimés.

---

## 4. Internationalisation (i18n)

Les 11 fichiers de langue existants dans `messages/*.json` sont embarqués dans `dist/assets/messages/`.
Le moteur i18n dans `app.js` :
1. Détecte la langue préférée de l'utilisateur (stockée dans `localStorage` ou configurée sur le serveur).
2. Charge le dictionnaire correspondant de manière asynchrone avec secours automatique sur `fr.json`.
3. Fournit la fonction `I18n.t(key, params)` remplaçant dynamiquement les variables comme `{count}` ou `{year}`.
4. Permet de changer instantanément de langue via le sélecteur du menu latéral.

---

## 5. Sécurité & Bonnes Pratiques

- **CSP (Content-Security-Policy)** : Conforme strict avec `script-src 'self'` et `style-src 'self'`. Aucun script inline ni `eval` n'est utilisé.
- **Protection CSRF** : Jeton CSRF automatique injecté dans l'en-tête `X-CSRF-Token` pour toutes les requêtes mutantes (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Protection Admin** : Les routes et actions administratives vérifient le rôle de l'utilisateur avant affichage et exécution.

---

## 6. Compilation et Exécution

Pour compiler et exécuter JellyTrack, seule une installation standard de Go est nécessaire :

```bash
# Exécution directe en développement
go run ./cmd/jellytrack

# Compilation d'un binaire de production autonome
go build -ldflags="-s -w" -o jellytrack ./cmd/jellytrack

# Exécution des tests unitaires et d'intégration
go test ./...
```
