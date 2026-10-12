# Bibliothèques importées et ajouts récents — 12 octobre 2026

Corrections locales sur develop, sans déploiement ni modification de la base utilisateur.

Le graphique d'analyse utilise `Media.libraryName`, puis `collectionType` si le nom manque. Des lignes nommées « Films » et d'autres sans nom peuvent donc produire « Films » et « movies ». Ce symptôme ne prouve pas une corruption SQLite ou un échec de l'import PostgreSQL. Le contenu de la base du serveur reste à examiner.

Les événements plugin sans nom de bibliothèque ne remplacent plus un nom existant par NULL. Les parents connus sont également conservés lorsqu'un événement ne les fournit pas. Les noms réellement fournis restent actualisés. La synchronisation Jellyfin conserve déjà les noms absents. Les bibliothèques distinctes ne sont pas fusionnées automatiquement.

La page `/recent` demande `groupSeries=true` : une carte par série du catalogue, sans saisons ni épisodes. Films, musique et livres restent disponibles. La date affichée est la date d'ajout de la série ; ajouter un épisode ne crée pas de nouvelle carte. Les épisodes restent accessibles dans les autres pages et dans l'historique. Une série absente du catalogue nécessite une synchronisation Jellyfin ; aucune série artificielle n'est créée.

Pour les listes triées par titre/date d'ajout sans filtre de résolution, les statistiques de lecture sont calculées pour les familles de médias de la page affichée. Les tris par statistiques et les filtres de résolution conservent leur calcul complet. Aucun gain chiffré sur le serveur réel n'est encore démontré.

## Tâche manuelle dans JellyTrack

Après déploiement de cette version : **Paramètres → Planificateur → Tâches → Réparer les bibliothèques importées → Exécuter**. La carte porte « Lancement manuel uniquement ». Aucune fréquence, aucun cron et aucun démarrage automatique ne déclenchent cette réparation. Elle est réservée à l'administrateur.

La tâche intégrée fonctionne directement en Go, sans Python. Elle vérifie SQLite et ses relations, consulte les bibliothèques Jellyfin configurées et leurs médias récursivement, puis retrouve chaque média par son identifiant Jellyfin dans le même serveur. Les différentes bibliothèques de films restent distinctes ; les noms ne sont jamais déduits du seul type Movie/Episode. Les UUID avec/sans tirets sont reconnus. Les médias absents ou présents dans plusieurs bibliothèques de noms différents restent inchangés et sont comptés dans le résultat.

Un véritable identifiant Jellyfin différent, une clé manquante, un Jellyfin inaccessible ou une énumération incomplète interrompent la préparation sans appliquer de correction. Avant les modifications, la tâche crée une copie native complète `.sqlite` via `VACUUM INTO`, incluant les données WAL validées, contrôle cette copie et calcule son SHA-256. Un lien administrateur permet de télécharger cette sauvegarde depuis le résultat. Elle est conservée dans le dossier de sauvegardes ; elle n'est pas soumise à la rotation des sauvegardes ZIP ordinaires. Ce fichier natif se restaure comme fichier SQLite, application arrêtée ; ce n'est pas un ZIP à importer dans le formulaire de sauvegardes.

Les noms sont corrigés dans une transaction et relus. Si un média change pendant la préparation, l'ensemble des modifications est annulé. Les lectures, identifiants internes, relations et autres réglages sont conservés. Une deuxième exécution sans nouveau changement affiche zéro correction et ne crée pas de nouvelle sauvegarde. Le résultat est affiché sur la carte ; garder la page ouverte jusqu'à la fin de la requête, qui peut durer plusieurs minutes selon le catalogue. La tâche ne répare pas toutes les formes possibles de corruption ou les relations invalides de l'import.

Tests intégrés : bibliothèques Films/Enfants/Séries obtenues auprès d'un Jellyfin HTTP simulé, noms SQLite relus, historique conservé, sauvegarde native relue et téléchargée, idempotence, annulation transactionnelle, refus d'origine étrangère, exclusion mutuelle et routes protégées administrateur.

Contrôle navigateur isolé (`scripts/runtime-regressions/library-repair-browser.cjs`, API simulée) : carte manuelle, aucune requête de réparation au chargement, bouton désactivé pendant l'exécution, affichage du résultat et du téléchargement, erreur visible après nouvelle tentative, action disponible à 390 pixels et absence d'erreur JavaScript. Ce contrôle ne prouve pas le fonctionnement de Jellyfin ou de la base sur le serveur utilisateur.

### Identifiants provisoires provenant des anciens imports

Un ancien export peut omettre `jellyfinServerId` : le restaurateur utilise alors `Server.id`. Les anciens exports main peuvent aussi contenir `imported-server-N`. Ces marqueurs et les identifiants vides peuvent être réconciliés avec l'identifiant renvoyé par Jellyfin, uniquement si au moins un média existant est retrouvé dans une bibliothèque sans ambiguïté. Les identifiants de médias seuls ne prouvent pas que deux installations Jellyfin sont identiques : vérifier que l'URL configurée correspond bien au serveur d'origine. Le 12 octobre, l'utilisateur a confirmé conserver la même installation et son dossier de configuration.

La sauvegarde précède toute correction. La transaction met à jour seulement `Server.jellyfinServerId`, garde `Server.id` et tous les liens de l'historique, puis relit l'identifiant. Si cet identifiant Jellyfin est déjà associé à un autre serveur, la réparation entière est annulée ; aucune fusion automatique. Une vraie identité non provisoire différente reste refusée, avec les valeurs enregistrée et observée dans le message pour permettre le diagnostic. Les variantes UUID avec/sans tirets, casse différente et espaces périphériques sont reconnues.

Tests : ancien identifiant interne, marqueur `imported-server-1`, valeur vide, absence de média confirmé, véritable identité différente, conflit avec un serveur existant, UUID formaté, conservation de l'historique et de l'identifiant original dans la sauvegarde.

## Ancien outil hors ligne (alternative)

Prérequis : Python 3.11 ou plus, accès au véritable fichier SQLite. Pour appliquer une réparation sur le serveur, arrêter JellyTrack pendant la maintenance et travailler sur le montage de données identifié. Ne pas remplacer une base active par une copie de son seul fichier `.db` : les fichiers WAL peuvent contenir des écritures récentes. Utiliser une sauvegarde intégrée à l'application ou une sauvegarde SQLite cohérente.

Depuis la racine du dépôt, audit seul, sans écriture dans la base (remplacer le chemin par le véritable fichier) :

```powershell
python scripts/repair-library-names.py "CHEMIN_COMPLET_VERS_LA_BASE.db"
```

Le résultat contient le contrôle d'intégrité, le nombre d'erreurs de relations et les bibliothèques par serveur, type et collection. La copie locale `data/jellytrack.db` n'est pas une preuve du contenu du serveur utilisateur.

Après examen, créer un fichier `library-mapping.json`. Exemple de structure uniquement :

```json
[
  {"serverId": "ID_REEL_DU_SERVEUR", "from": null, "to": "NOM_VERIFIE"}
]
```

`null` signifie un nom absent ; `""` un nom vide ; `"movies"` désigne exclusivement ce nom exact. Chaque correspondance s'applique à tous les médias portant ce nom dans le serveur indiqué : ne pas utiliser une correspondance depuis `null` si plusieurs bibliothèques différentes ont perdu leur nom. Dans ce cas, privilégier une synchronisation complète ou une réparation ciblée à partir des identifiants Jellyfin. Ne pas déduire que tous les films appartiennent à une seule bibliothèque.

Simulation puis application :

```powershell
python scripts/repair-library-names.py "CHEMIN_COMPLET_VERS_LA_BASE.db" --mapping library-mapping.json
python scripts/repair-library-names.py "CHEMIN_COMPLET_VERS_LA_BASE.db" --mapping library-mapping.json --apply
```

L'application crée d'abord une sauvegarde SQLite cohérente, vérifie son intégrité et fournit son SHA-256. Les changements sont transactionnels, relus et contrôlés. Aucune lecture ni aucun média n'est supprimé. Des erreurs de relations empêchent l'application. Pour revenir en arrière : JellyTrack arrêté, conserver la base modifiée et ses éventuels fichiers WAL/SHM, puis restaurer la sauvegarde comme base de démarrage isolée sans réutiliser les anciens WAL/SHM.

L'outil corrige les noms ; il ne réimporte pas PostgreSQL, ne fusionne pas les sessions et ne répare pas les relations manquantes.

## Vérification

- Tests Go : absence de noms/parents dans les événements, regroupement Series → Season → Episode avec les deux formes d'identifiants, pagination, filtrage serveur/type, maintien des statistiques et accès explicite aux épisodes.
- Test Python : audit sans écriture, sauvegarde relue, correction limitée au bon serveur, historique intact, deuxième application sans changement, rejet des correspondances en chaîne.
- Suite Go complète, analyse statique, compilation, syntaxe JavaScript et vérification du diff.

À terminer sur l'instance réelle : audit de la base importée, correspondances vérifiées, application et relecture, mesure des pages lentes après déploiement. Docker Desktop était indisponible pendant cette intervention.
