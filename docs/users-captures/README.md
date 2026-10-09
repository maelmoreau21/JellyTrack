# Galerie utilisateurs : `main` / Go

Captures réelles du 9 octobre 2026, Chromium, données synthétiques identiques. Desktop : 1440 × 900. Mobile : 390 px de largeur. Les pages historiques défilent dans `main` ; les captures des sous-sections utilisent ce défilement. Les fichiers ne résultent pas d'une maquette ou d'un montage.

| Interface | Historique `main` | Go |
| --- | --- | --- |
| Liste, desktop sombre | [Capture](main-users-desktop-dark.png) | [Capture](go-users-desktop-dark.png) |
| Liste, desktop clair | [Capture](main-users-desktop-light.png) | [Capture](go-users-desktop-light.png) |
| Liste, mobile sombre | [Capture](main-users-mobile-dark.png) | [Capture](go-users-mobile-dark.png) |
| Profil, desktop sombre | [Capture](main-profile-desktop-dark.png) | [Capture](go-profile-desktop-dark.png) |
| Profil, desktop clair | [Capture](main-profile-desktop-light.png) | [Capture](go-profile-desktop-light.png) |
| Profil, mobile sombre | [Capture](main-profile-mobile-dark.png) | [Capture](go-profile-mobile-dark.png) |
| Profil, mobile clair | [Capture](main-profile-mobile-light.png) | [Capture standard](go-standard-profile-mobile-light.png) |
| Activité sur trente jours | [Capture](main-profile-desktop-dark-activity.png) | [Capture](go-profile-desktop-dark-activity.png) |
| Graphiques détaillés | [Capture](main-profile-desktop-dark-charts.png) | [Capture](go-profile-desktop-dark-charts.png) |
| Historique et filtres | [Capture](main-profile-desktop-dark-history.png) | [Capture](go-profile-desktop-dark-history.png) |
| Historique mobile | [Capture](main-profile-mobile-dark-history.png) | [Capture](go-profile-mobile-dark-history.png) |
| Compte sans historique | [Capture](main-profile-empty-dark.png) | [Capture](go-profile-empty-dark.png) |
| Activité du compte vide | [Capture](main-profile-empty-dark-activity.png) | [Capture](go-profile-empty-dark-activity.png) |
| Message historique vide | [Capture](main-profile-empty-dark-history.png) | [Capture](go-profile-empty-dark-history.png) |

Les autres fichiers `-activity`, `-charts` et `-history` fournissent les mêmes sections en clair et sur mobile.

## Cas Go complémentaires

- [Profil avec données partielles](go-profile-partial-dark.png)
- [Profil standard authentifié](go-standard-own-profile.png)
- [Chargement historique des quatre sections du profil](go-profile-loading.png)
- [Chargement mobile de la liste](go-users-loading-mobile.png)
- [Historique filtré sans résultat](go-profile-filter-empty.png)
- [Détails d'une session](go-profile-session-modal.png)
- [Chronologie avec cinq événements réels de la base QA](go-profile-telemetry-modal.png)

La dernière modale vérifie le regroupement à 1500 ms, les positions historiques en ticks, les langues/codecs avant-après, les changements de vitesse, les liens temporels et la copie réelle dans le presse-papiers du navigateur de test. Les cinq événements temporaires ont ensuite été supprimés.

Les conclusions sur **structure, apparence, comportement et données** ainsi que les limites sont dans [le rapport QA](../users-validation/README.md). La présence de captures ne certifie pas une égalité de tous les pixels, notamment pour les graphiques dont le moteur diffère.
