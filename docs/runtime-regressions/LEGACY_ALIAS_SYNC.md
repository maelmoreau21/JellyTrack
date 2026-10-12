# Synchronisation avec alias historique — 12 octobre 2026

Le contrôle de la tâche de réparation avait été adapté aux alias historiques, mais `jellyfin.SyncOne` conservait un refus indépendant. Le cas NAS signalé était donc toujours bloqué : identifiant interne `edd627c3-76f2-402b-b03c-d2e31e574198`, alias enregistré `srv:jellyfin_8096`, identifiant système renvoyé `1866d4f56378459384d54b130423a9e8`.

La réparation et la synchronisation partagent maintenant la reconnaissance des alias `srv:` et `master`. La synchronisation accepte un alias existant uniquement à l'URL enregistrée du serveur et après lecture de SystemInfo. Elle refuse l'identité système si un autre serveur configuré la porte déjà, y compris sous une autre forme UUID. Elle conserve l'alias, utilisé par les clés plugin, et l'identifiant interne auquel sont liés les utilisateurs, médias et historiques. Un véritable identifiant différent continue d'être refusé lorsqu'il existe des données.

Le délai d'écriture de la route manuelle de synchronisation est également aligné sur sa limite de traitement de 30 minutes, comme la tâche de réparation. Les délais des autres routes ne changent pas ; les éventuels délais d'un proxy externe restent hors de cette validation locale.

Tests SQLite avec les identifiants exacts du signalement : synchronisation récente puis complète, mise à jour du média existant, utilisateur et historique conservés, alias intact, une seule ligne par table. Les changements d'URL et les conflits avec un autre serveur restent refusés sans mutation. Les tests existants de changement d'identité réelle et de normalisation UUID restent applicables. La base et l'image du NAS n'ont pas été modifiées pendant cette intervention.
