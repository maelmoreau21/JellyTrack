"use client";

import { useEffect, useState } from "react";
import { Clock, Save, UploadCloud, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useTranslations, useLocale } from "next-intl";

export default function SchedulerBackupsPage() {
    const t = useTranslations('settings');
    const tc = useTranslations('common');
    const locale = useLocale();

    const [isTriggering, setIsTriggering] = useState(false);
    const [autoBackups, setAutoBackups] = useState<Array<{ name: string; date: string; sizeMb: number }>>([]);
    const [autoBackupMsg, setAutoBackupMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [isRestoringAuto, setIsRestoringAuto] = useState<string | null>(null);
    const [isDeletingAuto, setIsDeletingAuto] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch('/api/backup/auto');
                if (res.ok) {
                    const data = await res.json();
                    if (!mounted) return;
                    setAutoBackups(data.backups || []);
                }
            } catch {}
        })();
        return () => { mounted = false; };
    }, []);

    return (
        <div className="space-y-4">
            <Card className="app-surface">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" /> {t('backupManagement')}</CardTitle>
                    <CardDescription>{t('backupManagementDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {autoBackupMsg && (
                        <div className={`p-4 rounded-md flex items-center gap-3 text-sm ${autoBackupMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
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
                                            <span>{new Date(backup.date).toLocaleString(locale)}</span>
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
                                            {isDeletingAuto === backup.name ? tc('deleting') : tc('delete')}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
