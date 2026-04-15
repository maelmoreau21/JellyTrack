import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { readSmartSecurityThresholdsFromResolutionSettings } from "@/lib/securitySmartThresholds";

export const dynamic = "force-dynamic";

const SECURITY_ATTEMPT_ACTIONS = [
    "plugin.events.unauthorized",
    "plugin.events.rate_limited",
];

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const auditModel = (prisma as any).adminAuditLog;

    const searchParams = req.nextUrl.searchParams;

    const page = clampNumber(Number(searchParams.get("page") || "1") || 1, 1, 10_000);
    const pageSize = clampNumber(Number(searchParams.get("pageSize") || "25") || 25, 1, 100);
    const action = searchParams.get("action")?.trim() || null;
    const actor = searchParams.get("actor")?.trim() || null;
    const smart = (searchParams.get("smart") || "all").trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const settings = await prisma.globalSettings.findUnique({
        where: { id: "global" },
        select: { resolutionThresholds: true },
    });
    const smartThresholds = readSmartSecurityThresholdsFromResolutionSettings(settings?.resolutionThresholds);
    const hotIpAttemptThreshold = smartThresholds.ipAttemptThreshold;
    const hotIpWindowMs = smartThresholds.ipWindowMinutes * 60 * 1000;
    const newCountryMatchWindowMs = smartThresholds.newCountryGraceMinutes * 60 * 1000;

    const where: Record<string, unknown> = {};

    const now = Date.now();
    const lastWindowStart = new Date(now - hotIpWindowMs);

    const [ipAttemptsRaw, recentPlaybackRows] = await Promise.all([
        auditModel.groupBy({
            by: ["ipAddress"],
            where: {
                ipAddress: { not: null },
                action: { in: SECURITY_ATTEMPT_ACTIONS },
                createdAt: { gte: lastWindowStart },
            },
            _count: { _all: true },
        }),
        prisma.playbackHistory.findMany({
            where: {
                startedAt: { gte: lastWindowStart },
                userId: { not: null },
                country: { notIn: ["", "Unknown"] },
                ipAddress: { not: null },
            },
            select: {
                userId: true,
                country: true,
                ipAddress: true,
                startedAt: true,
            },
        }),
    ]);

    const hotIpRows = (Array.isArray(ipAttemptsRaw) ? ipAttemptsRaw : [])
        .filter((row) => row?.ipAddress && row?._count?._all >= hotIpAttemptThreshold)
        .map((row) => ({
            ipAddress: String(row.ipAddress),
            attempts: Number(row._count._all || 0),
        }))
        .sort((left, right) => right.attempts - left.attempts);

    const hotIpSet = new Set(hotIpRows.map((row) => row.ipAddress));
    const hotIpCountByIp = new Map(hotIpRows.map((row) => [row.ipAddress, row.attempts] as [string, number]));

    const candidateUserIds = Array.from(
        new Set(
            recentPlaybackRows
                .map((row) => row.userId)
                .filter((value): value is string => typeof value === "string" && value.length > 0)
        )
    );
    const candidateCountries = Array.from(
        new Set(
            recentPlaybackRows
                .map((row) => row.country)
                .filter((value): value is string => typeof value === "string" && value.length > 0 && value !== "Unknown")
        )
    );

    let firstSeenRows: Array<{ userId: string | null; country: string | null; _min: { startedAt: Date | null } }> = [];
    if (candidateUserIds.length > 0 && candidateCountries.length > 0) {
        firstSeenRows = await prisma.playbackHistory.groupBy({
            by: ["userId", "country"],
            where: {
                userId: { in: candidateUserIds },
                country: { in: candidateCountries },
            },
            _min: { startedAt: true },
        });
    }

    const firstSeenByPair = new Map<string, number>();
    firstSeenRows.forEach((row) => {
        if (!row.userId || !row.country || !row._min.startedAt) return;
        firstSeenByPair.set(`${row.userId}:${row.country}`, row._min.startedAt.getTime());
    });

    const newCountryIpCount = new Map<string, number>();
    const newCountrySet = new Set<string>();
    recentPlaybackRows.forEach((row) => {
        if (!row.userId || !row.country || !row.ipAddress) return;
        const firstSeenTs = firstSeenByPair.get(`${row.userId}:${row.country}`);
        if (typeof firstSeenTs !== "number") return;

        const startedAtTs = row.startedAt.getTime();
        if (Math.abs(startedAtTs - firstSeenTs) > newCountryMatchWindowMs) return;

        const currentCount = newCountryIpCount.get(row.ipAddress) || 0;
        newCountryIpCount.set(row.ipAddress, currentCount + 1);
        newCountrySet.add(row.country);
    });

    const newCountryIpRows = Array.from(newCountryIpCount.entries())
        .map(([ipAddress, count]) => ({ ipAddress, count }))
        .sort((left, right) => right.count - left.count);

    const newCountryIpSet = new Set(newCountryIpRows.map((row) => row.ipAddress));

    if (action) {
        where.action = action;
    }

    if (actor) {
        where.actorUsername = { contains: actor, mode: "insensitive" };
    }

    if (from || to) {
        const createdAt: Record<string, Date> = {};
        if (from) {
            const parsedFrom = new Date(from);
            if (!Number.isNaN(parsedFrom.getTime())) {
                createdAt.gte = parsedFrom;
            }
        }
        if (to) {
            const parsedTo = new Date(to);
            if (!Number.isNaN(parsedTo.getTime())) {
                createdAt.lte = parsedTo;
            }
        }
        if (Object.keys(createdAt).length > 0) {
            where.createdAt = createdAt;
        }
    }

    if (smart === "ip_50_attempts" || smart === "ip_attempt_burst") {
        if (hotIpSet.size > 0) {
            where.ipAddress = { in: Array.from(hotIpSet) };
            if (!action) {
                where.action = { in: SECURITY_ATTEMPT_ACTIONS };
            }
        } else {
            where.id = "__no_match__";
        }
    } else if (smart === "new_country_success") {
        if (newCountryIpSet.size > 0) {
            where.ipAddress = { in: Array.from(newCountryIpSet) };
        } else {
            where.id = "__no_match__";
        }
    }

    const [total, rows] = await Promise.all([
        auditModel.count({ where }),
        auditModel.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
                id: true,
                action: true,
                actorUserId: true,
                actorUsername: true,
                target: true,
                ipAddress: true,
                details: true,
                createdAt: true,
            },
        }),
    ]);

    const rowsWithAnomalies = (rows || []).map((row: Record<string, unknown>) => {
        const ipAddress = typeof row.ipAddress === "string" ? row.ipAddress : null;
        const anomalyFlags: string[] = [];

        if (ipAddress && hotIpSet.has(ipAddress)) {
            anomalyFlags.push("ip_50_attempts");
        }
        if (ipAddress && newCountryIpSet.has(ipAddress)) {
            anomalyFlags.push("new_country_success");
        }

        return {
            ...row,
            anomalyFlags,
            ipAttemptCount24h: ipAddress ? hotIpCountByIp.get(ipAddress) || null : null,
            newCountryCount24h: ipAddress ? newCountryIpCount.get(ipAddress) || null : null,
        };
    });

    return NextResponse.json({
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        smart,
        anomalies: {
            ipAttemptThreshold: hotIpAttemptThreshold,
            ipWindowMinutes: smartThresholds.ipWindowMinutes,
            newCountryGraceMinutes: smartThresholds.newCountryGraceMinutes,
            hotIp24h: hotIpRows,
            newCountrySuccess24h: {
                count: Array.from(newCountryIpCount.values()).reduce((sum, value) => sum + value, 0),
                countries: Array.from(newCountrySet).sort(),
                ips: newCountryIpRows,
            },
        },
        rows: rowsWithAnomalies,
    });
}
