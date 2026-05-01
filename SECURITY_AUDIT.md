# Security Audit Report - JellyTrack

Date: 2026-05-01
Version: 1.5.1
Status: Remediated with residual follow-up items

## Summary

This audit focused on dependency vulnerabilities, committed secrets, webhook URL validation, deployment defaults, and reproducible install/build behavior.

## Fixed

- Reduced `npm audit` findings from 7 vulnerabilities to 0.
- Updated safe patch/minor dependencies, including `next-auth`, `next-intl`, `vitest`, `shadcn`, `postcss`, `tailwindcss`, `jose`, `fuse.js`, and related lockfile entries.
- Added targeted npm overrides for vulnerable transitive packages:
  - `postcss`
  - `uuid`
  - `vite`
  - `hono`
  - `@hono/node-server`
- Added explicit `react-is` dependency so Recharts builds reproducibly after a clean `npm ci`.
- Added `.npmrc` with `legacy-peer-deps=true` to match the existing Next 16 + React 19 dependency graph in CI and local installs.
- Stopped tracking real `.env` files:
  - `.gitignore` now keeps `.env*` ignored and allows only `.env.example`.
  - `.env.example` contains placeholder configuration only.
  - `.env` was removed from the Git index without deleting the local file.
- Hardened production auth secret validation:
  - `CHANGE_ME_*`, `your_*`, `example*`, and `placeholder` values are now rejected.
  - Production runtime still fails closed when `NEXTAUTH_SECRET` or `AUTH_SECRET` is missing or invalid.
- Hardened `docker-compose.yml`:
  - Sensitive values now use required variable expansion instead of insecure defaults.
- Fixed Discord webhook domain validation:
  - Lookalike domains such as `evil-discord.com` and `discord.com.attacker.test` are rejected.
  - The settings API now uses the shared webhook validator.
- Added unit tests for the Discord webhook validator.

## Verification

- `npm ci` passed.
- `npm audit` passed with 0 vulnerabilities.
- `npm run test` passed: 6 files, 19 tests.
- `npm run lint` passed with warnings only.
- `npm run check:i18n` passed.
- `npm run build` passed.

## Residual Risks

- `npx tsc --noEmit` still fails on existing TypeScript issues across chart components, Prisma groupBy typing, and a few route payload types. Because of this, `next.config.ts` still has `typescript.ignoreBuildErrors: true`; enabling strict build-time type blocking needs a separate cleanup pass.
- Major upgrades were intentionally not applied automatically because they need migration/testing work:
  - `@prisma/client` / `prisma` 5 -> 7
  - `typescript` 5 -> 6
  - `eslint` 9 -> 10
  - `lucide-react` 0.x -> 1.x
  - `@types/node` 20 -> 25
- `react`, `react-dom`, and `react-is` were kept on `19.2.4`; `19.2.5` currently causes npm peer-resolution issues with the installed Next 16.2.4 graph.
- Any sensitive values that were previously committed in `.env` should be considered exposed. Rotate those secrets and, if this repository was pushed publicly, purge them from Git history as a separate incident-response step.
