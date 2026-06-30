"use client";

import React from 'react';
import { useTranslations } from 'next-intl';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Info, AlertCircle, ShieldCheck, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SystemLogEntry = {
    id: string;
    type: 'audit' | 'health';
    action?: string; // for audit
    actorUsername?: string; // for audit
    ipAddress?: string; // for audit
    source?: string; // for health
    kind?: string; // for health
    message?: string; // for health
    details?: any;
    createdAt: string;
};

export default function SystemLogsListClient({ logs, locale }: { logs: SystemLogEntry[], locale: string }) {
    const t = useTranslations('logs');
    const dateLocale = locale === 'fr' ? fr : enUS;

    const getIcon = (entry: SystemLogEntry) => {
        if (entry.type === 'audit') return <ShieldCheck className="w-4 h-4 text-indigo-500" />;
        const kind = entry.kind?.toLowerCase() || '';
        if (kind.includes('error')) return <AlertCircle className="w-4 h-4 text-red-500" />;
        if (kind.includes('success')) return <Activity className="w-4 h-4 text-emerald-500" />;
        return <Info className="w-4 h-4 text-blue-500" />;
    };

    const filteredLogs = logs.filter(entry => entry.kind !== 'monitor_ping');

    return (
        <div className="w-full">
            <Table>
                <TableHeader className="app-surface-soft backdrop-blur-md">
                    <TableRow className="border-b border-border">
                        <TableHead className="w-[180px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('colDate')}</TableHead>
                        <TableHead className="w-[100px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('colStatus')}</TableHead>
                        <TableHead className="w-[200px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('system.colSource')}</TableHead>
                        <TableHead className="w-[180px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('system.colUser')}</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('system.colMessage')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredLogs.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                <div className="flex flex-col items-center gap-2">
                                    <Activity className="w-8 h-8 opacity-20" />
                                    {t('noResults')}
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredLogs.map((entry) => (
                            <TableRow key={entry.id} className="group hover:bg-muted/60 transition-colors border-b border-border/70">
                                <TableCell className="py-4 font-medium text-[11px] text-muted-foreground">
                                    {format(new Date(entry.createdAt), 'PPp', { locale: dateLocale })}
                                </TableCell>
                                <TableCell className="py-4">
                                    <Badge variant="outline" className={cn(
                                        "text-[9px] font-extrabold px-2 py-0.5 uppercase tracking-widest rounded-md border-0 shadow-sm",
                                        entry.type === 'audit' 
                                            ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" 
                                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    )}>
                                        {entry.type === 'audit' ? t('system.typeAudit') : t('system.typeHealth')}
                                    </Badge>
                                </TableCell>
                                <TableCell className="py-4">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "p-2 rounded-lg shadow-sm border border-transparent",
                                            entry.type === 'audit' 
                                                ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100/50 dark:border-indigo-500/20" 
                                                : "app-surface-soft border-border"
                                        )}>
                                            {getIcon(entry)}
                                        </div>
                                        <span className="text-xs font-bold text-foreground tracking-tight">
                                            {entry.type === 'audit' ? (entry.action || 'Audit') : (entry.source || 'System')}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="py-4">
                                    {entry.actorUsername ? (
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-xs font-bold text-foreground">{entry.actorUsername}</span>
                                            {entry.ipAddress && <span className="text-[10px] text-muted-foreground font-mono tracking-tighter">{entry.ipAddress}</span>}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-muted-foreground italic">System</span>
                                    )}
                                </TableCell>
                                <TableCell className="py-4">
                                    <div className="flex flex-col gap-2 max-w-xl">
                                        <span className="text-sm leading-relaxed text-foreground/80">{entry.message || entry.action}</span>
                                        {entry.details && typeof entry.details === 'object' && Object.keys(entry.details).length > 0 && (
                                            <div className="app-surface-soft text-[10px] p-3 rounded-xl mt-1 font-mono break-all max-h-40 overflow-y-auto border shadow-inner">
                                                <pre className="whitespace-pre-wrap opacity-80">{JSON.stringify(entry.details, null, 2)}</pre>
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
    );
}
