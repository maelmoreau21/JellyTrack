import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getLogHealthSnapshot } from "@/lib/logHealth";
import { AlertTriangle, CheckCircle2, Clock3, HeartPulse, RadioTower, RefreshCw, ShieldAlert } from "lucide-react";
import { HealthAnomalyCharts } from "@/components/admin/HealthAnomalyCharts";

function formatDate(dateString: string | null) {
    if (!dateString) return "Jamais";
    return new Date(dateString).toLocaleString('fr-FR');
}

export default async function LogHealthPage() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.isAdmin) {
        const uid = (session?.user as any)?.jellyfinUserId;
        redirect(uid ? `/users/${uid}` : '/login');
    }

    const snapshot = await getLogHealthSnapshot();

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6 max-w-7xl mx-auto w-full">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">SantÃ© des logs</h2>
                    <p className="mt-2 text-sm text-zinc-400">Vue dâ€™ensemble du monitor, des sessions orphelines, des fermetures automatiques et des bibliothÃ¨ques exclues.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                    <Card className="bg-zinc-900/50 border-zinc-800/50"><CardHeader><CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><RadioTower className="h-4 w-4 text-cyan-400" /> Monitor</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{snapshot.status.monitor.status === 'error' ? 'Erreur' : 'OK'}</div><p className="text-xs text-zinc-500 mt-1">Dernier poll: {formatDate(snapshot.status.monitor.lastPollAt)}</p></CardContent></Card>
                    <Card className="bg-zinc-900/50 border-zinc-800/50"><CardHeader><CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-orange-400" /> Lectures orphelines</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{snapshot.counts.openPlaybackOrphans}</div><p className="text-xs text-zinc-500 mt-1">PlaybackHistory ouvertes sans ActiveStream.</p></CardContent></Card>
                    <Card className="bg-zinc-900/50 border-zinc-800/50"><CardHeader><CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-400" /> Streams DB sans Redis</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{snapshot.counts.dbStreamsWithoutRedis}</div><p className="text-xs text-zinc-500 mt-1">ActiveStream prÃ©sents en base mais absents du cache Redis.</p></CardContent></Card>
                    <Card className="bg-zinc-900/50 border-zinc-800/50"><CardHeader><CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><HeartPulse className="h-4 w-4 text-emerald-400" /> Redis orphelin</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{snapshot.counts.redisOrphans}</div><p className="text-xs text-zinc-500 mt-1">ClÃ©s Redis stream sans ActiveStream correspondant.</p></CardContent></Card>
                </div>

                <Card className="bg-zinc-900/50 border-zinc-800/50">
                    <CardHeader>
                        <CardTitle>Graphiques dâ€™anomalies</CardTitle>
                        <CardDescription>Vue sur les 14 derniers jours des erreurs monitor/sync/backup et des nettoyages automatiques dÃ©tectÃ©s.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <HealthAnomalyCharts timeline={snapshot.anomalyTimeline} breakdown={snapshot.anomalyBreakdown} />
                    </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>Lectures orphelines en cours</CardTitle>
                            <CardDescription>Ces entrÃ©es sont affichÃ©es comme ouvertes mais nâ€™ont plus de stream actif associÃ©.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {snapshot.orphanPlaybacks.length === 0 && <div className="text-sm text-zinc-500">Aucune lecture orpheline dÃ©tectÃ©e.</div>}
                            {snapshot.orphanPlaybacks.map((entry: any) => (
                                <div key={entry.id} className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                                    <div className="font-medium text-zinc-100">{entry.mediaTitle}</div>
                                    <div className="mt-1 text-xs text-zinc-400">{entry.username} Â· {entry.library}</div>
                                    <div className="mt-2 text-xs text-zinc-500">Ouverte le {formatDate(entry.startedAt)} Â· {Math.floor(entry.durationWatched / 60)} min</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>Fermetures automatiques rÃ©centes</CardTitle>
                            <CardDescription>RÃ©sumÃ© des nettoyages rÃ©alisÃ©s par le monitor, la synchro et les sauvegardes.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {snapshot.recentEvents.length === 0 && <div className="text-sm text-zinc-500">Aucun Ã©vÃ©nement rÃ©cent.</div>}
                            {snapshot.recentEvents.map((event: any) => (
                                <div key={event.id} className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                                        {event.kind.includes('error') ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                                        {event.message}
                                    </div>
                                    <div className="mt-2 text-xs text-zinc-500">{formatDate(event.createdAt)}</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>BibliothÃ¨ques exclues</CardTitle>
                            <CardDescription>BibliothÃ¨ques complÃ¨tement ignorÃ©es pour les logs et statistiques.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                            {snapshot.excludedLibraries.length === 0 && <span className="text-sm text-zinc-500">Aucune bibliothÃ¨que exclue.</span>}
                            {snapshot.excludedLibraries.map((library: string) => (
                                <span key={library} className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-200">{library}</span>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="bg-zinc-900/50 border-zinc-800/50">
                        <CardHeader>
                            <CardTitle>RÃ¨gles de complÃ©tion</CardTitle>
                            <CardDescription>ParamÃ¨tres actifs par bibliothÃ¨que pour les mÃ©dias abandonnÃ©s et taux de complÃ©tion.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {Object.entries(snapshot.libraryRules).map(([library, rule]: any) => (
                                <div key={library} className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                                    <div className="font-medium text-zinc-100">{library}</div>
                                    <div className="mt-1 text-xs text-zinc-400">
                                        {rule.completionEnabled
                                            ? `AbandonnÃ©: ${rule.abandonedThreshold}% Â· Partiel: ${rule.partialThreshold}% Â· TerminÃ©: ${rule.completedThreshold}%`
                                            : 'ComplÃ©tion dÃ©sactivÃ©e'
                                        }
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <Card className="bg-zinc-900/50 border-zinc-800/50">
                    <CardHeader>
                        <CardTitle>Ã‰tat des traitements</CardTitle>
                        <CardDescription>Derniers passages du monitor, de la synchronisation et des sauvegardes.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-sm text-zinc-300"><RadioTower className="h-4 w-4 text-cyan-400" /> Monitor</div>
                            <div className="mt-2 text-sm text-zinc-500">Dernier succÃ¨s: {formatDate(snapshot.status.monitor.lastSuccessAt)}</div>
                            <div className="mt-1 text-sm text-zinc-500">DerniÃ¨re erreur: {snapshot.status.monitor.lastError || 'Aucune'}</div>
                        </div>
                        <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-sm text-zinc-300"><RefreshCw className="h-4 w-4 text-amber-400" /> Sync</div>
                            <div className="mt-2 text-sm text-zinc-500">Dernier succÃ¨s: {formatDate(snapshot.status.sync.lastSuccessAt)}</div>
                            <div className="mt-1 text-sm text-zinc-500">Mode: {snapshot.status.sync.mode || 'â€”'}</div>
                        </div>
                        <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
                            <div className="flex items-center gap-2 text-sm text-zinc-300"><Clock3 className="h-4 w-4 text-emerald-400" /> Backup</div>
                            <div className="mt-2 text-sm text-zinc-500">Dernier succÃ¨s: {formatDate(snapshot.status.backup.lastSuccessAt)}</div>
                            <div className="mt-1 text-sm text-zinc-500">Fichier: {snapshot.status.backup.lastFileName || 'â€”'}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
