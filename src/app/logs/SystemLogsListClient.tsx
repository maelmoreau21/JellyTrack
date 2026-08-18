"use client";

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
    Info, 
    AlertCircle, 
    AlertTriangle, 
    ShieldCheck, 
    Activity, 
    Download, 
    Trash2, 
    Settings, 
    Search, 
    FileText,
    CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export type SystemLogEntry = {
    id: string;
    type: 'audit' | 'health' | 'file';
    level?: string;
    action?: string; // for audit
    actorUsername?: string; // for audit
    ipAddress?: string; // for audit
    source?: string; // for health/file
    kind?: string; // for health
    message?: string; // for health/file
    details?: any;
    createdAt: string;
};

export default function SystemLogsListClient({ logs, locale }: { logs: SystemLogEntry[], locale: string }) {
    const t = useTranslations('logs');
    const tc = useTranslations('common');
    const dateLocale = locale === 'fr' ? fr : enUS;

    const [filterLevel, setFilterLevel] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isClearing, setIsClearing] = useState(false);
    const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const getIcon = (entry: SystemLogEntry) => {
        const level = (entry.level || entry.kind || '').toUpperCase();
        if (entry.type === 'audit' || level.includes('AUDIT')) return <ShieldCheck className="w-4 h-4 text-indigo-500" />;
        if (level.includes('ERROR')) return <AlertCircle className="w-4 h-4 text-red-500" />;
        if (level.includes('WARN')) return <AlertTriangle className="w-4 h-4 text-amber-500" />;
        if (level.includes('SUCCESS')) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
        return <Info className="w-4 h-4 text-blue-500" />;
    };

    const getLevelBadgeClass = (entry: SystemLogEntry) => {
        const level = (entry.level || entry.kind || '').toUpperCase();
        if (entry.type === 'audit' || level.includes('AUDIT')) return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
        if (level.includes('ERROR')) return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
        if (level.includes('WARN')) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
        if (level.includes('SUCCESS')) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    };

    const getLevelLabel = (entry: SystemLogEntry) => {
        const level = (entry.level || entry.kind || '').toUpperCase();
        if (entry.type === 'audit' || level.includes('AUDIT')) return 'AUDIT';
        if (level.includes('ERROR')) return 'ERROR';
        if (level.includes('WARN')) return 'WARN';
        if (level.includes('DEBUG')) return 'DEBUG';
        return 'INFO';
    };

    const filteredLogs = useMemo(() => {
        return logs.filter(entry => {
            if (entry.kind === 'monitor_ping') return false;

            const level = getLevelLabel(entry);
            if (filterLevel !== 'ALL' && level !== filterLevel) return false;

            if (searchQuery.trim().length > 0) {
                const q = searchQuery.toLowerCase();
                const text = `${entry.message || ''} ${entry.action || ''} ${entry.source || ''} ${entry.actorUsername || ''} ${entry.ipAddress || ''}`.toLowerCase();
                if (!text.includes(q)) return false;
            }

            return true;
        });
    }, [logs, filterLevel, searchQuery]);

    const handleClearLogs = async () => {
        const confirmText = t('clearLogsConfirm') || 'Voulez-vous vraiment effacer les journaux système ?';
        if (!window.confirm(confirmText)) return;

        setIsClearing(true);
        setActionMsg(null);
        try {
            const res = await fetch('/api/logs/system', { method: 'DELETE' });
            if (res.ok) {
                setActionMsg({ type: 'success', text: t('clearLogsSuccess') || 'Journaux système effacés avec succès.' });
                setTimeout(() => window.location.reload(), 1000);
            } else {
                setActionMsg({ type: 'error', text: 'Erreur lors de la suppression des journaux.' });
            }
        } catch {
            setActionMsg({ type: 'error', text: 'Erreur réseau.' });
        } finally {
            setIsClearing(false);
        }
    };

    return (
        <div className="w-full space-y-4">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/70 app-surface-soft shadow-sm">
                <div className="flex flex-wrap items-center gap-2 flex-1 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder={t('searchPlaceholder') || "Rechercher dans les logs..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>
                    <select
                        value={filterLevel}
                        onChange={(e) => setFilterLevel(e.target.value)}
                        className="h-9 px-3 py-1 bg-background border rounded-md text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option value="ALL">{t('levelAll') || 'Tous les niveaux'}</option>
                        <option value="ERROR">ERROR</option>
                        <option value="WARN">WARN</option>
                        <option value="INFO">INFO</option>
                        <option value="AUDIT">AUDIT</option>
                        <option value="DEBUG">DEBUG</option>
                    </select>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Link
                        href="/settings/scheduler"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/80 text-xs font-medium hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title={t('logRetentionHint') || "Configurer la rétention des journaux"}
                    >
                        <Settings className="w-3.5 h-3.5" />
                        <span>{t('retentionConfig') || 'Rétention'}</span>
                    </Link>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleClearLogs}
                        disabled={isClearing}
                        className="h-9 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/30"
                    >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        {t('clearLogs') || 'Vider'}
                    </Button>

                    <a
                        href="/api/logs/system/download"
                        download
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 shadow-sm transition-all"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>{t('downloadLogs') || 'Télécharger les logs'}</span>
                    </a>
                </div>
            </div>

            {actionMsg && (
                <div className={`p-3 rounded-lg text-xs font-medium border ${actionMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                    {actionMsg.text}
                </div>
            )}

            {/* Logs Table */}
            <div className="rounded-xl border border-border overflow-hidden app-surface">
                <Table>
                    <TableHeader className="app-surface-soft backdrop-blur-md">
                        <TableRow className="border-b border-border">
                            <TableHead className="w-[180px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('colDate')}</TableHead>
                            <TableHead className="w-[90px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('colStatus')}</TableHead>
                            <TableHead className="w-[180px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('system.colSource')}</TableHead>
                            <TableHead className="w-[160px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('system.colUser')}</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('system.colMessage')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredLogs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <FileText className="w-8 h-8 opacity-20" />
                                        <span>{t('noResults')}</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredLogs.map((entry) => (
                                <TableRow key={entry.id} className="group hover:bg-muted/60 transition-colors border-b border-border/70">
                                    <TableCell className="py-3 font-medium text-[11px] text-muted-foreground whitespace-nowrap">
                                        {format(new Date(entry.createdAt), 'PPp', { locale: dateLocale })}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <Badge variant="outline" className={cn(
                                            "text-[9px] font-extrabold px-2 py-0.5 uppercase tracking-wider rounded-md border shadow-sm",
                                            getLevelBadgeClass(entry)
                                        )}>
                                            {getLevelLabel(entry)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-1.5 rounded-lg shadow-sm border border-border/50 app-surface-soft">
                                                {getIcon(entry)}
                                            </div>
                                            <span className="text-xs font-bold text-foreground tracking-tight truncate max-w-[140px]">
                                                {entry.type === 'audit' ? (entry.action || 'Audit') : (entry.source || 'System')}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        {entry.actorUsername ? (
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs font-bold text-foreground">{entry.actorUsername}</span>
                                                {entry.ipAddress && <span className="text-[10px] text-muted-foreground font-mono tracking-tighter">{entry.ipAddress}</span>}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">System</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-1.5 max-w-2xl">
                                            <span className="text-xs leading-relaxed text-foreground/90 font-mono break-words">{entry.message || entry.action}</span>
                                            {entry.details && typeof entry.details === 'object' && Object.keys(entry.details).length > 0 && (
                                                <div className="app-surface-soft text-[10px] p-2.5 rounded-lg font-mono break-all max-h-36 overflow-y-auto border shadow-inner">
                                                    <pre className="whitespace-pre-wrap opacity-85">{JSON.stringify(entry.details, null, 2)}</pre>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
