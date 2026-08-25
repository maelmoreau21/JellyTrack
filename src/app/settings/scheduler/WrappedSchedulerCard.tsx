"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Save, Sparkles, Calendar, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useTranslations } from "next-intl";

export function WrappedSchedulerCard() {
    const t = useTranslations('settings');
    const tc = useTranslations('common');

    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [wrappedVisible, setWrappedVisible] = useState(true);
    const [wrappedPeriodEnabled, setWrappedPeriodEnabled] = useState(true);
    const [wrappedStartMonth, setWrappedStartMonth] = useState(12);
    const [wrappedStartDay, setWrappedStartDay] = useState(1);
    const [wrappedEndMonth, setWrappedEndMonth] = useState(1);
    const [wrappedEndDay, setWrappedEndDay] = useState(31);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch("/api/settings", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json().catch(() => ({}));
                if (!mounted) return;

                setWrappedVisible(data.wrappedVisible ?? true);
                setWrappedPeriodEnabled(data.wrappedPeriodEnabled ?? true);
                setWrappedStartMonth(data.wrappedStartMonth ?? 12);
                setWrappedStartDay(data.wrappedStartDay ?? 1);
                setWrappedEndMonth(data.wrappedEndMonth ?? 1);
                setWrappedEndDay(data.wrappedEndDay ?? 31);
            } catch {
                // Ignore transient network errors
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        setMsg(null);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    wrappedVisible,
                    wrappedPeriodEnabled,
                    wrappedStartMonth,
                    wrappedStartDay,
                    wrappedEndMonth,
                    wrappedEndDay,
                }),
            });
            if (res.ok) {
                setMsg({ type: "success", text: t('savedSuccess') });
            } else {
                setMsg({ type: "error", text: tc('saveError') });
            }
        } catch {
            setMsg({ type: "error", text: tc('networkError') });
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return null;
    }

    return (
        <Card className="app-surface border-border shadow-sm">
            <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    {t('wrappedPeriod') || "Planification du Wrapped annuel"}
                </CardTitle>
                <CardDescription className="text-xs">
                    {t('wrappedPeriodDesc') || "Définissez la période calendaire durant laquelle le récapitulatif annuel (Wrapped) est automatiquement accessible aux utilisateurs."}
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {msg && (
                    <div className={`p-3 rounded-lg flex items-center gap-2.5 text-xs font-medium border ${
                        msg.type === "success"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : "bg-red-500/10 text-red-500 border-red-500/20"
                    }`}>
                        {msg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        <span>{msg.text}</span>
                    </div>
                )}

                {/* Main Enable Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg app-surface-soft border border-border/60">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-primary" />
                            {t('autoAvailability')}
                        </Label>
                        <p className="text-xs text-muted-foreground">{t('autoAvailabilityDesc')}</p>
                    </div>
                    <Switch
                        checked={wrappedPeriodEnabled}
                        onCheckedChange={setWrappedPeriodEnabled}
                        className="self-start sm:self-auto shrink-0"
                    />
                </div>

                {/* Date range inputs */}
                {wrappedPeriodEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                        <div className="p-3.5 rounded-lg app-surface-soft border border-border/60 space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {t('wrappedStart')}
                            </Label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-[10px] uppercase text-muted-foreground/70 mb-1 block">
                                        {t('month')}
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={12}
                                        value={wrappedStartMonth}
                                        onChange={(e) => setWrappedStartMonth(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                                        className="font-mono text-xs"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[10px] uppercase text-muted-foreground/70 mb-1 block">
                                        {t('day')}
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={31}
                                        value={wrappedStartDay}
                                        onChange={(e) => setWrappedStartDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                                        className="font-mono text-xs"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-3.5 rounded-lg app-surface-soft border border-border/60 space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {t('wrappedEnd')}
                            </Label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-[10px] uppercase text-muted-foreground/70 mb-1 block">
                                        {t('month')}
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={12}
                                        value={wrappedEndMonth}
                                        onChange={(e) => setWrappedEndMonth(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                                        className="font-mono text-xs"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[10px] uppercase text-muted-foreground/70 mb-1 block">
                                        {t('day')}
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={31}
                                        value={wrappedEndDay}
                                        onChange={(e) => setWrappedEndDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                                        className="font-mono text-xs"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Global Wrapped Visibility Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg app-surface-soft border border-border/60">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Eye className="w-4 h-4 text-muted-foreground" />
                            {t('wrappedVisibilityLabel') || "Visibilité générale du Wrapped"}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t('wrappedVisibilityDesc') || "Autoriser ou masquer l'icône et l'accès au Wrapped dans la barre latérale."}
                        </p>
                    </div>
                    <Switch
                        checked={wrappedVisible}
                        onCheckedChange={setWrappedVisible}
                        className="self-start sm:self-auto shrink-0"
                    />
                </div>
            </CardContent>

            <CardFooter className="app-surface-soft border-t border-border rounded-b-xl px-4 sm:px-6 py-3">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium text-xs transition-colors ${
                        isSaving
                            ? 'bg-muted text-muted-foreground cursor-not-allowed'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                    }`}
                >
                    <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-pulse' : ''}`} />
                    {isSaving ? tc('saving') : t('saveSettings')}
                </button>
            </CardFooter>
        </Card>
    );
}
