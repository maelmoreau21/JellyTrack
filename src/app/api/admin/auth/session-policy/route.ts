import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { getAuthSessionPolicy } from "@/lib/authPolicy";
import { getRequestIp, writeAdminAuditLog } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const policy = await getAuthSessionPolicy();
    return NextResponse.json({
        rememberSessionsExpireAfterDays: policy.rememberSessionsExpireAfterDays,
        sessionsRevokedAt: policy.sessionsRevokedAt?.toISOString() ?? null,
    });
}

export async function PATCH(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => ({}))) as {
        rememberSessionsExpireAfterDays?: unknown;
    };

    if (typeof body.rememberSessionsExpireAfterDays !== "boolean") {
        return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await prisma.globalSettings.upsert({
        where: { id: "global" },
        update: {
            authRememberThirtyDaysEnabled: body.rememberSessionsExpireAfterDays,
        },
        create: {
            id: "global",
            authRememberThirtyDaysEnabled: body.rememberSessionsExpireAfterDays,
        },
        select: {
            authRememberThirtyDaysEnabled: true,
            authSessionsRevokedAt: true,
        },
    });

    await writeAdminAuditLog({
        action: "Auth session policy updated",
        actorUserId: auth.jellyfinUserId || null,
        actorUsername: auth.username || null,
        ipAddress: getRequestIp(req),
        details: {
            rememberSessionsExpireAfterDays: updated.authRememberThirtyDaysEnabled,
        },
    });

    return NextResponse.json({
        rememberSessionsExpireAfterDays: updated.authRememberThirtyDaysEnabled,
        sessionsRevokedAt: updated.authSessionsRevokedAt?.toISOString() ?? null,
    });
}

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "revoke_all") {
        return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const revokedAt = new Date();
    const updated = await prisma.globalSettings.upsert({
        where: { id: "global" },
        update: {
            authSessionsRevokedAt: revokedAt,
        },
        create: {
            id: "global",
            authSessionsRevokedAt: revokedAt,
        },
        select: {
            authRememberThirtyDaysEnabled: true,
            authSessionsRevokedAt: true,
        },
    });

    await writeAdminAuditLog({
        action: "Auth sessions revoked",
        actorUserId: auth.jellyfinUserId || null,
        actorUsername: auth.username || null,
        ipAddress: getRequestIp(req),
        details: {
            revokedAt: updated.authSessionsRevokedAt?.toISOString() ?? revokedAt.toISOString(),
        },
    });

    return NextResponse.json({
        rememberSessionsExpireAfterDays: updated.authRememberThirtyDaysEnabled,
        sessionsRevokedAt: updated.authSessionsRevokedAt?.toISOString() ?? null,
    });
}
