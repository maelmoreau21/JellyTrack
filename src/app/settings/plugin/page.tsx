"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, KeyRound, Copy, Eye, EyeOff, Plug, Unplug, ShieldCheck, HeartPulse } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useTranslations, useLocale } from 'next-intl';

export default function SettingsPluginPage() {
    const t = useTranslations('settings');
    const tc = useTranslations('common');
    const locale = useLocale();
    const isFr = locale.toLowerCase().startsWith('fr');
    const tr = (en: string, fr: string) => (isFr ? fr : en);

    const [pluginMsg, setPluginMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [pluginConnected, setPluginConnected] = useState(false);
    const [pluginHasKey, setPluginHasKey] = useState(false);
    const [pluginServerName, setPluginServerName] = useState<string | null>(null);
    const [pluginVersion, setPluginVersion] = useState<string | null>(null);
    const [pluginLastSeen, setPluginLastSeen] = useState<string | null>(null);
    const [pluginApiKey, setPluginApiKey] = useState<string | null>(null);
    const [pluginLoading, setPluginLoading] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [apiKeyCopied, setApiKeyCopied] = useState(false);
    const [pluginUrlCopied, setPluginUrlCopied] = useState(false);

    const pluginEndpoint = typeof window !== 'undefined' ? `${window.location.origin}/api/plugin/events` : '/api/plugin/events';
    const maskedApiKey = pluginApiKey || "********************************";

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await fetch('/api/plugin/api-key');
                if (res.ok) {
                    const data = await res.json();
                    if (!mounted) return;
                    setPluginHasKey(!!data.hasApiKey);
                    setPluginApiKey(null);
                    setPluginLastSeen(data.pluginLastSeen || null);
                    setPluginVersion(data.pluginVersion || null);
                    setPluginServerName(data.pluginServerName || null);
                    setPluginConnected(!!data.isConnected);
                }
            } catch {}
        })();
        return () => { mounted = false; };
    }, []);

    const handleCopyPluginUrl = async () => {
        try {
            await navigator.clipboard.writeText(pluginEndpoint);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = pluginEndpoint;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        setPluginUrlCopied(true);
        setTimeout(() => setPluginUrlCopied(false), 2000);
    };

    const handleGeneratePluginKey = async (regenerate: boolean) => {
        setPluginLoading(true);
        setPluginMsg(null);
        try {
            const res = await fetch('/api/plugin/api-key', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setPluginApiKey(data.apiKey || null);
                setPluginHasKey(true);
                setShowApiKey(false);
                setPluginMsg({ type: 'success', text: t('pluginKeyGenerated') || 'API key generated' });
            } else {
                setPluginMsg({ type: 'error', text: data.error || tc('error') });
            }
        } catch {
            setPluginMsg({ type: 'error', text: tc('networkError') });
        } finally {
            setPluginLoading(false);
        }
    };

    const handleRevokePluginKey = async () => {
        if (!confirm(t('pluginConfirmRevoke') || 'Revoke plugin API key?')) return;
        setPluginLoading(true);
        setPluginMsg(null);
        try {
            const res = await fetch('/api/plugin/api-key', { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setPluginApiKey(null);
                setPluginHasKey(false);
                setShowApiKey(false);
                setPluginMsg({ type: 'success', text: t('pluginKeyRevoked') || 'API key revoked' });
            } else {
                setPluginMsg({ type: 'error', text: data.error || tc('error') });
            }
        } catch {
            setPluginMsg({ type: 'error', text: tc('networkError') });
        } finally {
            setPluginLoading(false);
        }
    };

    const handleCopyApiKey = async () => {
        if (!pluginApiKey) return;
        try {
            await navigator.clipboard.writeText(pluginApiKey);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = pluginApiKey;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        setApiKeyCopied(true);
        setTimeout(() => setApiKeyCopied(false), 2000);
    };

    return (
        <div className="p-4 max-w-[1100px] mx-auto">
            <Card className="app-surface">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Plug className="w-5 h-5" /> {t('pluginTitle')}</CardTitle>
                    <CardDescription>{t('pluginDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {pluginMsg && (
                        <div className={`p-4 rounded-md flex items-center gap-3 text-sm ${pluginMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                            {pluginMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                            {pluginMsg.text}
                        </div>
                    )}

                    <div className="app-surface-soft rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">{t('pluginStatus')}</span>
                            <span className={`flex items-center gap-2 text-sm font-semibold ${pluginConnected ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                                <span className={`w-2.5 h-2.5 rounded-full ${pluginConnected ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground/40'}`} />
                                {pluginConnected ? t('pluginConnected') : t('pluginDisconnected')}
                            </span>
                        </div>
                        {pluginHasKey && (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
                                {pluginServerName && (
                                    <div><span className="text-muted-foreground">{t('pluginServerName')}:</span> <span className="text-foreground font-medium">{pluginServerName}</span></div>
                                )}
                                {pluginVersion && (
                                    <div><span className="text-muted-foreground">{t('pluginVersion')}:</span> <span className="text-foreground font-medium">v{pluginVersion}</span></div>
                                )}
                                {pluginLastSeen && (
                                    <div><span className="text-muted-foreground">{t('pluginLastSeen')}:</span> <span className="text-foreground font-medium">{new Date(pluginLastSeen).toLocaleString(locale)}</span></div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <div className="flex items-center gap-2">
                            <Link
                                href="/settings/plugin/security"
                                className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-border hover:bg-muted transition-colors"
                            >
                                <ShieldCheck className="w-4 h-4" />
                                {tr('Security Center', 'Centre de securite')}
                            </Link>
                            <Link
                                href="/admin/plugin-health"
                                className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-border hover:bg-muted transition-colors"
                            >
                                <HeartPulse className="w-4 h-4" />
                                {tr('Health Center', 'Centre de sante')}
                            </Link>
                        </div>
                    </div>

                    {!pluginHasKey ? (
                        <div className="text-center py-6">
                            <KeyRound className="w-10 h-10 mx-auto mb-3 text-zinc-500 opacity-50" />
                            <p className="text-sm text-muted-foreground mb-4">{t('pluginNoKey')}</p>
                            <button
                                onClick={() => handleGeneratePluginKey(false)}
                                disabled={pluginLoading}
                                className={`flex items-center gap-2 px-4 py-2 mx-auto rounded-md font-medium text-sm transition-colors ${pluginLoading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                            >
                                <KeyRound className={`w-4 h-4 ${pluginLoading ? 'animate-pulse' : ''}`} />
                                {t('pluginGenerateKey')}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label>{t('pluginApiKeyLabel')}</Label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 relative">
                                        <Input
                                            readOnly
                                            type={showApiKey && !!pluginApiKey ? "text" : "password"}
                                            value={maskedApiKey}
                                            className="font-mono text-sm pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowApiKey(!showApiKey)}
                                            disabled={!pluginApiKey}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleCopyApiKey}
                                        disabled={!pluginApiKey}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Copy className="w-4 h-4" />
                                        {!pluginApiKey
                                            ? tr('Key hidden', 'Cle masquee')
                                            : (apiKeyCopied ? t('pluginApiKeyCopied') : t('pluginCopyKey'))}
                                    </button>
                                </div>
                                {!pluginApiKey && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {tr(
                                            'The saved API key is hidden for security. Regenerate it to display it once.',
                                            'La cle API enregistree est masquee pour la securite. Regenerez-la pour l afficher une seule fois.'
                                        )}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>{t('pluginServerUrl')}</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={pluginEndpoint}
                                        className="font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCopyPluginUrl}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors text-foreground"
                                    >
                                        <Copy className="w-4 h-4" />
                                        {pluginUrlCopied ? t('pluginApiKeyCopied') : t('pluginCopyKey')}
                                    </button>
                                </div>
                                <p className="text-xs text-muted-foreground">{t('pluginServerUrlDesc')}</p>
                            </div>

                            <p className="text-xs text-muted-foreground italic">{t('pluginInstructions')}</p>
                        </>
                    )}
                </CardContent>
                {pluginHasKey && (
                    <CardFooter className="flex gap-3">
                        <button
                            onClick={() => handleGeneratePluginKey(true)}
                            disabled={pluginLoading}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${pluginLoading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'border border-border hover:bg-muted text-foreground'}`}
                        >
                            <RefreshCw className={`w-4 h-4 ${pluginLoading ? 'animate-spin' : ''}`} />
                            {t('pluginRegenerateKey')}
                        </button>
                        <button
                            onClick={handleRevokePluginKey}
                            disabled={pluginLoading}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${pluginLoading ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'border border-destructive/30 text-destructive hover:bg-destructive/10'}`}
                        >
                            <Unplug className="w-4 h-4" />
                            {t('pluginRevokeKey')}
                        </button>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}
