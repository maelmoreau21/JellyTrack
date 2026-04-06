"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

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
        if (!confirm("Delete this backup?")) return;
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
        if (!confirm("Restoring will replace your database. Continue?")) return;
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

    return (
        <div className="p-4 md:p-8 max-w-[1100px] mx-auto space-y-4">
            <Card className="app-surface">
                <CardHeader>
                    <CardTitle>{t("dataBackups")}</CardTitle>
                    <CardDescription>{t("dataBackupsDesc")}</CardDescription>
                </CardHeader>

                <CardContent>
                    {msg && <div className={`p-3 rounded text-sm ${msg.type === "success" ? "text-emerald-400 bg-emerald-500/5" : "text-red-400 bg-red-500/5"}`}>{msg.text}</div>}

                    <div className="flex gap-2 items-center mb-4">
                        <Button onClick={triggerBackup} disabled={running}>{running ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t("backingUp")}</> : t("backupNow")}</Button>
                        <Button variant="outline" onClick={handleExport}>{t("exportBackup")}</Button>

                        <div className="flex items-center gap-2 ml-auto">
                            <Label className="text-sm">{t("importBackup")}</Label>
                            <Input type="file" accept=".json,application/json" ref={fileRef} />
                            <Button onClick={handleImport}>{t("importBackup")}</Button>
                        </div>
                    </div>

                    <Table className="table-fixed">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>{tCommon("mb")}</TableHead>
                                <TableHead>{t("day")}</TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-zinc-400">{tCommon("loading")}</TableCell></TableRow>
                            ) : backups.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-zinc-400">{t("noAutoBackups")}</TableCell></TableRow>
                            ) : (
                                backups.map((b) => (
                                    <TableRow key={b.name}>
                                        <TableCell className="max-w-[400px] truncate">{b.name}</TableCell>
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
                </CardContent>

                <CardFooter>
                    <div className="text-xs text-muted-foreground">{t("backupManagementDesc")}</div>
                </CardFooter>
            </Card>
        </div>
    );
}
