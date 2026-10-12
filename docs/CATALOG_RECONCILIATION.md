# Catalogue et historique après un remplacement de fichier

Après installation de cette version, lancer **Synchronisation complète** dans Paramètres → Planificateur → Tâches. La synchronisation récente ne vérifie pas les suppressions.

Une synchronisation complète réussie retire du catalogue visible les éléments absents de Jellyfin. Les fiches nécessaires aux anciennes lectures restent accessibles depuis l’historique. Une erreur de lecture du catalogue ne déclenche pas ce retrait.

Pour les films et les séries, une correspondance unique par TMDB, IMDb ou TVDB, sur le même serveur et pour le même type, peut rattacher le nouveau fichier à sa fiche précédente. Les lectures et événements sont conservés, y compris si la nouvelle fiche avait déjà été créée. Les correspondances ambiguës, versions simultanées et lectures actives empêchent la fusion. Les épisodes et pistes ne sont pas fusionnés sur l’identifiant de leur série ou album.

La tâche de réparation peut retrouver une bibliothèque historique avec ces identifiants. Si l’ancien import ne contient aucun identifiant fournisseur exploitable, le nom du film ne suffit pas : l’enregistrement reste non identifié. Un numéro présent seulement dans le nom du dossier ne sera pas deviné ; Jellyfin doit fournir ses ProviderIds.

La tâche manuelle de nettoyage présente les médias non identifiés admissibles et les lectures concernées. Il faut utiliser son bouton de suppression pour appliquer le nettoyage. Une sauvegarde SQLite précède la suppression. Une résolution manquante seule ne rend pas un média admissible. Musique, albums et conteneurs de séries ne sont pas comptés comme fichiers vidéo sans résolution dans l’audit des métadonnées.

Le texte du bouton SSO se règle dans **Paramètres → Jellyfin → Général → Texte du bouton de connexion SSO**. Vide, il reprend la traduction standard. Ce réglage de présentation ne modifie pas la configuration OIDC définie par les variables d’environnement.

Validation locale : SQLite et Jellyfin simulé. Le serveur NAS et un fournisseur OIDC réel ne sont pas vérifiés par ces tests.
