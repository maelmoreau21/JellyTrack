# Captures comparatives de navigation

Captures réelles, mêmes résolutions : **1440 × 900** sur desktop et **390 × 844** sur mobile. La référence est `main` au commit `a59a28613e63e86106c61827167d355b47147f42`. Les conditions et limites sont dans le [rapport](../NAVIGATION_RESTORATION.md#validation-et-captures).

Le contenu de la page À propos garde la présentation de chaque version. Le badge N appartient au serveur Next de développement. Pour comparer le menu administrateur avec Mon Compte, les captures Go utilisent une identité Jellyfin simulée ; le compte local Go n'a pas de profil Jellyfin.

| Situation | Historique `main` | Go restauré |
|---|---|---|
| Admin desktop ouvert | [Main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/main-admin-desktop-open.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-admin-jellyfin-single-desktop-open.png) |
| Admin desktop réduit | [Main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/main-admin-desktop-collapsed.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-admin-jellyfin-single-desktop-collapsed.png) |
| Admin mobile fermé | [Main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/main-admin-mobile-closed.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-admin-jellyfin-single-mobile-closed.png) |
| Admin mobile ouvert | [Main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/main-admin-mobile-open.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-admin-jellyfin-single-mobile-open.png) |
| Utilisateur desktop ouvert | [Main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/main-user-desktop-open.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-user-wrapped-desktop-open.png) |
| Utilisateur desktop réduit | [Main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/main-user-desktop-collapsed.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-user-wrapped-desktop-collapsed.png) |
| Utilisateur mobile fermé | [Main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/main-user-mobile-closed.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-user-wrapped-mobile-closed.png) |
| Utilisateur mobile ouvert | [Main](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/main-user-mobile-open.png) | [Go](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-user-wrapped-mobile-open.png) |

## Utilisateur mobile : historique puis Go

![Navigation historique utilisateur mobile](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/main-user-mobile-open.png)

![Navigation Go restaurée utilisateur mobile](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-user-wrapped-mobile-open.png)

## États complémentaires Go

- [Administrateur multi-serveurs](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-admin-multi-desktop-open.png).
- [Utilisateur connecté au serveur de secours](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-user-backup-mobile-open.png).
- [Recherche globale](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-user-wrapped-desktop-search.png).
- [Santé avec Nettoyage imbriqué](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-admin-health.png).
- [Planificateur avec sections empilées](https://raw.githubusercontent.com/maelmoreau21/JellyTrack/6f0109c03a86b544dca706dbfcae717168d92e1b/docs/navigation-captures/go-admin-scheduler.png).

Les deux dernières pages n'ont pas de capture historique valide : la comparaison de leurs hiérarchies repose sur leurs sources, comme indiqué dans le rapport.
