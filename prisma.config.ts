try {
  require("dotenv/config");
} catch {
  // Environment variables are already exported by container/environment
}
import { defineConfig } from "prisma/config";

function getDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL;
  if (envUrl && !envUrl.toLowerCase().includes("placeholder")) {
    return envUrl;
  }

  const dbUser = process.env.DB_USER ?? process.env.JELLYTRACK_DB_USER ?? process.env.POSTGRES_USER ?? 'JellyTrack';
  const dbPassword = process.env.DB_PASSWORD ?? process.env.JELLYTRACK_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'JellyTrack_password';
  const dbHost = process.env.DB_HOST ?? process.env.POSTGRES_IP ?? 'localhost';
  const dbPort = process.env.DB_PORT ?? process.env.POSTGRES_PORT ?? '5432';
  const dbName = process.env.DB_NAME ?? process.env.JELLYTRACK_DB_NAME ?? process.env.POSTGRES_DB ?? 'jellytrack';

  const safeUser = encodeURIComponent(dbUser);
  const safePassword = encodeURIComponent(dbPassword);

  return `postgresql://${safeUser}:${safePassword}@${dbHost}:${dbPort}/${dbName}?schema=public&connection_limit=5`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
