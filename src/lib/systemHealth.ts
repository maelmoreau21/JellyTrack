import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { readStateFile } from "@/lib/appStateStorage";

type SectionStatus = "idle" | "running" | "ok" | "error";

export interface HealthEvent {
    id: string;
    source: "monitor" | "sync" | "backup" | "restore";
    kind: string;
    message: string;
    createdAt: string;
    details?: Record<string, unknown>;
}

export interface SystemHealthState {
    monitor: {
        status: SectionStatus;
        active: boolean;
        lastPollAt: string | null;
        lastSuccessAt: string | null;
        lastError: string | null;
        lastErrorAt: string | null;
        sessionCount: number;
        consecutiveErrors: number;
    };
    sync: {
        status: SectionStatus;
        mode: string | null;
        lastStartedAt: string | null;
        lastFinishedAt: string | null;
        lastSuccessAt: string | null;
        lastError: string | null;
        lastUsers: number | null;
        lastMedia: number | null;
    };
    backup: {
        status: SectionStatus;
        lastStartedAt: string | null;
        lastFinishedAt: string | null;
        lastSuccessAt: string | null;
        lastFileName: string | null;
        lastError: string | null;
    };
    events: HealthEvent[];
}

const STATE_FILE = "JellyTrack-system-health.json";
const MAX_EVENTS = 60;

const defaultState = (): SystemHealthState => ({
    monitor: {
        status: "idle",
        active: false,
        lastPollAt: null,
        lastSuccessAt: null,
        lastError: null,
        lastErrorAt: null,
        sessionCount: 0,
        consecutiveErrors: 0,
    },
    sync: {
        status: "idle",
        mode: null,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastSuccessAt: null,
        lastError: null,
        lastUsers: null,
        lastMedia: null,
    },
    backup: {
        status: "idle",
        lastStartedAt: null,
        lastFinishedAt: null,
        lastSuccessAt: null,
        lastFileName: null,
        lastError: null,
    },
    events: [],
});

let legacyMigrationPromise: Promise<void> | null = null;

function mergeStateSection<T extends Record<string, unknown>>(defaults: T, input: unknown): T {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return defaults;
    }

    return {
        ...defaults,
        ...(input as Partial<T>),
    };
}

async function ensureSystemHealthRow() {
    return prisma.systemHealthState.upsert({
        where: { id: "global" },
        update: {},
        create: {
            id: "global",
            monitor: defaultState().monitor as Prisma.InputJsonValue,
            sync: defaultState().sync as Prisma.InputJsonValue,
            backup: defaultState().backup as Prisma.InputJsonValue,
        },
    });
}

async function migrateLegacySystemHealthIfNeeded() {
    if (!legacyMigrationPromise) {
        legacyMigrationPromise = (async () => {
            const row = await prisma.systemHealthState.findUnique({ where: { id: "global" } });
            const hasDbData = Boolean(row) || Boolean(await prisma.systemHealthEvent.findFirst({ where: { stateId: "global" }, select: { id: true } }));
            if (hasDbData) {
                return;
            }

            const legacyState = readStateFile<SystemHealthState>(STATE_FILE, defaultState());
            const hasLegacyData = legacyState.events.length > 0
                || legacyState.monitor.lastPollAt
                || legacyState.sync.lastStartedAt
                || legacyState.backup.lastStartedAt;

            if (!hasLegacyData) {
                return;
            }

            await prisma.$transaction(async (tx) => {
                await tx.systemHealthState.upsert({
                    where: { id: "global" },
                    update: {
                        monitor: mergeStateSection(defaultState().monitor, legacyState.monitor) as Prisma.InputJsonValue,
                        sync: mergeStateSection(defaultState().sync, legacyState.sync) as Prisma.InputJsonValue,
                        backup: mergeStateSection(defaultState().backup, legacyState.backup) as Prisma.InputJsonValue,
                    },
                    create: {
                        id: "global",
                        monitor: mergeStateSection(defaultState().monitor, legacyState.monitor) as Prisma.InputJsonValue,
                        sync: mergeStateSection(defaultState().sync, legacyState.sync) as Prisma.InputJsonValue,
                        backup: mergeStateSection(defaultState().backup, legacyState.backup) as Prisma.InputJsonValue,
                    },
                });

                if (legacyState.events.length > 0) {
                    await tx.systemHealthEvent.createMany({
                        data: legacyState.events.slice(0, MAX_EVENTS).map((event) => ({
                            id: event.id,
                            stateId: "global",
                            source: event.source,
                            kind: event.kind,
                            message: event.message,
                            details: (event.details ?? Prisma.JsonNull) as any,
                            createdAt: new Date(event.createdAt),
                        })),
                    });
                }
            });
        })().catch((error) => {
            legacyMigrationPromise = null;
            throw error;
        });
    }

    await legacyMigrationPromise;
}

function normalizeSystemHealth(row: { monitor: Prisma.JsonValue; sync: Prisma.JsonValue; backup: Prisma.JsonValue }, events: Array<any>): SystemHealthState {
    const defaults = defaultState();

    return {
        monitor: mergeStateSection(defaults.monitor, row.monitor),
        sync: mergeStateSection(defaults.sync, row.sync),
        backup: mergeStateSection(defaults.backup, row.backup),
        events: events.map((event) => ({
            id: event.id,
            source: event.source,
            kind: event.kind,
            message: event.message,
            createdAt: event.createdAt.toISOString(),
            details: (event.details as Record<string, unknown> | null | undefined) || undefined,
        })),
    };
}

export async function readSystemHealthState(options?: { eventLimit?: number }) {
    await migrateLegacySystemHealthIfNeeded();

    const eventLimit = options?.eventLimit ?? MAX_EVENTS;
    const [row, events] = await Promise.all([
        ensureSystemHealthRow(),
        prisma.systemHealthEvent.findMany({
            where: { stateId: "global" },
            orderBy: { createdAt: "desc" },
            take: eventLimit,
        }),
    ]);

    return normalizeSystemHealth(row, events);
}

export async function replaceSystemHealthState(state: SystemHealthState) {
    const normalized = {
        monitor: mergeStateSection(defaultState().monitor, state.monitor),
        sync: mergeStateSection(defaultState().sync, state.sync),
        backup: mergeStateSection(defaultState().backup, state.backup),
        events: Array.isArray(state.events) ? state.events : [],
    };

    await prisma.$transaction(async (tx) => {
        await tx.systemHealthState.upsert({
            where: { id: "global" },
            update: {
                monitor: normalized.monitor as Prisma.InputJsonValue,
                sync: normalized.sync as Prisma.InputJsonValue,
                backup: normalized.backup as Prisma.InputJsonValue,
            },
            create: {
                id: "global",
                monitor: normalized.monitor as Prisma.InputJsonValue,
                sync: normalized.sync as Prisma.InputJsonValue,
                backup: normalized.backup as Prisma.InputJsonValue,
            },
        });

        await tx.systemHealthEvent.deleteMany({ where: { stateId: "global" } });

        if (normalized.events.length > 0) {
            await tx.systemHealthEvent.createMany({
                data: normalized.events.slice(0, MAX_EVENTS).map((event) => ({
                    id: event.id,
                    stateId: "global",
                    source: event.source,
                    kind: event.kind,
                    message: event.message,
                    details: (event.details ?? Prisma.JsonNull) as any,
                    createdAt: new Date(event.createdAt),
                })),
            });
        }
    });

    return normalized;
}

async function pruneOldEvents() {
    const overflow = await prisma.systemHealthEvent.findMany({
        where: { stateId: "global" },
        orderBy: { createdAt: "desc" },
        skip: MAX_EVENTS,
        select: { id: true },
    });

    if (overflow.length > 0) {
        await prisma.systemHealthEvent.deleteMany({
            where: { id: { in: overflow.map((event) => event.id) } },
        });
    }
}

async function updateSystemHealthSections(update: (state: SystemHealthState) => SystemHealthState) {
    const current = await readSystemHealthState({ eventLimit: MAX_EVENTS });
    const next = update(current);

    await prisma.systemHealthState.upsert({
        where: { id: "global" },
        update: {
            monitor: next.monitor as Prisma.InputJsonValue,
            sync: next.sync as Prisma.InputJsonValue,
            backup: next.backup as Prisma.InputJsonValue,
        },
        create: {
            id: "global",
            monitor: next.monitor as Prisma.InputJsonValue,
            sync: next.sync as Prisma.InputJsonValue,
            backup: next.backup as Prisma.InputJsonValue,
        },
    });
}

let lastMonitorPersistAt = 0;

export async function appendHealthEvent(event: Omit<HealthEvent, "id" | "createdAt">) {
    await migrateLegacySystemHealthIfNeeded();
    await ensureSystemHealthRow();

    await prisma.systemHealthEvent.create({
        data: {
            stateId: "global",
            source: event.source,
            kind: event.kind,
            message: event.message,
            details: (event.details ?? Prisma.JsonNull) as any,
        },
    });

    await pruneOldEvents();
}

export async function markMonitorPoll(input: { active: boolean; sessionCount: number; consecutiveErrors: number; error?: string | null; force?: boolean }) {
    const now = Date.now();
    if (!input.force && now - lastMonitorPersistAt < 10_000 && !input.error) {
        return;
    }

    await updateSystemHealthSections((state) => {
        state.monitor.active = input.active;
        state.monitor.sessionCount = input.sessionCount;
        state.monitor.consecutiveErrors = input.consecutiveErrors;
        state.monitor.lastPollAt = new Date(now).toISOString();

        if (input.error) {
            state.monitor.status = "error";
            state.monitor.lastError = input.error;
            state.monitor.lastErrorAt = new Date(now).toISOString();
        } else {
            state.monitor.status = "ok";
            state.monitor.lastSuccessAt = new Date(now).toISOString();
            state.monitor.lastError = null;
            state.monitor.lastErrorAt = null;
        }

        return state;
    });

    lastMonitorPersistAt = now;
}

export async function markSyncStarted(mode: string) {
    await updateSystemHealthSections((state) => {
        state.sync.status = "running";
        state.sync.mode = mode;
        state.sync.lastStartedAt = new Date().toISOString();
        state.sync.lastError = null;
        return state;
    });
}

export async function markSyncFinished(input: { success: boolean; mode: string; users?: number; media?: number; error?: string | null }) {
    await updateSystemHealthSections((state) => {
        state.sync.status = input.success ? "ok" : "error";
        state.sync.mode = input.mode;
        state.sync.lastFinishedAt = new Date().toISOString();
        state.sync.lastUsers = input.users ?? null;
        state.sync.lastMedia = input.media ?? null;
        if (input.success) {
            state.sync.lastSuccessAt = state.sync.lastFinishedAt;
            state.sync.lastError = null;
        } else {
            state.sync.lastError = input.error || "Unknown error";
        }
        return state;
    });
}

export async function markBackupStarted() {
    await updateSystemHealthSections((state) => {
        state.backup.status = "running";
        state.backup.lastStartedAt = new Date().toISOString();
        state.backup.lastError = null;
        return state;
    });
}

export async function markBackupFinished(input: { success: boolean; fileName?: string | null; error?: string | null }) {
    await updateSystemHealthSections((state) => {
        state.backup.status = input.success ? "ok" : "error";
        state.backup.lastFinishedAt = new Date().toISOString();
        if (input.success) {
            state.backup.lastSuccessAt = state.backup.lastFinishedAt;
            state.backup.lastFileName = input.fileName || null;
            state.backup.lastError = null;
        } else {
            state.backup.lastError = input.error || "Unknown error";
        }
        return state;
    });
}
