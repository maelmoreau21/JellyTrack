# Audit et stabilisation backend — 9 octobre 2026

Travail sur `codex/frontend-recovery`, base `origin/develop` f29ef0e. Les tests utilisent uniquement des bases SQLite temporaires ou `scratch/audit-runtime/audit.db`, sans lecture des valeurs des fichiers `.env` réels et sans connexion Jellyfin réelle.

## Corrigé

- **P1 — filtres trompeurs** : `internal/stats/analytics.go` ne gérait que 7d/24h et ignorait la famille de médias ; Network ignorait aussi `days`. `internal/stats/filter.go` partage désormais les bornes 1d/24h,7d,30d,90d,365d/1y,all,custom et les conditions médias/serveurs. Les routes Go acceptent `from/to`, `startDate/endDate`, `dateFrom/dateTo`, `timeRange/range`. Dates custom invalides :400. Fin personnalisée : lendemain exclusif.
- **P1 — historique non filtré** : `internal/api/history_handlers.go` applique maintenant utilisateurs, famille, recherche, dates, heure UTC, méthode, client, serveurs, zapping, tri et pagination avec total exact. Les utilisateurs ordinaires sont limités au compte et au serveur résolus depuis leur session ; les administrateurs voient l'ensemble.
- **P1 — thermocarte/drilldown incohérents** : `internal/stats/dashboard.go` applique exclusion de bibliothèques, zapping, serveurs et médias sur la thermocarte annuelle ; familles canoniques Movie/Series/Audio/Book. `internal/api/heatmap_handlers.go` réutilise les mêmes filtres et gère les dates invalides.
- **P1 — révocation pouvant annoncer un succès malgré échec SQL** : `internal/api/admin_handlers.go` applique la révocation et la politique dans une transaction ; erreur500 en cas d'échec, rollback vérifié, création des paramètres globaux sur une base fraîche.
- **P1 — identité perdue après rechargement** : migration additive003 SQLite/PostgreSQL ajoute `AuthSession.identity`. Identité locale/Jellyfin/OIDC conservée dans la session sans modification des données historiques. Les sessions existantes restent acceptées avec identité NULL et résolution historique.
- **P1 — homonymes et profils privés** : `internal/auth/identity.go` résout un compte unique dans son serveur avant tout accès personnel à historique/profil/active-stream/Wrapped ; annuaire réservé aux admins comme dans `main`. Les anciennes sessions homonymes ambiguës reçoivent403. Aliases internes/Jellyfin/me/@me et UUID compact/dashed valides sont conservés. OIDC non lié ne crée plus de compte fantôme et peut se lier à un compte réel unique lors d'une reconnexion après synchronisation.
- **P1 — identifiants utilisateurs instables** : `internal/auth/auth.go` tronquait l'entrée hexadécimale avant huit octets : collision pour deux utilisateurs du même serveur et panic sur des IDs courts. Le hash SHA256 utilise la même convention que la synchronisation Jellyfin.
- **P1 — styles bloqués par CSP** : `web/static.go` autorise les styles de présentation dynamiques de l'interface existante/Chart.js ; scripts toujours limités à `'self'`, sans unsafe-inline/unsafe-eval pour JavaScript.
- **P2 — unités et catalogue** : `durationMs` dashboard convertit réellement les secondes persistées en millisecondes ; suppression de l'heuristique qui divisait arbitrairement certaines durées par1000. Compteur médias dashboard applique type/serveurs/exclusions. Catalogue reconnaît les familles séries/musique/livres et le scope serveurs.
- **P2 — mesures matérielles inventées** : CPU%,RAM%,température sont `null` quand indisponibles ; allocation Go, mémoire réservée au runtime, goroutines, OS et architecture sont réelles.
- **P1 — contexte Docker sensible** : `.dockerignore` exclut cookies, DB/WAL, données locales, logs et exécutables. Les `.env` étaient déjà exclus.

## Sécurité : intervention opérateur requise

Le retrait de `cookies.txt` du suivi Git et son exclusion ne révoquent pas la session publiée. Aucune session du déploiement réel n'a été invalidée pendant cet audit. Aucune réécriture d'historique effectuée.

Pour invalider les sessions du déploiement concerné : se connecter comme administrateur, appeler `POST` ou `PATCH /api/admin/auth/session-policy` avec le JSON `{"action":"revoke_all"}`, l'origine du déploiement et le jeton CSRF courant. Cela déconnecte toutes les sessions, y compris l'administrateur demandeur ; une reconnexion est nécessaire. Une suppression ciblée de la ligne `AuthSession` correspondante est aussi possible côté opérateur sans afficher le cookie. La rotation du secret de session invalide toutes les signatures, mais n'est pas nécessaire pour la révocation DB.

L'inventaire des fichiers suivis n'a pas trouvé de `.env` réel, DB, certificats/clés privées, données ou logs suivis après retrait du cookie. La recherche de signatures privées/tokens à forte entropie a été faite en affichant uniquement les noms de fichiers ; aucune correspondance. Ce contrôle n'est pas une preuve d'absence de tout secret dans tout l'historique Git.

## Tests effectués

- `go test -count=1 ./...` : tous les packages passent.
- `go vet ./...` : passe.
- `go build ./...` : passe.
- Intégration `web/api_integration_test.go` : 21 endpoints réellement montés, login réel sur DB temporaire ; administrateur200/JSON, anonyme401, utilisateur403 sur administration, mutation sansCSRF403 ; identité locale après reload ; cookie révoqué401.
- Régression statistiques : périodes7d/90d/365d/all/1d, familles séries incluant épisodes, scope serveur, bornes custom jusqu'à23:59:59 et lendemain00:00 exclu.
- Régression historique : self/cross-user, recherches/familles/clients/heures/méthodes, tri, zapping, dates, total versus limite.
- Régression identités : deux utilisateurs avec même nom et même Jellyfin ID sur deux serveurs ; reproducer active-stream/u2 retournait200 avant correction, puis403. Propres aliases200, historique limité, UUID normalisés, sessions anciennes ambiguës403 et cycle OIDC après synchronisation.
- Revue finale : reproducer HTTP login Jellyfin simulé sans serveur identifié + compte homonyme d'un autre serveur ; les nouvelles sessions versionnées restent non liées et leurs quatre routes personnelles répondent403. Login avec URL enregistrée entourée d'espaces + UUID compact réutilise le compte avec tirets existant : une ligne et quatre routes200. Sélecteurs et upsert d'authentification utilisent des booléens SQL portables ; PostgreSQL réel reste non testé.
- Régression révocation : trigger SQLite simulant un échec d'écriture ;500 et aucune suppression partielle des sessions.
- Tests migrations SQLite passent ; PostgreSQL compilé, **non testé en exécution** faute d'instance dédiée.
- `docker build -t jellytrack:codex-audit .` : **non testé**, lancement tenté mais moteur Docker Desktop Linux indisponible (`dockerDesktopLinuxEngine` absent).

## Environnement et performances

Serveur de test isolé sur localhost:3301, binaire natif Windows et assets vivants via junction locale ; données synthétiques (2serveurs inactifs,8médias,6utilisateurs,144lectures,48événements de télémétrie,1flux synthétique). Aucun message ni arrêt de flux sur serveur réel.

Mesure ponctuelle du processus PID13256 après navigation : working set75,27MiB ; mémoire privée58,40MiB ; CPU cumulé0,31s. Il s'agit de mémoire du processus Windows, pas d'un résultat Linux/Docker, ni d'une mesure de charge Jellyfin réelle. La cible indicative25Mo n'est pas atteinte dans cet environnement. L'allocation Go affichée par l'API matérielle n'est pas la RAM physique de l'hôte.

## Non testé ou encore partiel

Jellyfin réel, authentification fallback multiserveur en production, fournisseur OIDC réel, webhooks/notifications réels, envoi de messages, arrêt de flux, restauration de sauvegarde production, PostgreSQL et Docker. La validation visuelle appartient à l'agent principal utilisant le navigateur ; ce rapport backend ne revendique aucune capture personnelle. Les routes retournant HTML SPA dans les anciens tests n'étaient pas une preuve que leurs interactions fonctionnaient.

Les tableaux catalogue/profil et certaines analyses historiques ont encore des agrégats fixes ou des fonctions absentes ; cet ensemble ne prétend pas une parité exhaustive de toutes les pages historiques. La persistance d'identité résout les nouvelles sessions ; les anciens cookies sont résolus seulement si un compte compatible unique existe, sinon une reconnexion est requise. Les autres surfaces globales et les intégrations réelles restent à approfondir ; aucune sécurité exhaustive de l'application n'est revendiquée.
