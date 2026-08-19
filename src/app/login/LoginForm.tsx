"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, User, AlertCircle, Loader2, ArrowRight, ShieldCheck, KeyRound, ArrowLeft } from "lucide-react";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

interface LoginFormProps {
    oidcEnabled?: boolean;
    localAdminEnabled?: boolean;
}

export default function LoginForm({ oidcEnabled = false, localAdminEnabled = false }: LoginFormProps) {
    const t = useTranslations('login');
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get("callbackUrl") || "/";
    const queryError = searchParams.get("error");

    const [isLoading, setIsLoading] = useState(false);
    const [isLocalLogin, setIsLocalLogin] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!queryError) return;
        if (queryError === "AccessDeniedGroup" || queryError === "AccessDenied") {
            setError(t('unauthorizedGroup'));
        } else if (queryError === "OAuthSignin" || queryError === "OAuthCallback" || queryError === "OAuthCreateAccount") {
            setError(t('ssoError'));
        } else if (queryError === "CredentialsSignin") {
            setError(t('invalidCredentials'));
        } else {
            setError(t('unexpectedError'));
        }
    }, [queryError, t]);

    const handleSsoLogin = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await signIn("oidc", { callbackUrl });
        } catch {
            setError(t('ssoError'));
            setIsLoading(false);
        }
    };

    const handleLocalAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const res = await signIn("local-credentials", {
                redirect: false,
                username: username.trim() || "admin",
                password,
                callbackUrl,
            });

            if (res?.error) {
                setError(t('invalidLocalCredentials'));
                setIsLoading(false);
            } else {
                router.push(callbackUrl);
                router.refresh();
            }
        } catch {
            setError(t('unexpectedError'));
            setIsLoading(false);
        }
    };

    const handleJellyfinLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const res = await signIn("credentials", {
                redirect: false,
                username,
                password,
                rememberMe: rememberMe ? "true" : "false",
                callbackUrl,
            });

            if (res?.error) {
                setError(res.error);
                setIsLoading(false);
            } else {
                router.push(callbackUrl);
                router.refresh();
            }
        } catch {
            setError(t('unexpectedError'));
            setIsLoading(false);
        }
    };

    // 1. SSO Mode (OIDC Enabled)
    if (oidcEnabled && !isLocalLogin) {
        return (
            <div className="px-6 pb-6 pt-2 space-y-3">
                {error && (
                    <div className="p-3 rounded-xl flex items-start gap-2.5 text-sm bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm animate-in fade-in duration-200">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <p className="leading-5 font-medium text-xs">{error}</p>
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleSsoLogin}
                    disabled={isLoading}
                    className={`w-full flex items-center justify-center gap-2.5 h-11 rounded-xl font-semibold text-sm transition-all shadow-lg ${
                        isLoading
                            ? "bg-indigo-600/50 text-indigo-200 cursor-not-allowed"
                            : "bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-600 text-white hover:from-indigo-500 hover:to-cyan-500 hover:shadow-indigo-500/25 hover:scale-[1.01] active:scale-[0.99] duration-150"
                    }`}
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

                {localAdminEnabled && (
                    <div className="text-center pt-1">
                        <button
                            type="button"
                            onClick={() => {
                                setError(null);
                                setIsLocalLogin(true);
                            }}
                            className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors inline-flex items-center justify-center gap-1.5"
                        >
                            <KeyRound className="w-3.5 h-3.5 opacity-60" />
                            {t('localLogin')}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // 2. Emergency Local Admin Mode (or when toggled)
    if (isLocalLogin) {
        return (
            <form onSubmit={handleLocalAdminLogin}>
                <CardContent className="space-y-4 pt-6">
                    {error && (
                        <div className="p-3 rounded-md flex items-start gap-3 text-sm bg-red-500/10 text-red-400 border border-red-500/20">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <p className="leading-5">{error}</p>
                        </div>
                    )}

                    <div className="flex items-center justify-between pb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider text-amber-500/90 dark:text-amber-400 flex items-center gap-1.5">
                            <KeyRound className="w-3.5 h-3.5" />
                            {t('localAdminTitle')}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                setError(null);
                                setIsLocalLogin(false);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        >
                            <ArrowLeft className="w-3 h-3" />
                            {t('backToSso')}
                        </button>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="localUsername" className="text-foreground/80 dark:text-slate-300 font-medium">
                            {t('username')}
                        </Label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="localUsername"
                                required
                                placeholder="admin"
                                className="bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-white/10 text-foreground focus-visible:ring-indigo-500 placeholder:text-muted-foreground/60 h-10 focus:bg-white/60 dark:focus:bg-slate-900/60 transition-colors duration-200 pl-10"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="localPassword" className="text-foreground/80 dark:text-slate-300 font-medium">
                            {t('password')}
                        </Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="localPassword"
                                type="password"
                                required
                                placeholder="••••••••"
                                className="bg-white/40 dark:bg-slate-900/40 border border-white/20 dark:border-white/10 text-foreground focus-visible:ring-indigo-500 placeholder:text-muted-foreground/60 h-10 focus:bg-white/60 dark:focus:bg-slate-900/60 transition-colors duration-200 pl-10"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-2 pt-2 pb-6">
                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full flex items-center justify-center gap-2 h-10 rounded-md font-semibold text-sm transition-all shadow-lg ${
                            isLoading
                                ? "bg-amber-600/50 text-amber-200 cursor-not-allowed"
                                : "bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 hover:shadow-amber-500/20 hover:scale-[1.01] active:scale-[0.99] duration-150"
                        }`}
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

    // 3. Fallback Jellyfin Direct Authentication (OIDC Disabled)
    return (
        <form onSubmit={handleJellyfinLogin}>
            <CardContent className="space-y-5 pt-6">
                {error && (
                    <div className="p-3 rounded-md flex items-start gap-3 text-sm bg-red-500/10 text-red-400 border border-red-500/20">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="leading-5">{error}</p>
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="username" className="text-foreground/80 dark:text-slate-300 font-medium">
                        {t('username')}
                    </Label>
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
                    <Label htmlFor="password" className="text-foreground/80 dark:text-slate-300 font-medium">
                        {t('password')}
                    </Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="password"
                            type="password"
                            required
                            placeholder="••••••••"
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

            <CardFooter className="flex flex-col gap-3 pt-2 pb-6">
                <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full flex items-center justify-center gap-2 h-10 rounded-md font-semibold text-sm transition-all shadow-lg ${
                        isLoading
                            ? "bg-indigo-600/50 text-indigo-200 cursor-not-allowed"
                            : "bg-gradient-to-r from-indigo-600 to-cyan-600 text-white hover:from-indigo-500 hover:to-cyan-500 hover:shadow-indigo-500/20 hover:scale-[1.01] active:scale-[0.99] duration-150"
                    }`}
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

                {localAdminEnabled && (
                    <button
                        type="button"
                        onClick={() => {
                            setError(null);
                            setIsLocalLogin(true);
                        }}
                        className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors pt-1 flex items-center justify-center gap-1.5"
                    >
                        <KeyRound className="w-3.5 h-3.5 opacity-60" />
                        {t('localLogin')}
                    </button>
                )}
            </CardFooter>
        </form>
    );
}

