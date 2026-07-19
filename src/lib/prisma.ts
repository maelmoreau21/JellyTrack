import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

/**
 * Build a safe DATABASE_URL from individual DB_* environment variables,
 * encoding user and password with encodeURIComponent to handle special
 * characters (e.g. &, @, #) that would otherwise corrupt the URI.
 */
function buildSafeConnectionString(): string | undefined {
  const dbUser = process.env.DB_USER ?? process.env.POSTGRES_USER;
  const dbPassword = process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;
  const dbHost = process.env.DB_HOST ?? process.env.POSTGRES_IP ?? 'localhost';
  const dbPort = process.env.DB_PORT ?? process.env.POSTGRES_PORT ?? '5432';
  const dbName = process.env.DB_NAME ?? process.env.POSTGRES_DB ?? 'JellyTrack';

  // Only rebuild if at least user or password are explicitly provided
  if (!dbUser && !dbPassword) return undefined;

  const safeUser = encodeURIComponent(dbUser || 'JellyTrack');
  const safePassword = encodeURIComponent(dbPassword || '');

  return `postgresql://${safeUser}:${safePassword}@${dbHost}:${dbPort}/${dbName}?schema=public&connection_limit=5`;
}

const prismaClientSingleton = () => {
  // Prefer a safely-built connection string from individual env vars,
  // falling back to the raw DATABASE_URL (which should already be encoded
  // if built by docker-entrypoint.sh).
  const connectionString = buildSafeConnectionString() || process.env.DATABASE_URL;
  let maxConnections = 10; // Default pg pool size

  if (connectionString) {
    try {
      const url = new URL(connectionString);
      const limit = url.searchParams.get('connection_limit');
      if (limit) {
        const parsedLimit = parseInt(limit, 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          maxConnections = parsedLimit;
        }
      }
    } catch (e) {
      console.warn('[prisma] Failed to parse connection_limit from DATABASE_URL:', e);
    }
  }

  const pool = new Pool({
    connectionString,
    max: maxConnections,
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

declare global {
  // Allow a loose global for both real PrismaClient and development stub
  // Keep type as unknown to avoid leaking any in global scope
  var prismaGlobal: unknown | undefined
}

function createPrismaStub() {
  // Return a Proxy that gracefully handles common Prisma model methods used in the app.
  const modelHandler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === '$connect' || prop === '$disconnect') return async () => {};
      return async () => {
        if (prop === 'findMany') return [];
        if (prop === 'groupBy') return [];
        if (prop === 'findUnique' || prop === 'findFirst' || prop === 'findUniqueOrThrow') return null;
        if (prop === 'count') return 0;
        if (prop === 'aggregate') return { _sum: {}, _avg: {}, _min: {}, _max: {}, _count: {} };
        if (prop === 'upsert' || prop === 'create' || prop === 'update' || prop === 'delete') return {};
        return null;
      };
    }
  };

  const dbProxy = new Proxy({}, {
    get(_t, modelName: string) {
      if (modelName === '$connect' || modelName === '$disconnect') return async () => {};
      return new Proxy({}, modelHandler);
    }
  });

  return dbProxy;
}

// Prefer a harmless stub only when DATABASE_URL is missing, or when
// PRISMA_USE_STUB is explicitly enabled for quick UI-only development.
const forceStub = process.env.PRISMA_USE_STUB === '1' || process.env.PRISMA_USE_STUB === 'true';
const useStub = forceStub || !process.env.DATABASE_URL;

// Export either the real Prisma client (when configured) or a harmless stub for local dev without a DB.
let prisma: PrismaClient;

if (useStub) {
  console.warn('[prisma] Using development stub (no DB). Set DATABASE_URL (and PRISMA_USE_STUB=false) to use the real database.');
  // Cast the stub proxy to PrismaClient for type inference only — runtime remains the proxy.
  prisma = (globalThis.prismaGlobal ?? createPrismaStub()) as unknown as PrismaClient;
  globalThis.prismaGlobal = prisma;
} else {
  prisma = (globalThis.prismaGlobal ?? prismaClientSingleton()) as PrismaClient;
  globalThis.prismaGlobal = prisma;
}

export default prisma
