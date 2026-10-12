# Bibliothèques, journaux et crédits — 12 octobre 2026

- Les statistiques du catalogue regroupent les lectures par média avant de les rattacher aux séries/albums. Pour une liste triée par titre/date, ce regroupement est limité aux familles affichées.
- Des index de pagination date/identifiant ont été ajoutés pour SQLite et PostgreSQL. SQLite reçoit également un index sur IP/date normalisée pour les alertes des journaux. Migration automatique au démarrage ; aucun historique supprimé.
- Les crédits Jellyfin sont importés depuis `People` (Director, Actor, GuestStar), et les studios acceptent objets et anciennes listes de noms. Les épisodes sans crédits héritent de ceux de leur série/saison sur le même serveur.
- Le sélecteur de rétention des fichiers de journaux système a été retiré des planifications. Les historiques de lecture restent disponibles.
- Le nettoyage manuel des médias sans bibliothèque ou des vidéos sans résolution existait déjà. Ses tests vérifient l'aperçu, la sauvegarde, la suppression transactionnelle, la protection des lectures actives et le rejet d'un aperçu périmé. Il n'a pas été exécuté sur les données de production.

## Vérification locale

Le test `TestLibraryAggregationWithRepeatedPlaybacks` compare les résultats avant/après sur 1 000 médias et 100 000 lectures. Une exécution a mesuré 858 ms avant et 690 ms après pour l'agrégation seule (environ 20 % de réduction). Ces temps fluctuent et ne mesurent ni une page complète ni le NAS.

Les tests de catalogue vérifient aussi les comptes, filtres, permissions, pagination et hiérarchies. Un test spécifique couvre un épisode → saison → série avec identifiants Jellyfin et crédits uniquement sur la série.

Aucun conteneur local actif n'a été trouvé. Le déploiement distant, les temps de pages réels et la récupération des métadonnées auprès du Jellyfin de production restent à vérifier après mise à jour et synchronisation complète.

Format Jellyfin : https://typescript-sdk.jellyfin.org/interfaces/generated-client.BaseItemDto.html
