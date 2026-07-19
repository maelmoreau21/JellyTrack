import "dotenv/config";
import { defineConfig } from "prisma/config";

function buildSafeConnectionString(): string | undefined {
  const dbUser = process.env.DB_USER ?? process.env.POSTGRES_USER;
  const dbPassword = process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;
  const dbHost = process.env.DB_HOST ?? process.env.POSTGRES_IP ?? 'localhost';
  const dbPort = process.env.DB_PORT ?? process.env.POSTGRES_PORT ?? '5432';
  const dbName = process.env.DB_NAME ?? process.env.POSTGRES_DB ?? 'jellytrack';

  // Only rebuild if at least user or password are explicitly provided
  if (!dbUser && !dbPassword) return undefined;

  const safeUser = encodeURIComponent(dbUser || 'JellyTrack');
  const safePassword = encodeURIComponent(dbPassword || '');

  return `postgresql://${safeUser}:${safePassword}@${dbHost}:${dbPort}/${dbName}?schema=public&connection_limit=5`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: buildSafeConnectionString() || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/jellytrack",
  },
});
