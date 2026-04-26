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

    return (
        <div className="w-full">
            <Table>
                <TableHeader className="bg-background/80 dark:bg-zinc-950/80 backdrop-blur-md">
                    <TableRow className="border-b border-zinc-200 dark:border-zinc-800">
                        <TableHead className="w-[180px] text-[10px] font-bold uppercase tracking-tight">{t('colDate')}</TableHead>
                        <TableHead className="w-[100px] text-[10px] font-bold uppercase tracking-tight">{t('colStatus')}</TableHead>
                        <TableHead className="w-[150px] text-[10px] font-bold uppercase tracking-tight">{t('system.colSource')}</TableHead>
                        <TableHead className="w-[150px] text-[10px] font-bold uppercase tracking-tight">{t('system.colUser')}</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-tight">{t('system.colMessage')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {logs.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-zinc-400">{t('noResults')}</TableCell>
                        </TableRow>
                    ) : (
                        logs.map((entry) => (
                            <TableRow key={entry.id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                                <TableCell className="py-3 font-medium text-xs text-zinc-500">
                                    {format(new Date(entry.createdAt), 'PPp', { locale: dateLocale })}
                                </TableCell>
                                <TableCell className="py-3">
                                    <Badge variant="outline" className={cn(
                                        "text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-full border-0",
                                        entry.type === 'audit' 
                                            ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" 
                                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    )}>
                                        {entry.type === 'audit' ? t('system.typeAudit') : t('system.typeHealth')}
                                    </Badge>
                                </TableCell>
                                <TableCell className="py-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className={cn(
                                            "p-1.5 rounded-lg",
                                            entry.type === 'audit' ? "bg-indigo-50 dark:bg-indigo-500/10" : "bg-zinc-50 dark:bg-zinc-800"
                                        )}>
                                            {getIcon(entry)}
                                        </div>
                                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                            {entry.type === 'audit' ? (entry.action || 'Audit') : (entry.source || 'Système')}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="py-3 text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                                    {entry.actorUsername ? (
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-zinc-900 dark:text-zinc-100 font-bold">{entry.actorUsername}</span>
                                            {entry.ipAddress && <span className="text-[10px] opacity-60 font-mono">{entry.ipAddress}</span>}
                                        </div>
                                    ) : entry.ipAddress || '-'}
                                </TableCell>
                                <TableCell className="py-3 text-xs text-zinc-600 dark:text-zinc-400">
                                    <div className="flex flex-col gap-1.5">
                                        <span className="leading-relaxed">{entry.message || entry.action}</span>
                                        {entry.details && typeof entry.details === 'object' && Object.keys(entry.details).length > 0 && (
                                            <div className="text-[10px] bg-zinc-100/50 dark:bg-zinc-800/50 p-2 rounded-lg mt-1 font-mono break-all max-h-32 overflow-y-auto border border-zinc-200/50 dark:border-zinc-700/30">
                                                <pre className="whitespace-pre-wrap">{JSON.stringify(entry.details, null, 2)}</pre>
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
