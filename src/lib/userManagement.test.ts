import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeUsers, detectUserDuplicates, normalizeStringLoose } from "./userManagement";
import prisma from "@/lib/prisma";

vi.mock("@/lib/prisma", () => {
  const mockUser = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
  };
  const mockPlaybackHistory = {
    updateMany: vi.fn(),
  };
  const mockActiveStream = {
    updateMany: vi.fn(),
  };
  const mockDailyStats = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return {
    default: {
      user: mockUser,
      playbackHistory: mockPlaybackHistory,
      activeStream: mockActiveStream,
      dailyStats: mockDailyStats,
      $transaction: vi.fn((callback) =>
        callback({
          user: mockUser,
          playbackHistory: mockPlaybackHistory,
          activeStream: mockActiveStream,
          dailyStats: mockDailyStats,
        })
      ),
    },
  };
});

vi.mock("@/lib/adminAudit", () => ({
  writeAdminAuditLog: vi.fn().mockResolvedValue(true),
}));

describe("userManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeStringLoose", () => {
    it("removes accents and converts to lowercase", () => {
      expect(normalizeStringLoose("Maël Moreau")).toBe("mael moreau");
      expect(normalizeStringLoose("Éléonore")).toBe("eleonore");
      expect(normalizeStringLoose("  MMoreau  ")).toBe("mmoreau");
    });
  });

  describe("mergeUsers", () => {
    it("successfully merges source user into target user", async () => {
      const sourceUser = {
        id: "source-db-1",
        jellyfinUserId: "oidc-mmoreau",
        username: "mmoreau",
      };
      const targetUser = {
        id: "target-db-2",
        jellyfinUserId: "jf-uuid-12345",
        username: "Maël Moreau",
      };

      const prismaAny = prisma as any;
      prismaAny.user.findFirst.mockImplementation((args: any) => {
        const query = args.where.OR[0].id || args.where.OR[1].jellyfinUserId;
        if (query === "source-db-1" || query === "oidc-mmoreau") return Promise.resolve(sourceUser);
        if (query === "target-db-2" || query === "jf-uuid-12345") return Promise.resolve(targetUser);
        return Promise.resolve(null);
      });

      prismaAny.playbackHistory.updateMany.mockResolvedValue({ count: 12 });
      prismaAny.activeStream.updateMany.mockResolvedValue({ count: 1 });
      prismaAny.dailyStats.findMany.mockResolvedValue([]);
      prismaAny.user.delete.mockResolvedValue(sourceUser);

      const result = await mergeUsers({
        sourceUserId: "oidc-mmoreau",
        targetUserId: "jf-uuid-12345",
        actorUsername: "Admin",
      });

      expect(result.success).toBe(true);
      expect(result.sourceUsername).toBe("mmoreau");
      expect(result.targetUsername).toBe("Maël Moreau");
      expect(result.sessionsMoved).toBe(12);
      expect(result.streamsMoved).toBe(1);
      expect(prismaAny.user.delete).toHaveBeenCalledWith({ where: { id: "source-db-1" } });
    });

    it("throws error if source and target are the same user", async () => {
      const sameUser = { id: "user-1", jellyfinUserId: "uuid-1", username: "Same" };
      const prismaAny = prisma as any;
      prismaAny.user.findFirst.mockResolvedValue(sameUser);

      await expect(
        mergeUsers({ sourceUserId: "user-1", targetUserId: "user-1" })
      ).rejects.toThrow("Source and target user must be different.");
    });
  });

  describe("detectUserDuplicates", () => {
    it("detects orphan SSO user and matches with real Jellyfin user", async () => {
      const users = [
        {
          id: "u-real",
          jellyfinUserId: "uuid-real-jf",
          username: "Maël Moreau",
          lastActive: new Date(),
          _count: { playbackHistory: 50 },
        },
        {
          id: "u-orphan",
          jellyfinUserId: "oidc-mmoreau",
          username: "mmoreau",
          lastActive: null,
          _count: { playbackHistory: 0 },
        },
      ];

      const prismaAny = prisma as any;
      prismaAny.user.findMany.mockResolvedValue(users);

      const duplicates = await detectUserDuplicates();
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].username).toBe("mmoreau");
      expect(duplicates[0].isOrphanSso).toBe(true);
      expect(duplicates[0].suggestedTarget?.username).toBe("Maël Moreau");
    });
  });
});
