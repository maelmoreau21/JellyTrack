"use client";

import { useState } from "react";
import { RefreshCw, Database, Save, Play } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useTranslations } from "next-intl";

export default function SchedulerTasksPage() {
    const t = useTranslations('settings');
    const tc = useTranslations('common');

    const [taskStatus, setTaskStatus] = useState<Record<string, { loading: boolean; msg: { type: 'success' | 'error', text: string } | null }>>({
        recentSync: { loading: false, msg: null },
        fullSync: { loading: false, msg: null },
        backup: { loading: false, msg: null },
    });

    const runTask = async (taskKey: string, url: string, body?: object) => {
        setTaskStatus(prev => ({ ...prev, [taskKey]: { loading: true, msg: null } }));
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: body ? { "Content-Type": "application/json" } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setTaskStatus(prev => ({ ...prev, [taskKey]: { loading: false, msg: { type: "success", text: data.message || tc('success') } } }));
            } else {
                setTaskStatus(prev => ({ ...prev, [taskKey]: { loading: false, msg: { type: "error", text: data.error || data.message || tc('error') } } }));
            }
        } catch {
            setTaskStatus(prev => ({ ...prev, [taskKey]: { loading: false, msg: { type: "error", text: tc('networkError') } } }));
        }
    };

    return (
        <div className="space-y-4">
            <Card className="app-surface">
                <CardHeader>
                    <CardTitle>{t('taskScheduler')}</CardTitle>
                    <CardDescription>{t('taskSchedulerDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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
                            className={`ml-3 shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:shadow-md active:scale-95 transition-all border ${taskStatus.recentSync.loading ? 'bg-muted text-muted-foreground cursor-not-allowed border-zinc-200 dark:border-zinc-800' : 'bg-sky-600 text-white hover:bg-sky-500 border-white/20'}`}
                        >
                            <Play className={`w-3.5 h-3.5 ${taskStatus.recentSync.loading ? 'animate-spin' : ''}`} />
                            {taskStatus.recentSync.loading ? tc('running') : tc('run')}
                        </button>
                    </div>

                    <div className="app-surface-soft flex items-center justify-between rounded-lg border p-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <Database className="w-4 h-4 text-violet-400 shrink-0" />
                                <span className="font-medium text-sm">{t('fullSync')}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 ml-6">{t('fullSyncDesc') || t('autoNightlyAt')}</p>
                            {taskStatus.fullSync.msg && (
                                <div className={`mt-2 ml-6 text-xs ${taskStatus.fullSync.msg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {taskStatus.fullSync.msg.text}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => runTask('fullSync', '/api/sync', { mode: 'full' })}
                            disabled={taskStatus.fullSync.loading}
                            className={`ml-3 shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:shadow-md active:scale-95 transition-all border ${taskStatus.fullSync.loading ? 'bg-muted text-muted-foreground cursor-not-allowed border-zinc-200 dark:border-zinc-800' : 'bg-violet-600 text-white hover:bg-violet-500 border-white/20'}`}
                        >
                            <Play className={`w-3.5 h-3.5 ${taskStatus.fullSync.loading ? 'animate-spin' : ''}`} />
                            {taskStatus.fullSync.loading ? tc('running') : tc('run')}
                        </button>
                    </div>

                    <div className="app-surface-soft flex items-center justify-between rounded-lg border p-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <Save className="w-4 h-4 text-amber-400 shrink-0" />
                                <span className="font-medium text-sm">{t('backupTask')}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 ml-6">{t('backupTaskDesc') || t('autoNightlyAt')}</p>
                            {taskStatus.backup.msg && (
                                <div className={`mt-2 ml-6 text-xs ${taskStatus.backup.msg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {taskStatus.backup.msg.text}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => runTask('backup', '/api/backup/auto/trigger')}
                            disabled={taskStatus.backup.loading}
                            className={`ml-3 shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:shadow-md active:scale-95 transition-all border ${taskStatus.backup.loading ? 'bg-muted text-muted-foreground cursor-not-allowed border-zinc-200 dark:border-zinc-800' : 'bg-amber-600 text-white hover:bg-amber-500 border-white/20'}`}
                        >
                            <Play className={`w-3.5 h-3.5 ${taskStatus.backup.loading ? 'animate-spin' : ''}`} />
                            {taskStatus.backup.loading ? tc('running') : tc('run')}
                        </button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
