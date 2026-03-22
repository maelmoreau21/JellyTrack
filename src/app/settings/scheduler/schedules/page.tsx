"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";

export default function SchedulerSchedulesPage() {
    const t = useTranslations('settings');
    const tc = useTranslations('common');

    const [isSavingCron, setIsSavingCron] = useState(false);
    const [cronMsg, setCronMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [syncCronHour, setSyncCronHour] = useState(3);
    const [syncCronMinute, setSyncCronMinute] = useState(0);
    const [backupCronHour, setBackupCronHour] = useState(3);
    const [backupCronMinute, setBackupCronMinute] = useState(30);

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

    return (
        <div className="space-y-4">
            <Card className="app-surface">
                <CardHeader>
                    <CardTitle>{t('saveSchedules')}</CardTitle>
                    <CardDescription>{t('scheduleSettingsDesc') || t('taskSchedulerDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {cronMsg && (
                        <div className={`p-4 rounded-md flex items-center gap-3 text-sm ${cronMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                            {cronMsg.text}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('fullSync')}</label>
                            <div className="flex items-center gap-2">
                                <Input type="number" min={0} max={23} value={syncCronHour} onChange={(e) => setSyncCronHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))} className="w-20 font-mono" />
                                <span className="text-muted-foreground">:</span>
                                <Input type="number" min={0} max={59} value={syncCronMinute} onChange={(e) => setSyncCronMinute(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))} className="w-20 font-mono" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('backupTask')}</label>
                            <div className="flex items-center gap-2">
                                <Input type="number" min={0} max={23} value={backupCronHour} onChange={(e) => setBackupCronHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))} className="w-20 font-mono" />
                                <span className="text-muted-foreground">:</span>
                                <Input type="number" min={0} max={59} value={backupCronMinute} onChange={(e) => setBackupCronMinute(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))} className="w-20 font-mono" />
                            </div>
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <button onClick={handleSaveCron} disabled={isSavingCron} className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${isSavingCron ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                        <Save className={`w-4 h-4 ${isSavingCron ? 'animate-pulse' : ''}`} />
                        {isSavingCron ? tc('saving') : t('saveSchedules')}
                    </button>
                </CardFooter>
            </Card>
        </div>
    );
}
