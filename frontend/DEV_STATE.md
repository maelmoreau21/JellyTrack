# État frontend — 14 octobre 2026

## Livraison

Travail local sur develop, sans commit, push, merge ou déploiement utilisateur.
Le frontend livré par Go est désormais le build SvelteKit dans web/svelte.
Les Dockerfiles standard, distroless et scratch compilent le frontend avant Go.
Node/npm sont absents du runtime. web/dist demeure une référence de QA et n'est
plus embarqué ni utilisé pour servir l'application.

## Architecture et portée exacte

Toutes les routes passent par le frontend SvelteKit et ses modules compilés.
La préparation ne copie plus ni ne réécrit les scripts de web/dist.
Le document et les assets publics sont possédés par frontend, le démarrage et le
chargement différé sont des imports de modules. Le navigateur utilise la
navigation SvelteKit avec les contrôleurs de pages historiques conservés.
`afterNavigate` déclenche les changements de vue ; l'ancien listener popstate
est supprimé. Filtres de profils/historique et onglets admin préservent également
l'état de navigation SvelteKit ; leurs parcours de filtrage/retour sont testés.

Composants Svelte : structure, sidebar, connexion, À propos, cadre/KPI/santé/
matériel/flux du dashboard, sauvegardes, comptes, utilisateurs et paramètres
Jellyfin/Médias/Sécurité. `Settings.svelte` est chargé à la demande, avec formulaires
et événements Svelte natifs. Ses trois anciens générateurs HTML sont supprimés.
Ces trois pages sont volontairement redessinées à la demande de l'utilisateur.
Les contrôleurs
JavaScript des graphiques, analyses, profils, historique, médias, Wrapped,
autres paramètres et administration restent repris dans src/lib/pages et le module
application.js. Ce n'est pas une réécriture de chaque template en Svelte natif.
La conservation de ces contrôleurs préserve les fonctions et données existantes.

Le backend n'est modifié pour cette intégration qu'au niveau du frontend embarqué,
du service des modules /_app et de leur compression. Les corrections sauvegarde
et DISTINCT des filtres du profil du lot précédent sont conservées.

## Preuves

- Svelte Check sans erreur ni avertissement ; build source autonome réussi.
- Utilisateurs : recherche, filtres, pagination, export JSON, suppression (erreur
  puis succès), purge et démontage réussis. 8 captures incluant les modales,
  zéro pixel différent sur mobile/desktop, clair/sombre.
- Sauvegardes : 8 scénarios et captures identiques ; comptes : 16 scénarios et
  captures identiques ; dashboard : 8 scénarios, 36 captures identiques.
- Navigation sidebar, précédent/suivant, contrats de connexion et API réussis.
- Intégration : 34 routes desktop ; 31 comparées à web/dist, mêmes textes, liens,
  dimensions des canvases et sections, sans erreur JavaScript. Les réponses
  viennent d'un serveur Go/SQLite jetable puis sont rejouées pour la comparaison.
  Date, animation des graphiques, origine affichée et chronologie du compteur
  live sont stabilisées uniquement dans cette fixture.
- Les trois paramètres redessinés sont capturés séparément sur 390/1440 px,
  en clair/sombre. `test:settings` vérifie CRUD serveur, clés plugin/CSRF,
  exclusions par serveur, conservation des seuils non enregistrés, presets,
  sessions, erreurs et navigation retour. Ce test est aussi ajouté à la CI.
- Les bibliothèques Jellyfin sont revérifiées une fois par requête personnelle,
  sans le cache de catalogue de 10 secondes : historique, exports, compteurs,
  profils, filtres, activité récente et télémétrie. Les titres des parents sont
  également filtrés. Tests de révocation, refus fournisseur et administrateur
  sur SQLite et PostgreSQL jetables ; aucune preuve sur le Jellyfin utilisateur.
- Le test Go vérifie le manifeste, chaque module livré, la CSP du bootstrap,
  la compression, les variantes ETag et les 404 des modules inexistants.
- Docker : image standard construite avec une variante QA utilisant le cache
  Go local vérifié, car storage.googleapis.com échoue en DNS. Le frontend est
  compilé normalement dans l'étape Node/alpine. Aucun changement de dépendances.
  Le conteneur jetable utilise un rootfs en lecture seule, l'UID 1000, aucune
  capability et uniquement des tmpfs pour les données. Aucun runtime Node.
- Les cinq parcours navigateur de l'image finale (dashboard, utilisateurs,
  profil local, sauvegardes, À propos) passent avec la vraie authentification Go,
  les modules SvelteKit chargés et la navigation précédent/suivant.
- Suite Go complète, vet et build réussis après intégration. 20 contrôles
  navigateur avec le vrai serveur Go et deux mocks Jellyfin réussis : comptes
  associés, Wrapped privé, refus d'accès, SSE authentifié, export/import chiffré
  et révocation des sessions après restauration. La CI est mise à jour, sans
  exécution GitHub distante dans cette session.

## Limites

Pas de publication GitHub, de remplacement de conteneur utilisateur ni de preuve
sur son instance Jellyfin/SSO. Les contrôleurs impératifs conservés ne sont pas
des pages Svelte natives. La parité intégrale pixel par pixel reste une affirmation
plus forte que les preuves disponibles ; de petites variations de capture
subsistent sur certaines zones malgré des textes/styles/dimensions identiques.
La construction Docker sans cache externe reste dépendante du DNS local.

## Reproduction

Voir README.md pour compilation, commandes QA et emplacement des preuves.
Toujours attendre la fin du build frontend avant de lancer la compilation Go,
car le répertoire embarqué est régénéré. Ne pas modifier web/svelte à la main.
