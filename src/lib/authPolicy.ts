import prisma from "@/lib/prisma";

export type AuthSessionPolicy = {
    rememberSessionsExpireAfterDays: boolean;
    sessionsRevokedAt: Date | null;
};

export async function getAuthSessionPolicy(): Promise<AuthSessionPolicy> {
    try {
        const settings = await prisma.globalSettings.findUnique({
            where: { id: "global" },
            select: {
                authRememberThirtyDaysEnabled: true,
                authSessionsRevokedAt: true,
            },
        });

        return {
            rememberSessionsExpireAfterDays: settings?.authRememberThirtyDaysEnabled !== false,
            sessionsRevokedAt: settings?.authSessionsRevokedAt ?? null,
        };
    } catch (error) {
        console.warn("[Auth] Could not load session policy, using defaults:", error);
        return {
            rememberSessionsExpireAfterDays: true,
            sessionsRevokedAt: null,
        };
    }
}
