# Médias : restauration livrée

Référence : `main` à `a59a28613e63e86106c61827167d355b47147f42`, inventaire complet dans [MEDIA_REFERENCE.md](MEDIA_REFERENCE.md). Ce document décrit le résultat final ; l'inventaire décrit l'état initial.

Le sous-agent réel `implementation` a écrit exclusivement `media-recovery.js`, `media-recovery.css`, `media_recovery.go` et ses tests. L'intégrateur a raccordé ces fichiers aux routes, aux assets embarqués et aux services SPA existants. Aucun framework supplémentaire n'est introduit dans le produit.

| Page / inventaire | Organisation et interactions finales | Données Go |
|---|---|---|
| Ajouts récents : 12 lignes | Titre et compteur à droite ; serveurs ; grille spécifique ; pagination 40 ; Nouveau animé si date réelle<7j ; ratios et survol historiques ; date/vues sous affiche | `/api/media?parents=true&sort=added&limit=40`, filtres et numéro de page conservés |
| Catalogue : 12 lignes | Navigation ; titre/serveurs ; catégories et recherche sur une rangée ; tri ; grille ; pagination 50. Exclusions multi-catégories, recherche400ms/2caractères/clear, qualité/genre/personnes, tri lectures/temps/qualité | Agrégats des descendants séries/albums ; résolution majoritaire, DirectPlay et bitrate calculés quand les mesures existent ; showLibraryMediaBadges respecté |
| Top contenus : 4 lignes | Films/séries/musique puis réalisateurs/acteurs/studios, deux rangées de 3 colonnes ; rang, vues, heures, liens filtrés et états vides | `/api/media/popular`, statistiques filtrées par serveur et identité autorisée |
| Collections : 8 lignes | Volume/contenu/temps ; titre avec compteur et recherche ; cartes alphabétiques ; counts parents ; contenu leader/dernier ajout ; enfants accessibles séparément | `/api/media/collections`, bibliothèque et serveur restent dans la clé ; taille/durée des vrais fichiers et statistiques des descendants |
| Analyses : 9 lignes | Contenu/qualité/bibliothèques ; genres ; binge ; acquisitions et tendances ; aperçu approfondi en dernier ; personnes cliquables et modale de recherche | `/api/media/analysis`, `/api/stats/deep` et `/api/media?q=…` ; accès administrateur conservé |
| Détails : inventaire commun + séries/vidéo | Fil d'Ariane ; navigation rapide ; hero ; distribution et éditions conditionnelles ; enfants ; KPI ; télémétrie ; comportements ; spectateurs/langues ; histogramme ; timeline positionnelle ; compteurs ; historique final | `/api/media/{id}`, familles récursives, vrais événements et agrégats complets. Les repères proches sont regroupés en boutons qui donnent accès à chaque événement |
| Artiste : 5 lignes | Fil d'Ariane ; portrait/album disponible ; quatre KPI ; albums ; pistes et pagination25/50 | `/api/media/artist/{name}`, union dédupliquée pistes de l'artiste et de ses albums |
| Acteurs et autres personnes | Portrait/rôle si disponibles dans détails ; classement vers catalogue ; modale dans analyses avec résultats, liens, voir tout, Escape et focus | Recherche sur tableaux JSON/arrays de personnes ; test Unicode Réalisateur QA ; aucune route acteur historique fictive |
| Toutes | Mobile390, desktop1440, thèmes clair/sombre et FR/EN ; erreur visible/retry, chargement, vide ; anciennes navigations et paramètres conservés | Services API/Router/Modal/ChartHelper existants ; destruction des graphiques et contrôle des réponses après navigation |

## Calculs et protections vérifiés

- Parents internes ou identifiants Jellyfin acceptés, toujours sur le même serveur. `UNION` termine aussi les hiérarchies cycliques. Deux serveurs partageant les identifiants externes ne fusionnent pas leurs contenus.
- Statistiques médias et spectateurs d'un utilisateur standard limitées à son identité liée ; les agrégats ne précèdent pas ce filtrage. Les options de serveur ne divulguent ni URL ni clé API.
- Les lectures sans utilisateur associé restent dans les statistiques, compteurs, historique et événements administrateur ; les tests empêchent qu'une jointure utilisateur les supprime. Aucun nom d'utilisateur n'est inventé.
- Histogramme détail : dix tranches par session, durée réelle du média ; les durées inconnues sont omises. Les complétions cumulées du Dashboard/Analytics suivent un autre contrat documenté dans le rapport final.
- Comportements calculés à partir des événements réels. L'agrégation parcourt l'historique complet ; le plafond de timeline2000événements n'ampute pas ses totaux.
- Métadonnées Jellyfin optionnelles : People/rôles, versions, backdrop/logo et repères. Délai3s, réponse plafonnée2MiB, pas de redirection, URL validée, champs autorisés seulement. Les tests HTTP locaux vérifient que clés et chemins privés ne sortent pas.
- Binge : au moins3épisodes, même utilisateur et série, intervalle≤45min, fenêtre30j. Une somme d'épisodes n'est pas présentée comme un marathon.

## Différences explicites

- Les scores historiques d'acquisition92/80 et leur recommandation générique sans lectures n'ont pas été recréés : ils contredisent la demande de ne pas inventer de données. Les suggestions sont fondées sur les heures/lectures mesurées, sans pourcentage de confiance fictif. Leur texte est adapté à ces mesures ; leur emplacement est restauré.
- Les métadonnées non enregistrées nécessitent Jellyfin. Sans réponse réelle, aucune version, aucun rôle, aucun logo ou numéro d'épisode n'est inventé. Les portraits, éditions et rotation ont été vérifiés sur un serveur HTTP de test, pas sur les serveurs de l'utilisateur.
- La section Distribution est conditionnelle aux People réellement retournés ; les noms d'acteurs déjà stockés restent cliquables dans le hero si les métadonnées distantes manquent. Un bloc d'indisponibilité ne repousse plus les KPI. Le bouton rotation est placé sur la jaquette et la navigation rapide vide n'occupe plus d'espace.
- Les parents sont prioritaires comme dans l'interface historique. Livres, épisodes, pistes et autres types Go restent accessibles par « Autres contenus » ; les tris supplémentaires sont conservés.
- `LibraryStats.tsx` définit `showDetails=true` en dur dans main : aucun réglage utilisateur historique n'a été perdu. Les détails des cartes restent affichés.

Tests : `TestMediaRecoveryFamiliesScopesFiltersAndPagination`, `TestMediaRecoveryBingeRequiresActualRunsAndNoFakeSuggestions`, `TestMediaRecoveryRealMetadataWhitelistAndSafeServerOptions`, puis tests navigateur et captures décrits dans [MEDIA_PAGES_QA.md](MEDIA_PAGES_QA.md).
