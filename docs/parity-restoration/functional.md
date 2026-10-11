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
