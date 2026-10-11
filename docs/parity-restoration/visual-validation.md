# Validation visuelle de la restauration

La comparaison directe a utilisé les composants historiques de `main` sur `localhost:3341` et le binaire Go QA isolé sur `localhost:3350`. Les captures anciennes de `docs/final-audit/` ont été conservées. Les nouvelles preuves sont dans `docs/parity-restoration/captures/`.

## Environnements et données

- Le contrôle de 145 fichiers historiques TSX/CSS normalisés LF confirme que l'archive des composants est inchangée par rapport aux empreintes vérifiées contre `main`. La preuve est dans `visual-main-aligned-results.json`, champ `archiveIntegrity`.
- La référence emploie son adaptateur Prisma synthétique préexistant; Go utilise les vraies API et une SQLite QA isolée. Aucun remplacement de réponse navigateur ne couvre les fonctionnalités manquantes.
- Le JSON de référence a été aligné par export en lecture seule de la SQLite QA préexistante : 4 utilisateurs, 2 serveurs, 128 médias, 147 lectures, 36 événements et 2 flux. L'ancien JSON est sauvegardé dans `scratch/parity-restoration/qa-users-fixture-before-visual-align.json`.
- Empreinte du JSON aligné : `38d3696c43a4c0be6a20551fc8ebc130c9cd19927d0fe0085ca140c08e6e24cb`.
- Les données de configuration et les services externes ne sont pas intégralement comparables. Les posters, avatars, métadonnées Jellyfin externes, flux live main et métriques de services ne permettent pas une affirmation générale d'égalité des données.

## Preuves exécutées

| Preuve | Portée | Résultat |
|---|---|---|
| `visual-go-before-results.json` | 13 routes, 52 variantes avant intégration finale | Toutes rendues, aucune erreur JS ni débordement du document |
| `visual-main-results.json` | 13 routes, 52 variantes avant alignement temporel | Rendu; `/users` signale le fallback SSR historique `window is not defined` |
| `visual-main-aligned-results.json` | 11 routes, 44 variantes, même fixture exportée | Toutes rendues, aucune erreur JS; première capture dashboard encore affectée par le cache historique |
| `visual-main-stable-dashboard.json` | Dashboard après revalidation du cache `unstable_cache` de 60 secondes | Données dashboard égales à Go, hors flux live de référence |
| `visual-go-final-results.json` | 17 routes, 68 variantes sur le binaire intégré PID25620 | Toutes rendues, 0 erreur JS, 0 débordement global; 12 assets servis identiques aux sources au début de l'exécution |
| `visual-interactions-aligned-retry.json` | Main : 3 onglets dashboard, menus mobiles clair/sombre | 6 contrôles réussis; vrais graphiques visibles après attente de leur chargement |
| `visual-interactions-final.json` | Go : mêmes interactions | 6 contrôles réussis; 10/15/2 canvas sur vue d'ensemble/analyses/réseau; 0 erreur JS |
| `visual-profile-main.json` | Graphiques et historique profil sous le premier écran, clair/sombre | Captures directes comparées aux captures profil Go du sous-agent utilisateurs |
| `visual-wrapped-first-final.json` | 7 étapes Wrapped, desktop/mobile, clair/sombre, main/Go | 56 captures; comparer les titres/progressions, car le premier clic main a précédé la fin de l'hydratation |
| `visual-go-final2-results.json` | 5 routes, 20 variantes sur PID51224 | Toutes rendues, 0 erreur JS, 0 débordement global; 16 assets servis identiques aux sources au début de l'exécution |
| `visual-deep-final.json` | Analyse sous écran et profil jour/genres, main/Go, desktop/mobile clair/sombre | 24 captures; thème persisté puis page rechargée, attente de 1500ms après défilement; source des données analysée séparément |
| `visual-wrapped-final3.json` | 7 étapes Wrapped, main/Go, desktop/mobile clair/sombre | 56 captures; progression `1 / 18` à `7 / 18` attendue réellement après chaque clic |
| `visual-profile-completion-source.json` | Calcul historique des buckets sur le JSON de référence aligné | 13 terminés / 2 partiels côté main contre 14 / 1 côté Go; cause explicitée ci-dessous |
| `visual-go-final4-results.json` | 5 routes, 20 variantes sur PID52200 | 5 rendues, 0 erreur JS, 0 débordement; 16/16 assets servis conformes aux sources; 145 fichiers historiques inchangés |
| `visual-deep-final4.json` | Panneau profond et graphiques profil, main/Go | 24 captures; les trois compteurs catalogue sont désormais 110 dans les deux versions, API 200 |
| `visual-wrapped-final4.json` | 7 étapes Wrapped Go, desktop/mobile clair/sombre | 28 captures comparables aux 28 main de `final3`; compteurs réellement attendus avant chaque capture |
| `visual-profile-geometry.json` | Géométrie réelle des arcs Chart.js après correction | Rayon intérieur 60.00000003 / extérieur 90, conformes aux 60/90 de main |
| `visual-final4-summary.json` | Synthèse calculée à partir des preuves final4 | Sources, géométrie, catalogue, progression et absence de débordement contrôlés; avant restauration ultérieure de la timeline primaire |

Les captures utilisent 1440×900 et 390×844, locale française et thèmes clair/sombre. Les screenshots `*-chart.png` et `*-table.png` donnent des vues après défilement, car `fullPage` ne déroule pas tout le contenu d'un conteneur principal à défilement interne.

## Constats pour la matrice

- `/` — Textes : les libellés historiques du moniteur, du dernier poll, de la dernière synchro, de la dernière sauvegarde et du choix « Tout » sont restaurés dans les captures Go intégrées.
- `/` — Données : les captures stables main et Go donnent 76 lectures, 34% DirectPlay, 42,2h, 4 utilisateurs actifs; aujourd'hui 16 lectures, 8.7h et 4 utilisateurs; catégories 10 films, 30 séries/épisodes, 27 titres musicaux, 9 livres. Les différences initiales 67/36,4h provenaient du cache de référence; leurs preuves sont conservées, sans les utiliser comme verdict final.
- `/users/[id]` — Sections/Ordre : les 11 indicateurs et les groupes de graphiques, genres, fiche technique et historique sont présents dans le même ordre. Les histogrammes jour et heure et la répartition de complétion ont été inspectés réellement sous le premier écran.
- `/users` — Responsive : la page Go intégrée ne déborde pas globalement à 390px. Les contrôles fonctionnels du défilement horizontal du tableau sont dans la suite dédiée du sous-agent utilisateurs.
- `/logs` — Apparence/Tableaux : contrôle restauré des colonnes, dates courtes sur deux lignes, utilisateurs en lien cyan, posters et largeur de la table. Les dimensions et certaines icônes restent des différences de détail; aucune identité pixel par pixel n'est affirmée.
- `/media/collections` — Sections/Ordre : KPI volume/contenu/temps et cartes de collection ont été inspectés; certaines dernières corrections de filtres et d'icônes ont été effectuées après le binaire capturé dans `visual-go-final-results.json`. Une capture supplémentaire de ces corrections est requise avant de les attribuer à ce binaire.
- `/wrapped/[userId]` — Apparence : la comparaison des étapes montre l'anneau horloge historique absent dans le premier binaire intégré, remplacé alors par un nombre de jours; ce constat a été transmis au principal pour correction. Le bouton global de fermeture est réellement visible; son existence est contrôlée dans `index.html`/`navigation.js`, pas seulement dans `app.js`.

## Nouvelle inspection après corrections

Le binaire PID51224 confirme les filtres serveurs sous forme de boutons « Tout » / serveurs dans Collections, les quatre collections consolidées, les unités et le placement historique 1+2+1 des indicateurs. Les nouvelles icônes Terminal de l'en-tête journaux et de l'onglet Système sont réellement visibles. Le détail film montre les icônes de sections de télémétrie. Les alignements et nuances de fond ont encore fait l'objet de corrections après ces captures : `final2` conserve la preuve intermédiaire et ne certifie pas ces modifications ultérieures.

Les vrais graphiques profil sous écran sont maintenant comparés directement. Légende Partiel / Terminé, départ du donut à 3h, grilles pointillées, barres genres de 20px et ticks horaires visibles sont restaurés. Les moteurs Chart.js et Recharts conservent des différences de tracé, d'espacement, d'axes et d'infobulles. Le maintien du calcul Go des règles musique produit aussi une différence de données explicite.

La source historique `UserStatsCharts.tsx` sélectionne `media.type` sans `collectionType`. `getCompletionMetrics` utilise alors `getDefaultLibraryRule(type)`, dont `normalizeLibraryKey` ne reconnaît pas `Audio`, `Track` ou `MusicAlbum` comme `music`. Main applique donc le seuil générique 80/20/10 aux titres audio sur cette page. Go conserve les règles musique existantes 60/30/12 : les mêmes sessions donnent 13 terminés et 2 partiels dans main contre 14 et 1 dans Go. Le premier calcul reproduit par l'agent visuel utilisait par erreur la règle intentionnelle musique et concluait 14/1 pour main; ce constat est annulé. `visual-profile-completion-source.json` contient désormais la reproduction des règles réellement invoquées par la source historique. La différence de données est justifiée, elle ne doit pas être masquée par un verdict d'égalité.

Les captures Wrapped `final3` montrent l'horloge dans son anneau de 128px, le bouton de fermeture SVG et le pied `2026 • GENERAL`. Elles montrent aussi le vrai client « Android TV » choisi par les données. Les premières captures `final2` desktop main ont parfois capturé l'introduction au lieu de l'étape annoncée pendant l'hydratation : elles ne servent pas de comparaison par étape. Le harnais `final3` vérifie le compteur de progression avant chaque capture. L'encart de l'appareil favori différait encore dans ce binaire (main encadré/majuscules, Go texte simple); le principal a reçu le constat.

L'analyse profonde possède désormais les trois cartes Réalisateurs / Acteurs / Studios avec leurs icônes, rangs et lignes cliquables. La première comparaison directe a identifié un vrai écart de contrat : main comptait 110 titres du catalogue, tandis que Go affichait 147 lectures. La correction métier est confiée au propriétaire backend pour fournir un comptage du catalogue sans modifier les statistiques de lectures du dashboard. Cette preuve intermédiaire ne clôture pas le critère Données avant la capture après correction.

La capture `final4` valide ensuite la correction : Go appelle `/api/stats/deep?catalogue=true` et affiche 110 titres pour chacun des trois classements, comme main. Les trois valeurs sont contrôlées sur desktop/mobile en clair/sombre. La preuve antérieure 147/110 est conservée. Les nouveaux alignements de collections placent le contenu à x312 sur desktop, comme main, et gardent les filtres en boutons ainsi que le regroupement quatre collections. Des espacements verticaux, fonds, détails de badges et trames restent différents; le verdict ne certifie pas l'identité pixel par pixel de tous ces éléments.

Un autre contrôle visuel a trouvé que `cutout:60` et `radius:90` ne produisaient pas un rayon intérieur de 60 dans Chart.js : le runtime mesurait 42.687747. La correction du découpage à 66.6666667% donne maintenant le rayon réel 60.00000003 pour un rayon extérieur de 90. La preuve initiale est sauvegardée dans `visual-profile-geometry-before-cutout-fix.json`. Les captures profil `final4` utilisent cette correction et les thèmes réellement rechargés.

L'appareil favori Wrapped dispose maintenant de son encart, de la bordure et du fond transparents, du texte en majuscules et de la taille 36px. L'horloge, les genres en barres, le client Android TV et le pied GENERAL sont visibles sur les captures Go `final4`, comparées aux étapes main `final3` dont les compteurs sont certifiés. Le lien Go supplémentaire « Personnaliser » demeure en bas des autres étapes afin de préserver cette interaction existante; main ne l'affiche que dans l'introduction.

Le bandeau du flux actif Go était en pause dans certaines captures pendant les contrôles fonctionnels sur la SQLite synthétique. Main dispose d'un adaptateur qui ne fournit pas ces flux live. Cet état du bandeau n'est pas utilisé comme preuve de comparaison de données avec main. Les contrôles du flux réel Go relèvent de la suite fonctionnelle.

Après `final4`, le principal a demandé une restauration supplémentaire de la timeline primaire du détail média. Les captures `final4` restent des preuves intermédiaires des panneaux inspectés, mais ne prouvent pas cette modification ultérieure. Une nouvelle comparaison film/épisode sous écran est requise avant clôture de ce critère.

## Contrôle ciblé de navigation et géométrie Collections

`visual-collections-metrics.json` contient les dimensions, polices, marges, espaces, couleurs/fonds et bordures calculés réellement dans les deux applications. L'attente du lien Analyse Profonde confirme l'hydratation du rôle administrateur avant ces mesures. Les positions horizontales x312 sont alignées; le premier KPI était encore à y223.8 avec 157.6px de hauteur côté Go, contre y247 et 170px côté main. La navigation était à y32 côté Go contre y24 côté main; les cartes main emploient un fond en dégradé, un rayon de 16px et une disposition en-tête/contenu avec 24px d'espace, au lieu des variantes Go capturées. Ces écarts visuels ont été transmis pour correction; la présence de quatre collections ne suffit pas à clôturer Apparence.

Les identités de connexion utilisées pour les captures ne constituent pas deux comptes Jellyfin équivalents : Go utilise son administrateur local `mediaadmin` avec `jellyfinUserId=local-admin`, et le token NextAuth QA de référence a été signé avec la même chaîne `local-admin` artificielle. Main affiche Mon Compte pour toute chaîne non vide (`Sidebar.tsx`), donc un lien vers `/users/local-admin`; Go exclut ce marqueur de compte local (`navigation.js`) afin de ne pas proposer un profil Jellyfin inexistant. Cette différence n'est pas une preuve de régression pour un véritable utilisateur Jellyfin.

Le lien Comparaison de serveurs apparaît en Go mais pas dans la référence malgré les deux rôles administrateur confirmés. Main lit `process.env.JELLYTRACK_MODE` dans `Sidebar.tsx`, un composant client, avec valeur par défaut `single`. `next.config.ts` n'exporte que `APP_VERSION`, et aucun `JELLYTRACK_MODE` public; Go utilise le vrai mode fourni par `/api/navigation`. Le comportement observé correspond à cette limitation de configuration historique côté navigateur. Le lien Go reste préservé. Les quatre onglets médias Tous les Médias / Populaires / Analyse Profonde / collections sont réellement présents dans les deux versions après hydratation; les captures avant chargement de session ne servent pas à conclure leur absence.

## Limites et différences conservées

Les graphiques Canvas/Chart.js et SVG/Recharts ont des orientations, légendes, grilles et détails de tracé différents. Les regroupements, valeurs et interactions ont des preuves ciblées; ces preuves ne certifient pas tous les pixels, tous les états combinatoires ni chaque infobulle.

Main normalise deux fois certains débits audio dans la page journaux; sur la fixture vidéo 12Mbps, il affiche 12kbps. Le premier binaire Go affichait 12000kbps dans la colonne audio. Après correction, Go affiche `—` quand aucun débit audio réel n'est disponible, au lieu d'afficher le débit vidéo sous un libellé audio. Cette différence doit être décrite explicitement : réintroduire une erreur d'unité historique n'est pas une preuve de conformité des données.

Les premiers contrôles d'interactions main ont attendu trop peu longtemps : graphiques encore en placeholders et clic du menu mobile pendant hydratation, puis fermeture hors viewport. `visual-interactions-aligned.json` conserve cet échec. La nouvelle exécution `aligned-retry` attend les composants et valide les vrais menus/graphiques. Le fallback SSR historique `/users` est conservé comme limitation de référence.

La référence 3341 s'était arrêtée avant les premières tentatives finales : `visual-deep-reference-unavailable.json` et `visual-wrapped-reference-unavailable.json` conservent `ERR_CONNECTION_REFUSED`. Seul le lanceur QA historique a été redémarré; les composants main sont restés inchangés. Après démarrage, la compilation initiale et l'hydratation du panneau profond ont dépassé la première attente de 30s (`visual-deep-main-heading-timeout.json`). La nouvelle exécution a attendu la réponse réelle de `/api/stats/deep` (200), puis a observé les cartes historiques rendues. Aucun faux panneau ni remplacement de réponse navigateur n'a été ajouté pour obtenir ces captures.

Les corrections du code produit et le nombre de cellules clôturées sont détenus par le principal et les sous-agents propriétaires; ce rapport fournit des preuves indépendantes et ne transforme pas une route rendue en conformité visuelle générale.
