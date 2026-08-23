import prisma from "@/lib/prisma";
import { writeAdminAuditLog } from "@/lib/adminAudit";

export interface MergeUsersInput {
  sourceUserId: string; // Database ID or jellyfinUserId of user to merge and delete (e.g. "mmoreau" or "oidc-mmoreau")
  targetUserId: string; // Database ID or jellyfinUserId of canonical user to keep (e.g. "Maël Moreau")
  actorUsername?: string;
  actorUserId?: string;
}

export interface MergeUsersResult {
  success: boolean;
  sourceUserId: string;
  sourceUsername: string;
  sourceJellyfinId: string;
  targetUserId: string;
  targetUsername: string;
  targetJellyfinId: string;
  sessionsMoved: number;
  streamsMoved: number;
  dailyStatsUpdated: number;
  message?: string;
}

export interface UserDuplicateCandidate {
  id: string;
  jellyfinUserId: string;
  username: string;
  lastActive: string | null;
  sessionsCount: number;
  isOrphanSso: boolean;
  suggestedTarget?: {
    id: string;
    jellyfinUserId: string;
    username: string;
    sessionsCount: number;
  };
}

/**
 * Normalizes a string for loose comparison (removes accents/diacritics and converts to lowercase).
 */
export function normalizeStringLoose(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Safely merges a source User into a target User:
 * 1. Reassigns all PlaybackHistory rows from source to target
 * 2. Reassigns all ActiveStream rows from source to target
 * 3. Aggregates and merges DailyStats rows to avoid unique constraint collisions
 * 4. Deletes the source User
 * 5. Logs the operation in AdminAuditLog
 */
export async function mergeUsers(input: MergeUsersInput): Promise<MergeUsersResult> {
  const sourceIdInput = String(input.sourceUserId || "").trim();
  const targetIdInput = String(input.targetUserId || "").trim();

  if (!sourceIdInput || !targetIdInput) {
    throw new Error("Both sourceUserId and targetUserId are required.");
  }

  const prismaAny = prisma as any;

  // Find source user
  const sourceUser = await prismaAny.user.findFirst({
    where: {
      OR: [
        { id: sourceIdInput },
        { jellyfinUserId: sourceIdInput },
      ],
    },
  });

  if (!sourceUser) {
    throw new Error(`Source user not found (${sourceIdInput}).`);
  }

  // Find target user
  const targetUser = await prismaAny.user.findFirst({
    where: {
      OR: [
        { id: targetIdInput },
        { jellyfinUserId: targetIdInput },
      ],
    },
  });

  if (!targetUser) {
    throw new Error(`Target user not found (${targetIdInput}).`);
  }

  if (sourceUser.id === targetUser.id) {
    throw new Error("Source and target user must be different.");
  }

  let sessionsMoved = 0;
  let streamsMoved = 0;
  let dailyStatsUpdated = 0;

  await prisma.$transaction(async (tx) => {
    const txAny = tx as any;

    // 1. Reassign PlaybackHistory
    const historyRes = await txAny.playbackHistory.updateMany({
      where: { userId: sourceUser.id },
      data: { userId: targetUser.id },
    });
    sessionsMoved = historyRes?.count ?? 0;

    // 2. Reassign ActiveStream
    const streamsRes = await txAny.activeStream.updateMany({
      where: { userId: sourceUser.id },
      data: { userId: targetUser.id },
    });
    streamsMoved = streamsRes?.count ?? 0;

    // 3. Merge DailyStats safely without unique constraint collisions
    const sourceDailyStats = await txAny.dailyStats.findMany({
      where: { userId: sourceUser.id },
    });

    for (const stat of sourceDailyStats) {
      const existingTargetStat = await txAny.dailyStats.findUnique({
        where: {
          date_userId_libraryName_mediaType: {
            date: stat.date,
            userId: targetUser.id,
            libraryName: stat.libraryName,
            mediaType: stat.mediaType,
          },
        },
      });

      if (existingTargetStat) {
        await txAny.dailyStats.update({
          where: { id: existingTargetStat.id },
          data: {
            totalPlays: existingTargetStat.totalPlays + stat.totalPlays,
            totalDuration: existingTargetStat.totalDuration + stat.totalDuration,
            directPlays: existingTargetStat.directPlays + stat.directPlays,
            transcodes: existingTargetStat.transcodes + stat.transcodes,
            uniqueMedia: Math.max(existingTargetStat.uniqueMedia, stat.uniqueMedia),
          },
        });
        await txAny.dailyStats.delete({ where: { id: stat.id } });
      } else {
        await txAny.dailyStats.update({
          where: { id: stat.id },
          data: { userId: targetUser.id },
        });
      }
      dailyStatsUpdated++;
    }

    // 4. Delete the source user
    await txAny.user.delete({
      where: { id: sourceUser.id },
    });
  });

  // 5. Write audit log
  await writeAdminAuditLog({
    action: "User Merged",
    actorUserId: input.actorUserId,
    actorUsername: input.actorUsername || "Admin",
    target: targetUser.username,
    details: {
      sourceUserId: sourceUser.id,
      sourceUsername: sourceUser.username,
      sourceJellyfinId: sourceUser.jellyfinUserId,
      targetUserId: targetUser.id,
      targetUsername: targetUser.username,
      targetJellyfinId: targetUser.jellyfinUserId,
      sessionsMoved,
      streamsMoved,
      dailyStatsUpdated,
    },
  }).catch(() => null);

  return {
    success: true,
    sourceUserId: sourceUser.id,
    sourceUsername: sourceUser.username,
    sourceJellyfinId: sourceUser.jellyfinUserId,
    targetUserId: targetUser.id,
    targetUsername: targetUser.username,
    targetJellyfinId: targetUser.jellyfinUserId,
    sessionsMoved,
    streamsMoved,
    dailyStatsUpdated,
    message: `User "${sourceUser.username}" successfully merged into "${targetUser.username}".`,
  };
}

/**
 * Matches two usernames loosely by testing exact match, substring, word tokens, and initial+lastname (e.g. mmoreau <-> Maël Moreau).
 */
export function matchUsernameLoose(name1: string, name2: string): boolean {
  const n1 = normalizeStringLoose(name1);
  const n2 = normalizeStringLoose(name2);

  if (n1 === n2) return true;
  if (!n1 || !n2) return false;

  // Check substring containment if length >= 4
  if ((n1.length >= 4 && n2.includes(n1)) || (n2.length >= 4 && n1.includes(n2))) {
    return true;
  }

  // Tokenize words: e.g. "mael moreau" -> ["mael", "moreau"]
  const parts1 = n1.split(/[\s._-]+/).filter(Boolean);
  const parts2 = n2.split(/[\s._-]+/).filter(Boolean);

  // Check if any significant word (>= 4 chars, e.g. "moreau") matches or is in the other
  for (const p1 of parts1) {
    if (p1.length >= 4 && (n2.includes(p1) || parts2.includes(p1))) return true;
  }
  for (const p2 of parts2) {
    if (p2.length >= 4 && (n1.includes(p2) || parts1.includes(p2))) return true;
  }

  // Check initial + last name: e.g. "m" + "moreau" = "mmoreau"
  if (parts1.length >= 2) {
    const initialPlusLast = parts1[0][0] + parts1[parts1.length - 1];
    if (n2 === initialPlusLast || n2.includes(initialPlusLast)) return true;
  }
  if (parts2.length >= 2) {
    const initialPlusLast = parts2[0][0] + parts2[parts2.length - 1];
    if (n1 === initialPlusLast || n1.includes(initialPlusLast)) return true;
  }

  return false;
}

/**
 * Detects potential user duplicates and orphan SSO users in the database.
 */
export async function detectUserDuplicates(): Promise<UserDuplicateCandidate[]> {
  const prismaAny = prisma as any;
  const users = await prismaAny.user.findMany({
    select: {
      id: true,
      jellyfinUserId: true,
      username: true,
      lastActive: true,
      _count: {
        select: {
          playbackHistory: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const candidates: UserDuplicateCandidate[] = [];
  const realJellyfinUsers = users.filter((u: any) => !u.jellyfinUserId.startsWith("oidc-"));

  for (const user of users) {
    const isOrphanSso = user.jellyfinUserId.startsWith("oidc-");

    // Look for matching real Jellyfin user with similar/normalized username
    let matchedRealUser: any = null;

    if (isOrphanSso) {
      matchedRealUser = realJellyfinUsers.find((r: any) => {
        return matchUsernameLoose(r.username, user.username);
      });
    }

    if (isOrphanSso) {
      candidates.push({
        id: user.id,
        jellyfinUserId: user.jellyfinUserId,
        username: user.username,
        lastActive: user.lastActive ? new Date(user.lastActive).toISOString() : null,
        sessionsCount: user._count?.playbackHistory || 0,
        isOrphanSso: true,
        suggestedTarget: matchedRealUser
          ? {
              id: matchedRealUser.id,
              jellyfinUserId: matchedRealUser.jellyfinUserId,
              username: matchedRealUser.username,
              sessionsCount: matchedRealUser._count?.playbackHistory || 0,
            }
          : undefined,
      });
    }
  }

  return candidates;
}

/**
 * Automatically cleans up or merges all orphan SSO users that have a matching real Jellyfin user.
 */
export async function cleanupOrphanSsoUsers(actor?: { actorUsername?: string; actorUserId?: string }): Promise<{
  mergedCount: number;
  deletedCount: number;
  results: MergeUsersResult[];
}> {
  const duplicates = await detectUserDuplicates();
  const results: MergeUsersResult[] = [];
  let mergedCount = 0;
  let deletedCount = 0;

  for (const dup of duplicates) {
    if (dup.suggestedTarget) {
      try {
        const result = await mergeUsers({
          sourceUserId: dup.id,
          targetUserId: dup.suggestedTarget.id,
          actorUsername: actor?.actorUsername || "System Cleanup",
          actorUserId: actor?.actorUserId || "system",
        });
        results.push(result);
        mergedCount++;
      } catch (err) {
        console.error(`[UserManagement] Failed to auto-merge duplicate user ${dup.username}:`, err);
      }
    } else if (dup.sessionsCount === 0 && dup.isOrphanSso) {
      // Empty orphan SSO user with no matches and no playback sessions
      try {
        await (prisma as any).user.delete({ where: { id: dup.id } });
        deletedCount++;
      } catch (err) {
        console.error(`[UserManagement] Failed to delete empty orphan user ${dup.username}:`, err);
      }
    }
  }

  return {
    mergedCount,
    deletedCount,
    results,
  };
}
