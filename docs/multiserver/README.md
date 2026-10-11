# Fiabilisation multi-serveur — develop, 11 octobre 2026

Corrections locales réalisées sur `develop`, sans commit, push ou déploiement. Les changements préexistants du dépôt ont été conservés. Aucun conteneur JellyTrack existant, montage `/data` ou base de production n'a été modifié.

## Comportements corrigés

- Les profils, lectures actives et Wrapped administrateur ne regroupent plus les comptes par nom. Un identifiant distant présent sur plusieurs serveurs exige un serveur ; un identifiant interne reste univoque. Les liens des utilisateurs, du dashboard et des sessions conservent cette identité.
- Synchronisation et plugin reconnaissent les UUID Jellyfin compacts, avec tirets et avec différences de casse, dans le périmètre d'un serveur. Les références aux parents sont également conservées lors de la normalisation par le plugin.
- La synchronisation contacte jusqu'à quatre serveurs indépendamment, libère les lignes SQL avant les écritures et conserve les résultats des serveurs fonctionnels lorsqu'un autre échoue. Un échec partiel est signalé, y compris lorsqu'un serveur fonctionnel est vide.
- Une synchronisation refuse de remplacer l'identité Jellyfin d'un serveur possédant déjà des données. Les changements d'URL dans les paramètres doivent désigner le même serveur. L'ajout répété du même identifiant serveur renvoie un conflit sans modifier la configuration existante.
- Les événements du plugin exigent un identifiant explicite en multi-serveur ; les clés limitées à un serveur refusent un autre serveur. L'absence de nom ou d'URL dans un événement conserve les valeurs configurées.
- Une image avec un serveur invalide ne retombe plus sur un autre serveur. Une image sans serveur ne choisit pas arbitrairement entre plusieurs serveurs.
- Les filtres s'appliquent aux utilisateurs, profils, historique, catalogue, dashboard et sessions. L'API de sessions distantes interroge les serveurs sélectionnés indépendamment et limite un utilisateur standard à son compte et son serveur.
- Les comptes homonymes de serveurs différents ne sont plus proposés comme doublons ; leur fusion est refusée avant toute écriture. Les erreurs de décodage d'une réponse Jellyfin lors de la purge des utilisateurs ne déclenchent plus de suppression.
- Les lectures/écritures des booléens de configuration et les tableaux de métadonnées synchronisées sont compatibles SQLite/PostgreSQL.

## Affichage

Le mode d'affichage dépend du nombre de serveurs configurés, même si `JELLYTRACK_MODE` indique l'inverse. L'ajout d'un autre serveur reste disponible dans les paramètres avec un seul serveur.

| Page | Ajout visible avec au moins deux serveurs |
|---|---|
| Historique | Nom du serveur sur chaque média lu |
| Sessions du dashboard | Nom et dernier état connu du serveur, liens contextualisés |
| Profil | Activité par serveur du compte sélectionné |
| Média | Serveurs avec une copie identifiée par un identifiant de catalogue commun |
| Dashboard | Filtre et comparaison de l'activité sur la période sélectionnée |
| Santé | État, latence mesurée et dernière connexion réussie par serveur |

Ces ajouts sont masqués en mono-serveur. Les pages et leurs composants existants sont conservés.

## Validation réellement exécutée

Deux serveurs HTTP Jellyfin simulés utilisent les mêmes identifiants utilisateur, média, session et événement, ainsi que les mêmes noms. Les tests contractuels ont été exécutés sur SQLite temporaire et PostgreSQL 17 dans un conteneur créé uniquement pour ces tests. Chaque test PostgreSQL crée et supprime son propre schéma dans `jellytrack_multi_test` ; le helper refuse une URL ne désignant pas cette base locale.

| Vérification | Résultat |
|---|---|
| `go test ./... -count=1 -timeout=120s`, URL PostgreSQL de test configurée | Réussi, aucun test ciblé PostgreSQL ignoré |
| `go vet ./...` | Réussi |
| `go build ./...` | Réussi |
| `node --check` sur les sept fichiers JavaScript modifiés | Réussi |
| `git diff --check` | Réussi |
| Navigateur Chromium, connexion administrateur réelle, deux fixtures mono/multi | 25 contrôles réussis, aucune erreur JavaScript |

Les sept tests `TestMultiServer…` couvrent 13 scénarios par base : création et mutation persistées, ajout répété, changement d'identité refusé, proxy d'images, sessions distantes et permissions, filtres/API/affichage, cible lente, changement d'identité avec données existantes, synchronisation/plugin sans doublons. Le test existant de fusion vérifie aussi le refus entre serveurs et la conservation de l'historique.

Le test de serveur lent vérifie que le serveur fonctionnel termine ses appels pendant que l'autre reste bloqué. L'arrêt d'une session avec un identifiant partagé laisse celle de l'autre serveur intacte. Une indisponibilité conserve la dernière connexion réussie.

Preuves navigateur : [résultats](browser-results.json), captures desktop mono/multi de dashboard, historique, profil, média, santé et captures mobiles de santé. [Liste des fichiers et empreintes](files.json).

## Migration et limites

La migration `004_server_connection.sql` ajoute `ServerConnectionState` et `Media.providerIds` pour les deux moteurs. Elle a uniquement été appliquée aux bases isolées de validation. Elle sera appliquée par le mécanisme habituel lors d'un démarrage ultérieur avec ces sources ; aucune migration de production n'a été lancée pendant ce travail.

- Une personne ayant des comptes sur plusieurs serveurs n'est pas identifiée par son nom ou par un UUID local identique. Aucun lien global de comptes n'est inventé : le profil reste celui du compte sélectionné. Une répartition couvrant plusieurs comptes d'une même personne demanderait une liaison explicite, absente du modèle actuel.
- La disponibilité des médias utilise le type et des identifiants IMDb, TMDb, TVDb ou MusicBrainz. Sans correspondance fiable, seule la présence du média sélectionné est confirmée. Les données existantes sans `providerIds` nécessitent une synchronisation pour enrichir cette information. Les médias ne sont pas fusionnés.
- L'état de santé est celui du dernier contact enregistré par la synchronisation ou le plugin ; il ne remplace pas une sonde réseau continue. La latence provient de l'appel SystemInfo, pas d'une valeur inventée.
- Aucun serveur Jellyfin réel, plugin installé réel ou volume de production n'a été testé. La redondance de plusieurs instances partageant une base reste hors périmètre.

## Rejouer la validation navigateur

Depuis le dépôt, lancer les deux commandes dans deux terminaux :

```powershell
go run ./scripts/multiserver-qa/serve.go -port 3358
```

```powershell
go run ./scripts/multiserver-qa/serve.go -port 3359 -single
```

Puis, dans un troisième terminal :

```powershell
node scripts/multiserver-qa/browser.cjs
```

Ces serveurs utilisent exclusivement des bases SQLite temporaires et des endpoints Jellyfin simulés. Le chemin Playwright par défaut correspond au runtime local présent lors de la validation ; ailleurs, définir `PLAYWRIGHT_MODULE` vers le module installé.
