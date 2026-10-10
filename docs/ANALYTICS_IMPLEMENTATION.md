# Restauration Dashboard, Analytics, Network, Newsletter et Wrapped

Implémentation coordonnée par le sous-agent réel `analytics_reference`, après inventaire exhaustif dans `ANALYTICS_REFERENCE.md`. Périmètre exclusif : `web/dist/assets/app.js` fonctions `dashboard`, `newsletter`, `wrapped`, helpers Chart.js ; nouveau `web/dist/assets/analytics-recovery.css`. Les paramètres/admin locaux, le routeur et les modules des autres agents ne sont pas modifiés dans ce périmètre. Le CSS est chargé et `data.serverId` transmis aux helpers globaux message/arrêt.

## Corrections réalisées

| Pages / IDs de référence | Résultat livré |
|---|---|
| Dashboard D01/D18 | Filtre multi-catégories historique via excludeTypes, query type existante conservée ; excludeLibs propagé ; multi-serveurs sélection indépendante, localStorage/cookie historique ; mêmes filtres dashboard/analytics/network/drilldowns |
| Dashboard D02 | Carte cache masquée lorsque Valkey désactivé, métriques matérielles Go identifiées sans inventer RAM système |
| Dashboard D04–D16 | 10 blocs existants et leur ordre conservés, bibliothèque annuelle dynamique sur libraryTypes API, vrais contenus et détails, traductions des principaux titres/datasets |
| Dashboard D13 | Progression0% authentique, images avec serverId/fallbackId, formats audio carré/épisode16:9, liens média, actions serverId, DirectStream correctement identifié, bande passante N/A si incomplet, poll4s interrompu document hidden |
| Dashboard D17 | Top tendances8 historique, pics10, note base des prévisions ; contrôle pageSignal au retour API |
| Analytics A01–A08 | DeepInsights avant Granular ; topFilms/Séries puis Albums/Livres en 2 colonnes ; liens catégories/genres/clients ; audio et sous-titres rétablis à leur emplacement Deep ; drilldown résolution/appareil/audio/subtitle ; figures acteurs/réalisateurs/studios Go préservées après sections historiques |
| Analytics A09–A17 | 6 rangées historiques exactes : quotidien lectures/durée, bibliothèque lectures/durée, horaire lectures/durée, affluence/complétion, segments abandon/pire complétion, audio/sous-titres ; lectures quotidiennes histogramme, bibliothèques barres empilées, segments donut, barres sous les titres abandonnés ; clics logs date/bibliothèque/segments/audio/sous-titres ; titres/descriptions dictionnaires existants |
| Network N01–N05 | KPI→graphiques→tableau inchangés ; libellés historiques et résolution inconnue explicite ; géographie Go conservée et erreur API geo isolée de la partie historique |
| Newsletter NL01–NL09 | Hero Rewind, dates locales, heures gauche/lectures droite, podium3 posters, carte leader violet ; actions sous la carte ; canvas PNG1080×1350 avec les vraies valeurs ; bouton Discord avec confirmation Go préservée et état busy/retour inline ; tops Go restants dans section complémentaire |
| Wrapped W01–W20 | Plein écran, gradients, intro/personnalisation, année/type URL ; temps, jours conditionnels, mois heures, pic, appareil, genres, jour, panthéon, séries/pistes/artistes/albums conditionnels, catégories conditionnelles, partage final ; 8s auto/progression, pause config/onglet masqué et nettoyage route, précédent/suivant/clavier, fermeture profil, modal configuration focus/Escape ; copie résumé Go préservée |

Les nouveaux contrats Wrapped et Newsletter sont implémentés par l'intégrateur dans `internal/api/analytics_recovery.go`. Les filtres graphiques utilisent `library` (nom de bibliothèque réel), `device`, `completion`, `excludeTypes`, `excludeLibs` : l'agent `logs_reference` coordonne leur prise en charge côté historique. Les heures mensuelles Wrapped viennent de `monthlyHours`, jamais de `monthCounts` (nombre de lectures). Les titres, données externes et sous-titres interpolés sont échappés ; les classements supplémentaires sont préservés.

## Vérification effectuée dans ce périmètre

- `node --check web/dist/assets/app.js` : succès après chaque reconstruction et après corrections finales.
- `git diff --check -- web/dist/assets/app.js web/dist/assets/analytics-recovery.css` : succès.
- Contrats frontend comparés aux champs du nouveau backend réel `analytics_recovery.go` (monthlyHours, years, categories, peaks, ranks, ISO dates).
- Contrôle statique : intégration des renderers médias/détails dans le module médias attribué ; conservation settings/admin et cleanup, absence d'introduction de React/Next/TS/Prisma ; PNG natif Canvas, Chart.js existant uniquement.

La validation navigateur, les filtres API et les captures ont été terminés après intégration ; voir [MEDIA_PAGES_QA.md](MEDIA_PAGES_QA.md). Les seuls contrôles syntaxe/static de cet agent ne constituaient pas une preuve visuelle.

## Limites explicites à contrôler

Les mesures RAM système de main diffèrent du tas Go : le frontend conserve la mesure disponible et son libellé explicite. Les graphiques horaires Granular sont alimentés par les agrégats API actuels ; le backend doit garantir leur sémantique si le libellé historique utilise « moyenne ». Les captures des deux runtimes, dark/light, FR/EN, viewport360px et desktop restent nécessaires pour confirmer l'espacement exact. Certains messages d'erreur/détails secondaires historiques Go restent en français ; les titres/sections principaux restaurés et Wrapped utilisent les dictionnaires existants. L'envoi réel Discord, les commandes réel Jellyfin et la provenance géographique dépendent de services connectés ; aucun envoi externe n'a été exécuté durant cette implémentation.

## Économie de contexte

Lectures ciblées par symboles/plages, référence Git sans checkout et réutilisation des mêmes éléments DOM/API. Le coût token n'a pas été mesuré : aucune économie chiffrée n'est revendiquée. Tous les écarts d'ordre et d'interaction identifiés ont été traités avant intégration, sans réintroduire de framework ni de données artificielles.

## Finalisation backend et visuelle

Après comparaison supplémentaire avec main, l'agent puis l'intégrateur ont corrigé les calculs dans `internal/stats/` : cumul utilisateur/serveur/média et seuils historiques, durées inconnues omises, sommes avant arrondi, parent séries/albums, langues/codecs, appareils réels, causes multiples de transcodage, classement clients≥2sessions et top8. Dashboard/Deep excluent les sessions terminées<60s ; Granular/Network les incluent comme main. Des tests vérifient cette différence et l'égalité des buckets SQL utilisés par les liens historique.

Les dernières captures ont conduit à restaurer le sélecteur de période, les petits filtres à côté du titre, les libellés/descriptions de tous les graphiques Overview et des cartes catégories, ainsi que largeur/paddings/icônes de Rewind. Les ressources du processus sont placées après les sections historiques ; aucune RAM système n'est simulée. Le chiffre0des utilisateurs actifs ne reprend plus le nombre d'inscrits.

Wrapped auto8s, pause configuration et nettoyage route ont été exécutés ; clic FR(aac) et égalité22/22 graphique/historique vérifiés sur la fixture. Les validations restantes concernent uniquement les services externes, autres langues et PostgreSQL détaillés dans le rapport final.
