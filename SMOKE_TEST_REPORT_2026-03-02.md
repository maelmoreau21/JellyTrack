# Smoke Test Ciblé — 2026-03-02

## 1) Webhook Auth (Prod vs Dev)

### Production (NODE_ENV=production)

Tests HTTP réels sur /api/webhook/jellyfin :

- prod_missing_secret_no_header -> 401, body {"error":"Unauthorized"}
- prod_missing_secret_invalid_header -> 401, body {"error":"Unauthorized"}
- prod_secret_set_no_header -> 401, body {"error":"Unauthorized"}
- prod_secret_set_invalid_header -> 401, body {"error":"Unauthorized"}
- prod_secret_set_valid_header -> 400, body {"error":"Payload non reconnu."}

Conclusion: Auth webhook fail-closed validée en production. Un token valide passe l’auth (puis tombe volontairement sur 400 avec payload vide).

### Développement

Tests HTTP réels sur /api/webhook/jellyfin sans secret :

- dev_missing_secret_no_header -> 400, body {"error":"Payload non reconnu."}
- dev_missing_secret_invalid_header -> 400, body {"error":"Payload non reconnu."}

Conclusion: En dev, l’absence de secret n’entraîne pas de 401 (comportement permissif attendu).

---

## 2) Cycle Backup/Restore télémétrie

Simulation reproductible exécutée via .github/scripts/smoke-test-audit.js :

- Export JSON avec replacer BigInt
- Re-import avec conversion BigInt/Date comme dans les routes
- Mapping auto-restore des compteurs

Résultat:

- pauseCount conservé: 3
- audioChanges conservé: 2
- subtitleChanges conservé: 1
- telemetry.positionMs reconverti en BigInt

Conclusion: Les compteurs de télémétrie ne sont pas perdus dans le cycle simulé export/import/restore.

---

## 3) KPI Complétion

Simulation reproductible via .github/scripts/smoke-test-audit.js avec la formule actuelle :

- durationMs = 3 600 000 ms (film 60 min)
- durationSecs = Number(durationMs) / 1000 = 3600
- watchedSeconds = 2700 (45 min)
- completion = (2700 / 3600) * 100 = 75

Résultat: completion = 75, valeur finie, sans erreur BigInt.

Conclusion: Correction durationMs/1000 validée.

---

## Sortie script

- [PASS] Backup/Restore simulation
- [PASS] KPI completion simulation
