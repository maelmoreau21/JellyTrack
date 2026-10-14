# État de migration frontend — 14 octobre 2026

Objectif : SvelteKit 3 / Svelte 5 / TypeScript, apparence de develop conservée.
Branche locale `codex/frontend-sveltekit`; aucune publication ni bascule.

Sources de référence : `web/dist` au commit de départ indiqué dans README.md.
Sources nouvelles : `src/lib/components`, `src/lib/migration-bridge.ts`.
Les scripts de préparation génèrent seulement les copies dans `static` et le
template `src/app.html`. Ne pas éditer les copies générées.

Convertis : structure principale, barre latérale (liens, menus, recherche, focus,
tooltips), À propos, connexion. Thème, traductions et client API en TypeScript
dans `src/lib/runtime`. Les copies de services historiques sont remplacées
par ces factories pendant la préparation ; `web/dist` reste intact.
Le routeur historique garde la navigation et le démarrage session. Les composants
de pages sont démontés avant son remplacement du main. `flushSync` sur les liens
permet au code historique de mettre immédiatement à jour leur état actif.
Les navigations attendent `goto` de SvelteKit en mode shallow : aucun appel
direct concurrent à l'historique natif. Kit 3 résout les routes de façon asynchrone ;
le routeur historique attend cette résolution avant de lire l'URL et rendre la page.
Précédent/suivant passent après cette correction sur le build avec CSP stricte,
ainsi que les 14 contrats de connexion relancés séparément.

Build statique : bootstrap externalisé et nommé par empreinte pour respecter
la CSP Go. Sortie `build`, encore distincte du frontend livré `web/dist`.

Vérifiés : compilation et Svelte Check sans erreurs/avertissements ; 16 scénarios
comparatifs navigation/À propos en développement, puis 16 avec build et CSP stricte.
Preuves locales dans `scratch/frontend-sveltekit-qa`, API entièrement simulées.
Connexion : 20 comparaisons visuelles ciblées et 14 scénarios API simulés réussis,
avec captures/résultats dans `scratch/frontend-sveltekit-login-qa`.

Nouvelle validation : 8 scénarios comparatifs sidebar mobile/desktop clair/sombre
administrateur/utilisateur, 7 contrats API sans réseau. Les 14 contrats login
sont relancés après raccordement de ces services. La recherche reçoit un signal
d'annulation explicite et rejette les réponses devenues obsolètes.

Dashboard partiellement converti : `DashboardFrame.svelte`, bandeau du jour,
`DashboardKpis.svelte` et types du KPI. Les zones graphiques/flux/analyses restent
des conteneurs contrôlés par le code historique. Démonter les KPI avant chaque
remplacement du conteneur des blocs ; démonter les KPI puis le cadre à la navigation.
L'actualisation des filtres attend aussi l'historique shallow SvelteKit.

Comparaison dashboard : 8 scénarios mobile/desktop clair/sombre FR/EN passent en
développement. Textes, icônes, dimensions des KPI, filtres période/média/serveur,
liens journaux, réordonnancement et navigation aller/retour sont contrôlés avec
API simulée. Les preuves sont dans `scratch/frontend-sveltekit-dashboard-qa`.
Le test ne valide pas les données graphiques ni les événements live d'un provider.
Les 8 scénarios passent aussi sur le build statique sous CSP stricte. Un cas
vérifie les dates personnalisées et la visibilité des trois onglets. Build,
Svelte Check (0 erreur/avertissement), tests/analyse/compilation Go réussis.

Prochaine étape : convertir les blocs de santé, matériel et flux puis les
graphiques/analyses du dashboard, en conservant les comparaisons. Valider chaque
famille avant bascule Go/Docker.

Mise à jour : santé et flux (vide/cartes/chronologie) convertis en Svelte ; matériel
préparé uniquement pour un conteneur existant, absent de l'écran Go livré. Les
instances sont actualisées puis démontées à la navigation ou au remplacement des
blocs. Le montage remplace les placeholders historiques plutôt que les conserver.
8 scénarios avec données de santé/flux renseignées passent sous CSP stricte.
36 captures comparées ont zéro pixel différent (FR/EN, clair/sombre, mobile/desktop).
Preuves : `scratch/frontend-sveltekit-widget-qa/pixel-comparison.json`.
Matériel et bascule forcée des flux utilisent des points de montage/hooks injectés
uniquement dans la fixture ; aucun panneau/bouton ajouté au produit.
Commandes : `npm run test:dashboard -- --production --widgets`, puis depuis la
racine `python frontend/scripts/compare-dashboard-pixels.py --widgets`.
Suite : graphiques, analyses et autres pages. Aucune preuve provider/production.

Limites : pas de validation serveur/provider/production, pas de parité complète,
TypeScript 6.0.3 retenu car TS 7 exclu par les peer dependencies SvelteKit/Check.

Comparaison main actualisée : voir `MAIN_COMPARISON.md`. Main distant e80c5e8 est
déjà inclus dans le point de départ (trois commits supplémentaires). Styles/assets
graphiques identiques ; anciennes sources React a59a286 gardées comme référence.
Après stabilisation des animations de capture, les 8 captures du viewport dashboard
Go/Svelte ont zéro pixel différent. Comparateur : `scripts/compare-dashboard-pixels.py`.
Limites strictes : viewport 900 px, API simulée, graphiques vides, aucune preuve
visuelle globale ou de production. À propos change le libellé de technologie.

Correctifs de performance du 14 octobre, sur `develop` : voir
`../docs/frontend-performance/README.md`. Docker livre encore `web/dist` ; la
migration Svelte n'a pas été intégrée à l'image. Les optimisations sont appliquées
au frontend livré et reprises par la préparation Svelte : démarrage et chargement
de modules parallèles, fichiers publics comprimés/revalidés, catalogue paginé
optimisé et fiches médias affichées avant l'enrichissement Jellyfin. Le service
i18n TypeScript reçoit la même suppression du téléchargement français dupliqué.
Trois scénarios média progressif comparent la présentation finale historique et
vérifient les interactions/annulations. Aucune mesure sur la production.
