"use client";

import { useState } from "react";
import { OctagonX, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function KillStreamButton({ sessionId, mediaTitle }: { sessionId: string; mediaTitle: string }) {
    const t = useTranslations('killStream');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

    const handleKillStream = async () => {
        if (!confirm(t('confirm', { title: mediaTitle }))) {
            return;
        }

        setIsLoading(true);
        setStatus("idle");

        try {
            const res = await fetch("/api/jellyfin/kill-stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId })
            });

            if (!res.ok) {
                setStatus("error");
            } else {
                setStatus("success");
            }
        } catch (e) {
            setStatus("error");
        } finally {
            setIsLoading(false);
        }
    };

    if (status === "success") {
        return <span className="text-[10px] text-red-500 font-bold px-2 py-1 bg-red-500/10 rounded">{t('stopped')}</span>;
    }

    return (
        <button
            onClick={handleKillStream}
            disabled={isLoading}
            className="flex items-center justify-center p-1.5 ml-2 hover:bg-red-500/20 text-red-500 rounded-md transition-colors opacity-70 hover:opacity-100 disabled:opacity-50"
            title={t('tooltip')}
        >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <OctagonX className="w-4 h-4" />}
        </button>
    );
}
