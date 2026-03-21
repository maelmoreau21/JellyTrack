/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock Prisma to avoid touching a real database during integration tests
vi.mock('./prisma', () => {
  const mediaUpsert = vi.fn(async () => ({}));
  const mediaUpdateMany = vi.fn(async () => ({ count: 0 }));
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

describe('syncJellyfinLibrary (integration smoke test)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('/Users')) {
        return { ok: true, json: async () => [{ Id: 'u1', Name: 'Alice' }] } as any;
      }
      if (url.includes('/Library/VirtualFolders')) {
        return { ok: true, json: async () => [] } as any;
      }
      if (url.includes('/UserViews')) {
        return { ok: true, json: async () => ({ Items: [] }) } as any;
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
        return { ok: true, json: async () => ({ Items: [item] }) } as any;
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

  it('runs end-to-end fetching and upsert logic with mocks', async () => {
    const prisma = await import('./prisma');
    const { syncJellyfinLibrary } = await import('./sync');

    const result = await syncJellyfinLibrary({ recentOnly: true });
    expect(result.success).toBe(true);
    // Ensure prisma upserts were invoked for user and media
    expect(prisma.default.user.upsert).toHaveBeenCalled();
    expect(prisma.default.media.upsert).toHaveBeenCalled();
  });
});
