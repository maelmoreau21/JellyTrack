"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { normalizeLibraryKey } from "@/lib/mediaPolicy";
import { ResolutionThresholds } from "@/components/settings/ResolutionThresholds";
import { InfoIcon } from "lucide-react";

type LibraryRule = {
    completionEnabled: boolean;
    completedThreshold: number;
    partialThreshold: number;
    abandonedThreshold: number;
};

const DEFAULT_RULE: LibraryRule = { completionEnabled: true, completedThreshold: 80, partialThreshold: 20, abandonedThreshold: 10 };

export default function SettingsLibraryRulesPage() {
    const t = useTranslations("settings");
    const tCommon = useTranslations("common");
    const tMedia = useTranslations("media");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [availableLibraries, setAvailableLibraries] = useState<string[]>([]);
    const [rules, setRules] = useState<Record<string, LibraryRule>>({});
    const [resolutionThresholds, setResolutionThresholds] = useState<any>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch("/api/settings");
                if (!res.ok) throw new Error("Failed");
                const data = await res.json();
                if (!mounted) return;
                setAvailableLibraries(data.availableLibraries || []);
                setRules(data.libraryRules || {});
                setResolutionThresholds(data.resolutionThresholds || null);
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

    const keys = useMemo(() => {
        return availableLibraries || [];
    }, [availableLibraries]);

    const humanize = (k: string) => {
        const map: Record<string, string> = {
            movies: tCommon("movies") || "Movies",
            tvshows: tCommon("tvshows") || tCommon("series") || "TV Shows",
            music: tCommon("music") || "Music",
            books: tCommon("books") || "Books",
            homevideos: tCommon("homevideos") || "Home Videos",
            photos: tCommon("photos") || "Photos",
            livetv: tCommon("livetv") || "Live TV"
        };
        
        if (map[k]) return map[k];
        
        // If it's a real library name, it might have camelCase from Jellyfin but 
        // usually we want to just return it as is or capitalized.
        return k;
    };

    const setRule = (key: string, r: Partial<LibraryRule>) => {
        setRules((prev) => ({ ...prev, [key]: { ...(prev[key] || DEFAULT_RULE), ...r } }));
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch("/api/settings", { 
                method: "POST", 
                headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify({ 
                    libraryRules: rules,
                    resolutionThresholds: resolutionThresholds
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

    const handleReset = (key?: string) => {
        if (key) {
            setRule(key, { ...DEFAULT_RULE });
        } else {
            // reset all
            setRules({});
        }
    };

    if (loading) return <div className="p-8 max-w-[900px] mx-auto">{t("loading") || "Loading..."}</div>;

    return (
        <div className="p-4 md:p-8 max-w-[1200px] mx-auto space-y-4">
            <Card className="app-surface border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-2xl">{t("libraryRules")}</CardTitle>
                    <CardDescription>{t("libraryRulesDesc")}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                    {msg && (
                        <div className={`p-4 rounded-lg text-sm font-medium border ${msg.type === "success" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" : "text-red-500 bg-red-500/10 border-red-500/20"}`}>
                            {msg.text}
                        </div>
                    )}

                    <div className="flex justify-between items-center">
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                            {availableLibraries.length ? `${availableLibraries.length} ${tMedia('libraries') || 'libraries'}` : null}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleReset()} className="hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-colors">
                            {t("resetRule")} (Tout)
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        {keys.map((key) => {
                            const r = rules[key] || DEFAULT_RULE;
                            
                            // Visual calculation
                            const abandonedWidth = r.abandonedThreshold;
                            const partialWidth = Math.max(0, r.partialThreshold - r.abandonedThreshold);
                            const activeWidth = Math.max(0, r.completedThreshold - r.partialThreshold);
                            const completedWidth = Math.max(0, 100 - r.completedThreshold);

                            return (
                                <div key={key} className="p-5 md:p-6 rounded-xl bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-800 shadow-sm transition-all hover:shadow-md">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between mb-6 gap-4">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-800 to-zinc-500 dark:from-zinc-100 dark:to-zinc-400">
                                                    {humanize(key)}
                                                </h3>
                                                <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-mono text-zinc-500">
                                                    {normalizeLibraryKey(key) || key}
                                                </span>
                                            </div>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5">{t("libraryRulesDesc")}</p>
                                        </div>

                                        <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700/50">
                                            <Switch 
                                                checked={!!r.completionEnabled} 
                                                onCheckedChange={(v: any) => setRule(key, { completionEnabled: !!v })} 
                                            />
                                            <span className={`text-sm font-medium ${r.completionEnabled ? 'text-primary' : 'text-zinc-400'}`}>
                                                {r.completionEnabled ? t("enabled") : t("disabled")}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Combined Visual Progress Bar */}
                                    <div className={`mt-6 space-y-8 transition-opacity duration-300 ${!r.completionEnabled ? 'opacity-40 pointer-events-none grayscale' : 'opacity-100'}`}>
                                        <div className="relative h-4 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden flex shadow-inner">
                                            <div className="bg-red-500 hover:brightness-110 transition-all border-r-2 border-white/20 dark:border-black/20" style={{ width: `${abandonedWidth}%` }} title={t("abandoned")} />
                                            <div className="bg-amber-400 hover:brightness-110 transition-all border-r-2 border-white/20 dark:border-black/20" style={{ width: `${partialWidth}%` }} title={t("partial")} />
                                            <div className="bg-zinc-300 dark:bg-zinc-700 hover:brightness-110 transition-all border-r-2 border-white/20 dark:border-black/20 relative" style={{ width: `${activeWidth}%` }}>
                                                {/* Striped pattern for the active zone */}
                                                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(45deg, #000 25%, transparent 25%, transparent 50%, #000 50%, #000 75%, transparent 75%, transparent)', backgroundSize: '1rem 1rem' }} />
                                            </div>
                                            <div className="bg-emerald-500 hover:brightness-110 transition-all" style={{ width: `${completedWidth}%` }} title={t("completed")} />
                                        </div>

                                        {/* Range Sliders Controls */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                                            <div className="space-y-3 p-4 rounded-xl bg-red-500/5 border border-red-500/10 hover:border-red-500/30 transition-colors">
                                                <div className="flex justify-between items-center text-sm font-medium text-red-600 dark:text-red-400">
                                                    <label>{t("abandonedThreshold")}</label>
                                                    <span className="text-xl font-bold bg-white dark:bg-red-950 px-2 rounded-md shadow-sm border border-red-100 dark:border-red-900">{r.abandonedThreshold}%</span>
                                                </div>
                                                <input type="range" min={0} max={Math.max(0, r.partialThreshold - 1)} value={r.abandonedThreshold} onChange={(e) => setRule(key, { abandonedThreshold: Number(e.target.value) })} className="w-full accent-red-500 cursor-pointer" />
                                                <p className="text-xs text-red-600/60 dark:text-red-400/60">{t("abandoned")}</p>
                                            </div>

                                            <div className="space-y-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 hover:border-amber-500/30 transition-colors">
                                                <div className="flex justify-between items-center text-sm font-medium text-amber-600 dark:text-amber-400">
                                                    <label>{t("partialThreshold")}</label>
                                                    <span className="text-xl font-bold bg-white dark:bg-amber-950 px-2 rounded-md shadow-sm border border-amber-100 dark:border-amber-900">{r.partialThreshold}%</span>
                                                </div>
                                                <input type="range" min={r.abandonedThreshold + 1} max={Math.max(1, r.completedThreshold - 1)} value={r.partialThreshold} onChange={(e) => setRule(key, { partialThreshold: Number(e.target.value) })} className="w-full accent-amber-500 cursor-pointer" />
                                                <p className="text-xs text-amber-600/60 dark:text-amber-400/60">{t("partial")}</p>
                                            </div>

                                            <div className="space-y-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/30 transition-colors">
                                                <div className="flex justify-between items-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                                    <label>{t("completedThreshold")}</label>
                                                    <span className="text-xl font-bold bg-white dark:bg-emerald-950 px-2 rounded-md shadow-sm border border-emerald-100 dark:border-emerald-900">{r.completedThreshold}%</span>
                                                </div>
                                                <input type="range" min={r.partialThreshold + 1} max={100} value={r.completedThreshold} onChange={(e) => setRule(key, { completedThreshold: Number(e.target.value) })} className="w-full accent-emerald-500 cursor-pointer" />
                                                <p className="text-xs text-emerald-600/60 dark:text-emerald-400/60">{t("completed")}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                                        <Button variant="ghost" size="sm" onClick={() => handleReset(key)} className="text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                                            {t("resetRule")}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>

                {/* Resolution Thresholds Section */}
                <CardHeader className="border-t border-zinc-200/50 dark:border-zinc-800/50 mt-4 pt-8">
                    <CardTitle className="text-xl">{t("resolutionThresholds")}</CardTitle>
                    <CardDescription>{t("resolutionThresholdsDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 text-blue-600 dark:text-blue-400">
                        <InfoIcon className="h-5 w-5 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                            <div className="text-sm font-bold">Note</div>
                            <div className="text-xs opacity-90">
                                {t("syncRequired")}
                            </div>
                        </div>
                    </div>

                    <ResolutionThresholds 
                        value={resolutionThresholds} 
                        onChange={setResolutionThresholds} 
                    />
                </CardContent>

                <CardFooter className="bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200/50 dark:border-zinc-800/50 rounded-b-xl px-6 py-4">
                    <div className="flex gap-3 w-full sm:w-auto ml-auto">
                        <Button variant="outline" onClick={() => { setRules({}); }} className="w-full sm:w-auto">{t("cancel")}</Button>
                        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto shadow-sm">{saving ? t("saving") : t("saveSettings")}</Button>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
