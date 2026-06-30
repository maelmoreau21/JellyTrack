"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2, Play } from "lucide-react";

export function IntegrityCleanupSettings() {
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

    const handleRunCleanup = async () => {
        setRunning(true);
        setResult(null);
        try {
            const res = await fetch("/api/admin/integrity-cleanup", { method: "POST" });
            const data = await res.json();
            if (res.ok && data.success) {
                setResult({ success: true, message: data.message });
            } else {
                setResult({ success: false, error: data.error || "Failed to trigger integrity check." });
            }
        } catch {
            setResult({ success: false, error: "Network error while connecting to JellyTrack." });
        } finally {
            setRunning(false);
        }
    };

    return (
        <Card className="app-surface">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    {"Vérification d'intégrité"}
                </CardTitle>
                <CardDescription>
                    {"Détectez et fermez manuellement les sessions de lecture orphelines (bloquées à l'état actif en raison d'une coupure réseau ou d'un crash de l'application cliente)."}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground bg-muted/10 p-3 rounded-lg border border-border">
                    <p className="font-semibold text-foreground mb-1">Fonctionnement automatique :</p>
                    {"JellyTrack exécute automatiquement cette vérification lors de chaque réception d'événement du plugin Jellyfin. Si un utilisateur cesse d'émettre des battements de cœur (heartbeat) pendant plus de 10 minutes, sa session est automatiquement clôturée. Cet outil vous permet de forcer le nettoyage immédiatement."}
                </div>

                {result && (
                    <div
                        className={`p-3 rounded-md text-sm border ${
                            result.success
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                : "bg-red-500/10 text-red-500 border-red-500/20"
                        }`}
                    >
                        {result.success ? result.message : result.error}
                    </div>
                )}

                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={handleRunCleanup}
                        disabled={running}
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/95 text-primary-foreground px-4 py-2 text-sm font-semibold transition-all shadow-sm hover:scale-[1.02] disabled:opacity-60"
                    >
                        {running ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Analyse en cours...
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4 fill-current" />
                                Lancer la vérification
                            </>
                        )}
                    </button>
                </div>
            </CardContent>
        </Card>
    );
}
