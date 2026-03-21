# Changelog

## Unreleased - 2026-03-22

- Add CI workflow: `.github/workflows/ci.yml` — runs lint, tests, i18n-check and build on PRs.
- Fix resolution detection (prefer height) and add `src/lib/resolution.ts` + tests.
- Add `src/lib/size.ts` for BigInt-safe size formatting + tests.
- Soften light-mode tokens in `src/app/globals.css` to reduce glare.
- Fix malformed JSX in `src/app/settings/page.tsx`.

Signed-off-by: Automated update
