"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, User, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

export default function LoginForm() {
    const t = useTranslations('login');
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get("callbackUrl") || "/";

    const [isLoading, setIsLoading] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const res = await signIn("credentials", {
                redirect: false,
                username,
                password,
                rememberMe: rememberMe ? "true" : "false",
                callbackUrl
            });

            if (res?.error) {
                setError(res.error);
                setIsLoading(false);
            } else {
                router.push(callbackUrl);
                router.refresh(); // Required in App Router to trigger middleware reload
            }
        } catch {
            setError(t('unexpectedError'));
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleLogin}>
            <CardContent className="space-y-5 pt-6">
                {error && (
                    <div className="p-3 rounded-md flex items-start gap-3 text-sm bg-red-500/10 text-red-400 border border-red-500/20">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="leading-5">{error}</p>
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="username" className="text-foreground/80 dark:text-slate-300 font-medium">{t('username')}</Label>
                    <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="username"
                            required
                            placeholder="Jellyfin User"
                            className="bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-white/10 text-foreground focus-visible:ring-indigo-500 placeholder:text-muted-foreground/60 h-10 focus:bg-white/60 dark:focus:bg-slate-900/60 transition-colors duration-200 pl-10"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password" className="text-foreground/80 dark:text-slate-300 font-medium">{t('password')}</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="password"
                            type="password"
                            required
                            placeholder=".........."
                            className="bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-white/10 text-foreground focus-visible:ring-indigo-500 placeholder:text-muted-foreground/60 h-10 focus:bg-white/60 dark:focus:bg-slate-900/60 transition-colors duration-200 pl-10"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                </div>

                <div className="bg-white/30 dark:bg-slate-900/30 border border-white/15 dark:border-white/5 flex items-start gap-3 rounded-md p-3">
                    <input
                        id="rememberMe"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-border accent-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                    <div className="space-y-1">
                        <Label htmlFor="rememberMe" className="cursor-pointer text-sm font-medium text-foreground">
                            {t('rememberMe')}
                        </Label>
                        <p className="text-xs leading-5 text-muted-foreground">{t('rememberMeHint')}</p>
                    </div>
                </div>
            </CardContent>

            <CardFooter className="pt-2 pb-6">
                <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full flex items-center justify-center gap-2 h-10 rounded-md font-semibold text-sm transition-all shadow-lg ${isLoading ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white hover:from-indigo-500 hover:to-cyan-500 hover:shadow-indigo-500/20 hover:scale-[1.01] active:scale-[0.99] duration-150'}`}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('verifying')}
                        </>
                    ) : (
                        <>
                            {t('signIn')}
                            <ArrowRight className="w-4 h-4 ml-1" />
                        </>
                    )}
                </button>
            </CardFooter>
        </form>
    );
}
