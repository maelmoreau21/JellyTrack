# Developer setup

Quick steps to get the project running locally:

1. Install dependencies

```bash
npm ci
```

2. Create a PostgreSQL database and set `DATABASE_URL` in a `.env` file at project root.

3. Set Jellyfin environment variables (for local sync testing):

```bash
export JELLYFIN_URL="https://your-jellyfin"
export JELLYFIN_API_KEY="your-api-key"
```

4. Generate and apply Prisma client & migrations

```bash
npx prisma generate
npx prisma migrate dev --name init
```

5. Run the dev server

```bash
npm run dev
```

Useful scripts:

- `npm run test` — run unit tests (vitest)
- `npm run build` — production build
- `npm run check:i18n` — check `media` i18n parity
- `RETENTION_DAYS=90 npm run retention:run` — prune old telemetry events (requires DB)
