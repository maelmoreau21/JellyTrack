import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { safeFetchWebhook, isValidDiscordWebhook } from "@/lib/webhookValidator";
import { ZAPPING_CONDITION } from "@/lib/statsUtils";
import { subDays, format } from "date-fns";
import { fr } from "date-fns/locale";

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        const settings = await prisma.globalSettings.findUnique({
            where: { id: "global" },
            select: { discordWebhookUrl: true, discordAlertsEnabled: true },
        });

        if (!settings?.discordWebhookUrl || !isValidDiscordWebhook(settings.discordWebhookUrl)) {
            return NextResponse.json(
                { error: "Webhook Discord non configuré ou invalide. Vérifiez les Paramètres > Notifications." },
                { status: 400 }
            );
        }

        const today = new Date();
        const thirtyDaysAgo = subDays(today, 30);

        // Fetch metrics
        const totalMetrics = await prisma.playbackHistory.aggregate({
            _sum: { durationWatched: true },
            _count: { id: true },
            where: {
                startedAt: { gte: thirtyDaysAgo },
                ...ZAPPING_CONDITION,
            },
        });
        const totalHours = ((totalMetrics._sum.durationWatched || 0) / 3600).toFixed(0);
        const totalPlays = totalMetrics._count.id;

        // Top 3 Media
        const topMediaAgg = await prisma.playbackHistory.groupBy({
            by: ["mediaId"],
            _sum: { durationWatched: true },
            where: {
                startedAt: { gte: thirtyDaysAgo },
                ...ZAPPING_CONDITION,
            },
            orderBy: { _sum: { durationWatched: "desc" } },
            take: 3,
        });

        const topMedia = await Promise.all(
            topMediaAgg.map(async (agg) => {
                if (!agg.mediaId) return null;
                const m = await prisma.media.findUnique({ where: { id: agg.mediaId } });
                return {
                    title: m?.title || "Média inconnu",
                    type: m?.type || "Vidéo",
                    hours: ((agg._sum.durationWatched || 0) / 3600).toFixed(1),
                };
            })
        );
        const validTopMedia = topMedia.filter(Boolean);

        // Top User
        const topUserAgg = await prisma.playbackHistory.groupBy({
            by: ["userId"],
            _sum: { durationWatched: true },
            where: {
                startedAt: { gte: thirtyDaysAgo },
                ...ZAPPING_CONDITION,
            },
            orderBy: { _sum: { durationWatched: "desc" } },
            take: 1,
        });

        let topUserName = "Aucun";
        let topUserHours = "0";
        if (topUserAgg.length > 0 && topUserAgg[0].userId) {
            const u = await prisma.user.findUnique({ where: { id: topUserAgg[0].userId } });
            topUserName = u?.username || "Utilisateur";
            topUserHours = ((topUserAgg[0]._sum.durationWatched || 0) / 3600).toFixed(0);
        }

        const dateRangeStr = `${format(thirtyDaysAgo, "dd MMM yyyy", { locale: fr })} au ${format(today, "dd MMM yyyy", { locale: fr })}`;

        const mediaPodiumStr = validTopMedia.length > 0
            ? validTopMedia.map((m, i) => `${i + 1}. **${m?.title}** (${m?.type}) — *${m?.hours}h*`).join("\n")
            : "Aucune lecture sur la période.";

        const discordPayload = {
            username: "JellyTrack Rewind",
            avatar_url: "https://raw.githubusercontent.com/maelmoreau21/JellyTrack/main/public/icon.svg",
            embeds: [
                {
                    title: "✨ JellyTrack Rewind — Bilan du Mois",
                    description: `Voici le récapitulatif des 30 derniers jours (${dateRangeStr}) sur votre serveur multimédia !`,
                    color: 11164867, // JellyTrack Purple / Blue gradient tone
                    fields: [
                        {
                            name: "⏱️ Temps de Visionnage",
                            value: `**${totalHours} heures**`,
                            inline: true,
                        },
                        {
                            name: "🎬 Lectures Totales",
                            value: `**${totalPlays} sessions**`,
                            inline: true,
                        },
                        {
                            name: "👑 Spectateur du Mois",
                            value: `**${topUserName}** (${topUserHours}h)`,
                            inline: false,
                        },
                        {
                            name: "🏆 Podium des Médias",
                            value: mediaPodiumStr,
                            inline: false,
                        },
                    ],
                    footer: {
                        text: "JellyTrack • Analyse & Statistiques pour Jellyfin",
                    },
                    timestamp: new Date().toISOString(),
                },
            ],
        };

        const res = await safeFetchWebhook(
            settings.discordWebhookUrl,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(discordPayload),
            },
            isValidDiscordWebhook
        );

        if (!res.ok) {
            console.error("[NewsletterDiscord] Discord webhook failed:", res.status, await res.text());
            return NextResponse.json({ error: "Échec lors de l'envoi vers Discord." }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: "Bilan mensuel diffusé avec succès sur Discord !" });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[NewsletterDiscord] Error:", e);
        return NextResponse.json({ error: msg || "Erreur interne" }, { status: 500 });
    }
}
