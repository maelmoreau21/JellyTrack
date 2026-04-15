import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import {
  comparePluginApiKey,
  getPluginKeySnapshot,
  isPreviousPluginKeyValid,
} from "@/lib/pluginKeyManager";
import { deriveScopedPluginApiKey } from "@/lib/pluginServerKey";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "").trim();
  const jellyfinServerId = String(body.jellyfinServerId || "").trim();
  const globalApiKey = String(body.globalApiKey || "").trim();

  if (!id && !jellyfinServerId) {
    return NextResponse.json({ error: "Serveur introuvable." }, { status: 400 });
  }

  if (!globalApiKey) {
    return NextResponse.json(
      {
        error:
          "Clé plugin globale requise. Régénérez-la depuis la sécurité plugin puis réessayez.",
      },
      { status: 400 },
    );
  }

  const prismaAny = prisma as any;
  const server = id
    ? await prismaAny.server.findUnique({
        where: { id },
        select: { id: true, jellyfinServerId: true, name: true, url: true },
      })
    : await prismaAny.server.findUnique({
        where: { jellyfinServerId },
        select: { id: true, jellyfinServerId: true, name: true, url: true },
      });

  if (!server) {
    return NextResponse.json({ error: "Serveur introuvable." }, { status: 404 });
  }

  const { snapshot } = await getPluginKeySnapshot({
    rotateIfExpired: true,
    context: {
      actorUserId: auth.linkedUserDbIds[0] ?? null,
      actorUsername: auth.username || null,
      ipAddress: null,
    },
  });

  if (!snapshot.currentKeyHash) {
    return NextResponse.json(
      {
        error:
          "Aucune clé plugin globale active. Générez-la depuis la sécurité plugin avant de créer une clé serveur.",
      },
      { status: 400 },
    );
  }

  const currentMatches = await comparePluginApiKey(globalApiKey, snapshot.currentKeyHash);
  let validGlobalKey = currentMatches;

  if (!validGlobalKey && isPreviousPluginKeyValid(snapshot) && snapshot.previousKeyHash) {
    validGlobalKey = await comparePluginApiKey(globalApiKey, snapshot.previousKeyHash);
  }

  if (!validGlobalKey) {
    return NextResponse.json({ error: "Clé plugin globale invalide." }, { status: 401 });
  }

  const pluginApiKey = deriveScopedPluginApiKey(globalApiKey, server.jellyfinServerId);
  if (!pluginApiKey) {
    return NextResponse.json({ error: "Impossible de générer la clé plugin du serveur." }, { status: 500 });
  }

  return NextResponse.json(
    {
      server,
      pluginApiKey,
      pluginEndpointPath: "/api/plugin/events",
    },
    { status: 200 }
  );
}
