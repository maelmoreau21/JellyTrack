"use client";

import React, { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
    FileText, 
    Download, 
    Trash2, 
    Settings, 
    Search, 
    HardDrive, 
    Clock, 
    RefreshCw,
    Archive,
    Loader2
} from "lucide-react";
import Link from "next/link";
import type { LogFileInfo } from "@/lib/systemLogger";

interface SystemLogsListClientProps {
    files: LogFileInfo[];
    locale: string;
    retentionDays: number;
}

export default function SystemLogsListClient({ files: initialFiles, locale, retentionDays }: SystemLogsListClientProps) {
    const t = useTranslations("logs");
    const tc = useTranslations("common");
    const ts = useTranslations("settings");
    const dateLocale = locale === "fr" ? fr : enUS;

    const [files, setFiles] = useState<LogFileInfo[]>(initialFiles);
    const [searchQuery, setSearchQuery] = useState("");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
    const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const refreshFiles = async () => {
        setIsRefreshing(true);
        try {
            const res = await fetch("/api/logs/system", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.files)) {
                    setFiles(data.files);
                }
            }
        } catch {
            // Ignore refresh error
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleDownload = async (filename: string) => {
        setDownloadingFile(filename);
        setActionMsg(null);
        try {
            const res = await fetch(`/api/logs/system/download?file=${encodeURIComponent(filename)}`);
            if (!res.ok) {
                const text = await res.text();
                setActionMsg({ type: "error", text: text || "Erreur lors du téléchargement du fichier." });
                return;
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setActionMsg({ type: "success", text: `Téléchargement de ${filename} réussi.` });
        } catch (err: any) {
            setActionMsg({ type: "error", text: err?.message || "Erreur réseau lors du téléchargement." });
        } finally {
            setDownloadingFile(null);
        }
    };

    const handleDeleteFile = async (filename: string) => {
        const confirmText = `Voulez-vous vraiment supprimer le fichier de log "${filename}" ?`;
        if (!window.confirm(confirmText)) return;

        setActionMsg(null);
        try {
            const res = await fetch(`/api/logs/system?file=${encodeURIComponent(filename)}`, { method: "DELETE" });
            if (res.ok) {
                setActionMsg({ type: "success", text: `Fichier ${filename} supprimé avec succès.` });
                setFiles((prev) => prev.filter((f) => f.filename !== filename));
            } else {
                setActionMsg({ type: "error", text: "Impossible de supprimer le fichier de log." });
            }
        } catch {
            setActionMsg({ type: "error", text: "Erreur réseau lors de la suppression." });
        }
    };

    const handleClearAll = async () => {
        const confirmText = "Voulez-vous vraiment vider tous les journaux système ?";
        if (!window.confirm(confirmText)) return;

        setActionMsg(null);
        try {
            const res = await fetch("/api/logs/system", { method: "DELETE" });
            if (res.ok) {
                setActionMsg({ type: "success", text: "Journaux système réinitialisés avec succès." });
                await refreshFiles();
            } else {
                setActionMsg({ type: "error", text: "Erreur lors de la réinitialisation." });
            }
        } catch {
            setActionMsg({ type: "error", text: "Erreur réseau." });
        }
    };

    const filteredFiles = useMemo(() => {
        if (!searchQuery.trim()) return files;
        const q = searchQuery.toLowerCase();
        return files.filter((f) => f.filename.toLowerCase().includes(q));
    }, [files, searchQuery]);

    const totalSizeBytes = useMemo(() => {
        return files.reduce((sum, f) => sum + f.sizeBytes, 0);
    }, [files]);

    const formattedTotalSize = useMemo(() => {
        if (totalSizeBytes < 1024) return `${totalSizeBytes} B`;
        if (totalSizeBytes < 1024 * 1024) return `${(totalSizeBytes / 1024).toFixed(1)} Ko`;
        return `${(totalSizeBytes / (1024 * 1024)).toFixed(2)} Mo`;
    }, [totalSizeBytes]);

    const activeLogFilename = useMemo(() => {
        const current = files.find((f) => f.isCurrent);
        return current ? current.filename : "jellytrack.log";
    }, [files]);

    return (
        <div className="w-full space-y-6">
            {/* Top Stat Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="app-surface border border-border/80 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fichiers de logs</p>
                            <h3 className="text-2xl font-black mt-1 tracking-tight text-foreground">{files.length}</h3>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Fichiers disponibles</p>
                        </div>
                        <div className="p-3 rounded-xl bg-primary/10 text-primary border border-primary/20">
                            <FileText className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="app-surface border border-border/80 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Espace disque utilisé</p>
                            <h3 className="text-2xl font-black mt-1 tracking-tight text-foreground">{formattedTotalSize}</h3>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Taille totale des journaux</p>
                        </div>
                        <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                            <HardDrive className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="app-surface border border-border/80 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rétention configurée</p>
                            <h3 className="text-2xl font-black mt-1 tracking-tight text-foreground">
                                {retentionDays > 0 ? `${retentionDays} jours` : "Illimitée"}
                            </h3>
                            <Link href="/settings/scheduler" className="text-[11px] text-primary hover:underline mt-0.5 inline-flex items-center gap-1 font-medium">
                                <Settings className="w-3 h-3" /> Modifier dans les paramètres
                            </Link>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            <Clock className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/70 app-surface-soft shadow-sm">
                <div className="relative flex-1 w-full sm:w-80 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Rechercher un fichier de log..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-xs"
                    />
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap w-full sm:w-auto justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={refreshFiles}
                        disabled={isRefreshing}
                        className="h-9 text-xs"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
                        Actualiser
                    </Button>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleClearAll}
                        className="h-9 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/30"
                    >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Vider les logs
                    </Button>

                    <Button
                        type="button"
                        onClick={() => handleDownload(activeLogFilename)}
                        disabled={downloadingFile === activeLogFilename}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 shadow-sm transition-all h-9"
                    >
                        {downloadingFile === activeLogFilename ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Download className="w-3.5 h-3.5" />
                        )}
                        <span>Télécharger le journal actif</span>
                    </Button>
                </div>
            </div>

            {actionMsg && (
                <div className={`p-3 rounded-lg text-xs font-medium border ${actionMsg.type === "success" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"}`}>
                    {actionMsg.text}
                </div>
            )}

            {/* Files Table */}
            <div className="rounded-xl border border-border overflow-hidden app-surface shadow-sm">
                <Table>
                    <TableHeader className="app-surface-soft backdrop-blur-md">
                        <TableRow className="border-b border-border">
                            <TableHead className="w-[300px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fichier de log</TableHead>
                            <TableHead className="w-[220px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dernière modification</TableHead>
                            <TableHead className="w-[120px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Taille</TableHead>
                            <TableHead className="w-[140px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lignes</TableHead>
                            <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredFiles.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <Archive className="w-8 h-8 opacity-20" />
                                        <span>Aucun fichier de log trouvé.</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredFiles.map((file) => (
                                <TableRow key={file.filename} className="group hover:bg-muted/60 transition-colors border-b border-border/70">
                                    <TableCell className="py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-foreground font-mono">{file.filename}</span>
                                                    {file.filename === "jellytrack.log" || file.fileRole === "master" || file.isCurrent ? (
                                                        <Badge variant="outline" className="text-[9px] font-extrabold px-1.5 py-0 uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                                                            Principal (Actif)
                                                        </Badge>
                                                    ) : file.fileRole === "daily" ? (
                                                        <Badge variant="outline" className="text-[9px] font-extrabold px-1.5 py-0 uppercase tracking-wider bg-sky-500/10 text-sky-500 border-sky-500/30">
                                                            Journal du jour
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">Format texte brut (.log)</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                                        {format(new Date(file.updatedAt), "PPp", { locale: dateLocale })}
                                    </TableCell>
                                    <TableCell className="py-4 text-xs font-bold text-foreground font-mono">
                                        {file.formattedSize}
                                    </TableCell>
                                    <TableCell className="py-4 text-xs font-semibold text-muted-foreground">
                                        {file.lineCount.toLocaleString()} lignes
                                    </TableCell>
                                    <TableCell className="py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleDownload(file.filename)}
                                                disabled={downloadingFile === file.filename}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 transition-colors h-8"
                                                title={`Télécharger ${file.filename}`}
                                            >
                                                {downloadingFile === file.filename ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Download className="w-3.5 h-3.5" />
                                                )}
                                                <span>Télécharger</span>
                                            </Button>

                                            {!file.isCurrent && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteFile(file.filename)}
                                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                                    title="Supprimer ce fichier"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
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
