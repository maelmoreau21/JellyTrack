import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { apiT } from "@/lib/i18n-api";
import { AVAILABLE_LOCALES } from "@/i18n/locales";
// No more library rules
import { getSanitizedLibraryNames, getServerLibraryScopes } from "@/lib/libraryUtils";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function fetchJellyfinLibraryNames() {
    const jellyfinUrl = process.env.JELLYFIN_URL;
    const jellyfinApiKey = process.env.JELLYFIN_API_KEY;

    if (!jellyfinUrl || !jellyfinApiKey) {
        return { names: [] as string[], source: "database" as const, error: "Jellyfin env vars missing" };
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
            return { names: [] as string[], source: "database" as const, error: `Jellyfin returned ${response.status}` };
        }

        const payload = await response.json();
        const folders = Array.isArray(payload) ? payload : [];

        const names = folders
            .filter((folder: any) => folder?.CollectionType !== 'boxsets')
            .map((folder: any) => folder?.Name)
            .filter((value: string | null): value is string => Boolean(value));

        return {
            names: Array.from(new Set(names)),
            source: "jellyfin" as const,
            error: null,
        };
    } catch {
        return { names: [] as string[], source: "database" as const, error: "Jellyfin fetch failed" };
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
                    maxConcurrentTranscodes: 0,
                    excludedLibraries: [],
                    wrappedVisible: true,
                    wrappedPeriodEnabled: true,
                    wrappedStartMonth: 12,
                    wrappedStartDay: 1,
                    wrappedEndMonth: 1,
                    wrappedEndDay: 31,
                }
            });
        }

        const [availableLibraries, availableLibraryScopes, jellyfinScanNames] = await Promise.all([
            getSanitizedLibraryNames(),
            getServerLibraryScopes(),
            fetchJellyfinLibraryNames(),
        ]);

        const mergedAvailableLibraries = Array.from(
            new Set([
                ...availableLibraries,
                ...availableLibraryScopes.map((entry) => entry.libraryName),
            ])
        ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));


        return NextResponse.json({
            ...settings,
            availableLibraries: mergedAvailableLibraries,
            availableLibraryScopes,
            libraryScanSource: jellyfinScanNames.source,
            libraryScanError: jellyfinScanNames.error || undefined,
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
        const { discordWebhookUrl, discordAlertCondition, discordAlertsEnabled, maxConcurrentTranscodes, excludedLibraries, syncCronHour, syncCronMinute, backupCronHour, backupCronMinute, defaultLocale, wrappedVisible, wrappedPeriodEnabled, wrappedStartMonth, wrappedStartDay, wrappedEndMonth, wrappedEndDay, resolutionThresholds } = body;

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
        if (maxConcurrentTranscodes !== undefined) {
            const val = Number(maxConcurrentTranscodes);
            if (isNaN(val) || val < 0) return NextResponse.json({ error: await apiT('maxConcurrentTranscodesRange') }, { status: 400 });
        }
        const validLocales = AVAILABLE_LOCALES.map((locale) => locale.code);
        if (defaultLocale !== undefined && !validLocales.includes(defaultLocale)) {
            return NextResponse.json({ error: await apiT('localeInvalid') }, { status: 400 });
        }
        if (excludedLibraries !== undefined && !Array.isArray(excludedLibraries)) {
            return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
        }

        const sanitizedExcludedLibraries = excludedLibraries !== undefined
            ? Array.from(
                new Set(
                    excludedLibraries
                        .map((value: unknown) => String(value || '').trim())
                        .filter((value: string) => value.length > 0)
                )
            )
            : undefined;

        const updated = await (prisma.globalSettings as any).upsert({
            where: { id: "global" },
            update: {
                discordWebhookUrl: discordWebhookUrl !== undefined ? discordWebhookUrl : undefined,
                discordAlertCondition: discordAlertCondition !== undefined ? discordAlertCondition : undefined,
                discordAlertsEnabled: discordAlertsEnabled !== undefined ? discordAlertsEnabled : undefined,
                maxConcurrentTranscodes: maxConcurrentTranscodes !== undefined ? Number(maxConcurrentTranscodes) : undefined,
                excludedLibraries: sanitizedExcludedLibraries !== undefined ? sanitizedExcludedLibraries : undefined,
                syncCronHour: syncCronHour !== undefined ? Number(syncCronHour) : undefined,
                syncCronMinute: syncCronMinute !== undefined ? Number(syncCronMinute) : undefined,
                backupCronHour: backupCronHour !== undefined ? Number(backupCronHour) : undefined,
                backupCronMinute: backupCronMinute !== undefined ? Number(backupCronMinute) : undefined,
                defaultLocale: defaultLocale !== undefined ? defaultLocale : undefined,
                wrappedVisible: wrappedVisible !== undefined ? Boolean(wrappedVisible) : undefined,
                wrappedPeriodEnabled: wrappedPeriodEnabled !== undefined ? Boolean(wrappedPeriodEnabled) : undefined,
                wrappedStartMonth: wrappedStartMonth !== undefined ? Number(wrappedStartMonth) : undefined,
                wrappedStartDay: wrappedStartDay !== undefined ? Number(wrappedStartDay) : undefined,
                wrappedEndMonth: wrappedEndMonth !== undefined ? Number(wrappedEndMonth) : undefined,
                wrappedEndDay: wrappedEndDay !== undefined ? Number(wrappedEndDay) : undefined,
                resolutionThresholds: resolutionThresholds !== undefined ? resolutionThresholds : undefined,
            },
            create: {
                id: "global",
                discordWebhookUrl: discordWebhookUrl || null,
                discordAlertCondition: discordAlertCondition || "ALL",
                discordAlertsEnabled: discordAlertsEnabled || false,
                maxConcurrentTranscodes: maxConcurrentTranscodes !== undefined ? Number(maxConcurrentTranscodes) : 0,
                excludedLibraries: sanitizedExcludedLibraries || [],
                syncCronHour: syncCronHour !== undefined ? Number(syncCronHour) : 3,
                syncCronMinute: syncCronMinute !== undefined ? Number(syncCronMinute) : 0,
                backupCronHour: backupCronHour !== undefined ? Number(backupCronHour) : 3,
                backupCronMinute: backupCronMinute !== undefined ? Number(backupCronMinute) : 30,
                defaultLocale: defaultLocale || "fr",
                wrappedVisible: wrappedVisible !== undefined ? Boolean(wrappedVisible) : true,
                wrappedPeriodEnabled: wrappedPeriodEnabled !== undefined ? Boolean(wrappedPeriodEnabled) : true,
                wrappedStartMonth: wrappedStartMonth !== undefined ? Number(wrappedStartMonth) : 12,
                wrappedStartDay: wrappedStartDay !== undefined ? Number(wrappedStartDay) : 1,
                wrappedEndMonth: wrappedEndMonth !== undefined ? Number(wrappedEndMonth) : 1,
                wrappedEndDay: wrappedEndDay !== undefined ? Number(wrappedEndDay) : 31,
                resolutionThresholds: resolutionThresholds || null,
            }
        });

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


        revalidatePath('/');
        revalidatePath('/settings');
        revalidatePath('/admin/cleanup');
        revalidatePath('/admin/health');
        revalidatePath('/admin/log-health');
        revalidatePath('/admin/plugin-health');

        return NextResponse.json(updated, { status: 200 });
    } catch (error) {
        console.error("Failed to update settings:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
