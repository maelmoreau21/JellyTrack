import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient({
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
  const modelHandler: ProxyHandler<any> = {
    get(_t, prop: string) {
      if (prop === '$connect' || prop === '$disconnect') return async () => {};
      return async (..._args: any[]) => {
        if (prop === 'findMany') return [];
        if (prop === 'findUnique' || prop === 'findFirst' || prop === 'findUniqueOrThrow') return null;
        if (prop === 'count') return 0;
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

// Prefer a harmless stub when running locally without a database, or when
// developers want to run the app quickly without a DB. Use the stub when
// NODE_ENV is development OR when no DATABASE_URL is configured. This keeps
// the dev server bootable even if Postgres is not available.
const useStub = process.env.NODE_ENV === 'development' || !process.env.DATABASE_URL;

// Export either the real Prisma client (when configured) or a harmless stub for local dev without a DB.
let prisma: PrismaClient;

if (useStub) {
  console.warn('[prisma] DATABASE_URL not set or running in development — using development stub (no DB).');
  // Cast the stub proxy to PrismaClient for type inference only — runtime remains the proxy.
  prisma = (globalThis.prismaGlobal ?? createPrismaStub()) as unknown as PrismaClient;
  globalThis.prismaGlobal = prisma;
} else {
  prisma = (globalThis.prismaGlobal ?? prismaClientSingleton()) as PrismaClient;
  globalThis.prismaGlobal = prisma;
}

export default prisma
