import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { apiT } from "@/lib/i18n-api";
import { AVAILABLE_LOCALES } from "@/i18n/locales";
import { getAvailableLibraryKeys, normalizeLibraryKey } from "@/lib/mediaPolicy";
import { loadLibraryRules, saveLibraryRules } from "@/lib/libraryRules";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function fetchJellyfinLibraryKeys() {
    const jellyfinUrl = process.env.JELLYFIN_URL;
    const jellyfinApiKey = process.env.JELLYFIN_API_KEY;

    if (!jellyfinUrl || !jellyfinApiKey) {
        return { keys: [] as string[], source: "database" as const, error: "Jellyfin env vars missing" };
    }

    try {
        const response = await fetch(`${jellyfinUrl}/Library/VirtualFolders`, {
            method: "GET",
            headers: {
                "X-Emby-Token": jellyfinApiKey,
            },
            cache: "no-store",
        });

        if (!response.ok) {
            return { keys: [] as string[], source: "database" as const, error: `Jellyfin returned ${response.status}` };
        }

        const payload = await response.json();
        const folders = Array.isArray(payload) ? payload : [];

        const keys = folders
            .map((folder: any) => normalizeLibraryKey(folder?.CollectionType))
            .filter((value: string | null): value is string => Boolean(value));

        return {
            keys: Array.from(new Set(keys)),
            source: "jellyfin" as const,
            error: null,
        };
    } catch {
        return { keys: [] as string[], source: "database" as const, error: "Jellyfin fetch failed" };
    }
}

// Endpoint to fetch global settings (admin only)
export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        let settings = await prisma.globalSettings.findUnique({
            where: { id: "global" }
        });

        // Initialize if empty
        if (!settings) {
            settings = await prisma.globalSettings.create({
                data: {
                    id: "global",
                    discordWebhookUrl: null,
                    discordAlertCondition: "ALL",
                    discordAlertsEnabled: false,
                    excludedLibraries: [],
                    monitorIntervalActive: 1000,
                    monitorIntervalIdle: 5000,
                }
            });
        }

        const [mediaLibraries, jellyfinScan] = await Promise.all([
            prisma.media.findMany({
            distinct: ["collectionType"],
            where: { collectionType: { not: null } },
            select: { collectionType: true }
            }),
            fetchJellyfinLibraryKeys(),
        ]);

        const libraryRules = await loadLibraryRules();
        const availableLibraries = getAvailableLibraryKeys([
            ...jellyfinScan.keys,
            ...mediaLibraries.map((entry) => entry.collectionType),
            ...Object.keys(libraryRules),
        ]);

        return NextResponse.json({
            ...settings,
            availableLibraries,
            libraryRules,
            libraryScanSource: jellyfinScan.source,
            libraryScanError: jellyfinScan.error,
        }, { status: 200 });
    } catch (error) {
        console.error("Failed to fetch settings:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// Endpoint to update global settings (admin only)
export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    try {
        const body = await req.json();
        const { discordWebhookUrl, discordAlertCondition, discordAlertsEnabled, excludedLibraries, monitorIntervalActive, monitorIntervalIdle, syncCronHour, syncCronMinute, backupCronHour, backupCronMinute, defaultLocale, libraryRules } = body;

        // Input validation — Discord webhook URL must be a valid Discord URL or null
        if (discordWebhookUrl !== undefined && discordWebhookUrl !== null && discordWebhookUrl !== "") {
            try {
                const parsed = new URL(discordWebhookUrl);
                if (!parsed.hostname.endsWith("discord.com") && !parsed.hostname.endsWith("discordapp.com")) {
                    return NextResponse.json({ error: await apiT('discordUrlDomain') }, { status: 400 });
                }
                if (parsed.protocol !== "https:") {
                    return NextResponse.json({ error: await apiT('discordUrlHttps') }, { status: 400 });
                }
            } catch {
                return NextResponse.json({ error: await apiT('discordUrlInvalid') }, { status: 400 });
            }
        }

        // Input validation — alert condition must be a known value
        const VALID_CONDITIONS = ["ALL", "TRANSCODE_ONLY", "NEW_IP_ONLY"];
        if (discordAlertCondition !== undefined && !VALID_CONDITIONS.includes(discordAlertCondition)) {
            return NextResponse.json({ error: await apiT('alertConditionInvalid') }, { status: 400 });
        }

        // Input validation — intervals must be positive numbers within sane bounds
        if (monitorIntervalActive !== undefined) {
            const val = Number(monitorIntervalActive);
            if (isNaN(val) || val < 500 || val > 60000) {
                return NextResponse.json({ error: await apiT('intervalActiveRange') }, { status: 400 });
            }
        }
        if (monitorIntervalIdle !== undefined) {
            const val = Number(monitorIntervalIdle);
            if (isNaN(val) || val < 1000 || val > 300000) {
                return NextResponse.json({ error: await apiT('intervalIdleRange') }, { status: 400 });
            }
        }

        // Input validation — cron hours/minutes
        if (syncCronHour !== undefined) {
            const val = Number(syncCronHour);
            if (isNaN(val) || val < 0 || val > 23) return NextResponse.json({ error: await apiT('syncCronHourRange') }, { status: 400 });
        }
        if (syncCronMinute !== undefined) {
            const val = Number(syncCronMinute);
            if (isNaN(val) || val < 0 || val > 59) return NextResponse.json({ error: await apiT('syncCronMinuteRange') }, { status: 400 });
        }
        if (backupCronHour !== undefined) {
            const val = Number(backupCronHour);
            if (isNaN(val) || val < 0 || val > 23) return NextResponse.json({ error: await apiT('backupCronHourRange') }, { status: 400 });
        }
        if (backupCronMinute !== undefined) {
            const val = Number(backupCronMinute);
            if (isNaN(val) || val < 0 || val > 59) return NextResponse.json({ error: await apiT('backupCronMinuteRange') }, { status: 400 });
        }
        const validLocales = AVAILABLE_LOCALES.map((locale) => locale.code);
        if (defaultLocale !== undefined && !validLocales.includes(defaultLocale)) {
            return NextResponse.json({ error: await apiT('localeInvalid') }, { status: 400 });
        }

        const updated = await prisma.globalSettings.upsert({
            where: { id: "global" },
            update: {
                discordWebhookUrl: discordWebhookUrl !== undefined ? discordWebhookUrl : undefined,
                discordAlertCondition: discordAlertCondition !== undefined ? discordAlertCondition : undefined,
                discordAlertsEnabled: discordAlertsEnabled !== undefined ? discordAlertsEnabled : undefined,
                excludedLibraries: excludedLibraries !== undefined ? excludedLibraries : undefined,
                monitorIntervalActive: monitorIntervalActive !== undefined ? monitorIntervalActive : undefined,
                monitorIntervalIdle: monitorIntervalIdle !== undefined ? monitorIntervalIdle : undefined,
                syncCronHour: syncCronHour !== undefined ? Number(syncCronHour) : undefined,
                syncCronMinute: syncCronMinute !== undefined ? Number(syncCronMinute) : undefined,
                backupCronHour: backupCronHour !== undefined ? Number(backupCronHour) : undefined,
                backupCronMinute: backupCronMinute !== undefined ? Number(backupCronMinute) : undefined,
                defaultLocale: defaultLocale !== undefined ? defaultLocale : undefined,
            },
            create: {
                id: "global",
                discordWebhookUrl: discordWebhookUrl || null,
                discordAlertCondition: discordAlertCondition || "ALL",
                discordAlertsEnabled: discordAlertsEnabled || false,
                excludedLibraries: excludedLibraries || [],
                monitorIntervalActive: monitorIntervalActive || 1000,
                monitorIntervalIdle: monitorIntervalIdle || 5000,
                syncCronHour: syncCronHour !== undefined ? Number(syncCronHour) : 3,
                syncCronMinute: syncCronMinute !== undefined ? Number(syncCronMinute) : 0,
                backupCronHour: backupCronHour !== undefined ? Number(backupCronHour) : 3,
                backupCronMinute: backupCronMinute !== undefined ? Number(backupCronMinute) : 30,
                defaultLocale: defaultLocale || "fr",
            }
        });

        // Update monitor intervals in real-time (same Node.js process)
        if (monitorIntervalActive !== undefined || monitorIntervalIdle !== undefined) {
            try {
                const { updateMonitorIntervals } = await import("@/server/monitor");
                updateMonitorIntervals(
                    updated.monitorIntervalActive,
                    updated.monitorIntervalIdle
                );
            } catch (err) {
                console.warn("[Settings] Could not update monitor intervals:", err);
            }
        }

        // Reschedule cron jobs if schedule changed
        if (syncCronHour !== undefined || syncCronMinute !== undefined || backupCronHour !== undefined || backupCronMinute !== undefined) {
            try {
                const { rescheduleCronJobs } = await import("@/server/cronManager");
                rescheduleCronJobs({
                    syncCronHour: updated.syncCronHour,
                    syncCronMinute: updated.syncCronMinute,
                    backupCronHour: updated.backupCronHour,
                    backupCronMinute: updated.backupCronMinute,
                });
            } catch (err) {
                console.warn("[Settings] Could not reschedule cron jobs:", err);
            }
        }

        if (libraryRules !== undefined) {
            await saveLibraryRules(libraryRules);
        }

        revalidatePath('/');
        revalidatePath('/settings');
        revalidatePath('/admin/cleanup');
        revalidatePath('/admin/log-health');

        return NextResponse.json(updated, { status: 200 });
    } catch (error) {
        console.error("Failed to update settings:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
