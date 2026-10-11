# Wrapped : contrôle borné des slides et du partage

Contrôle du 10 octobre 2026 après reprise quota. Aucune modification produit, aucun serveur démarré, aucune fixture réinitialisée. Sources : composant historique `scratch/navigation-qa/main-reference/src/app/wrapped/[userId]/WrappedClient.tsx`, calcul historique `page.tsx`, constructeur Go courant `Pages.wrapped` dans `web/dist/assets/app.js`, agrégation courante `internal/api/analytics_recovery.go`.

## Compte et ordre des slides

Le constructeur courant contient toutes les slides historiques et conserve cet ordre : introduction → temps total → jours équivalents (si ≥24 h arrondies) → mois → heure préférée → appareil (si disponible) → genres → jour préféré → panthéon → séries (si données) → pistes (si données) → artistes (si données) → albums (si données) → films → épisodes → musique → livres (chaque catégorie seulement si durée >0) → partage.

Maximum **18**, minimum sans données **8**, pour les deux constructeurs. Aucune des deux slides supposées supprimées dans l'observation Main1/18 / Go1/16 n'est absente du constructeur Go actuel. Ne pas ajouter deux slides artificielles pour forcer un compteur.

Lecture réelle de l'API sur le serveur QA déjà existant `http://localhost:3350/api/wrapped/qa-primary-alice?year=2026` :

| Condition | Réponse courante |
|---|---|
| Durée / heures arrondies | 175010 secondes / 49 h |
| Lectures | 90 |
| Appareil | TV |
| Séries / pistes / artistes / albums | 1 / 3 / 1 / 1 résultats |
| Films / épisodes / musique / livres | 52800 / 61200 / 6010 / 55000 secondes |

Toutes les conditions pour 18 slides sont donc satisfaites par l'API courante. Exécution bornée Node VM du constructeur Go avec ces conditions : **18 slides PASS**, ordre ci-dessus. Contre-exemple sans données : **8 slides PASS**. La VM s'arrête après la construction des slides ; elle ne valide pas les événements, animations ni le rendu navigateur.

La capture antérieure 1/16 correspond à un état API/fixture/runtime antérieur qui n'a pas été conservé avec tous ses champs. Impossible d'identifier précisément les deux conditions absentes à cette époque sans inventer une explication. Classement honnête : ancien écart de compteur observé, non reproductible sur conditions/API courantes, **rendu navigateur actuel du compteur Non testé** par cet agent. Une capture finale 1/18 reste nécessaire pour clore ce point visuellement.

## Helpers, thème et partage

- Les conversions durée, années disponibles, classement, noms traduits mois/jours et catégories existent dans le constructeur courant. Les helpers ne sont pas supprimés.
- Les types configurables sont Général, Films, TV, Musique, Livres. L'année et le type sont conservés dans la query ; ordre des choix TV/Musique différent du composant historique dans la modale, hors correction de ce contrôle borné.
- Le composant historique ne possède ni slide « langue préférée », ni filtre de langue audio, ni sélection de thème Wrapped, ni export PNG programmatique. Le partage historique affiche une carte et invite à une capture d'écran (`WrappedClient.tsx:378-400`). Il serait inexact de classer l'absence d'un bouton PNG ou d'une slide langue comme suppression historique sur cette référence.
- Go conserve la carte de partage, l'invitation capture et le complément de copie du résumé dans le presse-papiers. Aucune de ces possibilités n'a été supprimée. Avant le correctif ci-dessous, l'heure préférée et les heures par catégorie historiques étaient absentes de la carte Go.
- Le gradient et la pill d'introduction ont été corrigés précédemment dans `profile.css`. Avant le correctif ci-dessous, d'autres slides réutilisaient des thèmes Go ne reproduisant pas tous les couples de couleurs historiques ; la seule existence de 18 slides ne prouve pas la fidélité de leur apparence.

`node --check web/dist/assets/app.js` : **PASS**. Aucun test navigateur effectué pour cette reprise. **Freeze : aucune modification supplémentaire produit effectuée ni nécessaire pour corriger un compteur sur la seule base des captures anciennes.** Le principal peut poursuivre la consolidation et la capture finale sans conflit d'ownership. Aucun commit réalisé par cet agent.

## Correctif autorisé ensuite : carte et fonds historiques

Le principal a ensuite explicitement autorisé une correction ciblée des données de carte et des fonds. Seuls `Pages.wrapped` dans `app.js` et les sélecteurs Wrapped de `profile.css` ont été modifiés. Aucun autre renderer, serveur ou fixture modifié.

La carte reprend désormais l'ordre et les champs `main:WrappedClient.tsx:378-400` : titre année → nom → heures de streaming → genre → heure préférée → jour préféré → heures films/séries/musique/livres, puis invitation capture en dehors de la carte. Le bouton de copie de résumé Go reste après l'invitation. Les heures de catégories sont arrondies comme main et affichées lorsque leur valeur arrondie est positive.

Chaque slide a un thème distinct quand main utilise des couleurs différentes : mois fuchsia/purple, genres et albums pink/rose, panthéon blue/indigo, artistes purple/indigo, musique catégorie green/emerald, livres amber/yellow, partage purple/fuchsia. Les autres couples correspondent également à main. Les 15 couleurs OKLCH ont été extraites du CSS du serveur Next QA déjà existant à 3341 ; interpolation exacte `linear-gradient(to bottom right in oklab, from 0%, via 50%, black 100%)`, confirmée par les règles compilées historiques. Aucun changement des conditions, du compte ou de l'ordre des slides.

Vérifications : syntaxe `app.js` **PASS** ; exécution VM du constructeur avec réponse API QA courante Alice **18 PASS** ; ordre des 18 thèmes et présence année/genre/heure/jour/catégories/copie **PASS**. Preview Chromium isolée du HTML de partage construit et des CSS source, 1440×900 et 390×844 : largeur carte 384 / 358 px, zéro débordement document/carte. Capture mobile ouverte et inspectée après la fin de l'animation d'entrée : texte et données visibles, heures des quatre catégories présentes, bouton copie accessible visuellement. Ce sont des previews statiques ciblées, **pas des captures de l'application Go reconstruite**, ni une preuve visuelle des 18 slides.

Artefacts : `wrapped-preview.json`, `captures/wrapped-share-preview-desktop.png`, `captures/wrapped-share-preview-mobile.png`. **Freeze produit final annoncé au principal après ces vérifications : aucune édition supplémentaire app.js/profile.css.** Reconstruction et captures finales du runtime à effectuer par le principal. Aucun commit de cet agent.
