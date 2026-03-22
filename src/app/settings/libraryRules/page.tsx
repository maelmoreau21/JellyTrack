"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

type LibraryRule = {
    completionEnabled: boolean;
    completedThreshold: number;
    partialThreshold: number;
    abandonedThreshold: number;
};

const DEFAULT_RULE: LibraryRule = { completionEnabled: true, completedThreshold: 80, partialThreshold: 20, abandonedThreshold: 10 };

export default function SettingsLibraryRulesPage() {
    const t = useTranslations("settings");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [availableLibraries, setAvailableLibraries] = useState<string[]>([]);
    const [rules, setRules] = useState<Record<string, LibraryRule>>({});

    const defaultKeys = useMemo(() => ["movies", "tvshows", "music", "books", "homevideos", "photos", "livetv"], []);

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
        return Array.from(new Set([...defaultKeys, ...Object.keys(rules)])).filter(Boolean);
    }, [defaultKeys, rules]);

    const humanize = (k: string) => {
        const map: Record<string, string> = { movies: t("movies") || "Movies", tvshows: "TV Shows", music: t("music") || "Music", books: t("books") || "Books", homevideos: "Home Videos", photos: "Photos", livetv: "Live TV" };
        return map[k] || k.replace(/([a-z])([A-Z])/g, "$1 $2");
    };

    const setRule = (key: string, r: Partial<LibraryRule>) => {
        setRules((prev) => ({ ...prev, [key]: { ...(prev[key] || DEFAULT_RULE), ...r } }));
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ libraryRules: rules }) });
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
        <div className="p-4 md:p-8 max-w-[1100px] mx-auto space-y-4">
            <Card className="app-surface">
                <CardHeader>
                    <CardTitle>{t("libraryRules")}</CardTitle>
                    <CardDescription>{t("libraryRulesDesc")}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {msg && <div className={`p-3 rounded text-sm ${msg.type === "success" ? "text-emerald-400 bg-emerald-500/5" : "text-red-400 bg-red-500/5"}`}>{msg.text}</div>}

                    <div className="flex justify-between items-center">
                        <div className="text-sm text-muted-foreground">{availableLibraries.length ? `${availableLibraries.length} libraries` : null}</div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleReset()}>{t("resetRule")}</Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {keys.map((key) => {
                            const r = rules[key] || DEFAULT_RULE;
                            const abandoned = Math.max(0, Math.min(100, Number(r.abandonedThreshold || 0)));
                            const partial = Math.max(0, Math.min(100, Number(r.partialThreshold || 0)));
                            const completed = Math.max(0, Math.min(100, Number(r.completedThreshold || 0)));

                            const segAbandoned = Math.min(abandoned, partial, completed);
                            const segPartial = Math.max(0, Math.min(partial - abandoned, completed - abandoned));
                            const segCompleted = Math.max(0, completed - Math.max(partial, abandoned));

                            return (
                                <div key={key} className="p-4 border rounded-lg app-surface-soft">
                                    <div className="flex items-start justify-between mb-3 gap-3">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <div className="font-semibold">{humanize(key)}</div>
                                                <Badge variant="outline" className="text-xs">{key}</Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">{t("rulesDesc")}</div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col items-end">
                                                <Switch checked={!!r.completionEnabled} onCheckedChange={(v: any) => setRule(key, { completionEnabled: !!v })} />
                                                <div className="text-xs text-muted-foreground mt-1">{r.completionEnabled ? t("enabled") : t("disabled")}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <Label>{t("completedThreshold")}</Label>
                                            <div className="flex items-center gap-2">
                                                <Input type="number" min={1} max={100} value={r.completedThreshold} onChange={(e) => setRule(key, { completedThreshold: Number(e.target.value || 0) })} />
                                                <div className="text-sm text-muted-foreground">%</div>
                                            </div>
                                        </div>

                                        <div>
                                            <Label>{t("partialThreshold")}</Label>
                                            <div className="flex items-center gap-2">
                                                <Input type="number" min={1} max={100} value={r.partialThreshold} onChange={(e) => setRule(key, { partialThreshold: Number(e.target.value || 0) })} />
                                                <div className="text-sm text-muted-foreground">%</div>
                                            </div>
                                        </div>

                                        <div>
                                            <Label>{t("abandonedThreshold")}</Label>
                                            <div className="flex items-center gap-2">
                                                <Input type="number" min={0} max={100} value={r.abandonedThreshold} onChange={(e) => setRule(key, { abandonedThreshold: Number(e.target.value || 0) })} />
                                                <div className="text-sm text-muted-foreground">%</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <div className="w-full h-3 bg-border rounded overflow-hidden relative">
                                            <div className="absolute left-0 top-0 h-full bg-red-500" style={{ width: `${abandoned}%` }} />
                                            <div className="absolute top-0 h-full bg-yellow-400" style={{ left: `${abandoned}%`, width: `${Math.max(0, partial - abandoned)}%` }} />
                                            <div className="absolute top-0 h-full bg-emerald-400" style={{ left: `${partial}%`, width: `${Math.max(0, completed - partial)}%` }} />
                                        </div>
                                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                            <div>{t("abandoned")}</div>
                                            <div>{t("partial")}</div>
                                            <div>{t("completed")}</div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end mt-3">
                                        <Button variant="ghost" size="sm" onClick={() => handleReset(key)}>{t("resetRule")}</Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>

                <CardFooter>
                    <div className="flex gap-3">
                        <Button onClick={handleSave} disabled={saving}>{saving ? t("saving") : t("saveSettings")}</Button>
                        <Button variant="outline" onClick={() => { setRules({}); }}>{t("cancel")}</Button>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
