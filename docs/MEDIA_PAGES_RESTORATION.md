# Parité Médias, Historiques et Dashboard

Travail livré sur `codex/frontend-recovery`. Référence historique exclusivement `main`, commit `a59a28613e63e86106c61827167d355b47147f42`. Les corrections antérieures présentes au démarrage ont été préservées dans le commit `0c658f0`, avant cette restauration.

Le produit reste en Go avec son frontend JavaScript/CSS et Chart.js existant. L'archive Next utilisée uniquement pour comparer main est ignorée sous `scratch/` ; aucun Next, React, TypeScript ou Prisma n'est réintroduit dans le produit. Aucune modification du conteneur actif ni des données de l'utilisateur.

## Inventaires et matrice de résultat

Chaque page a été retrouvée dans main et inventoriée section par section, avec ordre, cartes, contrôles, graphiques et interactions : [médias](MEDIA_REFERENCE.md), [Dashboard/Analytics/Network/Newsletter/Wrapped](ANALYTICS_REFERENCE.md), [historique/système/sessions/live](LOGS_REFERENCE.md). Ces inventaires décrivent les écarts avant correction. Leurs résultats sont détaillés dans [MEDIA_IMPLEMENTATION.md](MEDIA_IMPLEMENTATION.md), [ANALYTICS_IMPLEMENTATION.md](ANALYTICS_IMPLEMENTATION.md) et [LOGS_IMPLEMENTATION.md](LOGS_IMPLEMENTATION.md).

« Restauré » ci-dessous signifie organisation et interactions raccordées aux données Go et vérifiées dans le périmètre indiqué. Cela ne signifie pas une identité de pixels, de bibliothèques de graphiques ou de données externes indisponibles.

| Page | Ordre final des sections historiques | Contrôles restaurés / données et preuves | Résultat et limites |
|---|---|---|---|
| Dashboard principal D01–D19 | Titre+catégories, serveurs dessous, période droite → santé → aujourd'hui → onglets → ordre → métriques5 → catégories4 → volume3:1/catégorie → bibliothèques → heatmap annuelle → fans/plateformes → live → heure/jour → mensuel2:1:1/complétion/familles → charge → tendances/prédictions | Sélecteur24h/7j/30j/tout/personnalisé ; multi-catégories/multi-serveurs persistés ; exclusions ; dix blocs réordonnables ; liens et graphiques réels ; libellés historiques ; cache conditionnel ; utilisateurs actifs0 conserve0 | Restauré. Ressources du processus conservées après les sections historiques : RAM Go mesurée ne devient pas une fausse RAM système. Prévisions EMA Go conservées |
| Analytics A01–A17 | DeepInsights avant Granular : films/séries, albums/livres, genres/clients, méthodes/résolutions/appareils, audio/sous-titres ; puis six rangées quotidiennes, bibliothèques, horaires, affluence/complétion, abandon/titres, langues | Barres/courbes/donuts et drilldowns date/bibliothèque/heure/appareil/langue/complétion ; mêmes périodes, exclusions et serveurs ; API granulaires/deep réelles | Restauré. Figures supplémentaires Go après les sections historiques ; durées inconnues omises des complétions |
| Network N01–N05 | Quatre KPI → méthodes horaires et clients → tableau des médias transcodés | Client≥2sessions, tri taux transcode top8 ; causes indépendantes cumulées ; durées ; serveurs/période ; géographie Go séparée et erreur isolée | Restauré. Géographie externe non vérifiée en production |
| Ajouts récents | Titre et total à droite → serveurs → grille → pagination 40 | Parents historiques, vrai Nouveau<7j, date/vues, types/ratios, survol, responsive2/3/4/5/6, liens détail | Restauré ; images distantes limitées par les services disponibles |
| Catalogue multimédia | Navigation → titre/serveurs → catégories+recherche → tri → grille → pagination 50 | Exclusions multi-types ; recherche claire/debounce ; titre/artiste/personnes ; filtres genre/résolution ; lectures/temps/qualité ; statistiques descendants et badges | Restauré ; contenus et tris supplémentaires Go conservés |
| Top contenus (page associée) | Films/séries/musique → réalisateurs/acteurs/studios | Six classements réels, vues/heures, liens catalogue filtrés, vide distinct par carte | Restauré ; même scope serveur et utilisateur dans les agrégats |
| Collections | KPI volume/contenu/temps → titre+compteur+recherche → cartes par nom | Nombre de parents ; taille/durée ; leader/dernier ajout avec image et lien ; noms traduits et bruts ; enfants supplémentaires accessibles | Restauré ; aucun champ absent simulé |
| Analyses des médias | Contenu/qualité/bibliothèques → genres → binge → acquisitions/tendances → aperçu approfondi | Distributions catalogue, liens qualité/genre, vrais marathons, modale personnes ; protection administrateur | Restauré avec différence volontaire : scores arbitraires et suggestion sans données omis |
| Détails films | Fil d'Ariane/navigation → hero → distribution/versions → KPI → télémétrie → comportements → spectateurs/langues → complétion → timelines → historique | Rotation, liens personnes, graphiques, filtrage sessions/utilisateurs, repères groupés cliquables, session/modal ; histogramme dix tranches sur sessions réelles | Restauré ; métadonnées Jellyfin réelles conditionnelles, tests HTTP locaux |
| Détails séries/saisons/épisodes | Même ordre, enfants avant KPI ; hiérarchie complète | Parent interne ou Jellyfin, agrégation descendants, navigation série/saison/épisode, tableau enfants et historique responsive | Restauré ; code épisode/versions seulement si réellement disponibles |
| Artistes | Fil d'Ariane → hero → quatre KPI → albums → pistes paginées | Images album disponibles, statistiques pistes dédupliquées, albums/liens, choix25/50, pagination bornée | Restauré ; portrait artiste dépend des métadonnées présentes |
| Acteurs/réalisateurs/studios | Distribution dans détails ; seconde rangée Top contenus ; aperçu des analyses | Portrait/rôle si connus ; recherche Unicode ; modale chargement/résultats/voir tout ; liens détail et catalogue | Restauré : main n'a pas de page acteur autonome à recréer |
| Historique des lectures H01–H49 | En-tête+onglets → alertes → recherche/colonnes/sauvegardes → serveurs → toolbar → filtres avancés/types/presets → tableau16colonnes → pagination 50 | Tri, dates, clients, langues, types multiples, résolution, exports CSV/JSON toutes pages filtrées, colonnes/largeurs persistées, chronologie inline ; compteurs et données réels | Restauré ; historique personnel Go et filtres heure/méthode supplémentaires conservés |
| Journaux système S01–S13 | En-tête/onglet → cartes nombre/taille/rétention → lien paramètres → recherche/actualiser → tableau fichiers → audit SQL Go | Lignes/taille réelles, téléchargement texte, supprimer/vider avec confirmation et erreurs ; actif protégé/tronqué ; pagination audit indépendante | Restauré. Permissions admin ; actions testées sur fichiers isolés |
| Sessions et modales M01–M10 | Utilisateur/média/sous-titre → compteurs → piste et repères → événements groupés → détails/liens | Groupement1500ms, couleurs/types, vraies métadonnées ; focus, Tab, Escape, backdrop et retour du focus ; fermeture/nettoyage au changement de route | Restauré ; numéros et métadonnées non enregistrés restent absents |
| Flux en direct L01–L14 | Dans le bloc live historique : count/bande passante → bascule cartes/timeline → posters/progression/méthode → message/stop | Poll4s suspendu onglet masqué, progression0 correcte, pause réelle, bande passante mesurée, sélection serveur+session, timeout message, confirmation et erreurs distantes | Restauré. Arrêt local seulement après succès distant ; pas d'appel au Jellyfin de l'utilisateur |
| Newsletter NL01–NL09 | Navigation médias → hero Rewind+dates → heures gauche/lectures droite → podium3 → leader violet → actions dessous | PNG1080×1350 natif avec vraies valeurs ; confirmation/état Discord ; résultats et autres tops Go séparés | Restauré ; envoi réel Discord non exécuté |
| Wrapped W01–W20 | Intro → temps/jours → mois → pic/appareil → genres/jour → panthéon → séries/pistes/artistes/albums conditionnels → catégories conditionnelles → partage | Année/type URL et configuration ; mois en heures ; progression/auto8s, pause configuration et onglet masqué ; clavier/boutons ; fermeture vers profil ; permissions propre/admin/période | Restauré ; copie du résumé Go conservée ; disponibilité actuelle reste liée aux réglages réels |

## Sémantique des données

- Dashboard et DeepInsights conservent l'exclusion des lectures terminées<60s, avec maintien des téléchargements et sessions encore actives. Granular et Network incluent les sessions courtes comme leurs implémentations historiques. Les liens vers l'historique transportent cette différence ; un filtre ne change plus silencieusement la population du graphique.
- La complétion Dashboard/Granular est cumulée par **utilisateur × serveur × média** : la période sélectionne les clés, les lectures antérieures contribuent à la progression. Seuils historiques par défaut : vidéo80/20/10%, musique60/30/12%. Les durées inconnues sont omises, sans pourcentage50% fabriqué. Le SQL des drilldowns utilise ces mêmes règles ; des tests vérifient l'égalité avec les segments calculés.
- Les histogrammes des pages détail restent par session, conformément à main. Les langues sont normalisées, les codecs et états OFF/UNKNOWN/None conservés, les épisodes rattachés à leur série et les pistes à leur album, sur le même serveur.
- Les durées sont additionnées avant arrondi. Les graphiques horaires dits « moyenne » dans main utilisent ses sommes horaires historiques. Les causes de transcodage peuvent être multiples pour une même lecture.
- Les totaux catalogue, durées des fichiers, heures consommées et nombres de lectures restent distincts. Aucun graphique n'est rempli par des exemples ni par des valeurs de secours fabriquées.

## Validation et écarts vérifiables

[MEDIA_PAGES_QA.md](MEDIA_PAGES_QA.md) décrit les commandes, les 165 contrôles navigateur, les tests Go, les captures des deux runtimes et les limites. Les JSON de résultats et captures sont livrés sous `docs/media-pages-validation/` et `docs/media-pages-captures/`.

Les captures sont issues d'une fixture synthétique isolée, jamais de données de production. Go utilise de vraies API et une vraie session. Main conserve ses composants originaux et utilise un adaptateur de données de test. Celui-ci ne reproduit pas les services Valkey/Jellyfin ni les requêtes SQL brutes Prisma : une capture peut prouver la structure sans prouver toutes les valeurs externes. Les graphiques Go sont vérifiés séparément contre la base et les tests de calculs.

Les styles natifs CSS/Chart.js préservent la structure et les positions, mais les moteurs SVG de main et Canvas de Go n'ont pas un rendu pixel identique. Certains libellés secondaires et erreurs hérités Go restent en français ; les principales sections et les nouveaux libellés sont vérifiés FR/EN, les autres langues gardent le fallback existant. PostgreSQL et services distants de l'utilisateur n'ont pas été lancés. Ces limites ne sont pas présentées comme une parité totale en production.

## Sous-agents réellement utilisés

| Agent | Travail réel et attribution |
|---|---|
| `media_reference` | Audit main/Go des récents, catalogue, collections, analyses, détails et personnes ; lecture seule |
| `analytics_reference` | Audit et restauration frontend Dashboard/Analytics/Network/Newsletter/Wrapped, puis calculs Go dans `internal/stats/` |
| `logs_reference` | Audit et implémentation historique/système/sessions ; fichiers history/logs et seules méthodes système attribuées |
| `implementation` | Module et API médias, tests familles/scopes/Unicode/métadonnées ; fichiers médias exclusifs |
| `visual_qa` | Fixture isolée, scripts navigateur et archive main, captures et premiers tests |
| Intégrateur | Routes/assets, commandes live, API Newsletter/Wrapped, modale commune, filtres/drilldowns, fin des calculs et QA, documents et commits |

Les audits ont été parallèles dans les limites des créneaux disponibles. Les fichiers partagés ont été transférés entre propriétaires avant modification. Les trois dernières passes d'agents se sont interrompues sur la limite d'utilisation ; l'intégrateur a repris et vérifié leurs résultats avant livraison.

Skill `codex-token-saver` appliqué : recherche par symboles, réutilisation des inventaires, attributions exclusives, résultats regroupés et attente des processus existants. Les sources nécessaires et les vérifications n'ont pas été retirées. Aucune économie chiffrée de tokens n'a été mesurée.

## Commits locaux

- `0c658f06e6e3894c9f8faf35eecf93b9e8c70e54` : préservation des corrections paramètres et administration présentes au démarrage.
- `79f69db8c49c33726afc96c0a1866a2b7f89808b` : restauration des pages, interactions et calculs Go.
- Le commit documentaire suivant contient cette matrice, les inventaires, les scripts reproductibles, les résultats finaux et les captures. Aucun déploiement ni push n'a été effectué.
