# Mon profil et nettoyage — 12 octobre 2026

Le menu affiche désormais « Mon profil » pour tout compte connecté. Le lien utilise `/users/me`, dont l'API conserve la résolution exacte du compte et du serveur. Les accès aux profils et historiques restent contrôlés côté serveur.

Un administrateur local peut ouvrir la page pour consulter son nom et une explication : ses statistiques personnelles nécessitent une connexion Jellyfin ou SSO liée à Jellyfin. Aucun utilisateur Jellyfin ni historique fictif n'est créé pour ce compte.

Nettoyage confirmé par les appels actuels :

- Suppression de l'ancien `Pages.recent`, sans appel : `/recent` est rendu par `Pages.mediaPage`.
- Suppression des branches historiques de `Pages.settings` pour Jellyfin, médias, sauvegardes, notifications, plugin, sécurité du plugin et planificateur. `JellyTrackSettings` les rend directement. Les branches `overview` et `network` sont conservées : les pages `go-overview` et `go-network` les appellent encore.
- Suppression des deux traductions inutilisées de rétention des journaux système dans les onze fichiers de messages. Les historiques de lecture et leur rétention sont conservés.

Au total, 813 lignes de `app.js` sont retirées. Cela n'est pas un audit exhaustif de tout le dépôt : les autres anciennes fonctions encore appelées restent présentes.

`scripts/runtime-regressions/my-profile-browser.cjs` utilise les vrais fichiers frontend et un contexte simulé pour vérifier le menu local/Jellyfin/SSO, les rôles, le mobile, l'explication du compte local et l'échappement du nom. Les tests Go des API, de l'authentification et des ressources web passent. La validation locale ne remplace pas un test du Docker de production.
