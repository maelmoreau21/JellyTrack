import prisma from "@/lib/prisma";
import { getClientIp } from "@/lib/requestIp";

interface AuditEntryInput {
    action: string;
    actorUserId?: string | null;
    actorUsername?: string | null;
    target?: string | null;
    ipAddress?: string | null;
    details?: Record<string, unknown> | null;
}

export function getRequestIp(req: Request): string | null {
    return getClientIp(req, null);
}

export async function writeAdminAuditLog(input: AuditEntryInput): Promise<void> {
    try {
        await (prisma as any).adminAuditLog.create({
            data: {
                action: input.action,
                actorUserId: input.actorUserId ?? null,
                actorUsername: input.actorUsername ?? null,
                target: input.target ?? null,
                ipAddress: input.ipAddress ?? null,
                details: input.details ?? null,
            },
        });
    } catch (error) {
        // Audit logging must never break business-critical routes.
        console.error("[AdminAudit] Failed to write audit event:", error);
    }
}
