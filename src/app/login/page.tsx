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
                            <div className="p-2 bg-white/10 rounded-xl border border-white/10 shadow-inner overflow-hidden">
                                <img src="/logo.svg" alt="Logo" className="w-10 h-10" />
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
