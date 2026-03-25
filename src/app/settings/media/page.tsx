"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { ResolutionThresholds } from "@/components/settings/ResolutionThresholds";
import { InfoIcon, Film, EyeOff } from "lucide-react";

export default function SettingsMediaPage() {
    const t = useTranslations("settings");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [resolutionThresholds, setResolutionThresholds] = useState<any>(null);
    const [excludedLibraries, setExcludedLibraries] = useState<string[]>([]);
    const [availableLibraries, setAvailableLibraries] = useState<string[]>([]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch("/api/settings");
                if (!res.ok) throw new Error("Failed");
                const data = await res.json();
                if (!mounted) return;
                setResolutionThresholds(data.resolutionThresholds || null);
                setExcludedLibraries(data.excludedLibraries || []);

                // Build list of available libraries from scan or existing excluded list
                const libs: string[] = [];
                if (data.libraryScanSource && Array.isArray(data.libraryScanSource)) {
                    libs.push(...data.libraryScanSource);
                }
                // Merge any currently excluded that might not be in scan
                for (const ex of (data.excludedLibraries || [])) {
                    if (!libs.includes(ex)) libs.push(ex);
                }
                setAvailableLibraries(libs.sort());
            } catch (err) {
                setMsg({ type: "error", text: (err as any)?.message || "Failed to load" });
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const toggleLibrary = (lib: string) => {
        setExcludedLibraries(prev =>
            prev.includes(lib) ? prev.filter(l => l !== lib) : [...prev, lib]
        );
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch("/api/settings", { 
                method: "POST", 
                headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify({ 
                    resolutionThresholds: resolutionThresholds,
                    excludedLibraries: excludedLibraries,
                }) 
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) setMsg({ type: "success", text: t("savedSuccess") });
            else setMsg({ type: "error", text: data.error || t("saveError") });
        } catch (err) {
            setMsg({ type: "error", text: (err as any)?.message || t("saveError") });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 max-w-[900px] mx-auto">{t("loading") || "Loading..."}</div>;

    return (
        <div className="p-4 md:p-8 max-w-[1200px] mx-auto space-y-4">
            <Card className="app-surface border-zinc-200/50 dark:border-zinc-800/50 shadow-sm text-zinc-900 dark:text-zinc-100">
                <CardHeader>
                    <CardTitle className="text-2xl flex items-center gap-2">
                        <Film className="w-6 h-6 text-cyan-500" />
                        {t("mediaSettings") || "Paramètres Média"}
                    </CardTitle>
                    <CardDescription>{t("mediaSettingsDesc") || "Gérez les seuils de résolution et autres paramètres liés aux médias."}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                    {msg && (
                        <div className={`p-4 rounded-lg text-sm font-medium border ${msg.type === "success" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" : "text-red-500 bg-red-500/10 border-red-500/20"}`}>
                            {msg.text}
                        </div>
                    )}

                    <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 text-blue-600 dark:text-blue-400">
                        <InfoIcon className="h-5 w-5 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                            <div className="text-sm font-bold">Note</div>
                            <div className="text-xs opacity-90">
                                {t("syncRequired")}
                            </div>
                        </div>
                    </div>

                    {/* Excluded Libraries Section */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <EyeOff className="w-5 h-5 text-orange-500" />
                            {t("excludedLibrariesTitle") || "Bibliothèques exclues des statistiques"}
                        </h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            {t("excludedLibrariesDesc") || "Les bibliothèques désactivées ci-dessous seront exclues de toutes les statistiques du dashboard."}
                        </p>
                        {availableLibraries.length === 0 ? (
                            <p className="text-sm text-zinc-400 italic">{t("noLibrariesFound") || "Aucune bibliothèque trouvée. Lancez une synchronisation d'abord."}</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {availableLibraries.map(lib => {
                                    const isExcluded = excludedLibraries.includes(lib);
                                    return (
                                        <button
                                            key={lib}
                                            type="button"
                                            onClick={() => toggleLibrary(lib)}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                                                isExcluded
                                                    ? "border-red-500/30 bg-red-500/5 text-zinc-400 line-through opacity-60"
                                                    : "border-emerald-500/30 bg-emerald-500/5 text-zinc-900 dark:text-zinc-100"
                                            }`}
                                        >
                                            <div className={`w-3 h-3 rounded-full shrink-0 ${isExcluded ? "bg-red-500" : "bg-emerald-500"}`} />
                                            <span className="text-sm font-medium truncate">{lib}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">{t("resolutionThresholds")}</h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("resolutionThresholdsDesc")}</p>
                        <ResolutionThresholds 
                            value={resolutionThresholds} 
                            onChange={setResolutionThresholds} 
                        />
                    </div>
                </CardContent>

                <CardFooter className="bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200/50 dark:border-zinc-800/50 rounded-b-xl px-6 py-4">
                    <div className="flex gap-3 w-full sm:w-auto ml-auto">
                        <Button variant="outline" onClick={() => window.location.reload()} className="w-full sm:w-auto">{t("cancel")}</Button>
                        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto shadow-sm">{saving ? t("saving") : t("saveSettings")}</Button>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
