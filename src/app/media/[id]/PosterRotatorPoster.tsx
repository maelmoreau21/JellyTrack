"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { FallbackImage } from "@/components/FallbackImage";
import { Button } from "@/components/ui/button";

type PosterRotatorPosterProps = {
    mediaId: string;
    serverId: string;
    title: string;
    src: string;
    canRotate: boolean;
    className?: string;
};

export default function PosterRotatorPoster({ mediaId, serverId, title, src, canRotate, className }: PosterRotatorPosterProps) {
    const t = useTranslations("mediaProfile");
    const [cacheBust, setCacheBust] = useState<number>(0);
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

    const imageSrc = useMemo(() => {
        if (!cacheBust) return src;
        const separator = src.includes("?") ? "&" : "?";
        return `${src}${separator}v=${cacheBust}`;
    }, [cacheBust, src]);

    const reloadPoster = async () => {
        setStatus("loading");
        try {
            // If PosterRotator plugin is available, trigger rotation first
            try {
                await fetch(`/api/media/${encodeURIComponent(mediaId)}/poster-rotator/rotate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ serverId }),
                });
            } catch {
                // Ignore plugin rotate error, fallback to image cache-bust reload
            }

            const url = `/api/jellyfin/image?itemId=${encodeURIComponent(mediaId)}&type=Primary&cacheBust=${Date.now()}&serverId=${encodeURIComponent(serverId)}`;
            const response = await fetch(url);

            if (response.ok) {
                const contentType = response.headers.get("content-type") || "";
                if (contentType.includes("image/svg")) {
                    const text = await response.clone().text().catch(() => "");
                    if (text.includes("No Image")) {
                        setStatus("error");
                        return;
                    }
                }
                setCacheBust(Date.now());
                setStatus("success");
                return;
            }

            setStatus("error");
        } catch {
            setStatus("error");
        }
    };

    return (
        <div className={className}>
            <FallbackImage src={imageSrc} alt={title} fill className="object-cover" />
            {canRotate && (
                <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-2">
                    <Button
                        type="button"
                        size="icon-sm"
                        variant="secondary"
                        className="bg-white/90 text-zinc-900 shadow-md hover:bg-white dark:bg-slate-900/90 dark:text-slate-200"
                        onClick={reloadPoster}
                        disabled={status === "loading"}
                        title={t("posterRotate")}
                        aria-label={t("posterRotate")}
                    >
                        <RefreshCw className={status === "loading" ? "animate-spin" : ""} />
                    </Button>
                    {status !== "idle" && status !== "loading" && (
                        <div className="max-w-48 rounded-md border border-zinc-200/70 bg-white/95 px-2 py-1 text-[11px] font-medium text-zinc-700 shadow-lg dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-200">
                            {status === "success" && t("posterRotateSuccess")}
                            {status === "error" && t("posterRotateError")}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
