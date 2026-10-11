# Vérification fonctionnelle ciblée — 11 octobre 2026

Agent réellement exécuté : `functional_regressions`. Sources historiques lues sur `main` avec `git show` ; la branche `main` et les bases existantes n'ont pas été modifiées. Les données des tests résident dans des bases SQLite temporaires supprimées par Go ; aucun contenu applicatif fictif n'a été ajouté.

## Corrections concrètes

| Identifiant complémentaire | Écart confirmé avant correction | Fichier modifié | Correction | Preuve et statut |
| --- | --- | --- | --- | --- |
| FR-STREAM-SUBTITLE | Flux épisode sans série/saison ; audio sans album et sans artiste hérité | `internal/api/handlers.go`, méthode `streams` | Réutilisation du résolveur parent existant, après libération du curseur SQLite ; exposition `albumArtist` conforme au contrat historique | `TestFunctionalParityStreamsParentSubtitlesAndServerScope` échouait sur le sous-titre épisode, puis passe. Deux serveurs avec mêmes identifiants parents vérifient l'absence de mélange ; progression 50 % vérifiée. Corrigé et testé API. |
| FR-TELEMETRY-NULL | `endedAt` et `sourceEventId` retournés sous forme d'objets Go `{String,Valid}` | `internal/api/handlers.go`, méthode `streamsTelemetry` | Sérialisation en chaîne ou `null`, comme `main` | `TestFunctionalParityTelemetryNullableFieldsEmptySessionsAndServerScope` échouait sur la session ouverte, puis passe ; sessions ouverte/terminée et serveur interne/externe contrôlés. Corrigé et testé API. |
| FR-TELEMETRY-EMPTY | Média sans sessions retournant `sessions:null` au lieu de `sessions:[]` | `internal/api/handlers.go`, méthode `streamsTelemetry` | Initialisation d'une liste vide | Même test avec média sans session. Corrigé et testé API. |

Ces trois écarts de contrat sont complémentaires aux 63 critères déjà signalés. Ils ne justifient pas, à eux seuls, de déclarer la totalité d'un critère visuel ou d'une page fidèle. Leur regroupement éventuel dans une ligne de matrice doit conserver cette distinction.

Sources de comparaison : `main:src/app/api/streams/route.ts`, `main:src/app/api/streams/telemetry/route.ts`. Tests ajoutés dans `internal/api/functional_parity_test.go`.

## Contrôles ciblés exécutés

```powershell
go test ./internal/api -run '^TestFunctionalParity' -count=1 -timeout 30s
```

Résultat : succès après correction (`ok`, 2.821 s). Échec préalable enregistré dans la sortie de cette session sur les sous-titres et les champs nuls.

```powershell
go test ./internal/api -run '^Test(StreamsAndTelemetryMediaGrouping|StreamsDoNotInventBandwidthAndExposeRecordedPause|StreamCommandsPreserveLocalStateOnRemoteFailureAndScopeServer|HistoryFiltersPaginationAndSelfScope|HomonymousUsersCannotCrossServerIdentityBoundary|RecoveredHistoryFieldsFiltersTelemetryAndChartDrilldowns|CustomDashboardDateAliasesAndValidation|HeatmapDrilldownAndMatrix)$' -count=1 -timeout 60s
```

Résultat : succès (`ok`, 2.787 s). Couverture : regroupement de télémétrie, pause enregistrée, absence de bande passante inventée, erreur distante conservant le flux local, arrêt limité au serveur demandé, délai du message, pagination/tri et filtres historiques, restrictions d'identité multi-serveur, champs enrichis/événements, filtres de complétion/langues/bibliothèques, dates personnalisées et validation, matrice heatmap et détails.

## Limites

Cette exécution contrôle les handlers et les contrats JSON sur SQLite. Elle ne constitue pas une comparaison visuelle directe ni un test de chaque interaction navigateur. Les appels Jellyfin de contrôle de flux sont simulés par serveur HTTP de test ; aucun lecteur distant réel n'a été interrompu. PostgreSQL, les données d'une installation réelle, tous les codecs et une télémétrie de production ne sont pas validés ici. Une ligne `Non testé` concernant un tableau ou un graphique absent est sans objet ; elle ne doit pas être transformée en écart résolu.

Les contrats de filtre dashboard/statistiques et d'historique disposent déjà des tests ci-dessus ; pas de réécriture réalisée. La lecture de Newsletter pour utilisateur simple et la protection admin de l'envoi Discord sont intégrées par l'agent principal, dans son périmètre et avec ses propres tests.

## Audit complémentaire : débit audio de l'historique

Une capture historique indique 12 kbps contre 12 000 kbps dans Go, avec une même valeur stockée de 12 000 000 bits/s. La divergence a deux causes distinctes :

- `main:src/app/logs/page.tsx:525` normalise d'abord 12 000 000 bits/s en 12 000 kbps ; `resolveAudioBitrateKbps` renormalise ce champ déjà normalisé à la ligne 211, en le prenant pour des bits/s au seuil de 10 000 : il obtient 12 kbps. `LogRow.tsx:356` renormalise encore, sans effet dans ce cas. Les 12 kbps de la capture ne sont donc pas une donnée audio démontrée.
- Le résolveur historique préfère les métadonnées d'une piste audio Jellyfin (index actif, langue et codec, langue, codec, ou piste unique). Sans métadonnées, il accepte le débit global pour un média audio ; pour une vidéo, seulement un débit raisonnablement audio inférieur ou égal à 1 536 kbps. Go normalise une seule fois le débit stocké mais le présente directement dans la colonne « Débit audio » : 12 000 kbps est correct comme débit global, pas comme débit d'une piste audio connue.

Conclusion : ne pas reproduire les 12 kbps erronés. Une restauration correcte doit afficher un débit audio réellement résolu, ou `—` lorsqu'une vidéo à 12 Mbps ne dispose pas de cette métadonnée. L'export historique utilise une autre voie de normalisation ; son contrat doit rester distinct. Aucune correction de cette question n'est incluse dans les trois écarts FR ci-dessus ; proposition transmise au principal avant toute édition supplémentaire.

Source centrale : `main:src/lib/bitrate.ts`, règle `value >= 10_000 ? value / 1000 : value`. Fixture : `scripts/media-pages-qa/seed.py`, champ historique `bitrate=12000000`.

## Corrections finales ajoutées après cet audit

L'audit ci-dessus est conservé : les corrections suivantes ont été ajoutées ensuite, lors de la dernière intégration, par le sous-agent complémentaire `functional_final`.

| Identifiant complémentaire | Fichiers | Correction | Preuve et statut |
| --- | --- | --- | --- |
| FR-WRAPPED-CLIENT | `internal/api/analytics_recovery.go`, `analytics_recovery_test.go` | Le « Top appareil » historique classe `clientName` par temps regardé. `topDevice` reprend cette valeur ; le classement des appareils physiques reste disponible dans `topPhysicalDevice`. | Source `main:src/app/wrapped/[userId]/page.tsx`, `deviceCounts` et `topDeviceEntry`. Test `TestWrappedRestoresYearsCategoriesParentsAndHours` : Web/TV distingués, plusieurs courtes lectures Phone ne dépassent pas Web ; années, catégories et compte/serveur étrangers exclus. Corrigé et testé API. |
| FR-HISTORY-AUDIO | `internal/api/history_recovery.go`, `history_audio_parity_test.go`, `users_profile.go` ; affichage intégré par le principal dans `history.js` et `profile.js` | Champ explicite `audioBitrateKbps`, indépendant du débit global conservé. Métadonnées audio enregistrées préférées ; repli sur le débit global seulement pour un média musical ou une valeur vidéo ≤ 1 536 kbps, déjà normalisée une seule fois. Vidéo 12 Mbps sans piste audio connue : `null`, affichée `—`. Profils et historique utilisent le même enrichissement, limité à 500 sessions par requête pour préserver les gros exports. | `TestHistoryAudioBitrateSeparatesVideoAndExplicitAudioMetadata` : vidéo 12 000 kbps/audio inconnu, Audio 256 kbps, métadonnée audio explicite 320 kbps préférée à l'ancienne 192, piste audio explicite 448 kbps, seuil vidéo 1 536, événement d'un autre serveur exclu. Mêmes valeurs vérifiées dans le profil. `TestRecordedHistoryAudioBitrateOnlyUsesExplicitPositiveValues` : valeurs négatives, chaînes et débit non qualifié refusés ; unité kbps explicite jamais convertie deux fois. Corrigé pour les métadonnées enregistrées et testé API. |

Commande après intégration des deux corrections et des profils :

```powershell
go test ./internal/api -run '^Test(HistoryAudioBitrate|RecordedHistoryAudioBitrate|WrappedRestoresYears|RecoveredHistoryFields|FunctionalParity|User)' -count=1 -timeout 60s
```

Résultat : succès (`ok`, 3.105 s). `node --check scripts/parity-restoration/core.cjs` : succès. Le script navigateur ajoute des contrôles sur le client favori réellement affiché, calculé depuis l'historique du compte, et les cellules audio inconnues. Son rapport `core-runtime.json` doit être lu uniquement après exécution sur le binaire Go reconstruit.

Limite audio conservée explicitement : le schéma Go ne stocke pas les pistes `MediaStreams` de Jellyfin ni leur index. Seules les métadonnées audio explicitement enregistrées dans la télémétrie (`audioBitrateKbps`, `audioBitrate`, `audioStream.BitRate`) peuvent être résolues ici. Les pistes Jellyfin distantes non enregistrées restent inconnues ; aucun débit n'est déduit d'un codec, d'une langue ou d'un débit vidéo élevé. L'export historique autonome conserve son contrat de normalisation distinct. Cette amélioration ne certifie donc pas toutes les variantes de débit audio observées dans une installation Jellyfin réelle.


## Validation navigateur finale intégrée

`node scripts/parity-restoration/core.cjs` sur le Go isolé reconstruit (`localhost:3350`) : **43 contrôles sur 43 réussis**, code de sortie 0. Preuves détaillées : `docs/parity-restoration/core-runtime.json` ; six empreintes SHA-256 d'assets embarqués identiques aux sources courantes (`app.js`, `app.css`, `history.js`, `profile.js`, `history-recovery.css`, `wrapped-recovery.css`). Le script utilise des sessions réelles anonymes, utilisateur standard et admin ; aucune réponse HTTP interceptée.

Contrôles effectifs : utilisateur standard autorisé à lire et télécharger Newsletter ; publication Discord standard refusée avec CSRF valable ; accès anonyme refusé/redirigé ; PNG téléchargé valide de 1 080 × 1 350 ; icônes Soleil/Lune et changement de thème de login ; langue anglaise persistée après reload ; 18 diapositives Wrapped, fermeture vers le même profil, ordre Général/Films/Musique/TV/Livres ; genres, rangs et mois proportionnels aux valeurs API réelles de la base de test ; client favori calculé depuis les durées du compte (Android TV, appareil physique TV) effectivement rendu ; logs et profil affichant `—` lorsque seul un débit vidéo élevé est connu ; date/heure sur deux lignes, reset absent/inclus selon filtres et réinitialisation ; dates personnalisées dashboard ; vrais objets Chart avec données enregistrées ; clic sur l'arc audio français ouvrant les logs filtrés dont le compte (26 lectures) égale celui du graphique. Aucune exception JavaScript non interceptée.

Historique de vérification conservé dans `core-runtime-initial.json`, `core-runtime-retry1.json` et `core-runtime-retry2.json`. Les faux échecs du harness ont été corrigés sans mutation du produit : attente `networkidle` incompatible avec des requêtes SPA persistantes, glob de route `/login` ne couvrant pas `?callbackUrl=…`, puis initialisation du test réécrivant le français à chaque reload. La validation finale attend les éléments et états DOM utiles, compare le pathname et initialise seulement les préférences absentes. Une seconde exécution complète réussissait déjà les 42 contrôles avant ajout de l'empreinte de `profile.js`.

Limites de cette suite : viewport desktop, jeu SQLite isolé, navigation et API Go réelles ; aucune publication Discord admin exécutée et aucun lecteur Jellyfin externe piloté. La sortie PNG est contrôlée comme téléchargement valide, pas comme preuve de comparaison graphique directe avec le PNG historique. Les captures visuelles et le responsive relèvent des rapports des autres agents.


## Correction finale du classement des personnes dans l'analyse des médias

La comparaison directe de `/media/analysis` a révélé une divergence supplémentaire après la validation précédente : les cartes personnes réutilisaient le classement dashboard par lectures (147), tandis que `main` compte les titres du catalogue (110 dans le jeu comparé).

| Identifiant complémentaire | Fichiers | Correction | Preuve et statut |
| --- | --- | --- | --- |
| FR-MEDIA-DEEP-CATALOGUE | `internal/api/handlers.go` (seulement `deepStats`), nouveaux `catalogue_deep_parity.go`, `catalogue_deep_parity_test.go` ; appel frontend intégré par l'agent médias dans `media-recovery.js` | Mode opt-in `/api/stats/deep?catalogue=true` : trois listes `topDirectors`, `topActors`, `topStudios`, dix entrées maximum `{name,count}`, basées sur les seules métadonnées `Movie`/`Series`. Aucun lien aux lectures, donc un film lu deux fois ne compte qu'une fois. Scopes `servers`/`serverId`/cookie et exclusions conservés. Le mode dashboard reste inchangé ; route admin existante conservée. | Source `main:src/app/api/stats/deep/route.ts`. `TestCatalogueDeepStatsCountsTitlesNotPlaybacksAndScopesServers` : deux lectures → un titre ; série non lue incluse ; épisode et bibliothèque exclue omis ; serveur/cookie et multi-serveur respectés ; scope vide retourne des listes vides. Le même jeu démontre que le dashboard continue à compter deux lectures et conserve ses champs de graphiques. `TestCatalogueDeepStatsLimitsCreditsWithoutInventingEmptyMetadata` : dix entrées et listes vides en cas de métadonnées absentes. Corrigé et testé API ; comparaison navigateur finale après reconstruction à lire dans le rapport médias. |

```powershell
go test ./internal/api -run '^Test(CatalogueDeepStats|DeepStatsAndGeoStats|CustomDashboardDateAliasesAndValidation)' -count=1 -timeout 60s
```

Résultat : succès (`ok`, 2.567 s). Le tri décroissant utilise le nom comme départage déterministe des égalités ; `main` conservait l'ordre implicite de sa requête pour ces égalités. Aucune lecture distante, mutation de base ou donnée applicative ajoutée. Le parseur de métadonnées réutilise `recoveredRows`, prévu pour SQLite et PostgreSQL ; seul SQLite est exécuté dans ces tests.


## Rejeu après toute dernière intégration : 50/50

La version Go finale isolée sur `localhost:3350` (PID 52200 lors du démarrage) a été rejouée après toutes les dernières corrections produit. **`core.cjs` : 50 contrôles sur 50 réussis, sortie 0**, six empreintes d'assets embarqués identiques et aucune exception JavaScript. Le rapport courant `core-runtime.json` remplace le résultat courant précédent de 43 contrôles tout en conservant les rapports d'essais.

Les sept contrôles supplémentaires vérifient le mode catalogue : utilisateur standard 403, anonyme 401 ; lecture complète des 128 métadonnées médias de la base isolée ; réalisateurs, acteurs et studios calculés indépendamment à partir des 110 titres Movie/Series, identiques aux trois classements du nouvel endpoint ; mode dashboard conservant 147 lectures pour ces crédits et ses graphiques audio, tandis que le catalogue en compte 110 et retourne ses seules trois listes.

Un dernier faux échec du harness a été conservé dans `core-runtime-final-before-uppercase-check.json` : la nouvelle fidélité CSS met le client favori en majuscules, donc `innerText` retournait `ANDROID TV` pour la donnée `Android TV`. Le contrôle lit désormais `textContent` de la carte correspondante pour vérifier la donnée réellement insérée ; aucun fichier produit n'a été modifié après le gel/rebuild. Les contrôles débit audio inconnu dans logs/profil, client favori par durée, Newsletter/PNG, login, Wrapped, reset et drilldown restent tous réussis.

Le bundle Go ciblé complet a aussi été rejoué après intégration finale :

```powershell
go test ./internal/api -run '^Test(FunctionalParity|HistoryAudioBitrate|RecordedHistoryAudioBitrate|WrappedRestoresYears|CatalogueDeepStats|DeepStatsAndGeoStats|CustomDashboardDateAliasesAndValidation)' -count=1 -timeout 60s
```

Résultat : succès (`ok`, 4.658 s). Les neuf tests ciblés couvrent les six écarts fonctionnels complémentaires et les régressions deep/date. `node --check scripts/parity-restoration/core.cjs` : succès. Les limites externes et SQLite/desktop déjà exposées dans ce rapport restent applicables.


## Dernière régression audio corrigée : aucune inférence depuis une vidéo

La revue finale de `enrichHistory` a reproduit un défaut de l'heuristique historique auparavant conservée : un débit global vidéo faible (600 ou 1 536 kbps) restait attribué à la piste audio sans preuve. Le contrat final de **FR-HISTORY-AUDIO** est donc plus strict que le repli de `main` : **pour toute vidéo, quel que soit son débit global, `audioBitrateKbps` reste `null` sans métadonnée audio explicitement enregistrée**. Les seuls types autorisant le repli sont `Audio`, `Track`, `MusicTrack`, `MusicAlbum` et `AudioBook`. Le débit global original reste intact.

Fichiers exclusivement modifiés : `internal/api/history_recovery.go`, `internal/api/history_audio_parity_test.go`. Avant correction, le test reproduisait six échecs dans historique et profil : vidéo 600 → audio 600, vidéo 1 536 → audio 1 536, AudioBook 2 160 → audio inconnu. Après correction : vidéo 600/1 536/12 000 → audio inconnu ; vidéo 600 avec audio explicite 128 → 128 ; Audio 256 et AudioBook 2 160 conservés ; autres métadonnées audio explicites 320/448 et scope serveur conservés. Preuve complémentaire : `audio-strict-regression.json`.

```powershell
go test ./internal/api -run '^Test(HistoryAudioBitrate|RecordedHistoryAudioBitrate|RecoveredHistoryFields|FunctionalParity|User)' -count=1 -timeout 60s
```

Résultat après correction : succès (`ok`, 4.867 s), `git diff --check` réussi. Cette dérogation précise au repli historique évite de présenter une donnée vidéo comme une donnée audio. Aucun jeu applicatif/fixture existant n'a été modifié. Les cas 600 kbps et AudioBook 2 160 kbps résident seulement dans les bases temporaires des tests Go ; ils ne sont pas certifiés par les captures navigateur du jeu partagé. Le principal reconstruit le binaire final après ce gel.


## Alignement final du débit audio exporté (CSV/JSON)

L'export utilisait encore `item.bitrate` et un repli sur le débit global `ActiveStream` avant l'enrichissement historique. **FR-HISTORY-AUDIO** couvre maintenant aussi cet écart : `history_handlers.go` enrichit toutes les lignes avant la branche export ; `history_export.go` utilise `audioBitrateKbps` et n'accepte le débit live en repli que pour les cinq types audio identifiés. Aucune vidéo ne reçoit son débit global historique ou live dans une colonne audio. Le codec live existant, les filtres, tri, périmètres, unités, lignes exportées, noms et 17 colonnes CSV ainsi que la protection contre les formules sont conservés.

La régression a été reproduite avant correction : Movie avec débit global live 256 → audio 256 ; vidéo 600 → audio 600 ; vidéo sans débit historique → audio 512 live ; vidéo avec métadonnée audio explicite 384 → audio 12 000. Après correction, les trois cas vidéo sans métadonnée restent `null` en JSON/vide en CSV ; le cas explicite retourne 384 ; le média Audio sans débit historique conserve le repli live réel 256. Un enregistrement live incohérent d'un autre serveur ne remplace pas cette valeur. L'ancien test `TestHistoricalExportFiltersFormatsUnitsAndLiveFallback` vérifie maintenant le débit vidéo inconnu et conserve tous ses contrôles de filtres/formats/secondes/codec.

Deux tests ajoutés : `TestHistoryExportAudioKeepsUnknownVideoExplicitMetadataAndAudioLiveFallback` contrôle JSON et CSV, métadonnée enregistrée, inconnu, live audio, serveur, export sans pagination, 17 colonnes, secondes et échappement `'=Alice` ; `TestHistoryExportEnrichmentPreservesAllRowsPastBatchBoundary` exporte 501 sessions malgré `limit=1`, vérifie que la métadonnée audio explicite de la 501e session est conservée au-delà du premier paquet de 500 et que les autres vidéos restent inconnues. Ces jeux résident dans des bases SQLite Go temporaires.

```powershell
go test ./internal/api -run '^Test(HistoricalExportFiltersFormatsUnitsAndLiveFallback|HistoryExport|HistoryAudioBitrate|RecordedHistoryAudioBitrate|HistoryFiltersPaginationAndSelfScope|RecoveredHistoryFields|FunctionalParity|User)' -count=1 -timeout 60s
```

Résultat final après correction et test du second paquet : succès (`ok`, 2.773 s), `git diff --check` réussi. Fichiers modifiés : `internal/api/history_handlers.go`, `history_export.go`, `history_export_test.go`. Il s'agit de l'extension du même écart FR-HISTORY-AUDIO, pas d'un nouveau critère corrigé à compter séparément. Les exports conservent leur repli additionnel sur une session live audio réelle lorsque l'historique ne contient aucun débit audio ; ils n'en tirent jamais un débit audio de vidéo. Dernière reconstruction/validation navigateur intégrée effectuée par le principal après ce gel.
