# Restauration ciblée médias et collections

Référence historique `main a59a28613e63e86106c61827167d355b47147f42`, branche `codex/frontend-recovery`, 11 octobre 2026. Les rapports et captures précédents dans `docs/final-audit/` restent conservés. La matrice originelle identifie ses cellules par route et critère; les identifiants ci-dessous suivent les corrections concrètes sans compter plusieurs fois une cellule Apparence.

## Corrections et preuve source

| Identifiant | Route et critères concernés | Fichiers modifiés | Correction | Preuve ciblée / statut |
|---|---|---|---|---|
| M-COLLECTION-GROUP | `/media/collections` Sections, Ordre, Textes, Données | `internal/api/media_recovery.go`, `web/dist/assets/media-recovery.js` | Regroupement par clé normalisée historique au lieu de serveur + nom brut. NFD, suppression des accents U+0300–036F, espaces/tirets/underscores et aliases de `main:src/lib/mediaPolicy.ts`. Les identifiants média restent propres au serveur; noms génériques de synchronisation remplacés par le nom réel quand disponible. Groupes fantômes vides supprimés. | `TestHistoricalLibraryKeyMatchesMain`, `TestHistoricalCollectionNormalizationAndScopedDrilldown`: PASS. Corrigé; preuve runtime intégrée à compléter. |
| M-COLLECTION-SCOPE | `/media/collections` Interactions, Permissions, Données | mêmes fichiers | Chaque groupe retient les couples exacts serveur + nom de bibliothèque. Le lien de carte sérialise ces couples; le catalogue les filtre par paramètres SQL et conserve exclusions/scoping existants. Un filtre invalide donne zéro résultat. | Test de drilldown à travers deux serveurs dont un titre Jellyfin identique, exclusion d'une autre bibliothèque et scoping sélectionné: PASS. Aucun élargissement des permissions. |
| M-COLLECTION-COUNTS | `/media/collections` Sections, Données | mêmes fichiers | Agrégation des types avant le choix pistes/albums: les pistes remplacent les albums dans le nombre historique musical, y compris si une bibliothèque d'un autre serveur n'a que des albums. Comptes bruts albums/pistes et enfants conservés. Le leader est l'épisode/piste réellement regardé, au lieu du parent agrégé; dernier ajout/top déterminés sur les groupes fusionnés. | Tests musique multi-serveurs, leader piste, leader et dernière nouveauté sur le second serveur: PASS. Le scope utilisateur et le seuil Go anti-zapping sont préservés. |
| M-COLLECTION-LAYOUT | `/media/collections` Apparence, Sections, Ordre, Textes, Icônes | `web/dist/assets/media-recovery.js`, `media-recovery.css` | KPI disque + inventaire par types sur 1/3 + 2/3, temps sur la rangée suivante; unités historiques Go/To, jours/heures. Titre Détails par Collection avec icône Database, compte descriptif et recherche arrondie. Cartes triées par nom affiché, couleurs par type, previews leader/nouveauté empilées et comptes enfants visibles. | `main:src/components/media/LibraryStats.tsx`, `main:src/lib/size.ts`, ancienne paire `pair-final-media-collections-desktop-dark.png` effectivement inspectée. Code corrigé; nouvelle capture et contrôle responsive nécessaires avant clôture Apparence globale. |
| M-IMAGE-FALLBACK | `/media/[id]`, `/media/all`, `/recent` Apparence, Icônes, Textes | `web/dist/assets/media-recovery.js`, `media-recovery.css` | Remplacement du texte Image indisponible par SVG Film/Music/User sur fond zinc clair/sombre. `fallback=none` utilise le mode explicite du proxy Go pour recevoir une erreur réelle et déclencher ce fallback. Dimensions des posters détaillés conservées même après masquage de l'image; portrait/album carré/épisode paysage. | Référence `main:src/components/FallbackImage.tsx`; `node --check`: PASS. Nouvelle preuve navigateur requise pour les dimensions calculées et les assets embarqués. Les images distantes Jellyfin réellement disponibles ne sont pas simulées. |
| M-CATALOGUE-CARDS | `/media/all` Apparence, Textes, Icônes | `media-recovery.js`, `media-recovery.css` | Titre historique sans icône ni total ajouté. Suppression du badge type et overlay de métadonnées sur cartes catalogue; titre, vues et heures visionnées rétablis. Badges 4K UHD, HD, bitrate et DP restaurés. Espacement grille 24px; icônes catégories Filter/Film/Tv/Music. Les tris/types complémentaires Go restent dans le panneau extensible. Pagination absente sur une seule page. | Sources `main:src/app/media/all/page.tsx`, `AllMediaControls.tsx`; syntaxe JS PASS. Les filtres/pagination existants sont préservés et testables sur l'API réelle. |
| M-SERVER-FILTER | `/media/all`, `/media/collections`, `/media/popular`, `/media/analysis`, `/recent`, `/media/[id]` Apparence, Icônes, Interactions | `media-recovery.js`, `media-recovery.css` | Remplacement du fieldset à cases par les pilules historiques Tout/serveurs avec SVG Filter/Server, état actif `aria-pressed`, sélection simple depuis Tout et sélection multiple par toggle. La remise à Tout emploie `servers=all` pour effacer le scope persistant du backend Go. | Source `main:src/components/dashboard/ServerFilter.tsx`; contrôles navigateur singleton/multi/Tout/API réelle ajoutés. |
| M-CATALOGUE-SORT | `/media/all` Filtres, Interactions, Données | `internal/api/media_recovery.go`, `media-recovery.js` | `sortBy=quality` trie le taux de DirectPlay et `sortBy=duration` le temps visionné comme main. Les tris Go de durée du fichier et résolution restent disponibles sous `runtime` et `resolution`. | `TestHistoricalCatalogueSortContracts`: PASS avec des films dont qualité/résolution et temps visionné/durée fichier ont des classements opposés. |
| M-RECENT-CARDS | `/recent` Apparence, Textes, Icônes | `media-recovery.js`, `media-recovery.css` | Dates d'ajout calendaires et icône Clock, vue seulement si positive, dimensions/type badge coloré et SVG même sur mobile. Résolution réservée à l'overlay, grille 12px mobile et 24px desktop. Fallback de date crééAt pour les médias sans dateAdded. | Source `main:src/app/recent/page.tsx`; syntaxe PASS. Contrôles navigateur dédiés fournis. |
| M-POPULAR-HEADINGS | `/media/popular` Apparence, Textes, Icônes | mêmes fichiers | Description historique sous Top Contenus, SVG Film/Tv/Music/Clapperboard/Users/Building2 devant les titres, Play/Clock dans les statistiques; nombre en lecture(s) comme main. Classements et API existants conservés. | Source `main:src/app/media/popular/page.tsx`; syntaxe PASS. Contrôle visuel intégré requis. |
| M-ANALYSIS-HEADER | `/media/analysis` Apparence, Icônes | `media-recovery.js` | Retrait de l'icône Film ajoutée au titre Analyse Profonde, comme main. Aucune section/graphe existant supprimé. | Source `main:src/app/media/analysis/page.tsx`; correction ciblée uniquement: ne clôt pas à elle seule Apparence/Textes/Icônes/Graphiques de toute la page. |

## Tests effectués

- `node --check web/dist/assets/media-recovery.js`: PASS.
- `node --check scripts/parity-restoration/media.cjs`: PASS.
- `go test ./internal/api -run 'TestHistoricalCollection|TestHistoricalLibraryKey|TestHistoricalCatalogue|TestHistoricalPopular|TestMediaRecoveryFamilies' -count=1 -timeout=60s`: PASS, 4.512 secondes sur la dernière version Go. Les tests de regroupement, scopes, tris, familles médias et métadonnées populaires ont tous été exécutés.
- `git diff --check` ciblé: PASS, avertissement de normalisation LF/CRLF seulement.
- `scripts/parity-restoration/media.cjs` fourni pour le serveur isolé 3350: hashes JS/CSS embarqués, huit routes en desktop/mobile + clair/sombre, erreurs JS, débordement, fallback SVG/dimensions, API collections normalisée, recherche catalogue/collections, état vide, drilldown scopes et instances Chart. Aucun média, paramètre ou fichier de données utilisateur n'est muté. Le JSON `media-runtime.json` fait autorité pour sa passe intégrée.

## Limites et constats restant à vérifier

Les nouvelles comparaisons directes main/Go sont réalisées par l'agent de validation visuelle; ce rapport ne présente pas l'inspection du source ou d'une ancienne paire comme une capture directe actuelle. Le backend Go privilégie le scope utilisateur et les exclusions existants: le leader historique main ignorait certaines restrictions utilisateur et le seuil anti-zapping, ce comportement n'est pas réintroduit.

Le choix d'un nom de bibliothèque vivant via `/Library/VirtualFolders` lorsque plusieurs aliases existent est déterminé ici depuis les bibliothèques enregistrées. Une source Jellyfin vivante et son API de bibliothèques n'ont pas été vérifiées. Les métadonnées supplémentaires des pages détaillées, les images distantes, actions de rotation, graphes en bas d'Analyse Profonde et télémétrie détaillée ne deviennent pas conformes sur la seule base de cette correction de présentation. Aucune mutation Jellyfin/production ni suppression réelle n'a été effectuée.

Les nombres de cellules effectivement clôturées doivent provenir de la matrice consolidée après les preuves d'intégration; onze identifiants de correction ne constituent pas dix critères globaux certifiés.

## Évolution par cellule ouverte

Ces cellules étaient toutes `Différence à corriger` dans la matrice originelle. Elles restent dans cet état tant que la dernière passe après rebuild n'a pas confirmé les assets et les contrôles concernés; le principal consolide le statut final. Une cellule Apparence peut contenir plusieurs corrections et conserve ses constats initiaux dans l'historique.

| Cellule historique | Corrections intégrées | Preuve attendue / limite de clôture |
|---|---|---|
| `/media/collections` Sections | M-COLLECTION-GROUP, COUNTS, LAYOUT | API groupée + quatre cartes dans fixture comparable; preuve directe des cartes finales. |
| `/media/collections` Ordre | GROUP, LAYOUT | Tri localisé + previews leader puis nouveauté, durée KPI sur deuxième rangée. |
| `/media/collections` Textes | GROUP, LAYOUT | Noms/ghost, unités Go/To, jours/heures, inventaire par types et pluriels minuscules. |
| `/media/collections` Icônes | LAYOUT, SERVER-FILTER | SVG KPI à gauche, Database du titre, filtre pilules. |
| `/media/collections` Apparence | LAYOUT, SERVER-FILTER | Captures desktop/mobile clair/sombre finale; conserver les limites pixel/données live. |
| `/media/all` Textes | CATALOGUE-CARDS | Heures visionnées et résolution/DP/KBPS; additions Go toujours accessibles. |
| `/media/all` Icônes | IMAGE-FALLBACK, CATALOGUE-CARDS, SERVER-FILTER | Film/Music fallback, catégories Filter/Film/Tv/Music, header sans Film ajouté. |
| `/media/all` Apparence | CATALOGUE-CARDS, SERVER-FILTER | Grille, badges, toolbar; panneau de tris Go complémentaire n'a pas d'équivalent main. |
| `/recent` Textes | RECENT-CARDS | Dates calendaires et vues positives dans quatre variantes. |
| `/recent` Icônes | IMAGE-FALLBACK, RECENT-CARDS, SERVER-FILTER | Sparkles/Clock/type; fallback conforme quand la vraie image manque. |
| `/recent` Apparence | RECENT-CARDS, SERVER-FILTER | Grille et type, responsive, résolution overlay; comparer captures finales. |
| `/media/popular` Textes | POPULAR-HEADINGS | Description historique et lecture(s), heures. |
| `/media/popular` Icônes | POPULAR-HEADINGS, SERVER-FILTER | Header cartes et statistics Play/Clock. |
| `/media/popular` Apparence | POPULAR-HEADINGS, SERVER-FILTER | Cartes/rangs existants conservés; visuel et donnée finale requis. |
| `/media/[id]` Icônes | IMAGE-FALLBACK, SERVER-FILTER | Film/Music/User fallback vérifié pour film, épisode et album; les branches personnes/distantes restent limitées. |
| `/media/[id]` Textes | IMAGE-FALLBACK | Seul texte fallback supprimé; métadonnées Go supplémentaires persistent. Ne clôture pas la cellule entière. |
| `/media/[id]` Apparence | IMAGE-FALLBACK | Ratios/placeholder vérifiés; toutes les variantes média et sections inférieures n'ont pas été restaurées dans ce lot. |
| `/media/analysis` Icônes | ANALYSIS-HEADER, SERVER-FILTER | Correction du titre/filtre uniquement; les icônes de toutes les sections ne sont pas comparées. |
| `/media/analysis` Apparence | ANALYSIS-HEADER, SERVER-FILTER | Correction limitée titre/filtre. Captures au-dessous du pli nécessaires pour clôture globale. |
| `/media/analysis` Textes | aucun correctif global de ce lot | Conserver ouvert à moins de preuve fournie par principal ou visual_validation. |

La cellule Données des collections était `Non testé`: les tests Go établissent désormais la normalisation, les collisions d'identifiant Jellyfin, l'inventaire musique et la portée des liens. Ils n'établissent pas l'identité de chaque ligne provenant d'un Jellyfin vivant. La cellule Graphiques d'Analyse était `Non testé`: le script contrôle les véritables instances Chart et les APIs Go, ce qui prouve leur fonctionnement dans la fixture mais pas la similitude avec chaque graphe historique.

## Résultat des passes navigateur intermédiaires

Sur le premier build intégré contenant les corrections médias avant les dernières pilules ServerFilter et labels KPI, `media.cjs` a produit 32 captures (8 routes × desktop/mobile × clair/sombre), **90 contrôles PASS sur 92**, avec **zéro exception JavaScript**. Les deux contrôles échoués attendaient `networkidle` après une navigation SPA et lisaient les cartes avant le remplacement de la skeleton. Après attente d'une carte visible, la passe suivante obtient **91/92**; le dernier échec provenait de la comparaison du terme recherché avec un espace final, alors que le produit normalise correctement la recherche avec `.trim()`. Le harness applique maintenant la même normalisation. La passe finale après les pilules ServerFilter n'a pas encore été exécutée dans cette contribution; il faut rerun le script après le dernier rebuild commun et vérifier les hashes.

Captures nouvelles effectivement inspectées: épisode desktop sombre (fallback Film, ratio paysage, données réelles 8.5h/17/30min) et collections desktop sombre (4 cartes fusionnées, 11.9 Go, 108 films/2 séries/6 musique/2 livres, 7j1h). Ces captures précèdent les derniers labels lowercase et repositionnements KPI; elles ne remplacent pas la passe finale.

Contrôle Go renforcé ensuite avec un épisode orphelin `TV Shows` non regardé et intersection d'un drilldown groupé avec `servers=a`: **PASS, 6.010 secondes** (`TestHistoricalCollectionNormalizationAndScopedDrilldown`).

Résidu source précis au-delà du lot: les titres des sections `/media/[id]` n'ont pas tous les SVG Activity/Headphones/Languages/FastForward/Gauge/RotateCcw de main. Le bas d'Analyse Profonde contient dans main `deepStatsOverview` avec le composant `StatsDeepAnalysis`; sa fidélité ne se déduit pas de la simple présence de graphiques de tendances Go. Les critères globaux correspondants doivent rester ouverts en l'absence d'une restauration plus complète.

Défaut latent signalé au principal: le fallback d'une photo de personne `.mr-cast-person` nécessite une boîte relative de ratio 2/3 pour garder sa géométrie; cette branche n'est pas présente dans la fixture sans métadonnées de personnes Jellyfin. Correctif CSS proposé, non appliqué dans ce lot après freeze.
