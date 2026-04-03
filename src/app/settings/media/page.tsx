"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { ResolutionThresholds } from "@/components/settings/ResolutionThresholds";
import { InfoIcon, Film, EyeOff } from "lucide-react";
import { makeScopedLibraryExclusion, parseScopedLibraryExclusion } from "@/lib/mediaPolicy";

type LibraryScope = {
    key: string;
    serverId: string;
    serverName: string;
    serverUrl?: string | null;
    libraryName: string;
};

function normalizeLibraryName(value: string | null | undefined): string {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export default function SettingsMediaPage() {
    const t = useTranslations("settings");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [resolutionThresholds, setResolutionThresholds] = useState<any>(null);
    const [excludedLibraryScopes, setExcludedLibraryScopes] = useState<string[]>([]);
    const [orphanScopedExclusions, setOrphanScopedExclusions] = useState<string[]>([]);
    const [legacyGlobalExclusions, setLegacyGlobalExclusions] = useState<string[]>([]);
    const [availableLibraryScopes, setAvailableLibraryScopes] = useState<LibraryScope[]>([]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch("/api/settings");
                if (!res.ok) throw new Error("Failed");
                const data = await res.json();
                if (!mounted) return;
                setResolutionThresholds(data.resolutionThresholds || null);

                const apiScopesRaw = Array.isArray(data.availableLibraryScopes)
                    ? data.availableLibraryScopes
                    : [];
                const scopeMap = new Map<string, LibraryScope>();

                for (const raw of apiScopesRaw) {
                    if (!raw || typeof raw !== "object") continue;

                    const serverId = String((raw as any).serverId || "").trim();
                    const libraryName = String((raw as any).libraryName || "").trim();
                    if (!serverId || !libraryName) continue;

                    const keyFromApi = String((raw as any).key || "").trim();
                    const key = keyFromApi || makeScopedLibraryExclusion(serverId, libraryName);
                    if (!key) continue;

                    scopeMap.set(key, {
                        key,
                        serverId,
                        serverName: String((raw as any).serverName || serverId),
                        serverUrl: (raw as any).serverUrl ? String((raw as any).serverUrl) : null,
                        libraryName,
                    });
                }

                const scopes = Array.from(scopeMap.values()).sort((left, right) => {
                    const byServer = left.serverName.localeCompare(right.serverName, undefined, { sensitivity: "base" });
                    if (byServer !== 0) return byServer;
                    return left.libraryName.localeCompare(right.libraryName, undefined, { sensitivity: "base" });
                });
                setAvailableLibraryScopes(scopes);

                const knownScopeKeys = new Set(scopes.map((scope) => scope.key));
                const rawExcluded = Array.isArray(data.excludedLibraries) ? data.excludedLibraries : [];

                const explicitScoped: string[] = [];
                const legacy: string[] = [];
                for (const raw of rawExcluded) {
                    const value = String(raw || "").trim();
                    if (!value) continue;
                    if (parseScopedLibraryExclusion(value)) explicitScoped.push(value);
                    else legacy.push(value);
                }

                const selectedScoped = new Set<string>(explicitScoped.filter((value) => knownScopeKeys.has(value)));
                const orphanScoped = explicitScoped.filter((value) => !knownScopeKeys.has(value));

                const unresolvedLegacy: string[] = [];
                for (const legacyValue of legacy) {
                    const normalizedLegacy = normalizeLibraryName(legacyValue);
                    let matched = false;

                    if (normalizedLegacy) {
                        scopes.forEach((scope) => {
                            if (normalizeLibraryName(scope.libraryName) === normalizedLegacy) {
                                selectedScoped.add(scope.key);
                                matched = true;
                            }
                        });
                    }

                    if (!matched) {
                        unresolvedLegacy.push(legacyValue);
                    }
                }

                setExcludedLibraryScopes(Array.from(selectedScoped));
                setOrphanScopedExclusions(Array.from(new Set(orphanScoped)));
                setLegacyGlobalExclusions(Array.from(new Set(unresolvedLegacy)));
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

    const groupedByServer = useMemo(() => {
        const map = new Map<string, { id: string; name: string; url: string | null; libraries: LibraryScope[] }>();

        availableLibraryScopes.forEach((scope) => {
            if (!map.has(scope.serverId)) {
                map.set(scope.serverId, {
                    id: scope.serverId,
                    name: scope.serverName,
                    url: scope.serverUrl || null,
                    libraries: [],
                });
            }
            map.get(scope.serverId)!.libraries.push(scope);
        });

        const grouped = Array.from(map.values()).sort((left, right) =>
            left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
        );

        grouped.forEach((group) => {
            group.libraries.sort((left, right) =>
                left.libraryName.localeCompare(right.libraryName, undefined, { sensitivity: "base" })
            );
        });

        return grouped;
    }, [availableLibraryScopes]);

    const toggleLibraryScope = (scopeKey: string) => {
        setExcludedLibraryScopes((prev) =>
            prev.includes(scopeKey) ? prev.filter((value) => value !== scopeKey) : [...prev, scopeKey]
        );
    };

    const removeLegacyExclusion = (value: string) => {
        setLegacyGlobalExclusions((prev) => prev.filter((entry) => entry !== value));
    };

    const removeOrphanScopedExclusion = (value: string) => {
        setOrphanScopedExclusions((prev) => prev.filter((entry) => entry !== value));
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        const mergedExcludedLibraries = Array.from(
            new Set([
                ...excludedLibraryScopes,
                ...orphanScopedExclusions,
                ...legacyGlobalExclusions,
            ])
        );

        try {
            const res = await fetch("/api/settings", { 
                method: "POST", 
                headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify({ 
                    resolutionThresholds: resolutionThresholds,
                    excludedLibraries: mergedExcludedLibraries,
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
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Décochez une bibliothèque serveur par serveur. Deux bibliothèques portant le même nom sur des serveurs différents sont gérées séparément.
                        </p>

                        {groupedByServer.length === 0 ? (
                            <p className="text-sm text-zinc-400 italic">{t("noLibrariesFound") || "Aucune bibliothèque trouvée. Lancez une synchronisation d'abord."}</p>
                        ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                {groupedByServer.map((serverGroup) => (
                                    <div key={serverGroup.id} className="rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50/60 dark:bg-zinc-900/40 p-4 space-y-3">
                                        <div className="space-y-1">
                                            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{serverGroup.name}</div>
                                            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono break-all">{serverGroup.url || serverGroup.id}</div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {serverGroup.libraries.map((scope) => {
                                                const isExcluded = excludedLibraryScopes.includes(scope.key);

                                                return (
                                                    <button
                                                        key={scope.key}
                                                        type="button"
                                                        onClick={() => toggleLibraryScope(scope.key)}
                                                        className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left transition-all ${
                                                            isExcluded
                                                                ? "border-red-500/30 bg-red-500/5 text-zinc-400"
                                                                : "border-emerald-500/30 bg-emerald-500/5 text-zinc-900 dark:text-zinc-100"
                                                        }`}
                                                    >
                                                        <span className={`text-sm font-medium truncate ${isExcluded ? "line-through opacity-70" : ""}`}>{scope.libraryName}</span>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isExcluded ? "bg-red-500/15 text-red-500" : "bg-emerald-500/15 text-emerald-500"}`}>
                                                            {isExcluded ? "Exclue" : "Active"}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {(legacyGlobalExclusions.length > 0 || orphanScopedExclusions.length > 0) && (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                                <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">Règles héritées à vérifier</div>
                                <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                                    Certaines exclusions anciennes n'ont pas pu être reliées automatiquement à un serveur+bibliothèque. Vous pouvez les retirer manuellement ci-dessous.
                                </p>

                                {legacyGlobalExclusions.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Exclusions globales</div>
                                        <div className="flex flex-wrap gap-2">
                                            {legacyGlobalExclusions.map((value) => (
                                                <button
                                                    key={`legacy-${value}`}
                                                    type="button"
                                                    onClick={() => removeLegacyExclusion(value)}
                                                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                                                    title="Retirer cette exclusion"
                                                >
                                                    {value} ×
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {orphanScopedExclusions.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Exclusions serveur/bibliothèque indisponibles</div>
                                        <div className="flex flex-wrap gap-2">
                                            {orphanScopedExclusions.map((value) => (
                                                <button
                                                    key={`orphan-${value}`}
                                                    type="button"
                                                    onClick={() => removeOrphanScopedExclusion(value)}
                                                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                                                    title="Retirer cette exclusion"
                                                >
                                                    {value} ×
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
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
