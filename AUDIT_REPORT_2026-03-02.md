# Audit DevSecOps & Stabilité — JellyTulli

Date: 2026-03-02
Scope: Next.js app, API routes, monitor runtime, backup pipeline, Docker deployment, documentation.
Méthode: revue code + correctifs ciblés + validations d’erreurs sur fichiers impactés.

## Résumé exécutif

- Statut global: **correctifs critiques appliqués**.
- Risques majeurs traités: exposition de clé API en query string, webhook non strict en production, incohérences backup/restore de télémétrie, erreur de calcul analytics.
- Documentation de déploiement alignée avec le comportement réel (GHCR, variables, PUID/PGID, webhook secret).

---

## Phase 1 — Stabilité / Qualité

### F1-1 — Erreurs de compilation TypeScript/JSX

- Sévérité: Haute
- Impact: build cassé / régression UI.
- Preuve: erreurs sur composants timeline/formatting et endpoint télémétrie.
- Remédiation:
  - `src/lib/timeFormat.ts`: suppression JSX invalide dans fichier `.ts` via `createElement`.
  - `src/app/media/[id]/MediaTimelineChart.tsx`: correction de balises JSX.
  - `src/app/api/streams/telemetry/route.ts`: requêtes découplées (sessions + events) pour éviter dépendance fragile aux relations générées Prisma.
- Résultat: fichiers ciblés sans erreurs.

### F1-2 — Calcul de complétion incorrect

- Sévérité: Moyenne
- Impact: KPI analytics faux (biais décisionnel).
- Preuve: `durationMs` traité comme ticks au lieu de millisecondes.
- Remédiation:
  - `src/components/dashboard/GranularAnalysis.tsx`: dénominateur corrigé (`durationMs / 1000`).
- Résultat: ratio cohérent avec les unités stockées.

### F1-3 — Fidélité backup/restore incomplète

- Sévérité: Haute
- Impact: perte de données de télémétrie et restauration partielle des settings.
- Preuve: export/import/restore ne couvraient pas toutes les données attendues.
- Remédiation:
  - `src/app/api/backup/export/route.ts`: ajout télémétrie.
  - `src/lib/autoBackup.ts`: ajout télémétrie.
  - `src/app/api/backup/import/route.ts`: import télémétrie + conversion BigInt/dates + restauration settings élargie.
  - `src/app/api/backup/auto/restore/route.ts`: restauration télémétrie + settings complets.
- Résultat: parité export/import/restore améliorée.

---

## Phase 2 — Sécurité avancée

### F2-1 — Clé API Jellyfin dans URL (`api_key=`)

- Sévérité: Critique
- Impact: fuite possible via logs proxy, historique, observabilité, traces HTTP.
- Preuve: appels Jellyfin utilisant query string.
- Remédiation:
  - Migration vers header `X-Emby-Token` dans:
    - `src/server/monitor.ts`
    - `src/lib/sync.ts`
    - `src/app/media/[id]/page.tsx`
- Validation: recherche globale `api_key=` dans `src/**` → aucune occurrence.

### F2-2 — Auth webhook permissive en production

- Sévérité: Haute
- Impact: injection d’événements factices si secret absent.
- Preuve: comportement historiquement fail-open.
- Remédiation:
  - `src/app/api/webhook/jellyfin/route.ts`:
    - fail-closed en production si `JELLYFIN_WEBHOOK_SECRET` absent;
    - dev conservé permissif (compatibilité locale).
- Résultat: posture de sécurité renforcée en environnement prod.

### F2-3 — RBAC / défense en profondeur

- Sévérité: Moyenne
- Impact: risque d’accès non souhaité selon endpoint.
- État: garde middleware + garde serveur présentes sur routes sensibles inspectées.
- Remédiation: maintien de la double couche et alignement doc des attentes de prod.

---

## Phase 3 — Documentation / Exploitabilité

### F3-1 — README réaligné avec le runtime réel

- Sévérité: Moyenne (opérationnelle)
- Impact: erreurs de déploiement/config si doc obsolète.
- Remédiation:
  - `README.md` réécrit avec:
    - déploiement GHCR compose,
    - variables complètes,
    - mention explicite `JELLYFIN_WEBHOOK_SECRET` requis en prod,
    - `PUID/PGID` documentés,
    - section i18n FR/EN,
    - procédure de mise à jour et recommandation de pinning de tag.
- Validation: vérification markdown du fichier README OK.

---

## Fichiers modifiés (lot audit)

- `src/lib/timeFormat.ts`
- `src/app/media/[id]/MediaTimelineChart.tsx`
- `src/app/api/streams/telemetry/route.ts`
- `src/server/monitor.ts`
- `src/lib/sync.ts`
- `src/app/media/[id]/page.tsx`
- `src/app/api/webhook/jellyfin/route.ts`
- `src/components/dashboard/GranularAnalysis.tsx`
- `src/app/api/backup/export/route.ts`
- `src/lib/autoBackup.ts`
- `src/app/api/backup/import/route.ts`
- `src/app/api/backup/auto/restore/route.ts`
- `README.md`

---

## Risques résiduels & recommandations

- Ajouter des tests d’intégration ciblés:
  - webhook auth (secret présent/absent),
  - non-régression backup/restore (incl. télémétrie),
  - validation des métriques de complétion.
- En production:
  - pinning image GHCR par tag versionné,
  - rotation périodique `JELLYFIN_API_KEY` et `NEXTAUTH_SECRET`,
  - monitoring des erreurs 401 webhook.

---

## Validation technique effectuée

- Vérifications d’erreurs ciblées sur fichiers modifiés: OK.
- Recherche usage query `api_key` dans le source applicatif: aucune occurrence.
- README lint/check: OK sur le fichier final.

## Décision proposée

- Prêt pour validation fonctionnelle utilisateur (smoke test) puis merge.
