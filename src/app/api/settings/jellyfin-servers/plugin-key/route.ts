import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { getPluginKeySnapshot } from "@/lib/pluginKeyManager";
import { deriveScopedPluginApiKey } from "@/lib/pluginServerKey";
import { getRequestIp, writeAdminAuditLog } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "").trim();
  const jellyfinServerId = String(body.jellyfinServerId || "").trim();

  if (!id && !jellyfinServerId) {
    return NextResponse.json({ error: "Serveur introuvable." }, { status: 400 });
  }

  const server = id
    ? await prisma.server.findUnique({
        where: { id },
        select: { id: true, jellyfinServerId: true, name: true, url: true },
      })
    : await prisma.server.findUnique({
        where: { jellyfinServerId },
        select: { id: true, jellyfinServerId: true, name: true, url: true },
      });

  if (!server) {
    return NextResponse.json({ error: "Serveur introuvable." }, { status: 404 });
  }

  const ipAddress = getRequestIp(req);
  const { snapshot } = await getPluginKeySnapshot({
    rotateIfExpired: true,
    context: {
      actorUserId: auth.linkedUserDbIds[0] ?? null,
      actorUsername: auth.username || null,
      ipAddress,
    },
  });

  if (!snapshot.currentKeyHash) {
    return NextResponse.json(
      {
        error:
          "Aucune cle plugin globale active. Generez-la depuis les reglages plugin avant de creer une cle serveur.",
      },
      { status: 400 },
    );
  }

  const pluginApiKey = deriveScopedPluginApiKey(snapshot.currentKeyHash, server.jellyfinServerId);
  if (!pluginApiKey) {
    return NextResponse.json({ error: "Impossible de generer la cle plugin du serveur." }, { status: 500 });
  }

  await writeAdminAuditLog({
    action: "plugin.key.server_derived",
    actorUserId: auth.linkedUserDbIds[0] ?? null,
    actorUsername: auth.username || null,
    ipAddress,
    target: server.id,
    details: {
      jellyfinServerId: server.jellyfinServerId,
      serverName: server.name,
    },
  });

  return NextResponse.json(
    {
      server,
      pluginApiKey,
      pluginEndpointPath: "/api/plugin/events",
    },
    { status: 200 }
  );
}
