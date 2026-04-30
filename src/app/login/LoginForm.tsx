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
                    <Label htmlFor="username" className="text-zinc-600 dark:text-zinc-300 font-medium">{t('username')}</Label>
                    <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                        <Input
                            id="username"
                            required
                            placeholder="Jellyfin User"
                            className="pl-10 bg-zinc-100/80 dark:bg-black/50 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus-visible:ring-indigo-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 h-10"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password" className="text-zinc-600 dark:text-zinc-300 font-medium">{t('password')}</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                        <Input
                            id="password"
                            type="password"
                            required
                            placeholder=".........."
                            className="pl-10 bg-zinc-100/80 dark:bg-black/50 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white focus-visible:ring-indigo-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 h-10"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex items-start gap-3 rounded-md border border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-100/60 dark:bg-black/30 p-3">
                    <input
                        id="rememberMe"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 accent-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                    <div className="space-y-1">
                        <Label htmlFor="rememberMe" className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-200">
                            {t('rememberMe')}
                        </Label>
                        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t('rememberMeHint')}</p>
                    </div>
                </div>
            </CardContent>

            <CardFooter className="pt-2 pb-6">
                <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full flex items-center justify-center gap-2 h-10 rounded-md font-medium text-sm transition-all shadow-lg ${isLoading ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-indigo-500/25'}`}
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
