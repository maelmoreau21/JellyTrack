"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
    Users,
    Search,
    Download,
    UserPlus,
    Clock,
    Monitor,
    Zap,
    Flame,
    Moon,
    UserX,
    Filter,
    CheckCircle2,
    Copy,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    GitMerge,
    AlertTriangle,
    ArrowRight,
    Loader2,
    Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { escapeCsvCell } from "@/lib/csv";
import { ProfileAvatar } from "./[id]/ProfileAvatar";

export interface UserStatsItem {
    id: string;
    jellyfinUserId: string;
    username: string;
    totalHours: number;
    sessionsCount: number;
    lastActive: string | null;
    favoriteClient: string;
    transcodeCount: number;
    directPlayCount: number;
    transcodeRatio: number; // 0 to 100
}

interface UsersManagementClientProps {
    users: UserStatsItem[];
    ssoUrl?: string | null;
}

type UserFilterType = "all" | "inactive30" | "inactive90" | "transcoders" | "never" | "orphanSso";

export function UsersManagementClient({ users, ssoUrl }: UsersManagementClientProps) {
    const router = useRouter();
    const t = useTranslations("users");
    const tc = useTranslations("common");

    const [search, setSearch] = useState("");
    const [filterType, setFilterType] = useState<UserFilterType>("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [now] = useState(() => Date.now());

    // Merge Dialog State
    const [mergeOpen, setMergeOpen] = useState(false);
    const [sourceUserId, setSourceUserId] = useState<string>("");
    const [targetUserId, setTargetUserId] = useState<string>("");
    const [isMerging, setIsMerging] = useState(false);
    const [mergeError, setMergeError] = useState<string | null>(null);
    const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);

    // Duplicate detection State
    const [duplicates, setDuplicates] = useState<any[]>([]);
    const [loadingDuplicates, setLoadingDuplicates] = useState(false);
    const [isAutoMerging, setIsAutoMerging] = useState(false);
    const [autoMergeMessage, setAutoMergeMessage] = useState<string | null>(null);

    const loadDuplicates = useCallback(async () => {
        setLoadingDuplicates(true);
        try {
            const res = await fetch("/api/admin/users/duplicates");
            if (res.ok) {
                const data = await res.json();
                setDuplicates(data.duplicates || []);
            }
        } catch {
            // ignore non-fatal error
        } finally {
            setLoadingDuplicates(false);
        }
    }, []);

    useEffect(() => {
        loadDuplicates();
    }, [loadDuplicates]);

    const handleAutoMergeAll = async () => {
        setIsAutoMerging(true);
        setAutoMergeMessage(null);
        try {
            const res = await fetch("/api/admin/users/duplicates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setAutoMergeMessage(
                    `Fusion automatique réussie : ${data.mergedCount} compte(s) fusionné(s), ${data.deletedCount} orphelin(s) nettoyé(s).`
                );
                await loadDuplicates();
                router.refresh();
            } else {
                setAutoMergeMessage(data.error || "Erreur lors de la fusion automatique.");
            }
        } catch {
            setAutoMergeMessage("Erreur réseau lors de la fusion automatique.");
        } finally {
            setIsAutoMerging(false);
        }
    };

    const handleOpenMergeDialog = (preselectSourceId?: string) => {
        setSourceUserId(preselectSourceId || "");
        setTargetUserId("");
        setMergeError(null);
        setMergeSuccess(null);
        setMergeOpen(true);
    };

    const handleConfirmMerge = async () => {
        if (!sourceUserId || !targetUserId) {
            setMergeError("Veuillez sélectionner le compte source et le compte cible.");
            return;
        }
        if (sourceUserId === targetUserId) {
            setMergeError("Le compte source et le compte cible doivent être différents.");
            return;
        }

        setIsMerging(true);
        setMergeError(null);
        setMergeSuccess(null);

        try {
            const res = await fetch("/api/admin/users/merge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sourceUserId, targetUserId }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setMergeSuccess(data.result?.message || "Fusion effectuée avec succès !");
                setTimeout(() => {
                    setMergeOpen(false);
                    router.refresh();
                    loadDuplicates();
                }, 1500);
            } else {
                setMergeError(data.error || "Erreur lors de la fusion.");
            }
        } catch {
            setMergeError("Erreur réseau lors de la requête de fusion.");
        } finally {
            setIsMerging(false);
        }
    };

    const filteredUsers = useMemo(() => {
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

        return users.filter((u) => {
            // Search filter
            if (search.trim()) {
                const q = search.toLowerCase().trim();
                const matchName = u.username.toLowerCase().includes(q);
                const matchClient = u.favoriteClient.toLowerCase().includes(q);
                if (!matchName && !matchClient) return false;
            }

            // Quick category filter
            const lastActiveMs = u.lastActive ? new Date(u.lastActive).getTime() : 0;
            const diffMs = now - lastActiveMs;

            if (filterType === "inactive30") {
                return !u.lastActive || diffMs > thirtyDaysMs;
            }
            if (filterType === "inactive90") {
                return !u.lastActive || diffMs > ninetyDaysMs;
            }
            if (filterType === "transcoders") {
                return u.transcodeRatio >= 40 && u.sessionsCount >= 3;
            }
            if (filterType === "never") {
                return u.sessionsCount === 0 || !u.lastActive;
            }
            if (filterType === "orphanSso") {
                return u.jellyfinUserId.startsWith("oidc-");
            }

            return true;
        });
    }, [users, search, filterType, now]);

    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pagedUsers = filteredUsers.slice((safePage - 1) * pageSize, safePage * pageSize);

    const orphanSsoCount = useMemo(() => {
        return users.filter((u) => u.jellyfinUserId.startsWith("oidc-")).length;
    }, [users]);

    const handleExportCsv = () => {
        const headers = [
            "Rank",
            "Username",
            "JellyfinUserId",
            "TotalHours",
            "SessionsCount",
            "TranscodeCount",
            "DirectPlayCount",
            "TranscodeRatioPct",
            "FavoriteClient",
            "LastActive",
        ];

        const rows = filteredUsers.map((u, idx) => [
            idx + 1,
            escapeCsvCell(u.username),
            escapeCsvCell(u.jellyfinUserId),
            u.totalHours,
            u.sessionsCount,
            u.transcodeCount,
            u.directPlayCount,
            `${u.transcodeRatio}%`,
            escapeCsvCell(u.favoriteClient),
            u.lastActive ? escapeCsvCell(new Date(u.lastActive).toISOString()) : "Never",
        ]);

        const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `jellytrack_users_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportJson = () => {
        const jsonContent = JSON.stringify(filteredUsers, null, 2);
        const blob = new Blob([jsonContent], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `jellytrack_users_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatLastActive = (dateString: string | null) => {
        if (!dateString) return <span className="text-muted-foreground italic">Jamais</span>;
        const d = new Date(dateString);
        return d.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const inviteLink = ssoUrl ? `${ssoUrl.replace(/\/$/, '')}/if/flow/default-enrollment-flow/` : `${window?.location?.origin || ''}/settings/sso`;

    const selectedSourceUser = useMemo(() => {
        return users.find((u) => u.id === sourceUserId || u.jellyfinUserId === sourceUserId);
    }, [users, sourceUserId]);

    const selectedTargetUser = useMemo(() => {
        return users.find((u) => u.id === targetUserId || u.jellyfinUserId === targetUserId);
    }, [users, targetUserId]);

    return (
        <div className="space-y-6">
            {/* Action & Filter Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Filtrer par nom ou client..."
                        className="pl-9 bg-card border-border/80"
                    />
                </div>

                {/* Right Action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenMergeDialog()}
                        className="border-indigo-500/40 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 flex items-center gap-1.5"
                    >
                        <GitMerge className="h-4 w-4" />
                        <span>{t("mergeUsers")}</span>
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInviteOpen(true)}
                        className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1.5"
                    >
                        <UserPlus className="h-4 w-4" />
                        <span>Inviter / Inscrire</span>
                    </Button>

                    <Button variant="outline" size="sm" onClick={handleExportCsv} className="flex items-center gap-1.5">
                        <Download className="h-4 w-4" />
                        <span>Export CSV</span>
                    </Button>

                    <Button variant="outline" size="sm" onClick={handleExportJson} className="flex items-center gap-1.5">
                        <Download className="h-4 w-4" />
                        <span>Export JSON</span>
                    </Button>
                </div>
            </div>

            {/* Duplicate Detection Alert Banner */}
            {duplicates.length > 0 && (
                <Card className="border-amber-500/40 bg-amber-500/10 shadow-sm animate-in fade-in duration-300">
                    <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-amber-200">
                                    {t("duplicatesFound", { count: duplicates.length })}
                                </h4>
                                <p className="text-xs text-amber-300/80 mt-0.5">
                                    {t("duplicatesFoundDesc")}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                size="sm"
                                onClick={handleAutoMergeAll}
                                disabled={isAutoMerging}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-medium flex items-center gap-1.5"
                            >
                                {isAutoMerging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                <span>{isAutoMerging ? t("autoMerging") : t("autoMergeAll")}</span>
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenMergeDialog()}
                                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                            >
                                <GitMerge className="h-4 w-4 mr-1.5" />
                                {t("mergeUsers")}
                            </Button>
                        </div>
                    </CardContent>
                    {autoMergeMessage && (
                        <div className="px-4 pb-3 text-xs text-amber-200 font-medium">
                            {autoMergeMessage}
                        </div>
                    )}
                </Card>
            )}

            {/* Quick Filter Badges */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-sm">
                <span className="text-muted-foreground flex items-center gap-1 text-xs font-semibold mr-1">
                    <Filter className="h-3.5 w-3.5" /> Filtres :
                </span>

                <button
                    type="button"
                    onClick={() => {
                        setFilterType("all");
                        setPage(1);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                        filterType === "all"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted border-border"
                    }`}
                >
                    Tous ({users.length})
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setFilterType("inactive30");
                        setPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                        filterType === "inactive30"
                            ? "bg-amber-500/20 text-amber-500 border-amber-500/40"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted border-border"
                    }`}
                >
                    <Moon className="h-3 w-3" />
                    Inactifs &gt; 30 jours
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setFilterType("inactive90");
                        setPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                        filterType === "inactive90"
                            ? "bg-red-500/20 text-red-500 border-red-500/40"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted border-border"
                    }`}
                >
                    <UserX className="h-3 w-3" />
                    Inactifs &gt; 90 jours
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setFilterType("transcoders");
                        setPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                        filterType === "transcoders"
                            ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted border-border"
                    }`}
                >
                    <Flame className="h-3 w-3" />
                    Gros Transcodeurs (&ge;40%)
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setFilterType("never");
                        setPage(1);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                        filterType === "never"
                            ? "bg-zinc-700 text-zinc-100 border-zinc-500"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted border-border"
                    }`}
                >
                    Sans activité (0h)
                </button>

                {orphanSsoCount > 0 && (
                    <button
                        type="button"
                        onClick={() => {
                            setFilterType("orphanSso");
                            setPage(1);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                            filterType === "orphanSso"
                                ? "bg-amber-500/25 text-amber-300 border-amber-500"
                                : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/30"
                        }`}
                    >
                        <AlertTriangle className="h-3 w-3" />
                        SSO Orphelins ({orphanSsoCount})
                    </button>
                )}
            </div>

            {/* Main Table Card */}
            <Card className="border-border">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            {t("title")}
                        </CardTitle>
                        <CardDescription>
                            {filteredUsers.length} utilisateur{filteredUsers.length > 1 ? "s" : ""} trouvé
                            {filteredUsers.length > 1 ? "s" : ""}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16">#</TableHead>
                                <TableHead>{t("colUser")}</TableHead>
                                <TableHead className="text-right">Temps regardé</TableHead>
                                <TableHead className="text-right">Sessions</TableHead>
                                <TableHead className="text-center">Mode de flux</TableHead>
                                <TableHead>Client favori</TableHead>
                                <TableHead className="text-right">{t("colLastActive")}</TableHead>
                                <TableHead className="w-20 text-center">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pagedUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                        Aucun utilisateur ne correspond à ce filtre.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                pagedUsers.map((user, index) => {
                                    const isOrphan = user.jellyfinUserId.startsWith("oidc-");
                                    return (
                                        <TableRow key={user.id} className="hover:bg-muted/40 transition-colors">
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {(safePage - 1) * pageSize + index + 1}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2.5 flex-wrap">
                                                    <Link
                                                        href={`/users/${user.jellyfinUserId}`}
                                                        className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-2.5"
                                                    >
                                                        <ProfileAvatar jellyfinUserId={user.jellyfinUserId} username={user.username} size={28} />
                                                        <span>{user.username}</span>
                                                    </Link>
                                                    {isOrphan && (
                                                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10">
                                                            SSO Orphelin
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                <span className="text-emerald-500 font-bold">{user.totalHours}</span> h
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground">
                                                {user.sessionsCount}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {user.sessionsCount > 0 ? (
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono border border-border">
                                                        <span className="text-blue-400 font-semibold" title="DirectPlay">
                                                            {100 - user.transcodeRatio}% DP
                                                        </span>
                                                        <span className="text-muted-foreground">/</span>
                                                        <span
                                                            className={`font-semibold ${
                                                                user.transcodeRatio >= 50
                                                                    ? "text-purple-400 font-bold"
                                                                    : "text-muted-foreground"
                                                            }`}
                                                            title="Transcode"
                                                        >
                                                            {user.transcodeRatio}% TC
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded">
                                                    <Monitor className="h-3 w-3 text-muted-foreground" />
                                                    <span className="truncate max-w-[140px]">{user.favoriteClient}</span>
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right text-xs text-muted-foreground font-mono">
                                                {formatLastActive(user.lastActive)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleOpenMergeDialog(user.id)}
                                                    className="h-8 px-2 text-xs text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/10"
                                                    title={t("mergeUsers")}
                                                >
                                                    <GitMerge className="h-3.5 w-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                            <div className="text-xs text-muted-foreground">
                                Page <span className="font-semibold">{safePage}</span> sur{" "}
                                <span className="font-semibold">{totalPages}</span> ({filteredUsers.length} total)
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" /> {tc("previous")}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                >
                                    {tc("next")} <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Merge Users Modal */}
            <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-indigo-400">
                            <GitMerge className="h-5 w-5" />
                            {t("mergeUsers")}
                        </DialogTitle>
                        <DialogDescription>
                            {t("mergeUsersDesc")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Source User Selector */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground">
                                {t("sourceUser")}
                            </label>
                            <Select value={sourceUserId} onValueChange={(val) => setSourceUserId(val || "")}>
                                <SelectTrigger className="w-full bg-card">
                                    <SelectValue placeholder={t("selectSource")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {users.map((u) => (
                                        <SelectItem key={u.id} value={u.id}>
                                            <div className="flex items-center gap-2">
                                                <span>{u.username}</span>
                                                <span className="text-muted-foreground text-xs font-mono">
                                                    ({u.totalHours}h, {u.sessionsCount} sessions)
                                                </span>
                                                {u.jellyfinUserId.startsWith("oidc-") && (
                                                    <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400 py-0">
                                                        SSO
                                                    </Badge>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Target User Selector */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground">
                                {t("targetUser")}
                            </label>
                            <Select value={targetUserId} onValueChange={(val) => setTargetUserId(val || "")}>
                                <SelectTrigger className="w-full bg-card">
                                    <SelectValue placeholder={t("selectTarget")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {users
                                        .filter((u) => u.id !== sourceUserId)
                                        .map((u) => (
                                            <SelectItem key={u.id} value={u.id}>
                                                <div className="flex items-center gap-2">
                                                    <span>{u.username}</span>
                                                    <span className="text-muted-foreground text-xs font-mono">
                                                        ({u.totalHours}h, {u.sessionsCount} sessions)
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Visual Summary Card */}
                        {selectedSourceUser && selectedTargetUser && (
                            <div className="p-3.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs space-y-2">
                                <div className="font-semibold text-indigo-300 flex items-center justify-between">
                                    <span>{selectedSourceUser.username}</span>
                                    <ArrowRight className="h-4 w-4 text-indigo-400" />
                                    <span>{selectedTargetUser.username}</span>
                                </div>
                                <p className="text-muted-foreground text-[11px]">
                                    {selectedSourceUser.sessionsCount} session(s) ({selectedSourceUser.totalHours}h) seront rattachées à <strong>{selectedTargetUser.username}</strong>. Le compte <strong>{selectedSourceUser.username}</strong> sera définitivement supprimé.
                                </p>
                            </div>
                        )}

                        {mergeError && (
                            <div className="p-3 rounded-md bg-destructive/15 border border-destructive/30 text-destructive text-xs font-medium">
                                {mergeError}
                            </div>
                        )}

                        {mergeSuccess && (
                            <div className="p-3 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>{mergeSuccess}</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setMergeOpen(false)} disabled={isMerging}>
                            {tc("cancel")}
                        </Button>
                        <Button
                            onClick={handleConfirmMerge}
                            disabled={isMerging || !sourceUserId || !targetUserId || sourceUserId === targetUserId}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center gap-1.5"
                        >
                            {isMerging ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                            <span>{isMerging ? t("merging") : t("mergeConfirm")}</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Invite Modal */}
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5 text-primary" />
                            Inviter un utilisateur
                        </DialogTitle>
                        <DialogDescription>
                            Partagez le lien d&apos;inscription ou invitez un nouvel utilisateur sur votre serveur.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {ssoUrl ? (
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground">
                                    Lien d&apos;inscription SSO (Authentik)
                                </label>
                                <div className="flex items-center gap-2">
                                    <Input value={inviteLink} readOnly className="font-mono text-xs bg-muted/50" />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCopy(inviteLink)}
                                        className="shrink-0"
                                    >
                                        {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Les utilisateurs qui s&apos;inscrivent via ce lien recevront automatiquement les accès selon vos règles de groupe SSO.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 text-xs text-muted-foreground">
                                <p>
                                    Le SSO Authentik n&apos;est pas encore configuré. Vous pouvez créer directement l&apos;utilisateur dans l&apos;interface Jellyfin ou configurer Authentik dans les Paramètres.
                                </p>
                                <Link
                                    href="/settings/sso"
                                    className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline mt-2"
                                >
                                    <span>Configurer le SSO</span>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInviteOpen(false)}>
                            Fermer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
