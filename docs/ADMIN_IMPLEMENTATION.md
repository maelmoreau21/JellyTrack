# Administration restaurée — implémentation

Référence : `main:a59a28613e63e86106c61827167d355b47147f42`, décrite dans [ADMIN_REFERENCE.md](ADMIN_REFERENCE.md). Les fichiers historiques sont restés en lecture seule. Les modifications ci-dessous concernent la branche `codex/frontend-recovery`.

## Arborescence comparative

```text
main                                            Go
/admin/health                                   /admin/health
  Santé & Hygiène du Serveur                      Santé & Hygiène du Serveur
  4 métriques                                    4 métriques réelles
  Nettoyage & Stockage                            Nettoyage & Stockage
    Nettoyage Intelligent & Optimisation            Nettoyage Intelligent & Optimisation
    CleanupClient                                  composant partagé admin.js
      Médias Fantômes                               Médias Fantômes
      Médias Abandonnés                             Médias Abandonnés
      Doublons                                     Doublons
  Sécurité & Anomalies                            Sécurité & Anomalies
    Détection d'Anomalies & Partage de Compte        anomalies PlaybackHistory
    Santé du Plugin Jellyfin embedded               3 boutons + 4 cartes
  Moteur & Logs                                   Moteur & Logs
    Moniteur / lectures orphelines                    Moniteur / lectures orphelines
    Graphiques d'anomalies                           graphique 14 jours
    Orphelins / fermetures auto / exclusions          listes et sélecteur 5/10/20
/admin/cleanup                                  /admin/cleanup
  Assistant de Nettoyage                            même composant partagé
/admin/server-compare                           /admin/server-compare
  scope global + classement                         scope URL/cookie/local + classement
                                                    inventaire Go secondaire replié
/admin/log-health -> /admin/health               /admin/log-health -> /admin/health (replace)
/admin/plugin-health -> /admin/health            /admin/plugin-health -> /admin/health (replace)
                                                /admin/log-diagnostics : diagnostic Go secondaire
                                                /admin/plugin-diagnostics : centre plugin complet
```

Le module garde également les diagnostics système et journaux Go, la maintenance utilisateurs Go et le centre plugin complet dans les compléments secondaires. Les anciens alias log/plugin retrouvent leurs redirections historiques vers Santé, avec remplacement dans l'historique navigateur ; les diagnostics sont accessibles via leurs nouvelles URL ci-dessus. Aucun menu parent Administration n'a été ajouté dans ce module.

## Contrôles et interactions

- Santé : onglets dans l'ordre historique, défaut Nettoyage & Stockage ; compteurs et anomalies réelles ; groupes imbriqués conservés. Les changements d'onglet mettent à jour l'URL, et le routeur partagé prend en charge le retour navigateur. Navigation clavier par flèches, Home et End ; le focus survit au rafraîchissement asynchrone du plugin.
- Nettoyage : recherche sans distinction d'accents/casse ; périodes all/30d/90d/180d/365d ; types par sous-onglet ; tri de complétion ou dernière tentative ; pagination 25/50/100 ; exports CSV/JSON de toutes les lignes filtrées. Le CSV protège les cellules commençant par une formule.
- Recommandation : dix films au maximum, ajoutés depuis plus de 730 jours et jamais lus ; Examiner la sélection, Supprimer maintenant, Ignorer et fermeture du filtre smart. Le modal présente les films/dates/tailles, total, avertissement irréversible et mot traduit de confirmation ; Annuler, Escape et confirmation désactivés pendant l'envoi. Une erreur HTTP reste visible dans le modal ; les résultats partiels ne deviennent pas un succès global.
- Plugin embedded : rafraîchir, tester réellement la connexion, envoyer réellement un heartbeat avec la clé saisie ; connexion, jitter, ingestion, flux. Le mode complet secondaire conserve le graphique heartbeat, les seuils locaux `plugin-health-thresholds-v2`, export JSON, échecs et télémétrie/configuration réelle. Un HTTP 200 contenant `ok:false` ou `success:false` est affiché comme échec.
- Comparaison : condition mode multi + au moins deux options dédupliquées ; sélection multiple et Tout ; état global cookie/localStorage, query `servers` prioritaire, retour navigateur ; classement selon la formule historique. L'inventaire Go complet (URL/activité/médias/utilisateurs/lectures/flux/heures totales) est conservé derrière un bloc secondaire replié, y compris en mode single.

## Données et mutations

Les routes existantes sont réutilisées avec les handlers `recoveredCleanup`, `recoveredAdminHealth`, `recoveredPluginHealth`, `recoveredServerCompare` et `recoveredDeleteStaleMovies`. Leur protection administrateur et les contrôles Origin/CSRF restent dans les middleware partagés.

Le nettoyage prend désormais `dateAdded` avant `createdAt`, respecte les relations parent/enfant et le serveur, expose recommandations et tailles, et conserve la politique de complétion Go. Les anomalies proviennent des lectures : plusieurs IP par utilisateur sur 24 h et arrêts précoces par au moins trois spectateurs sur sept jours. Les événements système donnent le graphique et les dernières fermetures ; un poll inconnu reste inconnu.

La suppression exige un objet JSON unique, confirmation DELETE, sélection unique de 1 à 25 films, ancienneté/absence de lectures et flux, serveur actif avec clé/configuration valide. Toute la sélection est validée avant le premier appel réseau. Le backend appelle Jellyfin DELETE `/Items/{jellyfinMediaId}` et retire localement seulement les suppressions distantes réussies. Aucun appel ne supprime globalement tous les médias sans lecture. L'audit est `cleanup.stale_movies.delete_requested`.

Les dates SQLite ISO et CURRENT_TIMESTAMP sont normalisées pour comparer correctement les heures. PostgreSQL conserve les comparaisons entre timestamps typés ; les formats de dates exportés par PostgreSQL sont pris en charge.

## Validation effectuée par l'agent d'implémentation

`node --check web/dist/assets/admin.js` : réussi. `gofmt` et formatage JS/CSS exécutés.

`go test ./internal/api -run TestRecovered -count=1` : huit tests réussis :

1. Probe GET réel, refus clé incorrecte, heartbeat valide réellement persisté par le receiver plugin.
2. Requêtes dates SQLite/PostgreSQL et formats timestamps.
3. Refus HTTP 200 `ok:false` et erreur handler plugin indisponible.
4. Validation atomique d'une sélection invalide : zéro appel distant et zéro suppression locale.
5. Suppression partielle sur un serveur Jellyfin **synthétique httptest** : succès distant supprimé localement, échec distant conservé.
6. Ancienneté `dateAdded`, taille et recommandation.
7. Anomalie IP réelle, lectures orphelines, graphique 14 jours, absence de poll fabriqué.
8. Déduplication serveur historique, sélection URL et agrégats 24 h.

Le premier test couvre deux scénarios de probe et un heartbeat valide ; les huit fonctions de test figurent dans `admin_recovery_test.go`. Aucune suppression sur un serveur utilisateur, rotation/révocation de secret ou restauration de sauvegarde n'a été exécutée. Les tests utilisent seulement des bases temporaires et des serveurs HTTP de test.

Les captures comparatives et les tests navigateur/rôles sont pris en charge par `settings_admin_qa` et décrits dans le livrable partagé. Les écarts visuels identifiés sur mobile ont été corrigés d'après les captures de main : icônes et espacement des métriques santé, tuiles nettoyage avec icône à gauche sur une seule colonne mobile, onglets wrap et taille/position du titre.

## Écarts et limites à conserver dans le bilan

- Le receiver Go ne persiste pas un compteur complet de tous les succès d'ingestion. Le taux de succès est donc affiché N/A ; les erreurs affichées sont celles effectivement présentes dans AdminAuditLog. Les heartbeats ont leurs vrais percentiles/jitter et les flux ont leurs vrais agrégats. Une instrumentation exhaustive du receiver est un travail distinct.
- Les doublons historiques ont des textes français codés en dur même en anglais ; Go traduit ces textes en anglais et utilise les traductions disponibles pour le reste.
- Le retour navigateur retrouve les onglets et le scope serveur. Les filtres locaux du nettoyage gardent le comportement local historique.
- Le centre plugin complet et les diagnostics supplémentaires restent secondaires, sous `/admin/plugin-diagnostics` et `/admin/log-diagnostics`. Les anciens alias redirigent vers Santé comme main.
- PostgreSQL a une vérification de génération SQL et parsing, sans serveur PostgreSQL lancé pour ce sous-agent.
- L'interface reprend les primitives historiques avec HTML/CSS et Chart.js ; elle n'embarque pas React/Radix/Recharts. Ne pas présenter une capture comme strictement identique au pixel près sans le résultat du comparatif QA final.

Optimisation tokens : référence partagée réutilisée, recherches ciblées de sources main, fichiers attribués sans recouvrement, API existantes enrichies, tests centrés sur les contrats et opérations sensibles ; aucune mesure chiffrée d'économie n'a été inventée.
