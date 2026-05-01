# Developer setup

## Primary method (recommended)

Run JellyTrack with Docker first. The repository ships a committed `.env.example` template; real `.env*` files are intentionally ignored.

1. Copy `.env.example` to `.env`.
2. Edit `.env` and replace every `CHANGE_ME_*` value.
3. Start the stack:

```bash
docker compose up -d
```

4. Open `http://localhost:3000` (or the value of `APP_PORT` in your `.env`).

## Local source development (optional)

Use this mode if you need to change application code locally.

1. Install dependencies:

```bash
npm ci
```

2. Start database dependencies:

```bash
docker compose up -d postgres redis
```

3. Generate Prisma client and sync schema:

```bash
npx prisma generate
npx prisma db push
```

4. Start the dev server:

```bash
npm run dev
```

Useful scripts:

- `npm run test` — run unit tests (vitest)
- `npm run build` — production build
- `npm run check:i18n` — check `media` i18n parity
- `RETENTION_DAYS=90 npm run retention:run` — prune old telemetry events (requires DB)
