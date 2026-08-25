import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { resolveLinkedAccounts } from "@/lib/auth";
import { getUserActiveStream } from "@/lib/liveStreams";

export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{
        id: string; // jellyfinUserId
    }>;
}

export async function GET(req: Request, { params }: RouteParams) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: jellyfinUserId } = await params;
    const isAdmin = session.user.isAdmin === true;
    const myJellyfinId = (session.user as any)?.jellyfinUserId;

    // RBAC: Non-admins can only view their own active stream (or linked accounts)
    if (!isAdmin) {
        if (!myJellyfinId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (myJellyfinId !== jellyfinUserId) {
            const myLinked = await resolveLinkedAccounts({
                jellyfinUserId: myJellyfinId,
                username: session.user.name || undefined,
            });
            if (!myLinked.linkedJellyfinUserIds.includes(jellyfinUserId)) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }
    }

    // Resolve all linked DB IDs for this user
    const targetUser = await prisma.user.findFirst({
        where: { jellyfinUserId },
        select: { username: true, jellyfinUserId: true },
    });

    const linkedAccounts = await resolveLinkedAccounts({
        jellyfinUserId,
        username: targetUser?.username || undefined,
    });

    const linkedUserIds = linkedAccounts.linkedJellyfinUserIds.length > 0
        ? linkedAccounts.linkedJellyfinUserIds
        : [jellyfinUserId];

    const linkedUsers = await prisma.user.findMany({
        where: { jellyfinUserId: { in: linkedUserIds } },
        select: { id: true },
    });
    const linkedUserDbIds = linkedUsers.map((u) => u.id);

    const activeStream = await getUserActiveStream(linkedUserDbIds);

    return NextResponse.json(
        { activeStream },
        {
            headers: {
                "Cache-Control": "no-store, max-age=0",
            },
        }
    );
}
