# Nom Authentik et profil — 12 octobre 2026

Comparaison historique : `main:src/lib/authOptions.ts`, fonction `profile`, choisit `name`, puis `preferred_username`, `username`, `nickname`, `email`, `sub`. La version Go choisissait `preferred_username`, `email`, `name`, `sub` pour la réconciliation automatique.

La fonction Go `oidcProfileName` reprend maintenant l'ordre historique et ignore les champs vides ou qui ne sont pas des chaînes. Le callback et la recherche du compte Jellyfin utilisent la même sélection. Par exemple, `name=Maël Moreau` et `preferred_username=mmoreau` recherchent le compte Jellyfin `Maël Moreau`.

Les identifiants explicitement fournis dans `jellyfin_server_id` et `jellyfin_user_id` continuent de déterminer le compte vérifié ; le changement de nom ne les remplace pas. La réconciliation automatique refuse plusieurs comptes actifs de même nom sur un serveur, au lieu de prendre le premier.

Tests locaux : priorité et repli des champs, espaces, valeurs invalides, deux comptes distincts `mmoreau` et `Maël Moreau`, refus d'un homonyme, maintien de la liaison explicite. Tests des paquets auth et API réussis. Les tests utilisent un serveur Jellyfin simulé et ne constituent pas une validation auprès de l'Authentik de production.

Les sessions déjà ouvertes conservent leur liaison. Après déploiement, se déconnecter puis se reconnecter par SSO pour appliquer la nouvelle sélection. Aucun historique existant ni ancien utilisateur synthétique n'est supprimé par cette correction.
