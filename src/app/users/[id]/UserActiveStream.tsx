"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { UserActiveStreamInfo } from "@/lib/liveStreams";

interface UserActiveStreamProps {
    userId: string;
    initialStream: UserActiveStreamInfo | null;
}

export function UserActiveStream({ userId, initialStream }: UserActiveStreamProps) {
    const [stream, setStream] = useState<UserActiveStreamInfo | null>(initialStream);
    const tc = useTranslations("common");

    const fetchActiveStream = useCallback(async () => {
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(userId)}/active-stream`, {
                cache: "no-store",
            });
            if (res.ok) {
                const data = await res.json();
                setStream(data.activeStream ?? null);
            }
        } catch {
            // Silently ignore network blips
        }
    }, [userId]);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        const startPolling = () => {
            if (interval) clearInterval(interval);
            interval = setInterval(fetchActiveStream, 4000);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                clearInterval(interval);
            } else {
                fetchActiveStream();
                startPolling();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        startPolling();

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [fetchActiveStream]);

    if (!stream) return null;

    const isPaused = stream.isPaused;
    const progress = Math.min(100, Math.max(0, stream.progressPercent || 0));

    return (
        <div
            className={`rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 ${
                isPaused
                    ? "bg-amber-500/10 border border-amber-500/20"
                    : "bg-emerald-500/10 border border-emerald-500/20"
            }`}
        >
            <div className="flex items-center gap-3 min-w-0">
                <span className="relative flex h-3.5 w-3.5 shrink-0">
                    {!isPaused && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    <span
                        className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                            isPaused ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                    ></span>
                </span>
                <div className="min-w-0 flex-1">
                    <h3
                        className={`text-xs font-semibold tracking-wider uppercase ${
                            isPaused ? "text-amber-500" : "text-emerald-500"
                        }`}
                    >
                        {isPaused ? "Lecture en pause" : "Lecture en cours"}
                    </h3>
                    <p className="text-base font-bold text-foreground mt-0.5 truncate">
                        {stream.itemId ? (
                            <Link
                                href={`/media/${stream.itemId}`}
                                className="hover:underline transition-colors"
                            >
                                {stream.mediaTitle}
                            </Link>
                        ) : (
                            stream.mediaTitle
                        )}
                    </p>
                    {stream.mediaSubtitle && (
                        <p className="text-xs text-muted-foreground font-medium truncate mt-0.5">
                            {stream.mediaSubtitle}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        Sur {stream.clientName} ({stream.deviceName || "Inconnu"}) • {stream.playMethod === "Transcode" ? tc("transcode") : tc("directPlay")}
                    </p>
                </div>
            </div>
            <div className="w-full md:w-64 space-y-1.5 shrink-0">
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{isPaused ? "En pause" : "En cours de lecture"}</span>
                    <span className="font-semibold text-foreground">{progress}%</span>
                </div>
                <div className="h-2 w-full bg-zinc-800/60 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                            isPaused ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            </div>
        </div>
    );
}
