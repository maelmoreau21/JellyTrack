import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { getPluginKeySnapshot } from "@/lib/pluginKeyManager";
import { deriveScopedPluginApiKey } from "@/lib/pluginServerKey";
import { getRequestIp, writeAdminAuditLog } from "@/lib/adminAudit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const pluginKeyPostSchema = z.object({
  id: z.string().optional(),
  jellyfinServerId: z.string().optional(),
});

const SENSITIVE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
};

export async function POST(req: NextRequest) {
  const auth = await requireAdminMutation(req);
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parseResult = pluginKeyPostSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid payload structure." }, { status: 400 });
  }

  const id = String(parseResult.data.id || "").trim();
  const jellyfinServerId = String(parseResult.data.jellyfinServerId || "").trim();

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

  const { snapshot } = await getPluginKeySnapshot();

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

  const ipAddress = getRequestIp(req);

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
    { status: 200, headers: SENSITIVE_RESPONSE_HEADERS }
  );
}
