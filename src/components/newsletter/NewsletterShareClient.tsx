"use client";

import React, { useState } from "react";
import { Download, Send, Loader2, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NewsletterShareClientProps {
    totalHours: string;
    totalPlays: number;
    topUserName: string | null;
    topUserHours: string | null;
    topMedia: Array<{ title: string; type: string; hours: string }>;
    dateRangeStr: string;
}

export function NewsletterShareClient({
    totalHours,
    totalPlays,
    topUserName,
    topUserHours,
    topMedia,
    dateRangeStr,
}: NewsletterShareClientProps) {
    const [discordLoading, setDiscordLoading] = useState(false);
    const [imageLoading, setImageLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleSendDiscord = async () => {
        setDiscordLoading(true);
        setMessage(null);
        try {
            const res = await fetch("/api/newsletter/discord-post", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                setMessage({ type: "success", text: data.message || "Bilan diffusé sur Discord !" });
            } else {
                setMessage({ type: "error", text: data.error || "Impossible d'envoyer sur Discord." });
            }
        } catch {
            setMessage({ type: "error", text: "Erreur de connexion au serveur." });
        } finally {
            setDiscordLoading(false);
        }
    };

    const handleDownloadInfographic = () => {
        setImageLoading(true);
        try {
            const canvas = document.createElement("canvas");
            canvas.width = 1080;
            canvas.height = 1350;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            // Background gradient
            const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1350);
            bgGrad.addColorStop(0, "#0f172a");
            bgGrad.addColorStop(0.4, "#1e1b4b");
            bgGrad.addColorStop(1, "#090d16");
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, 1080, 1350);

            // Glow circle
            const radial = ctx.createRadialGradient(540, 200, 10, 540, 200, 450);
            radial.addColorStop(0, "rgba(170, 92, 195, 0.4)");
            radial.addColorStop(0.6, "rgba(0, 164, 220, 0.15)");
            radial.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = radial;
            ctx.fillRect(0, 0, 1080, 600);

            // Header Title
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 56px system-ui, -apple-system, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("JellyTrack Rewind", 540, 150);

            ctx.fillStyle = "#cbd5e1";
            ctx.font = "28px system-ui, -apple-system, sans-serif";
            ctx.fillText("Récapitulatif des 30 derniers jours", 540, 200);

            ctx.fillStyle = "#94a3b8";
            ctx.font = "20px monospace";
            ctx.fillText(dateRangeStr, 540, 240);

            // 2 Big stat cards
            const drawCard = (x: number, y: number, w: number, h: number, value: string, label: string, color: string) => {
                ctx.fillStyle = "rgba(30, 41, 59, 0.8)";
                ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, 20);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = color;
                ctx.font = "bold 52px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(value, x + w / 2, y + 80);

                ctx.fillStyle = "#94a3b8";
                ctx.font = "22px system-ui, sans-serif";
                ctx.fillText(label, x + w / 2, y + 125);
            };

            drawCard(80, 310, 440, 160, `${totalHours}h`, "Temps visionné", "#34d399");
            drawCard(560, 310, 440, 160, `${totalPlays}`, "Lectures totales", "#60a5fa");

            // Top Media section
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 36px system-ui, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("🏆 Podium des Médias", 80, 540);

            topMedia.slice(0, 3).forEach((item, index) => {
                const y = 580 + index * 120;
                ctx.fillStyle = "rgba(30, 41, 59, 0.7)";
                ctx.strokeStyle = index === 0 ? "rgba(250, 204, 21, 0.4)" : "rgba(148, 163, 184, 0.15)";
                ctx.lineWidth = index === 0 ? 3 : 1.5;
                ctx.beginPath();
                ctx.roundRect(80, y, 920, 100, 16);
                ctx.fill();
                ctx.stroke();

                // Rank
                ctx.fillStyle = index === 0 ? "#facc15" : index === 1 ? "#cbd5e1" : "#d97706";
                ctx.font = "bold 42px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(`${index + 1}`, 130, y + 65);

                // Title
                ctx.fillStyle = "#f8fafc";
                ctx.font = "bold 26px system-ui, sans-serif";
                ctx.textAlign = "left";
                const truncatedTitle = item.title.length > 38 ? item.title.slice(0, 35) + "..." : item.title;
                ctx.fillText(truncatedTitle, 190, y + 50);

                ctx.fillStyle = "#94a3b8";
                ctx.font = "20px system-ui, sans-serif";
                ctx.fillText(item.type, 190, y + 80);

                // Hours
                ctx.fillStyle = "#34d399";
                ctx.font = "bold 28px system-ui, sans-serif";
                ctx.textAlign = "right";
                ctx.fillText(`${item.hours}h`, 960, y + 60);
            });

            // Top User section
            if (topUserName) {
                const yUser = 980;
                const gradUser = ctx.createLinearGradient(80, yUser, 1000, yUser + 150);
                gradUser.addColorStop(0, "rgba(79, 70, 229, 0.3)");
                gradUser.addColorStop(1, "rgba(147, 51, 234, 0.3)");
                ctx.fillStyle = gradUser;
                ctx.strokeStyle = "rgba(129, 140, 248, 0.4)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(80, yUser, 920, 140, 20);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = "#a5b4fc";
                ctx.font = "22px system-ui, sans-serif";
                ctx.textAlign = "left";
                ctx.fillText("👑 Spectateur du Mois", 120, yUser + 50);

                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 36px system-ui, sans-serif";
                ctx.fillText(topUserName, 120, yUser + 95);

                ctx.fillStyle = "#c084fc";
                ctx.font = "bold 44px system-ui, sans-serif";
                ctx.textAlign = "right";
                ctx.fillText(`${topUserHours}h`, 960, yUser + 75);

                ctx.fillStyle = "#a5b4fc";
                ctx.font = "20px system-ui, sans-serif";
                ctx.fillText("visionnées", 960, yUser + 105);
            }

            // Footer
            ctx.fillStyle = "#64748b";
            ctx.font = "18px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Généré avec JellyTrack pour Jellyfin", 540, 1260);

            // Download image
            const link = document.createElement("a");
            link.download = `jellytrack_rewind_${new Date().toISOString().slice(0, 10)}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        } catch {
            setMessage({ type: "error", text: "Impossible de générer l'infographie." });
        } finally {
            setImageLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
            <div className="flex items-center gap-3 flex-wrap justify-center w-full">
                <Button
                    onClick={handleDownloadInfographic}
                    disabled={imageLoading}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg"
                >
                    {imageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span>Télécharger l&apos;infographie (PNG)</span>
                </Button>

                <Button
                    onClick={handleSendDiscord}
                    disabled={discordLoading}
                    variant="outline"
                    className="gap-2 border-indigo-500/40 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 font-semibold"
                >
                    {discordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Diffuser sur Discord</span>
                </Button>
            </div>

            {message && (
                <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 border w-full max-w-md animate-in fade-in-0 duration-200 ${
                        message.type === "success"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-red-500/10 border-red-500/30 text-red-300"
                    }`}
                >
                    {message.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    )}
                    <span>{message.text}</span>
                </div>
            )}
        </div>
    );
}
