# Référence historique — Dashboard, Analytics, Network, Newsletter, Wrapped

Audit statique du 10 octobre 2026 par le sous-agent réel `analytics_reference`. Référence historique : `main` a59a28613e63e86106c61827167d355b47147f42 ; Go avant restauration : HEAD 0c658f06e6e3894c9f8faf35eecf93b9e8c70e54 et corrections locales paramètres préservées. Les états ci-dessous décrivent les écarts **avant correction**. Aucun rendu ou test runtime n'est prétendu par cet audit.

Sources historiques lues avec `git show main:…`, sans checkout : `src/app/page.tsx`, `src/components/dashboard/{DeepInsights,GranularAnalysisClient,NetworkAnalysis,MediaFilter,ServerFilter,SystemHealthWidgets,HardwareMonitor,DraggableDashboard,CollapsibleCard,PredictionsPanel}.tsx`, `src/components/charts/{ComposedTrendChart,YearlyHeatmap,AttendanceHeatmap}.tsx`, `src/components/TimeRangeSelector.tsx`, `src/app/newsletter/page.tsx`, `src/components/newsletter/NewsletterShareClient.tsx`, `src/app/wrapped/[userId]/{page,WrappedClient}.tsx`. Sources Go : `web/dist/assets/app.js` fonctions `dashboard`, `newsletter`, `wrapped`, `ChartHelper`; `internal/api/{handlers,filters}.go`, `internal/stats/{dashboard,analytics,filter}.go`.

## Matrice Dashboard

| ID | Section et ordre main | Contrôles et données historiques | Go avant correction / action nécessaire |
|---|---|---|---|
| D01 | En-tête : titre + filtre médias, serveurs dessous, période à droite | Médias multi-sélection exclusion Movie/Series/MusicAlbum/Book ; serveurs multi-sélection persistée ; périodes 24h/7d/30d/90d/365d/all/custom avec dates | Ordre proche ; médias sélection unique via type, serveurs aussi sélection unique ; rétablir les exclusions/multi-sélections sans retirer le filtre type URL |
| D02 | Santé système | Moniteur, dernier sondage, synchro, sauvegarde, lien santé ; cartes flux actifs, orphelins, cache si Valkey actif, bibliothèques exclues | Présent au bon emplacement ; affiche cache même désactivé ; traductions FR fixes ; rétablir condition/cache et libellés |
| D03 | Moniteur matériel | CPU%, RAM%/total physique, température ou N/A ; polling | Présent ; données Go mémoire tas différente de RAM système, garder libellé explicite ; ne pas inventer RAM/CPU/température manquants |
| D04 | Bandeau aujourd'hui | Lectures, heures, utilisateurs actifs, indépendant période | Présent au bon emplacement, données API dashboard |
| D05 | Onglets | Vue d'ensemble, analyses approfondies, réseau | Présents, chargement lazy Analytics/Network ; conserver |
| D06 | Toolbar ordre | Modifier/terminer, boutons haut/bas, localStorage `JellyTrack-dashboard-order` | Présent ; même mécanisme 10 blocs ; conserver validation du tableau Go |
| D07 | Bloc0 : métriques, 5 cartes | Flux actifs ; lectures/croissance/précédente période ; DirectPlay ; heures/croissance/lien logs ; actifs/croissance/total inscrits | Structure préservée ; descriptions users/total réduites, titres FR fixes ; restaurer descriptifs/traductions |
| D08 | Bloc1 : 4 cartes types | Film, épisodes, musique, livres ; lectures+heures ; liens logs filtrés | Présent, ordre conservé ; catégories livres AudioBook mais filtre Book couvre types à vérifier |
| D09 | Bloc2 : volume (3/4 largeur), catégories (1/4) | 4 courbes heures films/séries/musique/livres, légende toggle ; donut catégorie clickable logs | Présent mêmes emplacements ; Go Chart.js légende et drilldown catégorie existants ; hauteurs exactes à vérifier visuellement |
| D10 | Bloc3 : lectures quotidiennes par bibliothèque | Courbes par bibliothèque, légende, vrai trendData | Présent ; conserver |
| D11 | Bloc4 : heatmap annuelle | Année navigation, types disponibles dynamiques, cellules/details/tooltip, mois/jours et niveaux ; indépendant période | Présent ; Go types hardcodés tous visibles, remplacer par API libraryTypes si possible ; données annuelles réelles |
| D12 | Bloc5 : fidèles + plateformes | Classement heures/lien profil ; donut plateformes/lien logs | Présent ; liste Go slice5 ; traductions et mêmes données à vérifier |
| D13 | Bloc6 : live | Bande passante/count, toggle cartes/timeline ; posters, titres/liens, progression, méthode/qualité ; message/stop ; polling4s pause hidden | Présent au bon endroit ; détails coordonnés audit logs ; serverId images/actions et réalité bande passante/progression requis |
| D14 | Bloc7 : activité heure + jour semaine | Histogrammes cliquables/details ; traduction jours | Présent ; jours/fallbacks FR et détails filtre contexte à vérifier |
| D15 | Bloc8 : mensuel 2/4, complétion 1/4, famille clients 1/4 | Navigation année, 12 mois, lien logs ; donuts complétion/familles | Présent ; ne pas réintroduire accordéon : main CollapsibleCard est déprécié et n'est plus pliable |
| D16 | Bloc9 : charge serveur | Courbe peakStreams, légende, données historiques serveur | Présent, fin des blocs |
| D17 | Après blocs : prévisions | Tendances top8 + pics top10, croissance/confiance, lien média, mention base historique | Go top6 et note de base absente ; rétablir top8/note/traductions, conserver EMA Go et vraies données |
| D18 | Filtres transverses | Paramètres excludeLibs + réglages DB, excludeTypes, serveur, dates | filters.go ignore excludeLibs/excludeTypes malgré champs DashboardFilter ; compléter backend et propagation sans casser exclusions DB |
| D19 | Responsive/visuel/langues | Colonnes1 mobile, 2 tablette, métriques5 et bento3:1 desktop ; glow, surfaces, dark/light | CSS Go similaires sans preuve pixel ; nombreux titres FR fixes ; traduire avec dictionnaires actuels, captures finales nécessaires |

## Matrice Analytics : ordre strict DeepInsights puis Granular

| ID | Position main / interaction | Go avant correction / restauration |
|---|---|---|
| A01 | Deep avant Granular | Inversion : containers granular puis deep ; inverser les containers |
| A02 | Deep rangée1 topFilms + topSéries | Go4 cartes même rangée desktop ; restituer rangée 2 cartes et lien `/media?q=title` |
| A03 | Deep rangée2 topAlbums + topLivres | Go musique puis livres sur même rangée quatre ; restituer rangée2 et liens ; conserver heures supplémentaires Go |
| A04 | Deep genres, rangs/barres/lectures | Présent mais non cliquable ; rétablir `/media/all?genre=…` |
| A05 | Deep clients + méthodes | Présent mais clients div ; rétablir `/logs?client=…` avec contexte filtres, doughnut méthodes |
| A06 | Deep résolutions + appareils | Présent donuts ; onClick absent ; rétablir logs `resolution` et `client` sur valeurs brutes |
| A07 | Deep audio + sous-titres | Rangée complètement absente, même si présent plus bas Granular ; rétablir deux donuts Deep + logs audio/subtitle |
| A08 | Acteurs/réalisateurs/studios Go | Main calcule acteurs/réalisateurs mais ne les affiche pas ; Go rangée supplémentaire à conserver après rangées historiques |
| A09 | Granular rangée1 lectures/jour **histogramme** + durée/jour **aire** | Go lectures/jour aire + lectures/lib ; déplacer durée/jour en rangée1, restaurer bar et liens dateFrom/dateTo |
| A10 | Granular rangée2 lectures/lib + durée/lib **barres empilées** | Go réparties rangées1/2, durée en aire ; restaurer pair/barres et drilldown type+date |
| A11 | Granular rangée3 moyenne lectures/h + durée/h | Présent pair ; Go titre parle total plutôt que moyenne, backend sémantique à vérifier et ne pas mentir |
| A12 | Granular rangée4 affluence7×24 + complétion/lib | Heatmap Go pleine largeur, complétion rangée suivante ; restituer pair, garder tableau overflow mobile et vraie modale detail |
| A13 | Granular rangée5 segments abandon **pie** + pire complétion **barres par titre** | Go segments en barres individuelles + complétion, pire complétion rangée3 cartes ; restaurer donut/pair/barres et drilldown |
| A14 | Granular rangée6 audio + sous-titres | Go rangée3 cartes avec pire complétion ; restaurer pair dédié et clic logs audio/subtitle |
| A15 | Drilldown quotidien/lib/complétion/audio/subtitle | Absent des charts Granular ; ajouter support options.onClick ChartHelper aire/empilé/horizontal et appliquer filtres Go existants |
| A16 | Libellés et langues | Titres/descriptions FR fixes ; réutiliser deepInsights/granular/messages dans les 10 langues actuelles, valeurs brutes pour filters |
| A17 | Chargement/erreurs | Promise.all gran/deep, epoch/pageSignal présents ; conserver protections, vider correctement charts lors de changement de tab/route |

## Matrice Network

| ID | Ordre et éléments main | Go avant correction / restauration |
|---|---|---|
| N01 | 4KPI sessions/DP, transcode%, DirectStream, durée | Même ordre/structures, vrais stats ; traductions FR fixes |
| N02 | Courbes DP/Transcode/DS horaires + barres horizontales taux client | Présents même emplacement ; tooltip/légende responsive à vérifier |
| N03 | Tableau titres plus transcodés | Colonnes média (rang), résolution, sessions, minutes, cause, client ; mêmes 6 colonnes Go ; fallback résolution HD inventé si manque : afficher inconnu |
| N04 | Géographie additionnelle Go après tableau | Absente main ; conserver et préciser périmètre toutes périodes/serveurs (API non filtrée) |
| N05 | Filtres et chargement | Même contexte URL à propager aux analytics, ne pas bloquer tout Network si geo additionnel échoue |

## Matrice Newsletter

| ID | Section historique ordonnée | Go avant correction / restauration |
|---|---|---|
| NL01 | MediaHeaderNav puis carte centrée max2xl | Header utilitaire max860 et actions en haut ; conserver nav restaurée/module médias et recentrer carte |
| NL02 | Hero256px Rewind, sparkles/glow indigo, sous-titre30j, plage locale | Supprimé, simple entête ; reconstruire hero, date locale via startDate/endDate |
| NL03 | Deux gros chiffres : heures **gauche** / lectures **droite** | Inversés (lectures puis heures), cartes génériques ; rétablir ordre/centrage/icons/glow |
| NL04 | Podium vidéo **3** avec rang, posters portrait, titre/type/heures | Top5 textuel sans posters ; rétablir podium3, préserver rang4/5 dans complément Go |
| NL05 | Une grande carte meilleur spectateur/mois, violet, heures | Top5 liste ; restaurer carte leader, conserver autres utilisateurs en complément |
| NL06 | Actions **sous** carte : PNG1080×1350, Discord | PNG disparu ; Discord en haut ; rétablir actions sous, canvas natif + téléchargement exact |
| NL07 | Busy/disabled, retour succès/erreur inline | Confirmation modale Go ajoutée à conserver ; désactiver bouton durant émission et rendre résultat lisible |
| NL08 | Données30j ZAPPING_CONDITION | newsletterData Go ignore sessions<10s ; restaurer filtre SQL partout ; image IDs déjà fournis |
| NL09 | Responsive/traductions | Carte max2xl, metrics2, topUser vertical→horizontal small ; main newsletters traduits sauf partage déjà FR fixe ; traduire nouvelles actions FR/EN fallback sans placeholder |

## Matrice Wrapped (slides conditionnelles dans cet ordre)

| ID | Structure main | Go avant correction / restauration |
|---|---|---|
| W01 | Expérience plein écran, gradient par slide, titre/sous-titre/icon ; close retour ; zones clic1/3 précédent2/3 suivant | Carte max680, fond standard ; rétablir immersion responsive/clavier/retour sûr |
| W02 | Personnaliser sur intro : année availableYears et catégorie general/Movies/TV/Music/Books ; URL year/type | Absent ; Go force currentYear UI malgré API year ; restaurer config+URL requête+slide reset |
| W03 | Intro username, année, bouton personnaliser | Remplacée par gros total ; restaurer intro distincte |
| W04 | Temps total | Fusionné intro ; rétablir slide propre |
| W05 | Temps jours+heures si total>=24h | Absent ; calcul authentique totalSeconds |
| W06 | 12 mois heures, barre relative+heures | Absent ; monthCounts Go = nb lectures (pas heures), demander monthlyHours ; ne pas convertir sessions en heures |
| W07 | Pic horaire + nombre sessions | Fusionné slide habitudes + fallback21h inventé pour0 ; retirer fallback falsifiant minuit, pas de soirée affirmée sans donnée |
| W08 | Appareil préféré si existe | Donnée topClients déjà présente mais métrique nb lectures != durée ; demander topDevice pondéré secondes |
| W09 | Genres top5 | API topGenres existe, UI absent ; restaurer rangs/genre principal |
| W10 | Jour favori | Fusionné habitudes ; restaurer slide day et jours locale |
| W11 | Panthéon médias tous types top5 | Go topFilms4 uniquement ; demander topMedia global |
| W12 | Séries top5 si existe | Go top4, groupé titres épisodes côté API ; agréger parent saison→série |
| W13 | Pistes top5 si existe | API topMusic disponible mais UI absent ; restaurer topTracks |
| W14 | Artistes top5 si existe | Absent ; utiliser artiste réel si disponible, jamais fabriquer artistes |
| W15 | Albums top5 si existe | Absent ; parentId MusicAlbum pour vraies données |
| W16 | Catégories films/épisodes/musique/livres, chacune si durée>0 ; total heures et top5 | Toutes absentes ; demander categories payload |
| W17 | Partage final username/année/heures/sessions/topgenre/jour | Carte résumée actuelle (film/série) ; enrichir et conserver copier résumé ajout Go |
| W18 | Progress segments cliquable ? main progress non clickable ; auto8s pause config ; compte slides/catégorie ; précédent/suivant | Boutons/compte5 présents, auto/progress absents ; restaurer timer nettoyé à route/config/document hidden ; garder boutons accessibles |
| W19 | Autorisation propre/admin, visible, période currentYear uniquement | Go propre/admin existe ; période appliquée aussi années passées, écart backend à corriger ; conserver résolution Go me/@me |
| W20 | Langues wrapped.* et jours/mois, responsive title4xl/5xl, listes/pictos/transitions | Tout FR fixe, UI tronquée ; réutiliser dictionaries, reduced-motion, overflow scroll petit écran |

## Validation restante

Audit sources uniquement : captures comparatives runtime non exécutées ici, authenticité des mesures matériel et données externes dépend des environnements. Test final nécessaire : dashboard dates personnalisées/multi-catégories/multi-serveurs, ordre persistant ; tous drilldowns chart→logs avec filtres ; analytics paire/ordre/moyennes ; network erreurs géo isolées ; newsletter0/top3+compléments/PNG/Discord sans envoi externe ; Wrapped année/type/0/minuit/catégories/auto8s/close/propriété/période, mobile360px et desktop, FR/EN et dark/light. Les textes fixes dans main des actions newsletter sont historiques mais leur traduction supplémentaire ne doit changer ni organisation ni données.

Optimisation token-saver appliquée : inventaire ciblé et plages par symbole, lecture `git show` sans répéter app.js entier, référence unique ; aucune omission volontaire de contrôle pour réduire les tokens.
