"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Loader2, Download, Upload, Database, Clock3 } from "lucide-react";

type Backup = { name: string; size: number | string; sizeMb: string; date: string };

export default function SettingsDataBackupsPage() {
    const t = useTranslations("settings");
    const tCommon = useTranslations("common");
    const [loading, setLoading] = useState(true);
    const [backups, setBackups] = useState<Backup[]>([]);
    const [running, setRunning] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const fetchBackups = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/backup/auto");
            const data = await res.json().catch(() => ({}));
            setBackups(data?.backups || []);
        } catch (e: any) {
            setMsg({ type: "error", text: t("fileReadError") || "Error reading backups." });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBackups();
    }, []);

    const triggerBackup = async () => {
        setRunning(true);
        setMsg(null);
        try {
            const res = await fetch("/api/backup/auto/trigger", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                setMsg({ type: "success", text: data.message || t("backingUp") });
                await fetchBackups();
            } else {
                setMsg({ type: "error", text: data.error || t("backupError") });
            }
        } catch (e: any) {
            setMsg({ type: "error", text: e?.message || t("backupError") });
        } finally {
            setRunning(false);
        }
    };

    const handleDelete = async (fileName: string) => {
        if (!confirm(t("confirmDeleteBackup"))) return;
        setMsg(null);
        try {
            const res = await fetch("/api/backup/auto/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName }) });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                setMsg({ type: "success", text: data.message || t("deleted") });
                await fetchBackups();
            } else {
                setMsg({ type: "error", text: data.error || t("deleteError") });
            }
        } catch (e: any) {
            setMsg({ type: "error", text: e?.message || t("deleteError") });
        }
    };

    const handleRestore = async (fileName: string) => {
        if (!confirm(t("confirmRestoreBackup"))) return;
        setMsg(null);
        try {
            const res = await fetch("/api/backup/auto/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName }) });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                setMsg({ type: "success", text: data.message || t("restoreSuccess") });
                setTimeout(() => window.location.reload(), 1200);
            } else {
                setMsg({ type: "error", text: data.error || t("restoreError") });
            }
        } catch (e: any) {
            setMsg({ type: "error", text: e?.message || t("restoreError") });
        }
    };

    const handleImport = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) {
            setMsg({ type: "error", text: t("fileReadError") });
            return;
        }
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            setMsg(null);
            const res = await fetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                setMsg({ type: "success", text: t("restoreSuccess") });
                setTimeout(() => window.location.reload(), 1200);
            } else {
                setMsg({ type: "error", text: data.error || t("invalidBackup") });
            }
        } catch (e: any) {
            setMsg({ type: "error", text: (e?.message as string) || t("jsonParseError") });
        }
    };

    const handleExport = () => {
        window.open("/api/backup/export", "_blank");
    };

    const totalBackups = backups.length;
    const totalSizeMb = backups.reduce((sum, item) => sum + Number(item.sizeMb || 0), 0);
    const latestBackup = backups[0] || null;

    return (
        <div className="p-4 md:p-8 max-w-[1200px] mx-auto space-y-6">
            <Card className="app-surface border-border">
                <CardHeader>
                    <CardTitle className="text-2xl flex items-center gap-2">
                        <Database className="w-6 h-6 text-cyan-500" />
                        {t("dataBackups")}
                    </CardTitle>
                    <CardDescription>{t("dataBackupsDesc")}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-5">
                    {msg && (
                        <div className={`rounded-lg border p-3 text-sm ${msg.type === "success" ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-red-500/20 text-red-400 bg-red-500/5"}`}>
                            {msg.text}
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="app-surface-soft rounded-lg border p-4">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("backupsCount")}</div>
                            <div className="mt-1 text-2xl font-semibold">{totalBackups}</div>
                        </div>
                        <div className="app-surface-soft rounded-lg border p-4">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("totalSize")}</div>
                            <div className="mt-1 text-2xl font-semibold">{totalSizeMb.toFixed(2)} {tCommon("mb")}</div>
                        </div>
                        <div className="app-surface-soft rounded-lg border p-4">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("latestBackup")}</div>
                            <div className="mt-1 text-sm font-medium flex items-center gap-1.5">
                                <Clock3 className="w-4 h-4 text-amber-400" />
                                {latestBackup ? new Date(latestBackup.date).toLocaleString() : "-"}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="lg:col-span-2 app-surface-soft rounded-lg border p-4 space-y-3">
                            <div>
                                <h3 className="font-semibold">{t("quickActions")}</h3>
                                <p className="text-xs text-muted-foreground mt-1">{t("quickActionsBackupDesc")}</p>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                                <Button onClick={triggerBackup} disabled={running}>
                                    {running ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t("backingUp")}</> : t("backupNow")}
                                </Button>
                                <Button variant="outline" onClick={handleExport}>
                                    <Download className="w-4 h-4 mr-2" />
                                    {t("exportBackup")}
                                </Button>
                            </div>
                        </div>

                        <div className="app-surface-soft rounded-lg border p-4 space-y-3">
                            <div>
                                <h3 className="font-semibold">{t("importBackup")}</h3>
                                <p className="text-xs text-muted-foreground mt-1">{t("quickActionsRestoreDesc")}</p>
                            </div>
                            <Label className="text-sm">{t("importBackup")}</Label>
                            <Input type="file" accept=".json,application/json" ref={fileRef} />
                            <Button className="w-full" onClick={handleImport}>
                                <Upload className="w-4 h-4 mr-2" />
                                {t("importBackup")}
                            </Button>
                        </div>
                    </div>

                    <div className="app-surface-soft rounded-lg border overflow-hidden">
                        <div className="px-4 py-3 border-b border-border">
                            <h3 className="font-semibold">{t("backupHistory")}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{t("backupHistoryDesc")}</p>
                        </div>
                        <Table className="table-fixed">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t("file")}</TableHead>
                                    <TableHead>{tCommon("mb")}</TableHead>
                                    <TableHead>{t("day")}</TableHead>
                                    <TableHead>{t("actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{tCommon("loading")}</TableCell></TableRow>
                                ) : backups.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("noAutoBackups")}</TableCell></TableRow>
                                ) : (
                                    backups.map((b) => (
                                        <TableRow key={b.name}>
                                            <TableCell className="max-w-[460px] truncate">{b.name}</TableCell>
                                            <TableCell>{String(b.sizeMb)}</TableCell>
                                            <TableCell>{new Date(b.date).toLocaleString()}</TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={() => handleRestore(b.name)}>{tCommon("restore")}</Button>
                                                    <Button size="sm" variant="ghost" onClick={() => handleDelete(b.name)}>{tCommon("delete")}</Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="text-xs text-muted-foreground">{t("backupManagementDesc")}</div>
                </CardContent>
            </Card>
        </div>
    );
}
