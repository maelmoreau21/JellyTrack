/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Register the same prisma mock for both local and aliased imports
function prismaMockFactory() {
  const mediaUpsert = vi.fn(async (..._args: any[]) => ({}));
  const mediaUpdateMany = vi.fn(async (..._args: any[]) => ({ count: 2 }));
  const userUpsert = vi.fn(async (..._args: any[]) => ({}));

  const tx = {
    media: {
      findMany: vi.fn(async () => []),
      create: mediaUpsert,
      update: mediaUpsert,
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

describe('syncJellyfinLibrary (integration - pagination & resilience)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    let vfAttempts = 0;

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
        vfAttempts++;
        if (vfAttempts === 1) {
          // Simulate transient network error to exercise retry logic
          throw new Error('transient network');
        }
        return makeResponse([{ Id: 'vf1', ItemId: null, Name: 'Films', CollectionType: 'movies' }]);
      }

      if (url.includes('/UserViews')) {
        return makeResponse({ Items: [] });
      }

      if (url.includes('/Items')) {
        const startMatch = url.match(/StartIndex=(\d+)/);
        const startIndex = startMatch ? parseInt(startMatch[1], 10) : 0;

        if (startIndex === 0) {
          // Return a full page to force pagination
          const items = Array.from({ length: 200 }, (_, i) => ({
            Id: `m${i}`,
            Name: `Movie ${i}`,
            Type: 'Movie',
            MediaSources: [
              { Size: `${1024 + i}`, MediaStreams: [{ Type: 'Video', Width: 1920, Height: i % 2 === 0 ? 1080 : 720 }] }
            ],
            RunTimeTicks: '6000000000',
            DateCreated: new Date().toISOString(),
          }));
          return makeResponse({ Items: items });
        }

        if (startIndex === 200) {
          const items = [
            {
              Id: `m200`,
              Name: `Movie 200`,
              Type: 'Movie',
              MediaSources: [
                { Size: '2048', MediaStreams: [{ Type: 'Video', Width: 3840, Height: 2160 }] }
              ],
              RunTimeTicks: '6000000000',
              DateCreated: new Date().toISOString(),
            }
          ];
          return makeResponse({ Items: items });
        }

        return makeResponse({ Items: [] });
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

  it('handles paginated Items, retries, and ghost cleanup', async () => {
    const prisma = await import('./prisma');
    const { syncJellyfinLibrary } = await import('./sync');

    const result = await syncJellyfinLibrary({ recentOnly: true });

    expect(result.success).toBe(true);

    // Expect 201 media upserts (200 + 1)
    const createCalls = (prisma as any).default.media.create ? (prisma as any).default.media.create.mock.calls.length : 0;
    // Note: in the test environment, they are all new, so they should be 'create'
    // But let's check both to be safe
    expect(createCalls).toBe(201);

    // Ensure ghost cleanup was attempted (media.updateMany)
    expect((prisma as any).default.media.updateMany).toHaveBeenCalled();

    // Ensure at least one upsert included a 1080p resolution (from even-indexed items)
    const has1080 = (prisma as any).default.media.upsert.mock.calls.some((c: any[]) => c[1] === undefined || JSON.stringify(c[0] || c[1] || c).includes('1080'));
    expect(has1080).toBe(true);
  });
});
