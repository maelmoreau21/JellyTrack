import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PlayCircle, Server, Database, Palette, BarChart3, Shield, Clock, Github, Heart, ExternalLink } from "lucide-react";
import { getTranslations } from 'next-intl/server';

const version = process.env.APP_VERSION || "1.0.0";

const techStackIcons = [Server, Palette, Database, BarChart3, Shield, Clock];
const techStackNames = ["Next.js", "React", "Prisma", "Recharts", "NextAuth.js", "Node-Cron"];
const techStackVersions = ["16", "19", "5", "3", "4", "4"];
const techStackKeys = ["techNextjs", "techReact", "techPrisma", "techRecharts", "techNextAuth", "techCron"] as const;

export default async function AboutPage() {
    const t = await getTranslations('about');
    const featuresList = t.raw('featuresList') as string[];

    return (
        <div className="flex-1 space-y-6 md:space-y-8 p-4 md:p-8 pt-4 md:pt-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-3">
                    <PlayCircle className="w-10 h-10 md:w-12 md:h-12 text-primary" />
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">JellyTulli</h1>
                </div>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    {t('description')}
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                    <span className="text-sm font-medium text-primary">{t('version', { version })}</span>
                </div>
            </div>

            {/* Features */}
            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Heart className="w-5 h-5 text-rose-400" />
                        {t('features')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="grid gap-2 md:grid-cols-2">
                        {featuresList.map((feature: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                                <span className="text-primary mt-0.5 shrink-0">•</span>
                                {feature}
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>

            {/* Tech Stack */}
            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Server className="w-5 h-5 text-sky-400" />
                        {t('technologies')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {techStackNames.map((name, i) => {
                            const Icon = techStackIcons[i];
                            return (
                                <div key={name} className="flex items-start gap-3 p-3 rounded-lg bg-black/20 border border-zinc-800/50">
                                    <Icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                    <div>
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="font-medium text-sm">{name}</span>
                                            <span className="text-[11px] text-zinc-500">v{techStackVersions[i]}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">{t(techStackKeys[i])}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Links & Credits */}
            <Card className="bg-zinc-900/50 border-zinc-800/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Github className="w-5 h-5" />
                        {t('linksCredits')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3">
                        <a
                            href="https://github.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-zinc-300 hover:text-primary transition-colors"
                        >
                            <Github className="w-4 h-4" />
                            {t('githubSource')}
                            <ExternalLink className="w-3 h-3 text-zinc-500" />
                        </a>
                        <a
                            href="https://jellyfin.org"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-zinc-300 hover:text-primary transition-colors"
                        >
                            <PlayCircle className="w-4 h-4" />
                            {t('jellyfinLink')}
                            <ExternalLink className="w-3 h-3 text-zinc-500" />
                        </a>
                    </div>
                    <div className="pt-4 border-t border-zinc-800/50">
                        <p className="text-xs text-zinc-500 text-center">
                            {t('openSourceNote')}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
