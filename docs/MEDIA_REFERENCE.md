# Audit historique des pages médias

Référence lue sans checkout : `main` = `a59a28613e63e86106c61827167d355b47147f42`. État Go audité : HEAD `9835d85d6f7afd571a7896ed672e0afa68ddc9b5` et fichiers de travail au 10 octobre 2026. Cet audit décrit les écarts **avant** restauration ; le rapport de validation final doit préciser lesquels sont corrigés. Aucun rendu Next historique ni capture comparative n'a été exécuté dans cet audit en lecture seule.

Les onglets communs sont déjà restaurés dans `web/dist/assets/navigation.js`, via `Pages.mediaNav` : tous les médias, top contenus, analyses (administrateur), collections. Préserver cet ordre et leurs permissions. La référence commune est `src/components/media/MediaHeaderNav.tsx` et `src/app/media/layout.tsx`.

## Ordre historique par page

| Page | Référence main | Ordre visible exact | Version Go auditée |
|---|---|---|---|
| Ajouts récents `/recent` | `src/app/recent/page.tsx`, `RecentPage` | titre Sparkles et compteur → filtre serveur → grille → pagination | `Pages.media({sort:'added'})`, même catalogue générique que `/media/all` |
| Catalogue `/media/all` | `src/app/media/all/page.tsx`, `AllMediaPage`; `src/components/media/AllMediaControls.tsx` | titre → filtre serveur → catégories et recherche sur même rangée → grille → pagination | `Pages.media`, filtres en haut à droite puis recherche/tri séparés |
| Top contenus `/media/popular` | `src/app/media/popular/page.tsx` | titre et serveur → première grille films/séries/musique → seconde grille réalisateurs/acteurs/studios | catalogue trié par popularité, six classements absents |
| Collections `/media/collections` | `src/app/media/collections/page.tsx`; `src/components/media/LibraryStats.tsx` | titre → serveur → KPI volume/contenu/temps → titre détails et recherche → cartes alphabétiques | `Pages.collections`, titre et cartes simples seulement |
| Analyses `/media/analysis` | `src/app/media/analysis/page.tsx`; `src/components/dashboard/StatsDeepAnalysis.tsx` | titre → serveur → trois cartes contenu/qualité/bibliothèques → genres → binge → suggestions/tendances → résumé approfondi | `Pages.analysis`, trois listes réalisateurs/acteurs/studios directement en haut |
| Détails `/media/[id]` | `src/app/media/[id]/page.tsx` et trois composants graphiques locaux | fil d'Ariane → navigation rapide → hero → distribution → éditions → enfants → KPI → télémétrie résumé → comportements → spectateurs/langues → complétion → timeline positionnelle → timeline compteurs → historique détaillé | `Pages.mediaDetail`, hero simple avec totaux et noms → dix dernières lectures |
| Artiste `/media/artist/[name]` | `src/app/media/artist/[name]/page.tsx` | fil d'Ariane → hero artiste → quatre KPI → albums → pistes paginées | route appelle `Pages.media({artist})`, page artiste entière absente |
| Acteurs / réalisateurs / studios | détails, top contenus, `StatsDeepAnalysis`, `MediaSearchModal` | portraits/roles dans détails ; classement cliquable → modale de recherche ou catalogue filtré | noms simples non cliquables dans détails et analyses ; aucune route acteur autonome dans main |

## Matrice complète des éléments de ce périmètre

Légende : **présent** = même fonction essentielle existe ; **déplacé** = rendu à un autre endroit ; **absent** = absent du Go audité ; **partiel** = données/interaction/organisation réduites. Une ligne présente ne garantit pas une identité visuelle.

| Page | Élément historique et interaction | État Go initial / preuve | Restauration attendue et source des données |
|---|---|---|---|
| Récents | Titre et total des médias sur même rangée | partiel : `Pages.media` affiche total seulement dans pagination | compteur près du titre, `GET /api/media.total` |
| Récents | Filtre serveur conditionnel multi-serveur | absent de la page ; API accepte déjà `servers` | composant serveur courant + paramètres conservés |
| Récents | Par défaut parents Movie, Series, MusicAlbum ; bibliothèque renseignée ; exclusions globales | partiel : `mediaList` retourne tous types ; exclusions appliquées | types parents et bibliothèque non vide, préserver accès aux livres/épisodes ajoutés en Go via contrôle explicite |
| Récents | Ordre dateAdded décroissante, puis createdAt décroissant | présent approximativement : COALESCE dateAdded/createdAt et id DESC | conserver tri réel ; vérifier traitement date null et ordre déterministe |
| Récents | 40 éléments par page ; numéro courant / total ; bornage de page | partiel : 24, offset non persisté URL, pas bornage total | 40 et URL page ; navigation précédente/suivante, réinitialisation filtre |
| Récents | Badge Nouveau en haut à gauche pour ajouts dans les 7 jours | absent | `dateAdded` existe déjà dans API ; badge animé conditionnel réel |
| Récents | Badge type traduit en haut à droite et icône | partiel : type brut anglais | traductions `common.movie`, `seriesSingular`, `album`, etc. |
| Récents | Albums carrés, films/séries 2:3, épisodes 16:9 | partiel : poster générique | classes par type ; état image absente explicite |
| Récents | Zoom et assombrissement au survol, overlay titre, sous-titre hiérarchique, date, vues, genres, résolution | partiel : overlay titre/durée seulement | champs dateAdded/plays/genres/resolution déjà disponibles ; ajouter parentTitle/artist/serverId |
| Récents | Titre, sous-titre, date relative et vues sous image | partiel : titre/bibliothèque/durée | mêmes positions, date relative localisée et pluralisation |
| Récents | Grille 2/3/4/5/6 colonnes aux paliers mobile/sm/md/lg/xl | partiel : grille SPA existante à vérifier | reproduire paliers et gap, captures 390/768/1440 px |
| Récents | État vide traduit avec titre et explication | partiel : texte français générique | namespace `recent.noMedia` et `recent.noMediaDesc` |
| Catalogue | `/media` redirige vers `/media/all` en conservant query | partiel : deux routes affichent même page sans normalisation | préserver toutes queries historiques et liens existants |
| Catalogue | Tout/Films/Séries/Musique multi-sélection via excludeTypes | absent : sélection unique Movie/Series/Audio/Book | multi-sélection parent types, paramètres compatibles, ajouts Go conservés |
| Catalogue | Icônes toujours visibles ; labels masqués mobile ; rangée scrollable | absent | même responsive et focus clavier |
| Catalogue | Recherche à droite des catégories, clear X, debounce 400 ms, minimum 2 caractères | déplacé et partiel : rangée suivante, sans clear, 300 ms | restauration de rangée et bouton ; abort/race protection sur changement rapide |
| Catalogue | Recherche titre/artiste/réalisateurs/acteurs/studios | partiel : API cherche titre/directors/actors seulement | étendre q aux champs existants artist/studios, pas de données inventées |
| Catalogue | Filtres serveur, genre, résolution depuis liens analyses | partiel : serveur API existe, genre/résolution ignorés et URL non conservée | propagations URL et clauses Go validées |
| Catalogue | Tri par lectures (défaut), temps regardé, qualité | partiel : défaut titre, durée média au lieu de temps regardé, qualité absente | garder tris Go comme choix supplémentaires, compatibles sortBy historique |
| Catalogue | Statistiques séries agrégées depuis épisodes/saisons ; albums depuis pistes | absent : `mediaList` COUNT PlaybackHistory direct sur parent uniquement | familles par serverId+parentId Jellyfin ; agrégats scoped et anti-zapping |
| Catalogue | Badge résolution ; série résolution majoritaire épisodes ou % DirectPlay ; album bitrate issu taille/durée pistes | absent du rendu alors que resolution est disponible | calcul côté Go des champs réels ; respecter showLibraryMediaBadges |
| Catalogue | Métadonnées sous affiche : nombre de lectures et temps regardé | absent ; affiche bibliothèque/durée média | agrégats Go, éviter confondre durée du fichier et durée consommée |
| Catalogue | 50 éléments, total pages et query conservées | partiel : 24 et état local | page bornée, URL persistée ; résolution/genre/servers conservés |
| Catalogue | Grille 2/3/4/6 colonnes, album carré, effets survol | partiel | CSS responsive spécifique et mêmes positions badges |
| Top contenus | Six cartes dans deux grilles 3 colonnes : films, séries, musique puis réalisateurs, acteurs, studios | absent | API dédiée/étendue, classement 5 entrées réel |
| Top contenus | Numéro, titre, nombre vues et heures ; série agrégée depuis épisodes | absent | agrégats PlaybackHistory terminés au-delà seuil zapping ; server/user scope |
| Top contenus | Réalisateurs/acteurs/studios liés vers `/media/all?q=` | absent | liens filtrés conservant serveur |
| Top contenus | État sans donnée pour chaque classement | absent | état vide authentique par carte, aucun exemple fabriqué |
| Collections | KPI globaux volume/contenu/temps | absent | SUM taille, types parents (comptes uniques séries/albums), durée réelle |
| Collections | En-tête détails avec compteur et recherche de bibliothèque | absent | filtrage client sur réponse bornée collections, ordre alphabétique displayName |
| Collections | Nom humanisé + nom brut si différent ; icône par type ; taille en haut à droite | partiel : nom/icône dossier seulement | normalisation libraryName/collectionType et bytes formatés |
| Collections | Détail counts films/séries/albums/livres, temps, épisodes/pistes ignorés | partiel : tous types bruts en chips | séparation parents/enfants ; ne supprimer aucun compte Go supplémentaire |
| Collections | Carte leader : image/titre/vues cliquable | absent | agrégat topItem sous même bibliothèque et même serveur |
| Collections | Carte dernier ajout : image/titre/date cliquable | absent | dateAdded réelle ; à défaut état aucun ajout |
| Collections | showDetails contrôle historique ; exclusions et ghost library names | absent du contrat API | respecter settings et filtrage ; vérifier champs historiques exacts |
| Collections | Bordures/gradients selon type, effet survol, grille 1/2/3 colonnes | partiel : grille simple minmax 320 | CSS spécifique aux collections et responsive |
| Analyses | Accès administrateur et onglet administrateur | présent route/onglet SPA | préserver protection API historique et rôle |
| Analyses | Carte contenu total, genres uniques, durée moyenne catalogue | absent | compter catalogue avec exclusions/serveur, sans mélanger avec stats lectures |
| Analyses | Carte qualité 4K/1440p/1080p/720p/SD avec liens résolution | absent | distribution normalisée réelle et navigation `/media/all?resolution=...` |
| Analyses | Carte bibliothèques six premières et compte | absent | catalog counts, distinct du nombre de lectures |
| Analyses | Diagramme genres diversité du catalogue, hauteur 340 | absent ; deep.topGenres concerne lectures | agrégat genres catalogue dédié, Chart.js courant |
| Analyses | Binge : série leader, moyenne épisodes, record, sessions 30j, utilisateur leader, top quatre séries | absent | reproduire règle main `getBingeWatchingStats(30)` ; séquences d'au moins 3 épisodes, pas simple somme |
| Analyses | Suggestions acquisitions & tendances, catégories/badges/titre/raison/score ; quatre genres par temps | absent | porter règles déterministes main `src/lib/tasteInsights.ts`, aucun score arbitraire |
| Analyses | Résumé approfondi après les cartes ; réalisateurs/acteurs/studios | déplacé en haut | restaurer section en fin ; API `/api/stats/deep` existante |
| Analyses | Chaque personne ouvre MediaSearchModal (title/query, loading, résultats, voir tout, fermeture) | absent : listes statiques | Modal courant + `/api/search?q=` ; liens résultats/détails, focus et fermeture |
| Détails | Fil d'Ariane bibliothèque → série → saison → épisode ou artiste → album → piste ; code épisode | absent | résoudre parentId avec serverId, links stables |
| Détails | Boutons navigation série/saison/artiste/album au-dessus hero | absent | données hiérarchiques réelles, pas de faux parent |
| Détails | Hero backdrop flouté si disponible, logo si disponible sinon titre ; jaquette responsive par type | absent/partiel : poster fixe 240 et texte min-width320 | images proxy Jellyfin Primary/Backdrop/Logo conditionnelles, aucun rectangle cassé mobile |
| Détails | Jaquette rotation administrateur | présent : bouton dans texte sous acteurs | replacer contrôle près du poster sans retirer action API existante |
| Détails | Badges type/code/versions/résolution, hiérarchie et artiste, genres | partiel : type/résolution/lib et genres | champs réels, liens artiste actifs |
| Détails | Distribution : portraits, noms, rôles | absent : huit acteurs en texte | métadonnées Jellyfin People si disponibles ; déclarer limite si aucune image/role enregistré |
| Détails | Multi-versions & éditions si >1 : nom, container, bytes, codecs audio/video | absent | données Jellyfin MediaSources si disponibles ; section uniquement si vrai multi-version |
| Détails séries | Enfants saisons/épisodes/pistes avant KPI, colonnes #/titre/type/résolution/sessions/temps | absent | children scoped server, agrégats descendantes ; liens et overflow horizontal |
| Détails | KPI temps cumulé / vues / durée moyenne (+ pauses musique) | déplacé/partiel : seulement totaux inline hero | cartes distinctes après enfants ; descendants dans totaux parent, durée moyenne calculée |
| Détails vidéo | Résumé télémétrie (pauses/changements audio/sous-titres/sauts etc.) | absent rendu ; compteurs déjà API partiellement | données PlaybackHistory, distinguer zéro réel et indisponible |
| Détails vidéo | Comportements : segments sautés/revus, distribution vitesse, changements langues | absent | TelemetryEvent eventType/positionMs/metadata ; reproduire règles main, pas extrapoler compteurs en segments |
| Détails | Spectateurs uniques triés temps, lien profil, sessions/temps | absent ; dix dernières lectures seulement | historique complet scoped, cartes/rows selon main |
| Détails | Distribution audio avec codec ; sous-titres vidéo seulement | absent | colonnes PlaybackHistory audioLanguage/audioCodec/subtitleLanguage/subtitleCodec |
| Détails | Histogramme complétion et markers, avant timelines | absent | buckets depuis effectiveHistory complet et runtime ; Chart.js sans fausse donnée |
| Détails | Timeline télémétrie positionnelle filtrable sessions/utilisateurs, playback lanes | absent | `TelemetryEvent` réel et `/api/telemetry` contrats existants à réutiliser/étendre |
| Détails | Timeline compteurs chronologique si valeurs >0 ; musique masque audio/subtitleChanges | absent | agrégats par session/date réel |
| Détails | Historique final utilisateur/date/méthode/audio/sous-titres/pauses/sauts/replays/vitesse/durée | partiel : quatre colonnes et dix entrées, avant aucune autre analyse | réponses Go complètes/paginées ; colonnes responsive cachées comme main ; liens profils |
| Détails | Utilisateur non-admin voit uniquement historique lié ; anti-zapping effectiveHistory | écart API audité : totaux globaux et recentActivity globaux | user scope serveur obligatoire avant agrégats ; ne pas exposer autres spectateurs |
| Artiste | Hero avec portrait artiste ou album leader et type Artist | absent | Jellyfin MusicArtist si disponible, sinon vraie image album ; titre artiste |
| Artiste | KPI albums/pistes/lectures/temps écouté | absent | pistes liées artiste ou albums artist, dédupliquées id serveur ; scope utilisateur |
| Artiste | Albums classés lectures puis titre, image/counters/links détails | absent | joindre albumStats de pistes parentId et serveur |
| Artiste | Pistes classées lectures puis titre ; album lié, durée/lectures/temps | absent | union tracksByArtist/tracksByAlbum, zéro permis si enregistré |
| Artiste | Pagination 25/50, tracksPage bornée, URLs stables | absent | pagination réelle et choix taille ; vider si aucune piste/album |
| Acteurs | Dans analyses modale recherche ; dans top catalogue filtré ; dans détails portrait/rôle | absent/partiel | réutiliser recherche/modale actuelle, ne créer aucune route acteur historique fictive |
| Toutes | Traductions namespace media/recent/common/mediaProfile ; date locale | partiel : majorité textes français codés en dur | reprendre clés existantes messages ; fallback propre si clé absente |
| Toutes | Loading, vide et erreur différenciés ; graphiques sans données explicites | partiel : certains catches gardent skeleton avec Toast uniquement | remplacer skeleton par erreur visible/retry et vérifier navigations rapides |

## Contrats Go vérifiés et plan d'intégration

Le contrat actif est `internal/api/handlers.go`, et non `internal/media/media.go` (ancien module avec JSON `media`, inutilisé par la SPA ici).

- `mediaList` (ligne initiale 939), `GET /api/media` : items/id/jellyfinMediaId/title/type/library/resolution/durationMs/server/dateAdded/genres/plays, total/limit/offset. Accepte q/type/library/artist/sort et `getServerScope(r)`. Les champs date/genres/plays/résolution sont déjà suffisants pour restaurer plusieurs badges récents. Ajouter de façon compatible parentTitle/artist/serverId, types parents/excludeTypes, genre/résolution, quality, aggregates descendants et user scope.
- `mediaDetail` (1030), `GET /api/media/{id}` : id/Jellyfin id, metadata, stats directes, compteurs pause/seek/rewatch/speed et recentActivity dix entrées. Résout id interne ou Jellyfin, mais il faut traiter un même Jellyfin id présent sur plusieurs serveurs. Étendre sans casser les champs existants avec hierarchy/children/scoped history/telemetry/versions/people, plutôt que requêter toutes les pages depuis le navigateur.
- `mediaCollections` (2247), `GET /api/media/collections` : collections name/types(type,count,durationMs)/totalItems/totalHours. Ajouter bytes/parents/ignoredCounts/topItem/lastAdded et totaux globaux ; appliquer serveur et scopes aux statistiques utilisateur. Ne pas sommer épisodes et série comme deux contenus parents.
- `deepStats` (197), `GET /api/stats/deep` : `stats.GetDetailedDeepInsights` fournit categorized/topGenres/topClients/chart datasets/topDirectors/topActors/topStudios, fondés sur **lectures**. Pour les trois cartes catalogue et diversité, calculer des agrégats catalogue dédiés. Préserver l'API et les consommateurs dashboard existants.
- Modale personnes : `GET /api/search?q=`, Modal et Router existants. L'historique utilise `MediaSearchModal` avec lien voir tout `/media/all?q=`. Fermer proprement sur changement de page ; préserver filtre serveur.
- Artist / popular / analysis peuvent utiliser endpoints compatibles `/api/media` enrichi avec un mode explicite ou endpoints dédiés dans un fichier backend isolé. Éviter toute dépendance React/Next et tout parcours intégral de la bibliothèque côté navigateur.

Implémentation conseillée : fichier frontend `web/dist/assets/media.js` avec installation des seuls handlers Pages.media/collections/analysis/mediaDetail/mediaArtist/mediaPopular et CSS dédié ; un fichier Go `internal/api/media_recovery.go` pour contrats enrichis. L'intégrateur propriétaire unique du routeur modifie les appels et chargements des assets. Les paramètres, navigation et leur CSS restent attribués à leurs propriétaires actuels.

## Validation nécessaire

1. API réelle avec bibliothèque mixte et deux serveurs : parent counts, descendants séries/albums, filtres exclus/livre/genre/résolution/recherche/serveur, null dates, page au-delà total ; pas de collisions Jellyfin id entre serveurs.
2. Admin et utilisateur lié : mêmes stats autorisées dans KPI, historique, personnes, artiste et drilldown ; routes analyses limitées au rôle historique.
3. Navigations : récent → détails → saison → série, artiste → album → piste, popular personne → catalogue, analyses qualité → catalogue, modale personnes → détail et voir tout ; revenir garde les filtres/page.
4. Graphiques : valeurs égales aux API/DB, comportements dérivés de vrais événements, états sans donnée, resize et destruction après navigation ; pas de séries de points fabriquées.
5. Browser 390/768/1440 px, dark/light, français/anglais : ordre des sections, poster ratios, images absentes, focus/clavier de modale, loading→vide/error, filtres rapides sans réponse obsolète.
6. Captures comparatives seulement si les deux environnements rendent réellement les pages ; sinon valider l'ordre sur référence code et documenter explicitement absence de preuve visuelle historique.

## Limites de l'audit

Lecture statique seulement. Les données Jellyfin en direct (People/roles/portraits, Backdrop, Logo, MediaSources/éditions) et le rendu historique ne sont pas prouvés exécutables. L'audit établit l'organisation et les conditions depuis main ; il ne mesure ni pixels, ni temps de chargement, ni comportement de l'environnement réel. Les métriques artificielles ne constituent pas un moyen de valider ces fonctionnalités.
