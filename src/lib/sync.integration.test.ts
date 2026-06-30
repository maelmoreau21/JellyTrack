/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock Prisma to avoid touching a real database during integration tests.
// Register the same factory for both local and aliased imports so modules
// importing either './prisma' or '@/lib/prisma' receive the mocked client.
function prismaMockFactory() {
  const mediaUpsert = vi.fn(async () => ({}));
  const mediaUpdateMany = vi.fn(async () => ({ count: 0 }));
  const userUpsert = vi.fn(async () => ({}));

  const tx = {
    media: {
      findMany: vi.fn(async () => []),
      create: async (...args: any[]) => mediaUpsert(...args),
      update: async (...args: any[]) => mediaUpsert(...args),
      delete: vi.fn(async () => ({})),
    },
    playbackHistory: { updateMany: vi.fn(async () => ({})) },
    activeStream: { updateMany: vi.fn(async () => ({})) },
  };

  return {
    default: {
      media: { updateMany: mediaUpdateMany, upsert: mediaUpsert, create: mediaUpsert, update: mediaUpsert },
      user: { upsert: userUpsert },
      systemHealthEvent: { create: vi.fn() },
      systemHealthState: { upsert: vi.fn() },
      globalSettings: { findUnique: vi.fn(async () => ({ resolutionThresholds: null })) },
      $transaction: vi.fn(async (fn: any) => typeof fn === 'function' ? await fn(tx) : undefined),
    },
  };
}

vi.mock('./prisma', prismaMockFactory);
vi.mock('@/lib/prisma', prismaMockFactory);

vi.mock('@/lib/systemHealth', () => ({
  appendHealthEvent: vi.fn(),
  markSyncStarted: vi.fn(),
  markSyncFinished: vi.fn(),
}));

vi.mock('@/lib/jellyfinId', () => ({ normalizeJellyfinId: (v: any) => v, compactJellyfinId: (v: any) => v }));
vi.mock('@/lib/cleanup', () => ({ cleanupOrphanedSessions: vi.fn(async () => {}) }));

describe('syncJellyfinLibrary (integration smoke test)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: string) => {
      const makeResponse = (body: any, ok = true, status = 200) => {
        const textBody = typeof body === 'string' ? body : JSON.stringify(body);
        return {
          ok,
          status,
          json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
          text: async () => textBody,
        } as any;
      };

      if (url.includes('/Users')) {
        return makeResponse([{ Id: 'u1', Name: 'Alice' }]);
      }
      if (url.includes('/Library/VirtualFolders')) {
        return makeResponse([]);
      }
      if (url.includes('/UserViews')) {
        return makeResponse({ Items: [] });
      }
      if (url.includes('/Items')) {
        const item = {
          Id: 'm1',
          Name: 'Test Movie',
          Type: 'Movie',
          MediaSources: [
            {
              Size: '1048576',
              MediaStreams: [{ Type: 'Video', Width: 1440, Height: 1080 }],
            },
          ],
          RunTimeTicks: '6000000000',
          DateCreated: new Date().toISOString(),
        };
        return makeResponse({ Items: [item] });
      }
      return makeResponse({}, false, 404);
    }) as any;

    process.env.JELLYFIN_URL = 'http://test.local';
    process.env.JELLYFIN_API_KEY = 'testkey';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetAllMocks();
    delete process.env.JELLYFIN_URL;
    delete process.env.JELLYFIN_API_KEY;
  });

  it('runs end-to-end fetching and upsert logic with mocks', async () => {
    const prisma = await import('./prisma');
    const { syncJellyfinLibrary } = await import('./sync');

    const result = await syncJellyfinLibrary({ recentOnly: true });
    expect(result.success).toBe(true);
    // Ensure prisma upserts were invoked for user and media
    expect(prisma.default.user.upsert).toHaveBeenCalled();
    // In our manual sync, it's either create or update on the mock
    expect(prisma.default.media.create).toHaveBeenCalled();
  });
});
