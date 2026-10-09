# Paramètres — restauration de l'interface Go

Référence : `main` en lecture seule, détails dans `SETTINGS_REFERENCE.md`. Les contrôles utilisent les routes Go existantes. L'analyse et les modifications backend nécessaires sont intégrées par l'agent principal ; ce document décrit le module d'interface `web/dist/assets/settings.js` et sa feuille de style.

## Structure conservée

| main | Interface Go |
|---|---|
| Jellyfin / plugin, même composant | `/settings/jellyfin`, `/settings/plugin`, cartes par serveur, formulaire Modifier, ajout secondaire en mode multi, sous-bloc connexion plugin |
| SSO | `/settings/sso`, état et résumés, callback copiable, configuration, groupes et rôles imbriqués, verrouillage des champs `.env` |
| Sécurité | `/settings/plugin/security`, état plugin, profils et sept valeurs de télémétrie, quatre commutateurs, seuils Smart |
| Médias | `/settings/media`, note de synchronisation, diagnostics des serveurs, exclusions par serveur, règles anciennes conservées, badges, six règles de complétion, quatre résolutions |
| Planificateur | `/settings/scheduler`, tâches puis plannings puis Wrapped, sans sous-onglets inventés ; routes `/tasks` et `/schedules` indépendantes |
| Sauvegardes de Données | `/settings/dataBackups`, actions, résumés, historique, import imbriqué dans la grande carte |
| Notifications | `/settings/notifications`, activation Discord puis champs conditionnels, sauvegarde |

Les sept onglets historiques proviennent du module partagé `JellyTrackNavigation`. Aucun titre générique supplémentaire n'est ajouté. Les textes historiques proviennent des catalogues existants et leur fallback. Les réglages Go supplémentaires restent dans des groupes secondaires repliables : langue et format horaire, liens vers les vues générale et réseau, politique des sessions longues et suppression confirmée des serveurs secondaires (le principal est protégé dans l'interface). Analytics mène à `/media/analysis`. Les alias historiques `/settings/overview` et `/settings/network` redirigent vers Jellyfin ; les vues supplémentaires Go sont conservées sous `/settings/go-overview` et `/settings/go-network`.

## Données, protections et sauvegardes

- Chaque sauvegarde de réglages attend une réponse HTTP réussie, rejette `success:false`, relit la configuration réelle et compare les valeurs attendues avant d'afficher un succès. Les secrets SSO sont confirmés uniquement par leur présence et restent masqués.
- Modifier un serveur laisse sa clé API vide pour la conserver. Copier une clé plugin appelle le contrat `regenerate:false` ; seul le contrôle explicite de renouvellement utilise `true`. Le module ne touche jamais directement à la clé globale.
- Les champs SSO pilotés par l'environnement sont verrouillés et omis du payload. Un secret masqué utilise `keepExistingSecret:true`; une saisie explicite remplace le secret. Les groupes, auto-redirection et l'accès local sont présents.
- Les exclusions utilisent `srvlib|<serverId>|<bibliothèque encodée>`. Les exclusions globales correspondent à tous les serveurs portant la bibliothèque ; les règles globales non résolues et les scopes orphelins restent enregistrés jusqu'à retrait explicite.
- Médias conserve les propriétés non affichées du blob `resolutionThresholds`, les règles additionnelles des bibliothèques et les propriétés des résolutions. Le contrat source réel utilise `4K`, `maxW`, `maxH` (les noms visibles maxWidth/maxHeight sont les clés de traduction).
- Les sept réglages de télémétrie et les quatre événements ont leurs contrôles. Le preset historique du composant conserve `mergeWindowSeconds:300` ; il peut différer du défaut de normalisation backend.
- Les cinq tâches possèdent chacune leurs boutons, chargements et retours. Les sauvegardes des plannings et du Wrapped restent indépendantes. Le module ne prétend pas que la relecture des plannings prouve leur consommation à l'exécution.
- Sauvegardes : création, export, téléchargement, liste réelle, restauration/suppression confirmées, import ZIP binaire avec contrôle local de l'extension et de la limite de 100 Mio. L'annulation n'envoie pas la mutation et n'affiche pas de succès fictif.
- Les événements sont liés au signal de la page. Les retours asynchrones n'écrasent pas la page après navigation. Les temporisations de copie et de rechargement sont nettoyées.

## Contrôles et limites

`node --check web/dist/assets/settings.js` passe. Les tests navigateur et API sur données jetables, les captures FR/EN, clair/sombre et mobiles sont réalisés par `settings_admin_qa` ; preuves dans `docs/settings-admin-validation/` et captures dans `docs/settings-admin-captures/`. Aucune restauration, importation, suppression, consolidation ou opération de nettoyage n'a été exécutée par ce sous-agent sur les données utilisateur.

La fidélité concerne la hiérarchie, les paramètres, les contrôles et leur comportement. Les composants sont reconstruits en JavaScript/CSS dans l'application Go, avec le système de thème partagé ; l'identité pixel à pixel avec React n'est pas présumée. Un réglage dont la lecture ou la sauvegarde échoue reste un écart, même si son formulaire est présent.
