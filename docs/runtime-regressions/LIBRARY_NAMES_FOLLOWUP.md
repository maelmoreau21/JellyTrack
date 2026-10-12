# Bibliothèques et albums — 12 octobre 2026

Signalement réel : `Server.id = edd627c3-76f2-402b-b03c-d2e31e574198`, identifiant enregistré `srv:jellyfin_8096`, identifiant renvoyé par Jellyfin `1866d4f56378459384d54b130423a9e8`. L'utilisateur confirme conserver la même installation Jellyfin et sa configuration.

L'ancien main (`src/lib/serverRegistry.ts`) et le gestionnaire plugin Go produisent des alias `srv:` à partir de l'adresse quand l'identifiant système n'est pas fourni. Le contrôle de la tâche de réparation reconnaissait les marqueurs d'import mais oubliait ces alias historiques. Les alias `srv:` et `master` sont désormais reconnus, avec correspondance d'au moins un média, refus d'une identité déjà attribuée à un autre serveur et sauvegarde préalable aux corrections. Ils restent enregistrés : les clés plugin attachées à l'alias doivent continuer de fonctionner. Un UUID véritablement différent reste refusé. Les autres identifiants provisoires conservent leur réconciliation transactionnelle existante.

La tâche reste manuelle, accessible dans Paramètres → Planificateur → Tâches. Après déploiement, lancer « Réparer les bibliothèques importées » pour corriger les noms stockés grâce à l'appartenance réelle des médias dans Jellyfin. Cette intervention n'a pas accédé à la base du serveur utilisateur.

Les graphiques de lectures et de complétion utilisent maintenant le nom de bibliothèque, avec héritage par parent/grand-parent dans le même serveur lorsque le nom manque. Le calcul de complétion utilisait à tort `collectionType` avant `libraryName`, puis normalisait le nom en catégorie anglaise. Les catégories restent utilisables pour les règles de complétion ; elles ne servent plus de noms affichés. Sans nom connu, la bibliothèque reste inconnue, sans inventer une affectation. Le clic sur la complétion filtre l'historique par le nom réel, avec le même héritage. Les noms techniques déjà stockés doivent être corrigés par la tâche, qui respecte les bibliothèques distinctes.

Titre français complet : « Taux de complétion moyen par bibliothèque ».

Ajoutés récemment : séries sans saisons/épisodes, albums sans pistes Audio/Track/MusicTrack. Les autres pages continuent d'afficher les pistes ; les livres audio ne sont pas masqués. Les compteurs de l'album agrègent toujours ses lectures de pistes. Les dates restent celles du parent ajouté ; aucune série ou album fictif n'est créé pour un parent absent.

Validation locale : tests de réparation des alias et de préservation de leur portée plugin ; tests des graphiques avec Films, Films enfants, Musiques, Séries et bibliothèque inconnue, dont parents sur deux serveurs ; moyennes de complétion vérifiées ; album seul avec son compteur de lectures, accès explicite aux pistes, livre audio conservé et historique filtré par nom hérité. Tests Go, analyse statique, compilation et syntaxe JavaScript. Les données et graphiques de production restent à relire après mise à jour et exécution de la tâche.
