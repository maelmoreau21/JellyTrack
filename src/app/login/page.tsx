import { Suspense } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import LoginForm from "./LoginForm";
import { LoginLanguageSwitcher } from "./LoginLanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getTranslations } from 'next-intl/server';
import { getOidcConfigAsync, isLocalAdminConfigured } from "@/lib/oidcConfig";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
    const t = await getTranslations('login');
    const oidcConfig = await getOidcConfigAsync();
    const oidcEnabled = oidcConfig.enabled;
    const localAdminEnabled = isLocalAdminConfigured();

    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 selection:bg-indigo-500/30 overflow-hidden relative">
            {/* Background Aurora glowing blobs */}
            <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-indigo-500/10 dark:bg-indigo-500/15 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-cyan-500/10 dark:bg-cyan-500/15 blur-[120px] pointer-events-none" />

            <div className="absolute inset-0 z-0 opacity-20 dark:opacity-30 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-300 dark:from-indigo-900 via-transparent to-transparent pointer-events-none" />

            <div className="z-10 flex flex-col items-center gap-4 w-full max-w-sm">
                <Card className="w-full border border-white/20 dark:border-white/10 bg-white/30 dark:bg-slate-900/40 backdrop-blur-xl shadow-2xl">
                    <CardHeader className={`space-y-3 ${oidcEnabled ? 'pb-2 border-none' : 'pb-6 border-b border-white/10 dark:border-white/5'}`}>
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className="bg-gradient-to-tr from-indigo-500/10 to-cyan-500/10 dark:from-indigo-500/20 dark:to-cyan-500/20 p-3 rounded-2xl border border-white/25 dark:border-white/15 shadow-lg transition-transform hover:scale-105 duration-300">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="18 23 64 69" className="w-14 h-14">
                                    <defs>
                                        <linearGradient id="jellyGradLogin" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#AA5CC3" />
                                            <stop offset="100%" stopColor="#00A4DC" />
                                        </linearGradient>
                                        <mask id="holeMaskLogin">
                                            <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
                                            <circle cx="50" cy="39" r="10" fill="black" />
                                        </mask>
                                    </defs>
                                    <path d="M 20 55 A 30 30 0 0 1 80 55 Z" fill="url(#jellyGradLogin)" mask="url(#holeMaskLogin)" />
                                    <polygon points="46,32 46,46 58,39" fill="#00A4DC" />
                                    <rect x="30" y="60" width="8" height="20" rx="4" fill="url(#jellyGradLogin)" />
                                    <rect x="46" y="60" width="8" height="30" rx="4" fill="url(#jellyGradLogin)" />
                                    <rect x="62" y="60" width="8" height="15" rx="4" fill="url(#jellyGradLogin)" />
                                </svg>
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</CardTitle>
                                {!oidcEnabled && (
                                    <CardDescription className="text-muted-foreground mt-1 text-sm font-medium">
                                        {t('subtitle')}
                                    </CardDescription>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <Suspense fallback={<div className="p-6 text-center text-muted-foreground">{t('loadingForm')}</div>}>
                        <LoginForm
                            oidcEnabled={oidcEnabled}
                            localAdminEnabled={localAdminEnabled}
                            autoRedirect={oidcConfig.autoRedirect ?? true}
                        />
                    </Suspense>
                </Card>

                <LoginLanguageSwitcher />
                <div className="w-full">
                    <ThemeToggle />
                </div>
            </div>
        </div>
    );
}
