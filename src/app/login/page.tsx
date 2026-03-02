import { Suspense } from "react";
import { Lock } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import LoginForm from "./LoginForm";
import { getTranslations } from 'next-intl/server';

export const dynamic = "force-dynamic";

export default async function LoginPage() {
    const t = await getTranslations('login');
    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-4 selection:bg-indigo-500/30">
            <div className="absolute inset-0 z-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900 via-black to-black" />

            <Card className="w-full max-w-sm z-10 bg-zinc-900/80 border-zinc-800/50 backdrop-blur-xl shadow-2xl">
                <CardHeader className="space-y-3 pb-6 border-b border-zinc-800/50">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="p-3 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                            <Lock className="w-6 h-6 text-indigo-400" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-bold tracking-tight text-white">{t('title')}</CardTitle>
                            <CardDescription className="text-zinc-400 mt-1 text-sm font-medium">{t('subtitle')}</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <Suspense fallback={<div className="p-6 text-center text-zinc-500">{t('loadingForm')}</div>}>
                    <LoginForm />
                </Suspense>
            </Card>
        </div>
    );
}
