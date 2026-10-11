# Corrections de fonctionnement — 11 octobre 2026

À la demande de l’utilisateur, ce lot traite les bugs de fonctionnement signalés après passage à l’image develop. Il ne poursuit pas la reproduction de main. La matrice historique de parité et ses constats sont conservés ; ces nouveaux constats ont leurs propres identifiants.

Base : develop `0356455`. Livraison : codex/frontend-recovery, avancée depuis cette base, sans fusion automatique. Aucun conteneur utilisateur, fichier .env ou base réelle n’a été remplacé. Le seul serveur reconstruit est la fixture locale ignorée scratch/media-pages-qa, port 3350.

## Registre des corrections

Tous les statuts « corrigé » signifient corrigé et vérifié localement, pas déjà déployé sur le serveur utilisateur.

| ID | Constat et correction | Fichiers modifiés | Preuve / tests | Statut |
|---|---|---|---|---|
| R001 | Retrait du bloc Compléments Go et des références DOM dans la navigation ; autres fonctions accessibles par leurs pages existantes | navigation.js | browser-results.json : sidebar sans go-navigation-extras ; suite core sans erreur JS | Corrigé |
| R002 | Ajoutés récemment : Tout, Films, Séries, Musique, Livres directement sélectionnables, plusieurs catégories possibles ; livres audio et pistes inclus | media-recovery.js, app.css | browser : cinq boutons, musique puis livres, reset Tout, conservation des filtres des autres pages, desktop/mobile clair/sombre | Corrigé |
| R003 | Santé ne dépend plus du nettoyage ; chargement à la demande, états inconnus explicites, erreur et réessai ; requête SQL de nettoyage calculant les médias lus une seule fois | admin.js, admin_recovery.go | settings-browser.json : nettoyage volontairement bloqué puis 503 ; TestCataloguePageWithThousandsOfItemsKeepsRealCounts et TestRecoveredCleanupUsesDateAddedAndKeepsServerScope | Corrigé |
| R004 | Réduction du coût CPU/mémoire des validations répétées du plugin : cache positif borné à 16 entrées et une minute, empreintes uniquement ; révocation et expiration vérifiées à chaque événement | events.go, key_cache.go | TestCachedPluginKeyStillChecksRevocationAndPreviousExpiry ; TestWarmPluginKeyAvoidsScryptAllocations : une allocation par vérification chaude ; aucune clé invalide mise en cache | Corrigé |
| R005 | Couleurs et typographie des options de listes natives adaptées au thème | app.css | browser : couleurs calculées des options ; contrôle visuel Go | Corrigé |
| R006 | Journaux : pochettes audio carrées, épisodes horizontaux, images contenues sans recadrage forcé | history.js, app.css | browser : wrappers audio 48×48 ; images Jellyfin de production non inspectées | Corrigé |
| R007 | Configuration Jellyfin accessible lorsque aucun serveur n’existe, y compris en mode single | settings.js | settings-browser : réponse vide single explicitement interceptée, formulaire affiché ; browser : serveurs enregistrés réellement visibles | Corrigé |
| R008 | PlaybackProgress actualise aussi pluginLastSeen, au maximum toutes les dix secondes ; une lecture longue ne dépend plus d’un Heartbeat distinct pour l’état en ligne | events.go | TestPlaybackProgressKeepsPluginPresenceFresh envoie un véritable événement autorisé puis relit SQLite | Corrigé |
| R009 | Synchronisation : mise à jour du serveur configuré lors de résolution de son véritable identifiant Jellyfin, sans tenter une seconde insertion du même Server.id | sync.go | TestSyncResolvesConfiguredServerWithoutChangingInternalID : deux synchronisations HTTP simulées, identifiant interne et média existant préservés | Corrigé |
| R010 | Reprise récente à position non nulle : même ligne pour serveur/utilisateur/média/client/appareil/IP correspondants ; fenêtre configurée respectée ; changements de média clôturent l’ancienne ligne ; démarrages simultanés sérialisés | events.go | session_resume_test.go : reprise et durée conservées, relecture à zéro, clients parallèles, fenêtre désactivée/expirée, changement Start/Progress, 12 démarrages concurrents | Corrigé |
| R011 | Connexion : menu de dix langues avec vrais fichiers drapeaux PNG, choix persistant et fermeture Escape | app.js, app.css | deux suites navigateur + core : drapeaux décodés, changement/rechargement, clavier ; login-mobile.png | Corrigé |
| R012 | Mon compte résout /users/me avec le serveur de connexion et les variantes UUID ; aucun utilisateur Jellyfin fictif créé pour une connexion locale | handlers.go, navigation.js, app.js | account_runtime_test.go : deux serveurs et comptes homonymes, UUID avec/sans tirets, compte local sans lien ; tests existants d’isolation de profil | Corrigé |
| R013 | Compteur et liste d’orphelins liés au playbackId et au serveur ; flux expirés clôturent seulement leur historique sans autre flux actif, au dernier ping observé et sans changer la durée | admin_handlers.go, admin_recovery.go, telemetry.go | orphan_sessions_test.go ; TestExpiredStreamsCloseOnlyTheirUnobservedHistory : flux actif parallèle et anciennes lignes sans flux préservés, formats SQLite/ISO acceptés | Corrigé |

**13 corrections vérifiées localement. Deux suivis restent ouverts :** R014, mesure des chargements/CPU/RAM sur la véritable instance ; R015, examen des anciens orphelins pour distinguer événements importés et arrêts manquants. Aucune suppression, fusion rétrospective ou clôture massive de ces anciens enregistrements n’a été effectuée.

## Résultats

- `go test ./...`, `go vet ./...`, `go build ./...` réussis ; nouveau nettoyage de flux revérifié après son dernier ajustement.
- Syntaxe des dix fichiers JavaScript embarqués vérifiée ; `git diff --check` réussi.
- 84 contrôles navigateur réussis : 24 dans browser-results.json, 10 dans settings-browser.json, 50 dans core-runtime.json. Core vérifie aussi les assets effectivement embarqués, les droits utilisateur/anonyme/admin, graphiques, exports et interactions existantes.
- Charge synthétique comparable : 3 000 films + 3 000 lectures, nettoyage 1,97 s avant / 22 ms après ; 3 000 séries + saisons + épisodes (9 000 médias) et 3 000 lectures, 8,71 s avant / 58 ms après. Une fixture renforcée ensuite, avec anciens médias et candidat réellement jamais lu, conserve les bonnes listes : 49/84 ms. Ces temps sont locaux, pas des mesures du serveur utilisateur.
- Le catalogue lui-même n’a pas reproduit le blocage : environ 28 ms pour les films et 130–179 ms pour la hiérarchie. Son code de calcul n’a pas été réécrit sans nécessité mesurée.

## Limites précises

La base SQLite et les identifiants de connexion utilisés sont exclusivement des fixtures de QA. Les tests HTTP Jellyfin reproduisent le conflit de serveur ; ils ne valident pas le réseau, la clé ou la configuration du Jellyfin utilisateur. Le cas single vide et la panne 503 de nettoyage sont explicitement injectés dans le navigateur. Aucun gain global de RSS, aucune absence générale de fuite et aucun chiffre de mémoire en production ne sont affirmés. Les 50–70 Mo signalés ne suffisent pas à eux seuls à conclure à une fuite.

Le délai GET de 30 secondes borne l’attente des en-têtes HTTP ; le corps JSON n’a pas de délai distinct. Les mutations/importations/sauvegardes ne reçoivent pas ce délai. Le navigateur annule les lectures de la page quittée. L’apparence des options natives peut dépendre du système d’exploitation.

Captures : uniquement la version Go actuelle, sans prétendre à une comparaison directe avec main. Absence de débordement horizontal vérifiée en 1440 et 390 px, thèmes clair/sombre.

## Rejouer

```powershell
go test ./... -count=1
go vet ./...
go build ./...
$env:PLAYWRIGHT_MODULE='C:\Users\Mael\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/runtime-regressions/browser.cjs
node scripts/runtime-regressions/settings-browser.cjs
$env:CORE_RESULTS_DIR=Join-Path (Get-Location).Path 'docs/runtime-regressions'
node scripts/parity-restoration/core.cjs
```

Les commandes navigateur supposent le serveur de fixture 3350 lancé par scripts/media-pages-qa/run-isolated.py. Elles n’utilisent aucune instance de production.

## Suivi tableau de bord, albums et performances

Les nouvelles corrections et leurs limites sont détaillées dans [DASHBOARD_ALBUM_PERFORMANCE.md](DASHBOARD_ALBUM_PERFORMANCE.md). Elles sont locales et ne constituent pas une validation de la synchronisation ni du CPU/RAM de production.
