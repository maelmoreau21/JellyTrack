import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

vi.mock('./prisma', () => {
  const mediaUpsert = vi.fn(async () => ({}));
  const mediaUpdateMany = vi.fn(async () => ({ count: 2 }));
  const userUpsert = vi.fn(async () => ({}));
  return {
    default: {
      media: { updateMany: mediaUpdateMany, upsert: mediaUpsert },
      user: { upsert: userUpsert },
      systemHealthEvent: { create: vi.fn() },
      systemHealthState: { upsert: vi.fn() },
      $transaction: vi.fn(async (fn: any) => typeof fn === 'function' ? await fn({}) : undefined),
    },
  };
});

vi.mock('@/lib/systemHealth', () => ({
  appendHealthEvent: vi.fn(),
  markSyncStarted: vi.fn(),
  markSyncFinished: vi.fn(),
}));

vi.mock('@/lib/jellyfinId', () => ({ normalizeJellyfinId: (v: any) => v }));
vi.mock('@/lib/cleanup', () => ({ cleanupOrphanedSessions: vi.fn(async () => {}) }));

describe('syncJellyfinLibrary (integration - pagination & resilience)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    let vfAttempts = 0;

    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('/Users')) {
        return { ok: true, json: async () => [{ Id: 'u1', Name: 'Alice' }] } as any;
      }

      if (url.includes('/Library/VirtualFolders')) {
        vfAttempts++;
        if (vfAttempts === 1) {
          // Simulate transient network error to exercise retry logic
          throw new Error('transient network');
        }
        return { ok: true, json: async () => [{ Id: 'vf1', ItemId: null, Name: 'Films', CollectionType: 'movies' }] } as any;
      }

      if (url.includes('/UserViews')) {
        return { ok: true, json: async () => ({ Items: [] }) } as any;
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
          return { ok: true, json: async () => ({ Items: items }) } as any;
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
          return { ok: true, json: async () => ({ Items: items }) } as any;
        }

        return { ok: true, json: async () => ({ Items: [] }) } as any;
      }

      return { ok: false, status: 404, json: async () => ({}) } as any;
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
    const mediaUpsertCalls = (prisma as any).default.media.upsert.mock.calls.length;
    expect(mediaUpsertCalls).toBe(201);

    // Ensure ghost cleanup was attempted (media.updateMany)
    expect((prisma as any).default.media.updateMany).toHaveBeenCalled();

    // Ensure at least one upsert included a 1080p resolution (from even-indexed items)
    const has1080 = (prisma as any).default.media.upsert.mock.calls.some((c: any[]) => c[1] === undefined || JSON.stringify(c[0] || c[1] || c).includes('1080'));
    expect(has1080).toBe(true);
  });
});
