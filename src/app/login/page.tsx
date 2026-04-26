import { Suspense } from "react";
import { Lock } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import LoginForm from "./LoginForm";
import { LoginLanguageSwitcher } from "./LoginLanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getTranslations } from 'next-intl/server';

export const dynamic = "force-dynamic";

export default async function LoginPage() {
    const t = await getTranslations('login');
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white flex items-center justify-center p-4 selection:bg-indigo-500/30">
            <div className="absolute inset-0 z-0 opacity-10 dark:opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-400 dark:from-indigo-900 via-transparent to-transparent" />

            <div className="z-10 flex flex-col items-center gap-4">
                <Card className="w-full max-w-sm bg-white/80 dark:bg-zinc-900/80 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-xl shadow-2xl">
                    <CardHeader className="space-y-3 pb-6 border-b border-zinc-200/60 dark:border-zinc-800/50">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-inner overflow-hidden transition-transform hover:scale-105 duration-300">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-14 h-14">
                                    <defs>
                                        <linearGradient id="jellyGradLogin" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#AA5CC3" />
                                            <stop offset="100%" stopColor="#00A4DC" />
                                        </linearGradient>
                                        <mask id="holeMaskLogin">
                                            <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
                                            <circle cx="50" cy="39" r="10" fill="#000000" />
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
                                <CardTitle className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{t('title')}</CardTitle>
                                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm font-medium">{t('subtitle')}</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <Suspense fallback={<div className="p-6 text-center text-zinc-400 dark:text-zinc-500">{t('loadingForm')}</div>}>
                        <LoginForm />
                    </Suspense>
                </Card>

                <LoginLanguageSwitcher />
                <div className="w-full max-w-sm">
                    <ThemeToggle />
                </div>
            </div>
        </div>
    );
}
