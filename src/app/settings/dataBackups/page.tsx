"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Upload, Database, Clock3, RotateCcw, Trash2, Plus, FileJson, ShieldCheck } from "lucide-react";

type Backup = {
    name: string;
    size: number | string;
    sizeMb: string;
    date: string;
    type?: "auto" | "manual";
};

export default function SettingsDataBackupsPage() {
    const t = useTranslations("settings");
    const tCommon = useTranslations("common");
    const [loading, setLoading] = useState(true);
    const [backups, setBackups] = useState<Backup[]>([]);
    const [running, setRunning] = useState(false);
    const [importing, setImporting] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const fetchBackups = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/backup/auto");
            const data = await res.json().catch(() => ({}));
            setBackups(data?.backups || []);
        } catch {
            setMsg({ type: "error", text: t("fileReadError") || "Error reading backups." });
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchBackups();
    }, [fetchBackups]);

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

    const handleDownload = (fileName: string) => {
        window.open(`/api/backup/auto/download?fileName=${encodeURIComponent(fileName)}`, "_blank");
    };

    const handleDelete = async (fileName: string) => {
        if (!confirm(t("confirmDeleteBackup") || "Voulez-vous vraiment supprimer cette sauvegarde ?")) return;
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
        if (!confirm(t("confirmRestoreBackup") || "Voulez-vous vraiment restaurer cette sauvegarde ? Vos données actuelles seront remplacées.")) return;
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
            setMsg({ type: "error", text: t("fileReadError") || "Veuillez sélectionner un fichier." });
            return;
        }
        setImporting(true);
        setMsg(null);
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const res = await fetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                setMsg({ type: "success", text: t("restoreSuccess") || "Restauration effectuée avec succès." });
                setTimeout(() => window.location.reload(), 1200);
            } else {
                setMsg({ type: "error", text: data.error || t("invalidBackup") });
            }
        } catch (e: any) {
            setMsg({ type: "error", text: (e?.message as string) || t("jsonParseError") });
        } finally {
            setImporting(false);
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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <CardTitle className="text-2xl flex items-center gap-2">
                                <Database className="w-6 h-6 text-cyan-500" />
                                {t("dataBackups")}
                            </CardTitle>
                            <CardDescription className="mt-1">{t("dataBackupsDesc")}</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={triggerBackup} disabled={running} className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2">
                                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                {t("backupNow")}
                            </Button>
                            <Button variant="outline" onClick={handleExport} className="gap-2">
                                <Download className="w-4 h-4" />
                                {t("exportBackup")}
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    {msg && (
                        <div className={`rounded-lg border p-4 text-sm flex items-center gap-3 ${msg.type === "success" ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-red-500/20 text-red-400 bg-red-500/5"}`}>
                            {msg.type === "success" ? <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" /> : <Database className="w-5 h-5 text-red-400 shrink-0" />}
                            <div>{msg.text}</div>
                        </div>
                    )}

                    {/* Overview Cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="app-surface-soft rounded-xl border border-border p-4 flex flex-col justify-between">
                            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{t("backupsCount") || "Nombre de sauvegardes"}</div>
                            <div className="mt-2 text-3xl font-bold text-foreground">{totalBackups}</div>
                        </div>
                        <div className="app-surface-soft rounded-xl border border-border p-4 flex flex-col justify-between">
                            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{t("totalSize") || "Taille totale"}</div>
                            <div className="mt-2 text-3xl font-bold text-foreground">{totalSizeMb.toFixed(2)} <span className="text-lg font-normal text-muted-foreground">{tCommon("mb")}</span></div>
                        </div>
                        <div className="app-surface-soft rounded-xl border border-border p-4 flex flex-col justify-between">
                            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{t("latestBackup") || "Dernière sauvegarde"}</div>
                            <div className="mt-2 text-base font-medium flex items-center gap-2 text-amber-400">
                                <Clock3 className="w-4 h-4" />
                                {latestBackup ? new Date(latestBackup.date).toLocaleString() : "-"}
                            </div>
                        </div>
                    </div>

                    {/* Backup Table Section */}
                    <div className="app-surface-soft rounded-xl border border-border overflow-hidden shadow-sm">
                        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-lg">{t("backupHistory") || "Historique des sauvegardes"}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">{t("backupHistoryDesc") || "Liste des sauvegardes enregistrées sur le serveur."}</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border hover:bg-transparent">
                                        <TableHead className="w-[180px]">{t("day") || "Date"}</TableHead>
                                        <TableHead className="w-[120px]">{t("backupType") || "Type"}</TableHead>
                                        <TableHead className="w-[100px]">{tCommon("mb") || "Taille"}</TableHead>
                                        <TableHead className="min-w-[220px]">{t("file") || "Fichier"}</TableHead>
                                        <TableHead className="text-right w-[300px]">{t("actions") || "Actions"}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                                <div className="flex items-center justify-center gap-2">
                                                    <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
                                                    {tCommon("loading")}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : backups.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                                {t("noAutoBackups") || "Aucune sauvegarde disponible."}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        backups.map((b) => {
                                            const isAuto = b.type === "auto" || b.name.startsWith("JellyTrack-auto-");
                                            return (
                                                <TableRow key={b.name} className="border-border/60 hover:bg-accent/40">
                                                    <TableCell className="font-medium whitespace-nowrap">
                                                        {new Date(b.date).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        {isAuto ? (
                                                            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                                                                {t("backupAuto") || "Automatique"}
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
                                                                {t("backupManual") || "Manuelle"}
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap font-mono text-xs">
                                                        {String(b.sizeMb)} MB
                                                    </TableCell>
                                                    <TableCell className="max-w-[280px] truncate font-mono text-xs text-muted-foreground" title={b.name}>
                                                        {b.name}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleDownload(b.name)}
                                                                className="h-8 px-2.5 text-xs gap-1.5"
                                                            >
                                                                <Download className="w-3.5 h-3.5" />
                                                                {t("download") || "Télécharger"}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="secondary"
                                                                onClick={() => handleRestore(b.name)}
                                                                className="h-8 px-2.5 text-xs gap-1.5 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                                {tCommon("restore") || "Restaurer"}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleDelete(b.name)}
                                                                className="h-8 px-2.5 text-xs gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                {tCommon("delete") || "Supprimer"}
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {/* Import Section */}
                    <Card className="app-surface-soft border border-border">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Upload className="w-5 h-5 text-purple-400" />
                                {t("importBackup") || "Importer une sauvegarde"}
                            </CardTitle>
                            <CardDescription>
                                {t("importBackupDesc") || "Sélectionnez un fichier de sauvegarde JSON (.json) depuis votre ordinateur pour restaurer votre base de données."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                <div className="flex-1">
                                    <Label htmlFor="import-file" className="sr-only">{t("importBackup")}</Label>
                                    <Input
                                        id="import-file"
                                        type="file"
                                        accept=".json,application/json"
                                        ref={fileRef}
                                        className="cursor-pointer"
                                    />
                                </div>
                                <Button
                                    onClick={handleImport}
                                    disabled={importing}
                                    className="bg-purple-600 hover:bg-purple-700 text-white gap-2 shrink-0"
                                >
                                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
                                    {importing ? (t("importing") || "Importation...") : (t("importBackup") || "Importer et restaurer")}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="text-xs text-muted-foreground">{t("backupManagementDesc")}</div>
                </CardContent>
            </Card>
        </div>
    );
}

