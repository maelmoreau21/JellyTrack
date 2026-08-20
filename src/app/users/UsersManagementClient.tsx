"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
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
import { escapeCsvCell } from "@/lib/csv";

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

type UserFilterType = "all" | "inactive30" | "inactive90" | "transcoders" | "never";

export function UsersManagementClient({ users, ssoUrl }: UsersManagementClientProps) {
    const t = useTranslations("users");
    const tc = useTranslations("common");

    const [search, setSearch] = useState("");
    const [filterType, setFilterType] = useState<UserFilterType>("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    const filteredUsers = useMemo(() => {
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

            return true;
        });
    }, [users, search, filterType, now, thirtyDaysMs, ninetyDaysMs]);

    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pagedUsers = filteredUsers.slice((safePage - 1) * pageSize, safePage * pageSize);

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
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pagedUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                        Aucun utilisateur ne correspond à ce filtre.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                pagedUsers.map((user, index) => (
                                    <TableRow key={user.id} className="hover:bg-muted/40 transition-colors">
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {(safePage - 1) * pageSize + index + 1}
                                        </TableCell>
                                        <TableCell>
                                            <Link
                                                href={`/users/${user.jellyfinUserId}`}
                                                className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-2"
                                            >
                                                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                                    {user.username.slice(0, 2).toUpperCase()}
                                                </div>
                                                <span>{user.username}</span>
                                            </Link>
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
                                    </TableRow>
                                ))
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
