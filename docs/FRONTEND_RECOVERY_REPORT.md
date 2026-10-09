# Récupération de JellyTrack Go — 9 octobre 2026

Un ensemble cohérent de corrections backend/frontend a été intégré et testé. **La migration et la parité complète avec l'ancienne interface ne sont pas terminées.** Aucun framework frontend, dépendance runtime Node, Next.js, React, TypeScript ou Prisma n'a été ajouté.

Base : dernier `origin/develop` récupéré au début de la mission, `f29ef0eea5cf9c6e08813f5db2ffb3973b339ddd`. Comparaison historique : `origin/main`, `a59a28613e63e86106c61827167d355b47147f42`. Branche : `codex/frontend-recovery`. `main` n'a pas été modifiée ; aucune fusion ni réécriture d'historique.

## 1. Sous-agents réellement utilisés et coordination

Six sous-agents ont réellement été lancés au fil de la mission. Trois ont travaillé simultanément avec le principal ; les revues suivantes ont utilisé les créneaux libérés. Les responsabilités dashboard et validation ont été réparties entre l'audit frontend, le backend et le principal.

| Sous-agent | Responsabilités et fichiers attribués |
|---|---|
| `frontend_audit` | Navigation et comparaison des dashboards/composants historiques ; audit de `app.js` en lecture seule, rédaction de [l'audit frontend](audit-frontend.md), création exclusive du module isolé `web/dist/assets/history.js`, puis revue d'intégration. |
| `interface_css` | Thèmes, layout, responsive et ergonomie ; exclusivité `web/dist/assets/app.css` et [audit interface](audit-interface.md). |
| `backend_validation` | API Go, contrats, authentification, permissions, tests et démarrage isolé ; exclusivité `internal/`, migrations, serveur/tests web et `.dockerignore` ; [audit backend](audit-backend.md). |
| `security_review` | Revue indépendante en lecture seule du retrait du cookie, des exclusions et de la révocation. A identifié les exclusions imbriquées et les erreurs SQL de révocation, corrigées ensuite. |
| `backend_validation/identity_investigator` | Investigation indépendante des identités homonymes, des anciennes sessions, d'OIDC et des variantes UUID Jellyfin ; lecture seule. |
| `backend_validation/identity_candidate_review` | Revue finale indépendante des possibilités de contournement et régressions de la correction d'identité ; lecture seule. |

Le principal a centralisé toutes les modifications du fichier partagé `app.js`, le shell HTML, `.gitignore`, l'intégration et les tests navigateur. Les agents CSS/backend n'ont pas piloté la même session navigateur. Les retouches finales de `history.js` ont été faites après la fin du travail de son auteur.

L'agent backend a atteint sa limite d'usage pendant la toute dernière passe. Le principal a repris la vérification du code final et exécuté lui-même la suite complète, `vet` et `build` ; la livraison ne repose pas sur un test resté en attente chez cet agent.

## 2. Problèmes constatés et preuves

Les [constats détaillés](audit-frontend.md) incluent les chemins et lignes du point de départ, vérifiés contre les handlers Go et `origin/main`. Principaux défauts :

| Cause | Preuve dans le code initial | Statut livré |
|---|---|---|
| Secret suivi Git | `cookies.txt` contient un enregistrement de cookie d'authentification. Valeur jamais affichée. | **Partiellement corrigé** : retrait du suivi et protections faits ; session d'origine non révoquée. |
| DOM/CSP | `web/static.go` bloquait les styles inline existants ; actions live `onclick`/`onerror` dans `app.js` bloquées par `script-src 'self'`. | **Corrigé** : listeners délégués ; scripts toujours limités à `'self'`, styles dynamiques autorisés. |
| Contrats API | Settings serveurs attendait un tableau au lieu de `{servers}` ; sauvegardes utilisait de mauvais noms ; thermocarte attendait `heatmapDataByType` au lieu de `dataByType`. | **Corrigé** : contrats réels utilisés. Sauvegardes avec données non vides et restauration : **non testées** dans le navigateur. |
| Navigation/état | Login réussi à la racine sans changement de page ; timers du dashboard nettoyés seulement sur `popstate` ; anciens graphiques et réponses en retard. | **Corrigé** pour le cycle de route : abort, destruction des charts, nettoyage des timers, conteneur détaché et gardes des analyses. |
| Backend/filtres | « Tout » revenait à 7 jours ; analyses ignoraient plusieurs périodes et types ; drilldowns perdaient leur scope. | **Corrigé** : bornes communes, familles médias, scope serveur et dates personnalisées. |
| Non migré | `/logs` affichait seulement des logs système ; `/recent` affichait les lectures plutôt que les ajouts historiques. | **Corrigé** : historique de lectures séparé et véritable catalogue des ajouts. |
| Layout | Grilles minimum420px, sidebar réduite avec mauvais sélecteur, header mobile dépassant558px sur390px. | **Corrigé** : largeur plafonnée, menu mobile, header repliable ; mesure finale383px sur390px. |
| Identité/sécurité | Sessions ne conservaient pas l'identité serveur ; ancien générateur d'IDs pouvait produire collisions/panic ; révocation annonçait succès malgré erreurs SQL. Les homonymes étaient autorisés par pseudo et le profil omettait le contrôle self historique. | **Corrigé** : migration additive003, SHA256 compatible sync, révocation transactionnelle et résolution unique du compte+serveur pour historique/profil/flux personnel/Wrapped ; annuaire réservé aux admins. |
| Données présentées | CPU/RAM hôte fictifs, mémoire Go présentée comme RAM système, géographie lisant `count` au lieu de `sessions`. | **Corrigé** : N/A/null pour mesures absentes, tas Go en MiB, compteur géographique réel et scope global explicite. |

## 3. Corrections et fonctions restaurées

- Dashboard : plages24h/7j/30j/90j/365j/Tout/custom, paramètres URL, filtres familles/serveur et protection des requêtes concurrentes. Périodes réutilisées dans deep/granular/network.
- Graphiques existants reconnectés à leur scope réel : activité, horaires, jours, catégories/clients/plateformes, complétion, mois, thermocartes et transcodage. Calendrier annuel UTC avec nombre de semaines correct ; lien mensuel borné au dernier jour du mois. Heures de filtres/matrices explicitement UTC ; dates de sessions affichées dans la locale du navigateur.
- Historique : recherche, types, dates, heures UTC, client, méthode, zapping, tri, pagination et total exact ; restriction self pour non-admin ; liens médias/utilisateurs ; détails et événements de télémétrie ; onglet audit système ; CSV de la page visible.
- Flux : ouverture des détails/actions, messages prédéfinis et durée du pop-up ; un seul polling streams dashboard ; fenêtres de confirmation utilisables. Envoi/arrêt sur Jellyfin réel **non testés**.
- Ajouts récents, familles séries incluant épisodes dans le catalogue et scope serveur backend ; recherche issue de l'URL.
- Connexion locale affichée sans OIDC, retour SSO masqué, navigation après connexion ; redirection non-admin vers son profil et annuaire masqué ; identité des nouvelles sessions conservée après rechargement. Anciennes sessions homonymes ambiguës refusées403, aliases légitimes et formats UUID Jellyfin conservés. Les nouvelles sessions sans serveur fiable ne bénéficient pas du fallback réservé aux anciennes sessions. Une connexion avec UUID compact réutilise le compte existant avec tirets dans le même serveur. OIDC ambigu reste non lié, sans créer de faux compte utilisateur ; rapprochement unique possible lors d'une reconnexion après synchronisation.
- CSS : thèmes et contrastes, sidebar, grilles, tableaux défilants, modales/notifications contenues, focus visible et préférence de réduction des animations. `[hidden]` reste effectif malgré les règles de présentation.
- README et architecture corrigés pour ne plus présenter la présence de fichiers comme preuve de parité ni garantir une mémoire non mesurée.

## 4. Parité restante — partielle ou non corrigée

| Surface | Statut et limite |
|---|---|
| Dashboard déplaçable | **Partiellement corrigé** : ordre local validé, contrôles monter/descendre existants ; glisser-déposer historique non restauré. |
| CollapsibleCard | L'ancien composant `main` indiquait que le repli avait été retiré à la demande de l'utilisateur : aucun repli fictif ajouté. |
| ServerFilter | **Partiellement corrigé** : sélection d'un serveur dashboard et propagation URL ; multi-sélection persistante historique et application uniforme à toutes les pages absentes. |
| Predictions et géographie | **Partiellement corrigé** : données API réelles ; ne suivent pas tous les filtres dashboard. Géographie explicitement globale. |
| Profils | **Non corrigé** : activité/statistiques utilisateur détaillées et flux personnel historiques encore incomplets ; recherche/pagination du répertoire non restaurées. |
| Détails médias | **Non corrigé** : MediaDropoffChart, TelemetryChart et MediaTimelineChart complets, hiérarchies saisons/épisodes/albums/pistes encore manquants. Événements bruts visibles dans l'historique. |
| Bibliothèques | **Partiellement corrigé** : courbes dashboard par familles ; courbes nommées de toutes les bibliothèques historiques non rétablies. |
| Santé | **Non corrigé** pour HealthAnomalyCharts ; certains états moniteur/sondes et intitulés restent optimistes ou statiques sans collecte réelle. |
| Historique avancé | **Partiellement corrigé** : colonnes personnalisables, presets, filtres audio/sous-titres/résolution et timeline graphique complète absents. CSV limité à50 lignes affichées. |
| Traductions | **Partiellement corrigé** : secours français, locale formats/document ; chaînes françaises fixes et certains textes anglais dans le dictionnaire allemand demeurent. Onze JSON valides ne prouvent pas une traduction complète. |
| Wrapped | **Non testé** bout à bout dans le navigateur ; limites calendaires, confidentialité et partage à compléter. |
| Multi-serveur et confidentialité | **Partiellement corrigé** : compte+serveur exact pour les routes personnelles et contrôle des homonymes ; résolutions d'images et autres surfaces globales encore à approfondir sur des instances réelles. Les anciens comptes homonymes nécessitent une nouvelle connexion pour lever l'ambiguïté. |
| Accessibilité | **Partiellement corrigé** : focus visible, cellules clavier, modales fermées masquées ; focus trap/retour focus de toutes les modales génériques non vérifiés. |
| Erreurs et gros volumes | **Partiellement corrigé** : analyses/historique différencient erreurs et vide ; d'autres pages absorbent encore certaines erreurs. Certaines requêtes parcourent de longues périodes : charge volumineuse non mesurée. |

## 5. Tests et validation visuelle

| Vérification | Résultat |
|---|---|
| `go test -count=1 ./...` | **Réussi**, tous packages, bases temporaires. |
| `go vet ./...`, `go build ./...` | **Réussis**. |
| Intégration HTTP | **Réussie** :21 endpoints montés, login, JSON,401 anonyme,403 admin/CSRF, identité, révocation401 ; rollback500 testé. |
| Dates/filtres | **Réussis** : périodes, familles, serveurs, zapping, custom inclusif jusqu'à fin du jour ; lendemain exclu ; dates invalides400. |
| Isolation des comptes | **Réussie** : mêmes pseudos sur deux serveurs, refus inter-comptes, self légitime, aliases et UUID ; anciennes sessions ambiguës403, métadonnées de session et cycle de rapprochement OIDC. |
| Syntaxe et assets | **Réussis** : `node --check` pour les2 modules,11 dictionnaires JSON valides, `git diff --check`. Node utilisé uniquement comme outil de vérification. |
| Docker | **Bloqué/non testé** : construction tentée, moteur Docker Desktop Linux absent. Ni image ni démarrage conteneur validés. |
| PostgreSQL | **Non testé** en exécution ; migration additive préparée, compilation uniquement. |

Application réellement lancée sur `localhost:3301` avec une base isolée :2serveurs inactifs synthétiques,8médias,6utilisateurs,144lectures,48événements et1flux synthétique. Aucun accès ni modification des données de production. Aucun message ou arrêt envoyé aux vrais serveurs.

Navigateur automatisé réellement utilisé aux dimensions1440×1000,768×1024 et390×844. Captures enregistrées et examinées, références CSS/composants de `main` et capture historique `public/screenshots/dashboard.png` consultées. Le serveur Next.js historique n'a pas été exécuté : aucune comparaison pixel par pixel revendiquée.

Parcours vérifiés : connexion/déconnexion/reconnexion locale, identité admin après reload, dashboards et onglets deep/granular/network, Tout et dates personnalisées+Movie+serveur secondaire, modal de cellule horaire (4sessions), message prédéfini+30s puis annulation, confirmation arrêt puis annulation, thèmes, sidebar mobile/navigation, historique filtre/pagination3pages, détail vide et détail avec pause/reprise/seek, onglet audit, invalidité des dates puis correction/état vide. Catalogue/tablette, filtre Séries (2épisodes) et détail d'un épisode vérifiés.

Smoke navigation en base synthétique : récent/catalogue/utilisateurs, santé système, comparaison serveurs, nettoyage, logs/plugin health, analyses/collections, paramètres serveurs/SSO/média/plugin/scheduler/sauvegardes. Les opérations de nettoyage, restauration, modifications de clés, webhooks et tâches externes n'ont pas été exécutées. Aucun message console error/warn observé dans les parcours échantillonnés ; cela ne garantit pas l'absence d'erreur dans chaque branche de l'application.

Preuves : [desktop sombre](validation/dashboard-desktop.jpg), [graphiques](validation/charts-desktop.jpg), [desktop clair](validation/dashboard-light.jpg), [mobile clair final](validation/dashboard-mobile-light.jpg), [historique mobile](validation/history-mobile.jpg), [télémétrie](validation/history-telemetry.jpg), [catalogue tablette](validation/catalogue-tablet.jpg), [message30s](validation/message-modal.jpg).

## 6. Sécurité restante et intervention

**À faire sur l'instance d'origine : révoquer la session exposée.** Se connecter en administrateur et appeler `POST` ou `PATCH /api/admin/auth/session-policy`, corps `{"action":"revoke_all"}`, avec l'origine correcte et le jeton CSRF courant. Toutes les sessions, y compris celle de l'administrateur demandeur, seront déconnectées. Vérifier qu'une ancienne session reçoit401. La correction transactionnelle rend un échec SQL visible au lieu de signaler un succès.

Les métadonnées du cookie indiquent `localhost`, chemin `/` et attribut Secure ; sa validité et une éventuelle réutilisation sur un déploiement ne sont pas vérifiées. Le cookie n'a jamais été utilisé pour accéder à une instance réelle. `cookies.txt` n'est plus suivi, mais sa copie locale a été préservée et il reste dans l'historique Git. `.gitignore` couvre `cookies*.txt`, `*.cookie`, `*.cookies` y compris sous-répertoires ; Docker exclut aussi bases, journaux et données locales. Inventaire de noms et recherche de signatures usuelles : aucun autre candidat sensible suivi détecté. **L'historique complet n'a pas fait l'objet d'un scan exhaustif.** Aucune réécriture destructive entreprise.

## 7. Performances

Mesure ponctuelle du binaire Go Windows après navigation : working set75,27MiB, mémoire privée58,40MiB, CPU cumulé0,31s. Le navigateur est un autre processus. La mémoire du tas présentée par l'API est différente de la mémoire résidente totale. La cible indicative25Mo n'est pas atteinte sur cette mesure ; aucune charge représentative Jellyfin/Linux/Docker effectuée.

Les timers et chart instances sont nettoyés à chaque navigation, le polling streams redondant est supprimé et les demandes de pages quittées sont annulées. Aucune dépendance frontend lourde ajoutée. Aucune garantie chiffrée de production ou de taille d'image fournie.

## 8. Livraison Git

Branche publiée : `codex/frontend-recovery`, depuis `develop`.

Commits de code :

- `400ed4f` — retrait du cookie suivi et exclusions des données locales.
- `c43d324` — historique de lectures, dashboard, navigation et responsive.
- `eaac78d` — contrats API/filtres et isolation des comptes en session.

Le rapport, les audits, les captures et la mise à jour README/architecture sont livrés dans un quatrième commit documentaire ; son identifiant est donné dans la réponse de livraison.

**PR non créée** : le connecteur GitHub retourne403 « Resource not accessible by integration » ; `gh` n'est pas authentifié et la réutilisation de l'accès Git local n'a pas abouti. Le navigateur GitHub affiche « Sign in », sans session autorisée. La branche est bien poussée, mais aucune PR ni fusion n'est revendiquée. [Ouvrir la comparaison vers develop](https://github.com/maelmoreau21/JellyTrack/compare/develop...codex/frontend-recovery?expand=1). Le texte de PR est préparé localement dans `scratch/recovery-pr-body.md`, non suivi. Aucune modification de `main`, aucun force push.
