import { describe, it, expect, vi } from 'vitest';
import { getLogHealthSnapshot } from './logHealth';
import prisma from './prisma';

vi.mock('./prisma', () => ({
  default: {
    globalSettings: {
      findUnique: vi.fn(),
    },
    activeStream: {
      findMany: vi.fn(),
    },
    playbackHistory: {
      findMany: vi.fn(),
    },
    systemHealthEvent: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/systemHealth', () => ({
  readSystemHealthState: vi.fn().mockResolvedValue({
    status: 'healthy',
    events: [],
  }),
}));

vi.mock('@/lib/valkey', () => ({
  default: {
    keys: vi.fn().mockResolvedValue([]),
  },
}));

describe('logHealth', () => {
  it('returns snapshot data when DB contains no anomalies', async () => {
    vi.mocked(prisma.globalSettings.findUnique).mockResolvedValue({ excludedLibraries: [] } as Record<string, unknown> as any);
    vi.mocked(prisma.activeStream.findMany).mockResolvedValue([]);
    vi.mocked(prisma.playbackHistory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.systemHealthEvent.findMany).mockResolvedValue([]);

    const snapshot = await getLogHealthSnapshot();

    expect(snapshot.status).toEqual({ status: 'healthy', events: [] });
    expect(snapshot.counts.activeStreams).toBe(0);
    expect(snapshot.excludedLibraries).toEqual([]);
  });

  it('aggregates stream counts accurately', async () => {
    vi.mocked(prisma.globalSettings.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.activeStream.findMany).mockResolvedValue([
      {
        id: 'stream-1',
        serverId: 'srv-1',
        sessionId: 'sess-1',
        userId: 'usr-1',
        mediaId: 'med-1',
        lastPingAt: new Date(),
        user: { username: 'alice' },
        media: { title: 'Movie A', collectionType: 'movies', type: 'Movie' },
      },
    ] as any);
    vi.mocked(prisma.playbackHistory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.systemHealthEvent.findMany).mockResolvedValue([]);

    const snapshot = await getLogHealthSnapshot();

    expect(snapshot.counts.activeStreams).toBe(1);
  });
});
