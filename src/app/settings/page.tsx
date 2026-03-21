"use client";

import { useState, useRef } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Save, Download, UploadCloud, Clock, Trash2, Zap, Database, Play, Plug, Copy, Eye, EyeOff, KeyRound, Unplug } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useTranslations, useLocale } from 'next-intl';

type LibraryRule = {
    completionEnabled: boolean;
    completedThreshold: number;
    partialThreshold: number;
    abandonedThreshold: number;
};

export default function SettingsPage() {
    const t = useTranslations('settings');
    const tc = useTranslations('common');
    const locale = useLocale();
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);

    const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [backupMsg, setBackupMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

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
    const [excludedLibraries, setExcludedLibraries] = useState<string[]>([]);
    const availableLibraries = useState<string[]>([])[0] as string[];
    const [libraryRules, setLibraryRules] = useState<Record<string, LibraryRule>>({});
    const libraryScanSource = useState<'jellyfin' | 'database'>('database')[0] as 'jellyfin' | 'database';
    const libraryScanError = useState<string | null>(null)[0] as string | null;



    // Task scheduler state
    const [taskStatus, setTaskStatus] = useState<Record<string, { loading: boolean; msg: { type: 'success' | 'error', text: string } | null }>>({
        recentSync: { loading: false, msg: null },
        fullSync: { loading: false, msg: null },
        backup: { loading: false, msg: null },
    });

    // Cron schedule state
    const [syncCronHour, setSyncCronHour] = useState(3);

    const handleCopyPluginUrl = async () => {
        try {
            await navigator.clipboard.writeText(pluginEndpoint);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = pluginEndpoint;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        setPluginUrlCopied(true);
        setTimeout(() => setPluginUrlCopied(false), 2000);
    };

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
                    excludedLibraries,
                    libraryRules,
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



    const handleSaveCron = async () => {
        setIsSavingCron(true);
        setCronMsg(null);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ syncCronHour, syncCronMinute, backupCronHour, backupCronMinute })
            });
            if (res.ok) {
                setCronMsg({ type: "success", text: t('cronSaved') });
            } else {
                const data = await res.json();
                setCronMsg({ type: "error", text: data.error || tc('saveError') });
            }
        } catch {
            setCronMsg({ type: "error", text: tc('networkError') });
        } finally {
            setIsSavingCron(false);
        }
    };

    const runTask = async (taskKey: string, url: string, body?: object) => {
        setTaskStatus(prev => ({ ...prev, [taskKey]: { loading: true, msg: null } }));
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: body ? { "Content-Type": "application/json" } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json();
            if (res.ok) {
                setTaskStatus(prev => ({ ...prev, [taskKey]: { loading: false, msg: { type: "success", text: data.message || tc('success') } } }));
                // Refresh backup list after backup task
                if (taskKey === 'backup') {
                    const listRes = await fetch("/api/backup/auto");
                    if (listRes.ok) { const listData = await listRes.json(); setAutoBackups(listData.backups || []); }
                }
            } else {
                setTaskStatus(prev => ({ ...prev, [taskKey]: { loading: false, msg: { type: "error", text: data.error || data.message || tc('error') } } }));
            }
        } catch {
            setTaskStatus(prev => ({ ...prev, [taskKey]: { loading: false, msg: { type: "error", text: tc('networkError') } } }));
        }
    };

    const handleExportBackup = () => {
        window.location.href = "/api/backup/export";
    };

    const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsRestoring(true);
        setBackupMsg(null);
        try {
            const fileReader = new FileReader();
            fileReader.onload = async (e) => {
                const text = e.target?.result;
                if (typeof text !== 'string') return;
                try {
                    const parsedJson = JSON.parse(text);
                    const res = await fetch("/api/backup/import", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(parsedJson)
                    });
                    const data = await res.json();
                    if (res.ok) {
                        setBackupMsg({ type: "success", text: t('restoreSuccess') });
                        setTimeout(() => window.location.reload(), 3000);
                    } else {
                        setBackupMsg({ type: "error", text: data.error || t('invalidBackup') });
                        setIsRestoring(false);
                    }
                } catch {
                    setBackupMsg({ type: "error", text: t('jsonParseError') });
                    setIsRestoring(false);
                }
            };
            fileReader.readAsText(file);
        } catch {
            setBackupMsg({ type: "error", text: t('fileReadError') });
            setIsRestoring(false);
        }
        if (fileInputRef.current) { fileInputRef.current.value = ""; }
    };

    const toggleExcludedLibrary = (libraryKey: string) => {
        setExcludedLibraries((current) => (
            current.includes(libraryKey)
                ? current.filter((entry) => entry !== libraryKey)
                : [...current, libraryKey]
        ));
    };

    const formatLibraryLabel = (libraryKey: string) => {
        return libraryKey;
    };

    const updateRule = (libraryKey: string, patch: Partial<LibraryRule>) => {
        setLibraryRules((current) => ({
            ...current,
            [libraryKey]: {
                completionEnabled: current[libraryKey]?.completionEnabled ?? true,
                completedThreshold: current[libraryKey]?.completedThreshold ?? (libraryKey === 'music' ? 60 : 80),
                partialThreshold: current[libraryKey]?.partialThreshold ?? (libraryKey === 'music' ? 30 : 20),
                abandonedThreshold: current[libraryKey]?.abandonedThreshold ?? (libraryKey === 'music' ? 12 : 10),
                ...patch,
            }
        }));
    };

    const pluginEndpoint = typeof window !== 'undefined' ? `${window.location.origin}/api/plugin/events` : '/api/plugin/events';

    return (
        <>
                                <div className="flex items-center justify-between space-y-2 mb-6">
                                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t('title')}</h2>
                                </div>

                <section id="plugin" className="space-y-4">
                {/* PLUGIN CONNECTION CARD */}
                <Card className="app-surface">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Plug className="w-5 h-5" /> {t('pluginTitle')}</CardTitle>
                        <CardDescription>{t('pluginDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {pluginMsg && (
                            <div className={`p-4 rounded-md flex items-center gap-3 text-sm ${pluginMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                {pluginMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                {pluginMsg.text}
                            </div>
                        )}

                        {/* Connection Status */}
                        <div className="app-surface-soft rounded-lg border p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{t('pluginStatus')}</span>
                                <span className={`flex items-center gap-2 text-sm font-semibold ${pluginConnected ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                    <span className={`w-2.5 h-2.5 rounded-full ${pluginConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                                    {pluginConnected ? t('pluginConnected') : t('pluginDisconnected')}
                                </span>
                            </div>
                            {pluginHasKey && (
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
                                    {pluginServerName && (
                                        <div><span className="text-zinc-500">{t('pluginServerName')}:</span> <span className="text-zinc-300">{pluginServerName}</span></div>
                                    )}
                                    {pluginVersion && (
                                        <div><span className="text-zinc-500">{t('pluginVersion')}:</span> <span className="text-zinc-300">v{pluginVersion}</span></div>
                                    )}
                                    {pluginLastSeen && (
                                        <div><span className="text-zinc-500">{t('pluginLastSeen')}:</span> <span className="text-zinc-300">{new Date(pluginLastSeen).toLocaleString(locale)}</span></div>
                                    )}
                                </div>
                            )}
                        </div>

                        {!pluginHasKey ? (
                            /* No API key — show generate button */
                            <div className="text-center py-6">
                                <KeyRound className="w-10 h-10 mx-auto mb-3 text-zinc-500 opacity-50" />
                                <p className="text-sm text-muted-foreground mb-4">{t('pluginNoKey')}</p>
                                <button
                                    onClick={() => handleGeneratePluginKey(false)}
                                    disabled={pluginLoading}
                                    className={`flex items-center gap-2 px-4 py-2 mx-auto rounded-md font-medium text-sm transition-colors ${pluginLoading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                                >
                                    <KeyRound className={`w-4 h-4 ${pluginLoading ? 'animate-pulse' : ''}`} />
                                    {t('pluginGenerateKey')}
                                </button>
                            </div>
                        ) : (
                            /* API key exists — show key + config info */
                            <>
                                {/* API Key display */}
                                <div className="space-y-2">
                                    <Label>{t('pluginApiKeyLabel')}</Label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 relative">
                                            <Input
                                                readOnly
                                                type={showApiKey ? "text" : "password"}
                                                value={pluginApiKey || ""}
                                                className="font-mono text-sm pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowApiKey(!showApiKey)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                            >
                                                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleCopyApiKey}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                        >
                                            <Copy className="w-4 h-4" />
                                            {apiKeyCopied ? t('pluginApiKeyCopied') : t('pluginCopyKey')}
                                        </button>
                                    </div>
                                </div>

                                {/* Server URL display */}
                                <div className="space-y-2">
                                    <Label>{t('pluginServerUrl')}</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            readOnly
                                            value={pluginEndpoint}
                                            className="font-mono text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleCopyPluginUrl}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                        >
                                            <Copy className="w-4 h-4" />
                                            {pluginUrlCopied ? t('pluginApiKeyCopied') : t('pluginCopyKey')}
                                        </button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{t('pluginServerUrlDesc')}</p>
                                </div>

                                <p className="text-xs text-muted-foreground italic">{t('pluginInstructions')}</p>
                            </>
                        )}
                    </CardContent>
                    {pluginHasKey && (
                        <CardFooter className="flex gap-3">
                            <button
                                onClick={() => handleGeneratePluginKey(true)}
                                disabled={pluginLoading}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${pluginLoading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                            >
                                <RefreshCw className={`w-4 h-4 ${pluginLoading ? 'animate-spin' : ''}`} />
                                {t('pluginRegenerateKey')}
                            </button>
                            <button
                                onClick={handleRevokePluginKey}
                                disabled={pluginLoading}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${pluginLoading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'border border-red-500/30 text-red-400 hover:bg-red-500/10'}`}
                            >
                                <Unplug className="w-4 h-4" />
                                {t('pluginRevokeKey')}
                            </button>
                        </CardFooter>
                    )}
                </Card>

                </section>
                <section id="scheduler" className="space-y-4">
                {/* TASK SCHEDULER CARD */}
                <Card className="app-surface">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" /> {t('taskScheduler')}</CardTitle>
                        <CardDescription>
                            {t('taskSchedulerDesc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {cronMsg && (
                            <div className={`p-4 rounded-md flex items-center gap-3 text-sm ${cronMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                {cronMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                {cronMsg.text}
                            </div>
                        )}
                        {/* Task 1: Recent Sync */}
                        <div className="app-surface-soft flex items-center justify-between rounded-lg border p-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4 text-sky-400 shrink-0" />
                                    <span className="font-medium text-sm">{t('recentSync')}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 ml-6">{t('recentSyncDesc')}</p>
                                {taskStatus.recentSync.msg && (
                                    <div className={`mt-2 ml-6 text-xs ${taskStatus.recentSync.msg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {taskStatus.recentSync.msg.text}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => runTask('recentSync', '/api/sync', { mode: 'recent' })}
                                disabled={taskStatus.recentSync.loading}
                                className={`ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${taskStatus.recentSync.loading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
                            >
                                <Play className={`w-3 h-3 ${taskStatus.recentSync.loading ? 'animate-spin' : ''}`} />
                                {taskStatus.recentSync.loading ? tc('running') : tc('run')}
                            </button>
                        </div>

                        {/* Task 2: Full Sync */}
                        <div className="app-surface-soft flex items-center justify-between rounded-lg border p-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <Database className="w-4 h-4 text-violet-400 shrink-0" />
                                    <span className="font-medium text-sm">{t('fullSync')}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-1 ml-6">
                                    <p className="text-xs text-muted-foreground">{t('autoNightlyAt')}</p>
                                    <div className="flex items-center gap-1">
                                        <Input type="number" min={0} max={23} value={syncCronHour} onChange={(e) => setSyncCronHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))} className="w-14 h-7 text-xs text-center font-mono px-1" />
                                        <span className="text-xs text-muted-foreground">:</span>
                                        <Input type="number" min={0} max={59} value={syncCronMinute} onChange={(e) => setSyncCronMinute(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))} className="w-14 h-7 text-xs text-center font-mono px-1" />
                                    </div>
                                </div>
                                {taskStatus.fullSync.msg && (
                                    <div className={`mt-2 ml-6 text-xs ${taskStatus.fullSync.msg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {taskStatus.fullSync.msg.text}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => runTask('fullSync', '/api/sync', { mode: 'full' })}
                                disabled={taskStatus.fullSync.loading}
                                className={`ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${taskStatus.fullSync.loading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-violet-600 text-white hover:bg-violet-500'}`}
                            >
                                <Play className={`w-3 h-3 ${taskStatus.fullSync.loading ? 'animate-spin' : ''}`} />
                                {taskStatus.fullSync.loading ? tc('running') : tc('run')}
                            </button>
                        </div>

                        {/* Task 3: Backup */}
                        <div className="app-surface-soft flex items-center justify-between rounded-lg border p-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <Save className="w-4 h-4 text-amber-400 shrink-0" />
                                    <span className="font-medium text-sm">{t('backupTask')}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-1 ml-6">
                                    <p className="text-xs text-muted-foreground">{t('autoNightlyAt')}</p>
                                    <div className="flex items-center gap-1">
                                        <Input type="number" min={0} max={23} value={backupCronHour} onChange={(e) => setBackupCronHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))} className="w-14 h-7 text-xs text-center font-mono px-1" />
                                        <span className="text-xs text-muted-foreground">:</span>
                                        <Input type="number" min={0} max={59} value={backupCronMinute} onChange={(e) => setBackupCronMinute(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))} className="w-14 h-7 text-xs text-center font-mono px-1" />
                                    </div>
                                </div>
                                {taskStatus.backup.msg && (
                                    <div className={`mt-2 ml-6 text-xs ${taskStatus.backup.msg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {taskStatus.backup.msg.text}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => runTask('backup', '/api/backup/auto/trigger')}
                                disabled={taskStatus.backup.loading}
                                className={`ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${taskStatus.backup.loading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-amber-600 text-white hover:bg-amber-500'}`}
                            >
                                <Play className={`w-3 h-3 ${taskStatus.backup.loading ? 'animate-spin' : ''}`} />
                                {taskStatus.backup.loading ? tc('running') : tc('run')}
                            </button>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <button onClick={handleSaveCron} disabled={isSavingCron} className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${isSavingCron ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                            <Save className={`w-4 h-4 ${isSavingCron ? 'animate-pulse' : ''}`} />
                            {isSavingCron ? tc('saving') : t('saveSchedules')}
                        </button>
                    </CardFooter>
                </Card>

                </section>
                <section id="notifications" className="space-y-4">
                {/* DISCORD SETTINGS CARD */}
                <Card className="app-surface mt-6">
                    <CardHeader>
                        <CardTitle>{t('notifications')}</CardTitle>
                        <CardDescription>
                            {t('notificationsDesc')}
                        </CardDescription>
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

                        <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg">
                            <div className="space-y-0.5 mt-0.5">
                                <Label htmlFor="wrapped-visibility" className="text-base">{t('wrappedVisible')}</Label>
                                <p className="text-sm text-muted-foreground">{t('wrappedVisibleDesc')}</p>
                            </div>
                            <Switch id="wrapped-visibility" checked={wrappedVisible} onCheckedChange={setWrappedVisible} />
                        </div>

                        {wrappedVisible && (
                            <div className="space-y-4 border p-4 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                                <Label className="text-base underline mb-2 block">{t('wrappedPeriod')}</Label>
                                <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-900/40 border border-zinc-800/50">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium text-zinc-200">{t('autoAvailability')}</Label>
                                        <p className="text-xs text-zinc-500">
                                            {t('autoAvailabilityDesc')}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={wrappedPeriodEnabled}
                                        onCheckedChange={setWrappedPeriodEnabled}
                                    />
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
                                <p className="text-xs text-zinc-500 italic mt-2">{t('wrappedPeriodDesc')}</p>
                            </div>
                        )}

                        {discordEnabled && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                                        <Input
                                            id="max-transcodes"
                                            type="number"
                                            min={0}
                                            value={maxConcurrentTranscodes}
                                            onChange={(e) => setMaxConcurrentTranscodes(parseInt(e.target.value) || 0)}
                                            className="w-24 font-mono"
                                        />
                                        <p className="text-xs text-muted-foreground">0 = désactivé. Alerte si le nombre dépasse ce seuil.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="border-t border-zinc-200 dark:border-zinc-800/50 pt-6 mt-6">
                            <Label htmlFor="excluded-libraries" className="text-base">{t('collectionFilter')}</Label>
                            <p className="text-sm text-muted-foreground mb-4">{t('collectionFilterDesc')}</p>
                            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                                <span className={`rounded-full px-2.5 py-1 font-semibold uppercase tracking-wide ${libraryScanSource === 'jellyfin' ? 'app-chip-success' : 'app-chip'}`}>
                                    {libraryScanSource === 'jellyfin' ? 'Scan direct Jellyfin' : 'Fallback base locale'}
                                </span>
                                {libraryScanError && (
                                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-200">
                                        Jellyfin unreachable, display based on already synced media.
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {availableLibraries.map((libraryKey) => {
                                    const enabled = !excludedLibraries.includes(libraryKey);
                                    return (
                                        <button
                                            key={libraryKey}
                                            type="button"
                                            onClick={() => toggleExcludedLibrary(libraryKey)}
                                            className={`rounded-xl border px-4 py-3 text-left transition-all ${enabled
                                                ? 'border-emerald-400/30 bg-emerald-400/12 hover:bg-emerald-400/16'
                                                : 'app-surface-soft hover:border-slate-400/30'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="font-medium text-zinc-100">{libraryKey}</div>
                                                    <div className="text-xs text-zinc-400 font-mono mt-1">{libraryKey}</div>
                                                </div>
                                                <div className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${enabled ? 'app-chip-success' : 'app-chip'}`}>
                                                    {enabled ? 'Suivi' : 'Ignoré'}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <button onClick={handleSaveSettings} disabled={isSavingSettings} className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${isSavingSettings ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                            <Save className={`w-4 h-4 ${isSavingSettings ? 'animate-pulse' : ''}`} />
                            {isSavingSettings ? tc('saving') : t('saveSettings')}
                        </button>
                    </CardFooter>
                    </Card>
                    </section>
                    <section id="libraryRules" className="space-y-4">
                    <Card className="app-surface mt-6">
                        <CardHeader>
                            <CardTitle>{t('libraryRules')}</CardTitle>
                            <CardDescription>{t('libraryRulesDesc')}</CardDescription>
                        </CardHeader>
                    <CardContent className="space-y-4">
                        {availableLibraries.map((libraryKey) => {
                            const rule = libraryRules[libraryKey] || {
                                completionEnabled: true,
                                completedThreshold: libraryKey === 'music' ? 60 : 80,
                                partialThreshold: libraryKey === 'music' ? 30 : 20,
                                abandonedThreshold: libraryKey === 'music' ? 12 : 10,
                            };

                            return (
                                <div key={libraryKey} className="app-surface-soft rounded-2xl border p-4">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <div className="font-medium text-zinc-100">{formatLibraryLabel(libraryKey)}</div>
                                            <div className="mt-1 text-xs text-zinc-500 font-mono">{libraryKey}</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Label htmlFor={`rule-${libraryKey}`} className="text-sm text-zinc-300">Analyser la complétion</Label>
                                            <Switch id={`rule-${libraryKey}`} checked={rule.completionEnabled} onCheckedChange={(checked) => updateRule(libraryKey, { completionEnabled: checked })} />
                                        </div>
                                    </div>
                                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label>Terminé à partir de (%)</Label>
                                            <Input type="number" min={1} max={100} disabled={!rule.completionEnabled} value={rule.completedThreshold} onChange={(e) => updateRule(libraryKey, { completedThreshold: parseInt(e.target.value, 10) || 0 })} className="font-mono" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Partiel à partir de (%)</Label>
                                            <Input type="number" min={1} max={99} disabled={!rule.completionEnabled} value={rule.partialThreshold} onChange={(e) => updateRule(libraryKey, { partialThreshold: parseInt(e.target.value, 10) || 0 })} className="font-mono" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Abandonné à partir de (%)</Label>
                                            <Input type="number" min={0} max={98} disabled={!rule.completionEnabled} value={rule.abandonedThreshold} onChange={(e) => updateRule(libraryKey, { abandonedThreshold: parseInt(e.target.value, 10) || 0 })} className="font-mono" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                    <CardFooter>
                        <p className="text-xs text-zinc-500">Ces seuils s’appliquent au dashboard, aux statistiques utilisateur et au nettoyage des médias abandonnés.</p>
                    </CardFooter>
                </Card>
                </section>
                <section id="dataBackups" className="space-y-4">
                {/* BACKUP & RESTORE CARD */}
                <Card className="app-surface mt-6">
                    <CardHeader>
                        <CardTitle>{t('dataBackups')}</CardTitle>
                        <CardDescription>{t('dataBackupsDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {backupMsg && (
                            <div className={`p-4 rounded-md flex items-center gap-3 text-sm ${backupMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                {backupMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                {backupMsg.text}
                            </div>
                        )}
                        <input type="file" accept=".json" ref={fileInputRef} className="hidden" onChange={handleImportBackup} />
                    </CardContent>
                    <CardFooter className="flex flex-col sm:flex-row gap-4">
                        <button onClick={handleExportBackup} className="flex-1 flex justify-center items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                            <Download className="w-4 h-4" /> {t('exportBackup')}
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={isRestoring} className={`flex-1 flex justify-center items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${isRestoring ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                            <UploadCloud className={`w-4 h-4 ${isRestoring ? 'animate-bounce' : ''}`} />
                            {isRestoring ? t('importing') : t('importBackup')}
                        </button>
                    </CardFooter>
                    </Card>
                    </section>
                <section id="backupManagement" className="space-y-4">
                {/* AUTO-BACKUPS CARD */}
                <Card className="app-surface mt-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" /> {t('backupManagement')}</CardTitle>
                        <CardDescription>
                            {t('backupManagementDesc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {autoBackupMsg && (
                            <div className={`p-4 rounded-md flex items-center gap-3 text-sm ${autoBackupMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                {autoBackupMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                {autoBackupMsg.text}
                            </div>
                        )}
                        <button
                            onClick={async () => {
                                setIsTriggering(true); setAutoBackupMsg(null);
                                try {
                                    const res = await fetch("/api/backup/auto/trigger", { method: "POST" });
                                    const data = await res.json();
                                    if (res.ok) {
                                        setAutoBackupMsg({ type: "success", text: data.message || tc('success') });
                                        const listRes = await fetch("/api/backup/auto"); if (listRes.ok) { const listData = await listRes.json(); setAutoBackups(listData.backups || []); }
                                    } else { setAutoBackupMsg({ type: "error", text: data.error || tc('error') }); }
                                } catch { setAutoBackupMsg({ type: "error", text: tc('networkError') }); }
                                finally { setIsTriggering(false); }
                            }}
                            disabled={isTriggering}
                            className={`w-full flex justify-center items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${isTriggering ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                        >
                            <Save className={`w-4 h-4 ${isTriggering ? 'animate-pulse' : ''}`} />
                            {isTriggering ? t('backingUp') : t('backupNow')}
                        </button>
                        {autoBackups.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                <Clock className="w-8 h-8 mx-auto mb-3 opacity-50" />
                                <p>{t('noAutoBackups')}</p>
                                <p className="text-xs mt-1">{t('firstBackupTonight')}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {autoBackups.map((backup) => (
                                    <div key={backup.name} className="app-surface-soft flex items-center justify-between rounded-lg border p-3 transition-colors hover:border-slate-400/30">
                                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                            <span className="text-sm font-medium truncate">{backup.name}</span>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                <span>{new Date(backup.date).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                <span>{backup.sizeMb} {tc('mb')}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-3 shrink-0">
                                            <button
                                                onClick={async () => {
                                                    if (!confirm(t('confirmRestore', { name: backup.name }))) return;
                                                    setIsRestoringAuto(backup.name); setAutoBackupMsg(null);
                                                    try {
                                                        const res = await fetch("/api/backup/auto/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: backup.name }) });
                                                        const data = await res.json();
                                                        if (res.ok) { setAutoBackupMsg({ type: "success", text: t('restoreOk') }); setTimeout(() => window.location.reload(), 3000); }
                                                        else { setAutoBackupMsg({ type: "error", text: data.error || tc('error') }); }
                                                    } catch { setAutoBackupMsg({ type: "error", text: tc('networkError') }); }
                                                    finally { setIsRestoringAuto(null); }
                                                }}
                                                disabled={isRestoringAuto !== null || isDeletingAuto !== null}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${isRestoringAuto === backup.name ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                                            >
                                                <UploadCloud className={`w-3 h-3 ${isRestoringAuto === backup.name ? 'animate-bounce' : ''}`} />
                                                {isRestoringAuto === backup.name ? t('restoring') : tc('restore')}
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm(t('confirmDelete', { name: backup.name }))) return;
                                                    setIsDeletingAuto(backup.name); setAutoBackupMsg(null);
                                                    try {
                                                        const res = await fetch("/api/backup/auto/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: backup.name }) });
                                                        const data = await res.json();
                                                        if (res.ok) { setAutoBackupMsg({ type: "success", text: t('deleted') }); setAutoBackups(prev => prev.filter(b => b.name !== backup.name)); }
                                                        else { setAutoBackupMsg({ type: "error", text: data.error || tc('error') }); }
                                                    } catch { setAutoBackupMsg({ type: "error", text: tc('networkError') }); }
                                                    finally { setIsDeletingAuto(null); }
                                                }}
                                                disabled={isRestoringAuto !== null || isDeletingAuto !== null}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${isDeletingAuto === backup.name ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'border border-red-500/30 text-red-400 hover:bg-red-500/10'}`}
                                            >
                                                <Trash2 className={`w-3 h-3 ${isDeletingAuto === backup.name ? 'animate-pulse' : ''}`} />
                                                {isDeletingAuto === backup.name ? '...' : tc('delete')}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
                </section>
        </>

    );
}
