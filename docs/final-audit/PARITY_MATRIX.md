# Matrice finale de parité

États limités aux preuves décrites : fidèle source/contrôle ciblé ne certifie pas tous les pixels ni toutes les branches. Non testé inclut critères sans objet, faute de catégorie N/A autorisée. Les compléments Go sont comptés séparément.

F = Identique ou fidèle · J = Différence justifiée · C = Différence à corriger · M = Fonctionnalité manquante · N = Non testé.

| Route | Présence | Position navigation | Menu parent | Apparence | Sections | Ordre | Textes | Icônes | Tableaux | Graphiques | Filtres | Boutons | Interactions | Données | Permissions | Responsive |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/about` | F | F | F | J | F | F | J | J | N | N | F | F | F | N | F | F |
| `/admin/cleanup` | F | F | F | C | F | F | C | C | C | N | F | F | F | F | F | F |
| `/admin/health` | F | F | F | C | F | F | C | C | N | N | F | F | F | N | F | F |
| `/admin/log-health` | F | F | F | J | J | J | J | J | N | N | F | F | F | N | F | F |
| `/admin/plugin-health` | F | F | F | J | J | J | J | J | N | N | F | F | F | N | F | F |
| `/admin/server-compare` | F | F | F | C | F | F | C | C | C | N | F | F | F | N | F | F |
| `/login` | F | F | F | J | J | F | J | C | N | N | F | F | F | N | J | N |
| `/logs` | F | F | F | C | F | F | C | C | C | N | F | F | F | N | F | F |
| `/media/[id]` | F | F | F | C | F | F | C | C | F | N | F | F | F | F | F | F |
| `/media/all` | F | F | F | C | F | F | C | C | N | N | F | F | F | N | F | F |
| `/media/analysis` | F | F | F | C | F | F | C | C | N | N | F | F | F | N | F | F |
| `/media/artist/[name]` | F | F | F | J | F | F | J | J | N | N | F | F | F | N | F | F |
| `/media/collections` | F | F | F | C | C | C | C | C | N | N | F | F | F | N | F | F |
| `/media` | F | F | F | J | J | J | J | J | N | N | F | F | F | N | F | F |
| `/media/popular` | F | F | F | C | F | F | C | C | N | N | F | F | F | F | F | F |
| `/newsletter` | F | C | C | C | F | F | C | C | N | N | F | F | F | F | C | F |
| `/` | F | F | F | C | F | F | C | C | N | N | F | F | F | N | F | F |
| `/recent` | F | F | F | C | F | F | C | C | N | N | F | F | F | N | F | F |
| `/settings/analytics` | F | F | F | J | J | J | J | J | N | N | F | F | F | N | F | F |
| `/settings/dataBackups` | F | F | F | J | F | F | J | J | F | N | F | F | F | N | F | F |
| `/settings/jellyfin` | F | F | F | C | F | F | C | C | N | N | F | F | F | N | F | F |
| `/settings/media` | F | F | F | J | F | F | J | J | N | N | F | F | F | N | F | F |
| `/settings/network` | F | F | F | J | J | J | J | J | N | N | F | F | F | N | F | F |
| `/settings/notifications` | F | F | F | F | F | F | F | F | N | N | F | F | F | N | F | F |
| `/settings/overview` | F | F | F | J | J | J | J | J | N | N | F | F | F | N | F | F |
| `/settings` | F | F | F | J | J | J | J | J | N | N | F | F | F | N | F | F |
| `/settings/plugin` | F | F | F | C | F | F | C | C | N | N | F | F | F | N | F | F |
| `/settings/plugin/security` | F | F | F | F | F | F | F | F | N | N | F | F | F | N | F | F |
| `/settings/scheduler` | F | F | F | F | F | F | F | F | N | N | F | F | F | N | F | F |
| `/settings/scheduler/schedules` | F | F | F | F | F | F | F | F | N | N | F | F | F | N | F | F |
| `/settings/scheduler/tasks` | F | F | F | F | F | F | F | F | N | N | F | F | F | N | F | F |
| `/settings/sso` | F | F | F | J | F | F | J | J | N | N | F | F | F | N | F | F |
| `/setup` | F | F | F | J | J | J | J | J | N | N | F | F | F | N | F | F |
| `/users/[id]` | F | F | F | C | C | C | C | C | F | N | F | F | F | N | F | F |
| `/users` | F | F | F | C | F | F | C | C | F | N | F | F | F | N | F | C |
| `/wrapped/[userId]` | F | F | F | C | F | F | C | C | N | N | F | F | F | N | F | F |
| `/settings/go-overview` | J | J | J | N | N | N | N | N | N | N | N | N | N | N | F | F |
| `/settings/go-network` | J | J | J | N | N | N | N | N | N | N | N | N | N | N | F | F |
| `/admin/system-health` | J | J | J | N | N | N | N | N | N | N | N | N | N | N | F | F |
| `/admin/log-diagnostics` | J | J | J | N | N | N | N | N | N | N | N | N | N | N | F | F |
| `/admin/plugin-diagnostics` | J | J | J | N | N | N | N | N | N | N | N | N | N | N | F | F |
| `/admin/maintenance` | J | J | J | N | N | N | N | N | N | N | N | N | N | N | F | F |
| `/wrapped` | J | J | J | N | N | N | N | N | N | N | N | N | N | N | N | F |
| `/dashboard` | J | J | J | N | N | N | N | N | N | N | N | N | N | N | N | F |
| `/setup/go` | J | J | J | N | J | N | N | N | N | N | N | J | F | N | N | F |

## Preuves et réserves par route

- `/about` — Hiérarchie, 11 fonctionnalités et ordre restaurés. Six cartes technologiques adaptées à Go ; version réelle, compléments préservés.
- `/admin/cleanup` — Onglets étendus ; compte110 doublons comparable. Empty-state/table vide et styles diffèrent. Suppression réelle Jellyfin non testée.
- `/admin/health` — Onglets étendus, diagnostics/actions validés sur SQLite. Quelques couleurs/contrôles restent différentes ; statistiques production non testées.
- `/admin/log-health` — Redirection vers /admin/health. Onglets étendus, diagnostics/actions validés sur SQLite. Quelques couleurs/contrôles restent différentes ; statistiques production non testées.
- `/admin/plugin-health` — Redirection vers /admin/health. Onglets étendus, diagnostics/actions validés sur SQLite. Quelques couleurs/contrôles restent différentes ; statistiques production non testées.
- `/admin/server-compare` — Scope et données API testés. Espacements, hauteur KPI et badges restent différents ; inventaire Go additionnel préservé.
- `/login` — Remember 30 jours, callback sûr et langue initiale restaurés. Admin local et sessions Go ajoutés. Jellyfin/OIDC vivants non testés.
- `/logs` — Responsive, noms de dialogues et export historique corrigés ; disposition fine des filtres/tableau et iconographie restent différentes.
- `/media/[id]` — Cinq types concrets capturés ; épisode paysage, KPI/icônes/temps corrigés. Fallback poster et métadonnées supplémentaires diffèrent ; actions distantes simulées.
- `/media/all` — Catalogue et filtres fonctionnels ; ligne de tri supplémentaire, espacement/grille et fallback restent différents.
- `/media/analysis` — Trois sous-cartes, résolutions et suggestions historiques corrigées ; champs mesurés Go conservés. Graphiques bas de page non tous comparés visuellement.
- `/media/artist/[name]` — Portrait carré, titre30 et résumé restaurés. Traduction FR conservée ; images et genres incomplets selon métadonnées, état vide testé.
- `/media/collections` — Types/KPI/comptage corrigés. Go garde 8 cartes par serveur contre 4 bibliothèques normalisées historiques : regroupement/ghost names non restaurés.
- `/media` — Redirection vers /media/all. Catalogue et filtres fonctionnels ; ligne de tri supplémentaire, espacement/grille et fallback restent différents.
- `/media/popular` — Pistes top5, metadata Series même serveur, titres/traductions, badges et cartes corrigés. Portraits Jellyfin réels non testés.
- `/newsletter` — Podium/plage/zapping Discord restaurés. Hauteur/fallback visuels restent différents ; lecture standard historique interdite par permissions Go conservées.
- `/` — Filtres et KPI corrigés ; écarts mineurs d’espacement/densité restent. Cache/adaptateur historique limitent la comparaison des flux et données.
- `/recent` — Parents, tri, pagination et navigation testés. Différences de densité, couleurs et icônes à finir.
- `/settings/analytics` — Redirection vers /media/analysis. Trois sous-cartes, résolutions et suggestions historiques corrigées ; champs mesurés Go conservés. Graphiques bas de page non tous comparés visuellement.
- `/settings/dataBackups` — Nesting, tailles KPI, import violet et alignements restaurés. Export ZIP/integrité testés ; restauration de base production non testée.
- `/settings/jellyfin` — Structure, onglets et formulaires contrôlés. Adaptateur référence settings a 1 serveur contre 2 Go : parité des données non démontrée.
- `/settings/media` — Grille historique2x2 rétablie, clés bibliothèque par serveur préservées. Normalisation historique des collections reste ouverte.
- `/settings/network` — Redirection vers /settings/jellyfin. Structure, onglets et formulaires contrôlés. Adaptateur référence settings a 1 serveur contre 2 Go : parité des données non démontrée.
- `/settings/notifications` — Position carte et save gauche restaurés ; alertes plugin ALL/TRANSCODE/NEW_IP et capacité testées via transport en mémoire.
- `/settings/overview` — Redirection vers /settings/jellyfin. Structure, onglets et formulaires contrôlés. Adaptateur référence settings a 1 serveur contre 2 Go : parité des données non démontrée.
- `/settings` — Redirection vers /settings/jellyfin. Structure, onglets et formulaires contrôlés. Adaptateur référence settings a 1 serveur contre 2 Go : parité des données non démontrée.
- `/settings/plugin` — Route historique autonome réutilisant JellyfinServersSettings, sans redirection. Go réutilise le rendu Jellyfin avec le même chemin ; données Settings non comparables.
- `/settings/plugin/security` — Position h1 et grille4 colonnes corrigées. Sécurité Go préservée ; fournisseur externe non testé.
- `/settings/scheduler` — Icônes/pillules/couleurs/hauteurs restaurées ; actions et paramètres testés. Exécution longue avec Jellyfin réel non testée.
- `/settings/scheduler/schedules` — Save gauche et largeur restaurés ; réglages intervalles/rétention testés et vérification atomicité.
- `/settings/scheduler/tasks` — Même module tâches restauré ; boutons réellement reliés aux endpoints ; effets Jellyfin réel non testés.
- `/settings/sso` — Positions badges/Actualiser/switches corrigées et formulaires testés. Callback Go/PKCE justifiés ; fournisseur réel non testé.
- `/setup` — Redirection vers /. Filtres et KPI corrigés ; écarts mineurs d’espacement/densité restent. Cache/adaptateur historique limitent la comparaison des flux et données.
- `/users/[id]` — Profil/historique/filtres/export/modales testés ; cinq graphiques Go. Totalité des sept SVG historiques et données des flux non prouvées comparables.
- `/users` — Liste/actions/pagination/chargement contrôlés ; état desktop proche. Retours à la ligne des filtres mobile restent différents.
- `/wrapped/[userId]` — 18 slides conditionnelles confirmées ; anciens16 non reproductibles. Intro, fonds, carte partage/heure/catégories restaurés ; copie Go conservée.
- `/settings/go-overview` — Complément Go conservé ; sans équivalent main. legacy Pages.settings(overview). Couverture visuelle complète de ce complément non réalisée.
- `/settings/go-network` — Complément Go conservé ; sans équivalent main. legacy Pages.settings(network). Couverture visuelle complète de ce complément non réalisée.
- `/admin/system-health` — Complément Go conservé ; sans équivalent main. legacy Pages.health(system). Couverture visuelle complète de ce complément non réalisée.
- `/admin/log-diagnostics` — Complément Go conservé ; sans équivalent main. legacy Pages.health(logs). Couverture visuelle complète de ce complément non réalisée.
- `/admin/plugin-diagnostics` — Complément Go conservé ; sans équivalent main. plugin-health renderer. Couverture visuelle complète de ce complément non réalisée.
- `/admin/maintenance` — Complément Go conservé ; sans équivalent main. legacy Pages.cleanup(). Couverture visuelle complète de ce complément non réalisée.
- `/wrapped` — Complément Go conservé ; sans équivalent main. /wrapped/{current user id}. Couverture visuelle complète de ce complément non réalisée.
- `/dashboard` — Complément Go conservé ; sans équivalent main. Admin: Pages.dashboard() via fallback; standard: profil. Couverture visuelle complète de ce complément non réalisée.
- `/setup/go` — Complément Go conservé ; sans équivalent main. Pages.setup(). Couverture visuelle complète de ce complément non réalisée.
