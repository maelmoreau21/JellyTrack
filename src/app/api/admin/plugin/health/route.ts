import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { getMasterServerIdentityFromEnv } from "@/lib/serverRegistry";
import { getRequestIp, writeAdminAuditLog } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

const FAILURE_ACTIONS = [
    "plugin.events.unauthorized",
    "plugin.events.rate_limited",
    "plugin.events.payload_too_large",
    "plugin.events.invalid_payload",
    "plugin.events.invalid_content_type",
] as const;

const DEFAULT_GAP_WARNING_SEC = Number(process.env.PLUGIN_HEALTH_GAP_WARNING_SEC || 90);
const DEFAULT_GAP_CRITICAL_SEC = Number(process.env.PLUGIN_HEALTH_GAP_CRITICAL_SEC || 180);
const DEFAULT_JITTER_WARNING_SEC = Number(process.env.PLUGIN_HEALTH_JITTER_WARNING_SEC || 15);
const DEFAULT_JITTER_CRITICAL_SEC = Number(process.env.PLUGIN_HEALTH_JITTER_CRITICAL_SEC || 30);
const DEFAULT_HEARTBEAT_TIMEOUT_SEC = Number(process.env.PLUGIN_HEARTBEAT_TIMEOUT_SEC) || 600;

function clampPositiveNumber(value: number, fallback: number): number {
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return value;
}

const HEARTBEAT_THRESHOLD_DEFAULTS = {
    gapWarningSec: clampPositiveNumber(DEFAULT_GAP_WARNING_SEC, 90),
    gapCriticalSec: clampPositiveNumber(DEFAULT_GAP_CRITICAL_SEC, 180),
    jitterWarningSec: clampPositiveNumber(DEFAULT_JITTER_WARNING_SEC, 15),
    jitterCriticalSec: clampPositiveNumber(DEFAULT_JITTER_CRITICAL_SEC, 30),
};

if (HEARTBEAT_THRESHOLD_DEFAULTS.gapCriticalSec <= HEARTBEAT_THRESHOLD_DEFAULTS.gapWarningSec) {
    HEARTBEAT_THRESHOLD_DEFAULTS.gapCriticalSec = HEARTBEAT_THRESHOLD_DEFAULTS.gapWarningSec + 1;
}

if (HEARTBEAT_THRESHOLD_DEFAULTS.jitterCriticalSec <= HEARTBEAT_THRESHOLD_DEFAULTS.jitterWarningSec) {
    HEARTBEAT_THRESHOLD_DEFAULTS.jitterCriticalSec = HEARTBEAT_THRESHOLD_DEFAULTS.jitterWarningSec + 0.1;
}

function percentile(values: number[], percentileValue: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
    return sorted[index];
}

function computeIntervalsMs(timestamps: Date[]): number[] {
    if (timestamps.length < 2) return [];
    const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        intervals.push(sorted[i].getTime() - sorted[i - 1].getTime());
    }
    return intervals;
}

function parseFiniteNumber(raw: unknown): number | null {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
        const parsed = Number(raw.trim());
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

async function buildPluginHealthSnapshot(req: Request) {
    const now = Date.now();
    const nowDate = new Date(now);
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const parsedHeartbeatTimeoutSec = Number(process.env.PLUGIN_HEARTBEAT_TIMEOUT_SEC);
    const HEARTBEAT_TIMEOUT_SEC = Number.isFinite(parsedHeartbeatTimeoutSec) && parsedHeartbeatTimeoutSec > 0
        ? parsedHeartbeatTimeoutSec
        : DEFAULT_HEARTBEAT_TIMEOUT_SEC;
    const staleThreshold = new Date(now - HEARTBEAT_TIMEOUT_SEC * 1000);

    const auditModel = (prisma as any).adminAuditLog;

    const [settings, heartbeatEvents, activeStreamsAgg, playbackStarts24h, playbackStops24h, failureCount24h, unauthorized24h, rateLimited24h, invalidPayload24h, monitorErrors24h, recentAuditFailures] = await Promise.all([
        prisma.globalSettings.findUnique({
            where: { id: "global" },
            select: {
                pluginLastSeen: true,
                pluginVersion: true,
                pluginServerName: true,
                pluginApiKey: true,
            },
        }),
        prisma.systemHealthEvent.findMany({
            where: {
                source: "monitor",
                kind: "monitor_ping",
                createdAt: { gte: dayAgo },
            },
            orderBy: { createdAt: "asc" },
            select: { createdAt: true, message: true, details: true },
        }),
        prisma.activeStream.aggregate({
            where: { lastPingAt: { gte: staleThreshold } },
            _count: { _all: true },
            _avg: { bitrate: true },
        }),
        prisma.playbackHistory.count({ where: { startedAt: { gte: dayAgo } } }),
        prisma.playbackHistory.count({ where: { endedAt: { gte: dayAgo } } }),
        auditModel?.count
            ? auditModel.count({ where: { action: { in: FAILURE_ACTIONS as unknown as string[] }, createdAt: { gte: dayAgo } } })
            : Promise.resolve(0),
        auditModel?.count
            ? auditModel.count({ where: { action: "plugin.events.unauthorized", createdAt: { gte: dayAgo } } })
            : Promise.resolve(0),
        auditModel?.count
            ? auditModel.count({ where: { action: "plugin.events.rate_limited", createdAt: { gte: dayAgo } } })
            : Promise.resolve(0),
        auditModel?.count
            ? auditModel.count({ where: { action: "plugin.events.invalid_payload", createdAt: { gte: dayAgo } } })
            : Promise.resolve(0),
        prisma.systemHealthEvent.count({
            where: {
                source: "monitor",
                kind: { contains: "error" },
                createdAt: { gte: dayAgo },
            },
        }),
        auditModel?.findMany
            ? auditModel.findMany({
                where: {
                    action: { in: FAILURE_ACTIONS as unknown as string[] },
                },
                orderBy: { createdAt: "desc" },
                take: 8,
                select: {
                    id: true,
                    action: true,
                    ipAddress: true,
                    createdAt: true,
                    details: true,
                },
            })
            : Promise.resolve([]),
    ]);

    const lastSeen = settings?.pluginLastSeen ? new Date(settings.pluginLastSeen) : null;
    const heartbeatGapSec = lastSeen ? Math.max(0, Math.floor((now - lastSeen.getTime()) / 1000)) : null;

    const heartbeatIntervalsMs = computeIntervalsMs(heartbeatEvents.map((event) => event.createdAt));
    const p50IntervalMs = percentile(heartbeatIntervalsMs, 50);
    const p95IntervalMs = percentile(heartbeatIntervalsMs, 95);

    const baselineIntervalMs = p50IntervalMs;
    const heartbeatJitterMs = baselineIntervalMs
        ? heartbeatIntervalsMs.map((interval) => Math.abs(interval - baselineIntervalMs))
        : [];
    const jitterP95Ms = percentile(heartbeatJitterMs, 95);

    const intervalSeriesRaw = heartbeatIntervalsMs.map((intervalMs, index) => {
        const sampleTime = heartbeatEvents[index + 1]?.createdAt;
        return {
            timestamp: (sampleTime instanceof Date ? sampleTime : new Date(now)).toISOString(),
            intervalSec: Number((intervalMs / 1000).toFixed(2)),
            jitterSec: baselineIntervalMs !== null
                ? Number((Math.abs(intervalMs - baselineIntervalMs) / 1000).toFixed(2))
                : null,
        };
    });

    const maxTimelinePoints = 240;
    const samplingStep = intervalSeriesRaw.length > maxTimelinePoints
        ? Math.ceil(intervalSeriesRaw.length / maxTimelinePoints)
        : 1;
    const intervalSeries24h = intervalSeriesRaw.filter((_, index) => (
        index % samplingStep === 0 || index === intervalSeriesRaw.length - 1
    ));

    const latestHeartbeatDetails = heartbeatEvents.length > 0
        ? heartbeatEvents[heartbeatEvents.length - 1]?.details
        : null;
    const heartbeatDetails = latestHeartbeatDetails && typeof latestHeartbeatDetails === "object" && !Array.isArray(latestHeartbeatDetails)
        ? latestHeartbeatDetails as Record<string, unknown>
        : null;
    const queueDepth = parseFiniteNumber(heartbeatDetails?.queueDepth ?? heartbeatDetails?.QueueDepth);
    const retries = parseFiniteNumber(heartbeatDetails?.retries ?? heartbeatDetails?.Retries ?? heartbeatDetails?.retryCount ?? heartbeatDetails?.RetryCount);
    const lastHttpCode = parseFiniteNumber(
        heartbeatDetails?.lastHttpCode ??
        heartbeatDetails?.LastHttpCode ??
        heartbeatDetails?.lastHttpStatusCode ??
        heartbeatDetails?.LastHttpStatusCode
    );

    const normalizedQueueDepth = queueDepth !== null ? Math.max(0, Math.floor(queueDepth)) : null;
    const normalizedRetries = retries !== null ? Math.max(0, Math.floor(retries)) : null;
    const normalizedLastHttpCode = lastHttpCode !== null ? Math.max(0, Math.floor(lastHttpCode)) : null;
    const hasPluginMetrics = normalizedQueueDepth !== null || normalizedRetries !== null || normalizedLastHttpCode !== null;

    const successEstimate24h = heartbeatEvents.length + playbackStarts24h + playbackStops24h;
    const totalEstimate24h = successEstimate24h + failureCount24h;
    const successRate24h = totalEstimate24h > 0
        ? Number(((successEstimate24h / totalEstimate24h) * 100).toFixed(2))
        : null;

    const staleStreams = await prisma.activeStream.count({ where: { lastPingAt: { lt: staleThreshold } } });
    const transcodeStreams = await prisma.activeStream.count({ where: { lastPingAt: { gte: staleThreshold }, playMethod: "Transcode" } });

    return {
        generatedAt: nowDate.toISOString(),
        plugin: {
            connected: heartbeatGapSec !== null ? heartbeatGapSec <= HEARTBEAT_TIMEOUT_SEC : false,
            lastSeen: settings?.pluginLastSeen || null,
            version: settings?.pluginVersion || null,
            serverName: settings?.pluginServerName || null,
            hasApiKey: Boolean(settings?.pluginApiKey),
            endpoint: "/api/plugin/events",
        },
        heartbeat: {
            count24h: heartbeatEvents.length,
            gapSec: heartbeatGapSec,
            intervalP50Sec: p50IntervalMs !== null ? Number((p50IntervalMs / 1000).toFixed(2)) : null,
            intervalP95Sec: p95IntervalMs !== null ? Number((p95IntervalMs / 1000).toFixed(2)) : null,
            jitterP95Sec: jitterP95Ms !== null ? Number((jitterP95Ms / 1000).toFixed(2)) : null,
            intervalSeries24h,
        },
        thresholdDefaults: HEARTBEAT_THRESHOLD_DEFAULTS,
        ingestion: {
            successEstimate24h,
            failureCount24h,
            unauthorized24h,
            rateLimited24h,
            invalidPayload24h,
            monitorErrors24h,
            successRate24h,
        },
        streams: {
            active: activeStreamsAgg._count._all,
            transcodes: transcodeStreams,
            stale: staleStreams,
            avgBitrateKbps: activeStreamsAgg._avg.bitrate !== null
                ? Number(activeStreamsAgg._avg.bitrate)
                : null,
        },
        pluginReportedMetrics: {
            queueDepth: normalizedQueueDepth,
            retries: normalizedRetries,
            lastHttpCode: normalizedLastHttpCode,
            note: hasPluginMetrics
                ? "Live plugin telemetry from latest heartbeat."
                : "Current plugin payload version does not include queue depth/retry/http diagnostics.",
        },
        recentFailures: recentAuditFailures.map((event: any) => ({
            id: String(event.id),
            action: String(event.action),
            ipAddress: event.ipAddress || null,
            createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt),
            details: event.details || null,
        })),
    };
}

export async function GET(req: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const payload = await buildPluginHealthSnapshot(req);
    const url = new URL(req.url);
    const shouldExport = url.searchParams.get("export") === "1";

    if (shouldExport) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        return new NextResponse(JSON.stringify(payload, null, 2), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "content-disposition": `attachment; filename=plugin-health-diagnostic-${stamp}.json`,
                "cache-control": "no-store",
            },
        });
    }

    return NextResponse.json(payload, { status: 200, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const ipAddress = getRequestIp(req);

    let body: { action?: string; apiKey?: string } = {};
    try {
        body = (await req.json()) as { action?: string };
    } catch {
        body = {};
    }

    const action = typeof body.action === "string" ? body.action : "";

    if (action === "test_connection") {
        const pluginEvents = await import("@/app/api/plugin/events/route");
        const start = Date.now();
        const response = await pluginEvents.GET();
        const latencyMs = Date.now() - start;

        await writeAdminAuditLog({
            action: "plugin.health.test_connection",
            actorUserId: auth.jellyfinUserId || null,
            actorUsername: auth.username || null,
            ipAddress,
            target: "/api/plugin/events",
            details: {
                ok: response.ok,
                status: response.status,
                latencyMs,
            },
        });

        return NextResponse.json({
            ok: response.ok,
            status: response.status,
            latencyMs,
            endpoint: "/api/plugin/events",
        });
    }

    if (action === "force_heartbeat") {
        const providedApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
        if (!providedApiKey) {
            return NextResponse.json({ error: "Plugin API key is required for manual heartbeat in hash-only mode." }, { status: 400 });
        }

        const identity = getMasterServerIdentityFromEnv();
        const syntheticHeartbeat = {
            event: "Heartbeat",
            eventSchemaVersion: 2,
            pluginVersion: "manual-probe",
            serverName: identity.name,
            serverId: identity.jellyfinServerId,
            serverUrl: identity.url,
            users: [],
        };

        const pluginEvents = await import("@/app/api/plugin/events/route");
        const start = Date.now();
        const response = await pluginEvents.POST(new Request("http://localhost/api/plugin/events", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${providedApiKey}`,
            },
            body: JSON.stringify(syntheticHeartbeat),
        }));
        const latencyMs = Date.now() - start;

        const rawBody = await response.text();
        let parsedBody: unknown = rawBody;
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            // Keep raw text fallback.
        }

        await writeAdminAuditLog({
            action: "plugin.health.force_heartbeat",
            actorUserId: auth.jellyfinUserId || null,
            actorUsername: auth.username || null,
            ipAddress,
            target: "/api/plugin/events",
            details: {
                ok: response.ok,
                status: response.status,
                latencyMs,
            },
        });

        return NextResponse.json({
            ok: response.ok,
            status: response.status,
            latencyMs,
            response: parsedBody,
        });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
