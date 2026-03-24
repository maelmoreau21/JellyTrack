"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useTranslations } from 'next-intl';

export default function SettingsNotificationsPage() {
    const t = useTranslations('settings');
    const tc = useTranslations('common');

    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [discordEnabled, setDiscordEnabled] = useState(false);
    const [discordUrl, setDiscordUrl] = useState("");
    const [discordAlertCondition, setDiscordAlertCondition] = useState("ALL");
    const [maxConcurrentTranscodes, setMaxConcurrentTranscodes] = useState(0);
    const [wrappedVisible, setWrappedVisible] = useState(true);
    const [wrappedPeriodEnabled, setWrappedPeriodEnabled] = useState(true);
    const [wrappedStartMonth, setWrappedStartMonth] = useState(12);
    const [wrappedStartDay, setWrappedStartDay] = useState(1);
    const [wrappedEndMonth, setWrappedEndMonth] = useState(1);
    const [wrappedEndDay, setWrappedEndDay] = useState(31);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch("/api/settings");
                if (res.ok) {
                    const data = await res.json();
                    setDiscordEnabled(data.discordAlertsEnabled || false);
                    setDiscordUrl(data.discordWebhookUrl || "");
                    setDiscordAlertCondition(data.discordAlertCondition || "ALL");
                    setMaxConcurrentTranscodes(data.maxConcurrentTranscodes ?? 0);
                    setWrappedVisible(data.wrappedVisible ?? true);
                    setWrappedPeriodEnabled(data.wrappedPeriodEnabled ?? true);
                    setWrappedStartMonth(data.wrappedStartMonth ?? 12);
                    setWrappedStartDay(data.wrappedStartDay ?? 1);
                    setWrappedEndMonth(data.wrappedEndMonth ?? 1);
                    setWrappedEndDay(data.wrappedEndDay ?? 31);
                }
            } catch {
                console.error("Failed to load settings");
            }
        };
        fetchSettings();
    }, []);

    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        setSettingsMsg(null);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    discordWebhookUrl: discordUrl,
                    discordAlertCondition: discordAlertCondition,
                    discordAlertsEnabled: discordEnabled,
                    maxConcurrentTranscodes: maxConcurrentTranscodes,
                    wrappedVisible,
                    wrappedPeriodEnabled,
                    wrappedStartMonth,
                    wrappedStartDay,
                    wrappedEndMonth,
                    wrappedEndDay,
                })
            });
            if (res.ok) {
                setSettingsMsg({ type: "success", text: t('savedSuccess') });
            } else {
                setSettingsMsg({ type: "error", text: tc('saveError') });
            }
        } catch {
            setSettingsMsg({ type: "error", text: tc('networkError') });
        } finally {
            setIsSavingSettings(false);
        }
    };

    return (
        <div className="p-4 max-w-[1100px] mx-auto">
            <Card className="app-surface">
                <CardHeader>
                    <CardTitle>{t('notifications')}</CardTitle>
                    <CardDescription>{t('notificationsDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {settingsMsg && (
                        <div className={`p-4 rounded-md flex items-center gap-3 text-sm ${settingsMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                            {settingsMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                            {settingsMsg.text}
                        </div>
                    )}

                    <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg">
                        <div className="space-y-0.5 mt-0.5">
                            <Label htmlFor="discord-alerts" className="text-base">{t('enableDiscord')}</Label>
                            <p className="text-sm text-muted-foreground">{t('enableDiscordDesc')}</p>
                        </div>
                        <Switch id="discord-alerts" checked={discordEnabled} onCheckedChange={setDiscordEnabled} />
                    </div>

                    {wrappedVisible && (
                        <div className="space-y-4 border p-4 rounded-lg">
                            <Label className="text-base underline mb-2 block">{t('wrappedPeriod')}</Label>
                            <div className="flex items-center justify-between p-4 rounded-lg app-surface-soft border border-border/50">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium text-foreground">{t('autoAvailability')}</Label>
                                    <p className="text-xs text-muted-foreground">{t('autoAvailabilityDesc')}</p>
                                </div>
                                <Switch checked={wrappedPeriodEnabled} onCheckedChange={setWrappedPeriodEnabled} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-widest">{t('wrappedStart')}</Label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <Label className="text-[10px] uppercase opacity-50 mb-1 block">{t('month')}</Label>
                                            <Input type="number" min={1} max={12} value={wrappedStartMonth} onChange={(e) => setWrappedStartMonth(parseInt(e.target.value) || 1)} className="font-mono" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-[10px] uppercase opacity-50 mb-1 block">{t('day')}</Label>
                                            <Input type="number" min={1} max={31} value={wrappedStartDay} onChange={(e) => setWrappedStartDay(parseInt(e.target.value) || 1)} className="font-mono" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-widest">{t('wrappedEnd')}</Label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <Label className="text-[10px] uppercase opacity-50 mb-1 block">{t('month')}</Label>
                                            <Input type="number" min={1} max={12} value={wrappedEndMonth} onChange={(e) => setWrappedEndMonth(parseInt(e.target.value) || 1)} className="font-mono" />
                                        </div>
                                        <div className="flex-1">
                                            <Label className="text-[10px] uppercase opacity-50 mb-1 block">{t('day')}</Label>
                                            <Input type="number" min={1} max={31} value={wrappedEndDay} onChange={(e) => setWrappedEndDay(parseInt(e.target.value) || 1)} className="font-mono" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground italic mt-2">{t('wrappedPeriodDesc')}</p>
                        </div>
                    )}

                    {discordEnabled && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="discord-url">{t('discordWebhookUrl')}</Label>
                                <Input id="discord-url" type="url" placeholder="https://discord.com/api/webhooks/..." value={discordUrl} onChange={(e) => setDiscordUrl(e.target.value)} className="font-mono text-sm" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="discord-condition">{t('notifConditions')}</Label>
                                <select id="discord-condition" value={discordAlertCondition} onChange={(e) => setDiscordAlertCondition(e.target.value)} className="app-field flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                    <option value="ALL">{t('notifAll')}</option>
                                    <option value="TRANSCODE_ONLY">{t('notifTranscode')}</option>
                                    <option value="NEW_IP_ONLY">{t('notifNewIp')}</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max-transcodes">Seuil de Transcodes Simultanés</Label>
                                <div className="flex items-center gap-3">
                                    <Input id="max-transcodes" type="number" min={0} value={maxConcurrentTranscodes} onChange={(e) => setMaxConcurrentTranscodes(parseInt(e.target.value) || 0)} className="w-24 font-mono" />
                                    <p className="text-xs text-muted-foreground">0 = désactivé. Alerte si le nombre dépasse ce seuil.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <button onClick={handleSaveSettings} disabled={isSavingSettings} className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${isSavingSettings ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                        <Save className={`w-4 h-4 ${isSavingSettings ? 'animate-pulse' : ''}`} />
                        {isSavingSettings ? tc('saving') : t('saveSettings')}
                    </button>
                </CardFooter>
            </Card>
        </div>
    );
}
