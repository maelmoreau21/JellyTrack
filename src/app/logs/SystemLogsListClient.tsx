"use client";

import React, { useState } from 'react';
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
                <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50 backdrop-blur-md">
                    <TableRow className="border-b border-zinc-200 dark:border-zinc-800">
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
                            <TableCell colSpan={5} className="text-center py-12 text-zinc-400">
                                <div className="flex flex-col items-center gap-2">
                                    <Activity className="w-8 h-8 opacity-20" />
                                    {t('noResults')}
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredLogs.map((entry) => (
                            <TableRow key={entry.id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors border-b border-zinc-100 dark:border-zinc-800/50">
                                <TableCell className="py-4 font-medium text-[11px] text-zinc-500">
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
                                                : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200/50 dark:border-zinc-700/30"
                                        )}>
                                            {getIcon(entry)}
                                        </div>
                                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                                            {entry.type === 'audit' ? (entry.action || 'Audit') : (entry.source || 'Système')}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="py-4">
                                    {entry.actorUsername ? (
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{entry.actorUsername}</span>
                                            {entry.ipAddress && <span className="text-[10px] text-zinc-400 font-mono tracking-tighter">{entry.ipAddress}</span>}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-zinc-400 italic">Système</span>
                                    )}
                                </TableCell>
                                <TableCell className="py-4">
                                    <div className="flex flex-col gap-2 max-w-xl">
                                        <span className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{entry.message || entry.action}</span>
                                        {entry.details && typeof entry.details === 'object' && Object.keys(entry.details).length > 0 && (
                                            <div className="text-[10px] bg-zinc-100/30 dark:bg-zinc-950/50 p-3 rounded-xl mt-1 font-mono break-all max-h-40 overflow-y-auto border border-zinc-200/50 dark:border-zinc-800/80 shadow-inner">
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
