import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mergeUsers,
  detectUserDuplicates,
  normalizeStringLoose,
  deleteUser,
  pruneDeletedJellyfinUsers,
} from "./userManagement";
import prisma from "@/lib/prisma";

vi.mock("@/lib/prisma", () => {
  const mockUser = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
  const mockPlaybackHistory = {
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const mockActiveStream = {
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
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

vi.mock("@/lib/jellyfinServers", () => ({
  getConfiguredJellyfinServers: vi.fn().mockResolvedValue([
    {
      id: "srv-1",
      name: "Main Server",
      url: "http://jellyfin.test",
      apiKey: "test-key",
      isPrimary: true,
    },
  ]),
  buildJellyfinApiKeyHeaders: vi.fn().mockReturnValue({ "X-MediaBrowser-Token": "test-key" }),
}));

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

  describe("deleteUser", () => {
    it("deletes user and cascades playbackHistory and activeStreams", async () => {
      const user = {
        id: "user-to-delete-1",
        jellyfinUserId: "jf-del-1",
        username: "deleted_user",
      };

      const prismaAny = prisma as any;
      prismaAny.user.findFirst.mockResolvedValue(user);
      prismaAny.activeStream.deleteMany.mockResolvedValue({ count: 2 });
      prismaAny.playbackHistory.deleteMany.mockResolvedValue({ count: 15 });
      prismaAny.user.delete.mockResolvedValue(user);

      const result = await deleteUser({
        userId: "user-to-delete-1",
        actorUsername: "AdminTest",
      });

      expect(result.success).toBe(true);
      expect(result.username).toBe("deleted_user");
      expect(result.sessionsDeleted).toBe(15);
      expect(result.streamsDeleted).toBe(2);
      expect(prismaAny.user.delete).toHaveBeenCalledWith({ where: { id: "user-to-delete-1" } });
    });

    it("throws error when user is not found", async () => {
      const prismaAny = prisma as any;
      prismaAny.user.findFirst.mockResolvedValue(null);

      await expect(deleteUser({ userId: "non-existent" })).rejects.toThrow(
        "User not found: non-existent"
      );
    });
  });

  describe("pruneDeletedJellyfinUsers", () => {
    it("prunes users that no longer exist in Jellyfin", async () => {
      const existingInJt = [
        { id: "u-1", jellyfinUserId: "jf-active-1", username: "ActiveUser" },
        { id: "u-2", jellyfinUserId: "jf-deleted-2", username: "DeletedUser" },
        { id: "u-3", jellyfinUserId: "oidc-sso-orphan", username: "SsoUser" },
      ];

      const prismaAny = prisma as any;
      prismaAny.user.findMany.mockResolvedValue(existingInJt);

      // Mock Jellyfin /Users endpoint returning only jf-active-1
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ Id: "jf-active-1", Name: "ActiveUser" }],
      }) as any;

      try {
        const result = await pruneDeletedJellyfinUsers(undefined, "AdminTest");

        expect(result.totalPruned).toBe(1);
        expect(result.prunedUsers).toEqual(["DeletedUser"]);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("does nothing when all users exist in Jellyfin", async () => {
      const existingInJt = [
        { id: "u-1", jellyfinUserId: "jf-active-1", username: "ActiveUser" },
      ];

      const prismaAny = prisma as any;
      prismaAny.user.findMany.mockResolvedValue(existingInJt);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ Id: "jf-active-1", Name: "ActiveUser" }],
      }) as any;

      try {
        const result = await pruneDeletedJellyfinUsers(undefined, "AdminTest");

        expect(result.totalPruned).toBe(0);
        expect(result.prunedUsers).toEqual([]);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

