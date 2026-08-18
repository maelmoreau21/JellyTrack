"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type JellyfinServerRow = {
  id: string;
  jellyfinServerId: string;
  name: string;
  url: string;
  isPrimary: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  allowAuthFallback: boolean;
  hasPluginKey: boolean;
  pluginKeyMasked: string;
  pluginApiKey?: string | null;
  connectionState: "online" | "offline" | "no_api_key";
  connectionMessage: string;
};

type PluginConnectionState = "connected" | "ready" | "missing";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

export function JellyfinServersSettings() {
  const t = useTranslations("settings");
  const [servers, setServers] = useState<JellyfinServerRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [pluginLoadingServerId, setPluginLoadingServerId] = useState<string | null>(null);
  const [pluginKeyReady, setPluginKeyReady] = useState<boolean>(false);
  const [pluginLastSeen, setPluginLastSeen] = useState<string | null>(null);
  const [pluginEndpointPath, setPluginEndpointPath] = useState<string>('/api/plugin/events');
  const [pluginConnected, setPluginConnected] = useState<boolean>(false);

  const [copiedPluginEndpointServerId, setCopiedPluginEndpointServerId] = useState<string | null>(null);
  const [copiedPluginKeyServerId, setCopiedPluginKeyServerId] = useState<string | null>(null);
  const [pluginKeyVisible, setPluginKeyVisible] = useState<Record<string, boolean>>({});
  const [pluginKeyByServerId, setPluginKeyByServerId] = useState<Record<string, string>>({});
  const [globalPluginKeyLoading, setGlobalPluginKeyLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isMultiMode, setIsMultiMode] = useState<boolean>(false);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [allowAuthFallback, setAllowAuthFallback] = useState<boolean>(true);

  const fetchInfo = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    try {
      const res = await fetch('/api/settings/jellyfin-servers', { cache: 'no-store' });
      if (!res.ok) {
        setMessage({ type: 'error', text: `${t('loadError')}: ${res.status}` });
        setLoading(false);
        return;
      }
      const json = await res.json();
      const serverList: JellyfinServerRow[] = json.servers || [];
      setServers(serverList);
      setPluginKeyReady(Boolean(json.pluginKeyReady));
      setPluginLastSeen(json.pluginLastSeen || null);
      setPluginEndpointPath(json.pluginEndpointPath || '/api/plugin/events');
      setPluginConnected(Boolean(json.pluginConnected));
      setIsMultiMode(Boolean(json.isMultiMode));

      // Populate pluginKeyByServerId with keys from server list
      const keysMap: Record<string, string> = {};
      for (const s of serverList) {
        if (s.pluginApiKey) {
          keysMap[s.id] = s.pluginApiKey;
        }
      }
      setPluginKeyByServerId((prev) => ({ ...prev, ...keysMap }));
    } catch {
      setMessage({ type: 'error', text: t('networkErrorFetchServers') });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const effectivePluginEndpoint = typeof window !== 'undefined' ? `${window.location.origin}${pluginEndpointPath}` : pluginEndpointPath;
  const getPluginStateForServer = (server: JellyfinServerRow): PluginConnectionState => {
    if (server.hasPluginKey && pluginConnected) return 'connected';
    if (server.hasPluginKey) return 'ready';
    return 'missing';
  };

  const handleGenerateGlobalPluginKey = async () => {
    setGlobalPluginKeyLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/plugin/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: (err && err.error) || t('pluginKeyGenerateError') });
        return;
      }
      setMessage({ type: 'success', text: t('pluginKeyGeneratedSuccess') });
      await fetchInfo();
    } catch {
      setMessage({ type: 'error', text: t('networkErrorGenerateKey') });
    } finally {
      setGlobalPluginKeyLoading(false);
    }
  };

  const fetchServerPluginKey = async (id: string): Promise<string | null> => {
    const target = servers.find((s) => s.id === id);
    const jellyfinServerId = target?.jellyfinServerId;
    setPluginLoadingServerId(id || null);
    try {
      const res = await fetch('/api/settings/jellyfin-servers/plugin-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, jellyfinServerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: (err && err.error) || t('pluginKeyFetchError') });
        return null;
      }
      const json = await res.json();
      return json.pluginApiKey as string | null;
    } catch {
      setMessage({ type: 'error', text: t('networkErrorDeriveKey') });
      return null;
    } finally {
      setPluginLoadingServerId(null);
    }
  };

  const handleCopyPluginKey = async (id: string) => {
    try {
      let key = pluginKeyByServerId[id];
      if (!key) {
        const fetched = await fetchServerPluginKey(id);
        if (!fetched) return;
        key = fetched;
        setPluginKeyByServerId((prev) => ({ ...prev, [id]: key || '' }));
      }
      await copyText(key || '');
      setPluginKeyVisible((prev) => ({ ...prev, [id]: true }));
      setCopiedPluginKeyServerId(id);
      setTimeout(() => setCopiedPluginKeyServerId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      setMessage({ type: 'error', text: t('copyKeyError') });
    }
  };

  const handleCopyPluginEndpoint = async (id: string) => {
    await copyText(effectivePluginEndpoint);
    setCopiedPluginEndpointServerId(id);
    setTimeout(() => setCopiedPluginEndpointServerId((prev) => (prev === id ? null : prev)), 1800);
  };

  const handleDeriveServerPluginKey = async (id: string) => {
    try {
      const key = await fetchServerPluginKey(id);
      if (!key) return;
      setPluginKeyByServerId((prev) => ({ ...prev, [id]: key || '' }));
      setPluginKeyVisible((prev) => ({ ...prev, [id]: true }));
      setMessage({ type: 'success', text: t('serverPluginKeyDerived') });
    } catch {
      setMessage({ type: 'error', text: t('serverPluginKeyDeriveError') });
    }
  };

  const handleTogglePluginKeyVisibility = (id: string) => {
    setPluginKeyVisible((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddServer = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/jellyfin-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, apiKey, allowAuthFallback }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: (err && err.error) || t('addServerError') });
        setSaving(false);
        return;
      }
      setName('');
      setUrl('');
      setApiKey('');
      setAllowAuthFallback(true);
      setShowAddForm(false);
      setMessage({ type: 'success', text: t('serverAddedSuccess') });
      await fetchInfo();
    } catch {
      setMessage({ type: 'error', text: t('networkErrorAddServer') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="app-surface border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Plug className="w-5 h-5 text-primary" />
          {t('jellyfinServersTitle')}
        </CardTitle>
        <CardDescription>{t('jellyfinServersDesc')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {message && (
          <div className={`p-3 rounded-md text-sm border flex items-center justify-between gap-2 ${
            message.type === 'success'
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/35 bg-red-500/10 text-red-300'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
              <span>{message.text}</span>
            </div>
            <button type="button" onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        <div
          className={`p-3 rounded-md flex flex-col gap-3 text-sm border sm:flex-row sm:items-center sm:justify-between ${
            pluginKeyReady
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/30'
              : 'bg-red-50 text-red-800 border-red-300 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/30'
          }`}
        >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <p className={`font-semibold ${pluginKeyReady ? 'text-emerald-900 dark:text-emerald-100' : 'text-red-900 dark:text-red-200'}`}>
                  {pluginKeyReady ? t('globalPluginKeyActive') : t('globalPluginKeyMissing')}
                </p>
                <p className={pluginKeyReady ? 'text-emerald-800 dark:text-emerald-100/90' : 'text-red-800 dark:text-red-200/90'}>
                  {pluginKeyReady
                    ? t('globalPluginKeyActiveDesc')
                    : t('globalPluginKeyMissingDesc')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGenerateGlobalPluginKey}
              disabled={globalPluginKeyLoading}
              className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border text-xs font-medium disabled:opacity-60 ${
                pluginKeyReady
                  ? 'border-emerald-500/35 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:border-emerald-400/30 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 dark:text-emerald-50'
                  : 'border-red-500/35 bg-red-100 text-red-900 hover:bg-red-200 dark:border-red-400/30 dark:bg-red-500/20 dark:hover:bg-red-500/30 dark:text-red-100'
              }`}
            >
              {globalPluginKeyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {pluginKeyReady ? t('regenerateGlobalPluginKey') : t('generateGlobalPluginKey')}
            </button>
          </div>

        <div className="space-y-3">
          {loading ? (
            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">{t('loadingServers')}</div>
          ) : servers.length === 0 ? (
            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">{t('noServersConfigured')}</div>
          ) : (
            servers.map((server) => (
              <div key={server.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{server.name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${
                        server.isPrimary ? 'bg-primary/15 text-primary border-primary/30' : 'bg-zinc-500/10 text-muted-foreground border-zinc-500/30'
                      }`}>
                        <span className={`h-2 w-2 rounded-full ${server.isPrimary ? 'bg-primary' : 'bg-zinc-400'}`} />
                        {server.isPrimary ? t('primaryServerLabel') : t('secondaryServerLabel')}
                      </span>

                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${
                        server.connectionState === 'online'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : server.connectionState === 'no_api_key'
                          ? 'bg-zinc-500/10 text-muted-foreground border-zinc-500/30'
                          : 'bg-red-500/10 text-red-400 border-red-500/30'
                      }`}>
                        <span className={`h-2 w-2 rounded-full ${
                          server.connectionState === 'online' ? 'bg-emerald-400' : server.connectionState === 'no_api_key' ? 'bg-zinc-400' : 'bg-red-400'
                        }`} />
                        {server.connectionState === 'online' ? t('jellyfinConnected') : server.connectionState === 'no_api_key' ? t('missingApiKey') : t('jellyfinOffline')}
                      </span>

                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${
                        getPluginStateForServer(server) === 'connected'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : getPluginStateForServer(server) === 'ready'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-red-500/10 text-red-300 border-red-500/30'
                      }`}>
                        <span className={`h-2 w-2 rounded-full ${
                          getPluginStateForServer(server) === 'connected' ? 'bg-emerald-400 animate-pulse' : getPluginStateForServer(server) === 'ready' ? 'bg-amber-300' : 'bg-red-300'
                        }`} />
                        {getPluginStateForServer(server) === 'connected' ? t('pluginConnected') : getPluginStateForServer(server) === 'ready' ? t('pluginReady') : t('pluginNotConfigured')}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground max-w-lg">{server.connectionMessage}</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-3">
                    <Label className="text-xs">{t('serverNameLabel')}</Label>
                    <Input value={server.name} readOnly className="text-xs" />
                  </div>
                  <div className="lg:col-span-5">
                    <Label className="text-xs">{t('serverUrlLabel')}</Label>
                    <Input value={server.url} readOnly className="font-mono text-xs" />
                  </div>
                  <div className="lg:col-span-4">
                    <Label className="text-xs">{t('serverApiKeyLabel')}</Label>
                    <Input value={server.hasApiKey ? server.apiKeyMasked : t('notConfigured')} readOnly className="font-mono text-xs" />
                  </div>
                </div>

                {server.isPrimary && <p className="text-[11px] text-muted-foreground">{t('serverLockedDesc')}</p>}

                <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/10">
                  <p className="text-xs font-semibold text-foreground">{t('pluginConnectionFor', { name: server.name })}</p>

                  {pluginLastSeen && <p className="text-[11px] text-muted-foreground">{t('lastHeartbeat', { date: new Date(pluginLastSeen).toLocaleString() })}</p>}

                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
                    <div className="xl:col-span-8">
                      <Label className="text-xs">{t('pluginUrlLabel')}</Label>
                      <Input value={effectivePluginEndpoint} readOnly className="font-mono text-xs" />
                    </div>
                    <div className="xl:col-span-4 flex items-end">
                      <button type="button" onClick={() => handleCopyPluginEndpoint(server.id)} className="w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-border hover:bg-muted text-xs font-medium">
                        <Copy className="w-3.5 h-3.5" />
                        {copiedPluginEndpointServerId === server.id ? t('urlCopied') : t('copyUrl')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
                    <div className="xl:col-span-8 relative">
                      <Label className="text-xs">{t('serverPluginKeyLabel')}</Label>
                      <Input readOnly type={pluginKeyVisible[server.id] ? 'text' : 'password'} value={pluginKeyVisible[server.id] ? pluginKeyByServerId[server.id] || '' : server.pluginKeyMasked || ''} className="font-mono text-xs pr-10" placeholder={pluginKeyReady ? t('clickToShow') : t('generateGlobalFirst')} />
                      <button type="button" onClick={() => handleTogglePluginKeyVisibility(server.id)} disabled={!pluginKeyReady || pluginLoadingServerId === server.id} className="absolute right-2 top-[30px] text-zinc-500 hover:text-foreground disabled:opacity-40">
                        {pluginKeyVisible[server.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="xl:col-span-4 flex items-end">
                      <button type="button" onClick={() => handleCopyPluginKey(server.id)} disabled={!pluginKeyReady || pluginLoadingServerId === server.id} className="w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-border hover:bg-muted text-xs font-medium disabled:opacity-60">
                        {pluginLoadingServerId === server.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedPluginKeyServerId === server.id ? t('keyCopied') : t('copyKey')}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" onClick={() => handleDeriveServerPluginKey(server.id)} disabled={!pluginKeyReady || pluginLoadingServerId === server.id} className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-border hover:bg-muted text-xs font-medium disabled:opacity-60">
                      {pluginLoadingServerId === server.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      {t('deriveServerKey')}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {isMultiMode ? (
          <div className="space-y-3">
              <div className="flex justify-end">
              <button type="button" onClick={() => setShowAddForm((prev) => !prev)} className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-border hover:bg-muted text-sm font-medium">
                <Plus className="w-4 h-4" />
                {showAddForm ? t('hideAddForm') : t('addServer')}
              </button>
            </div>

            {showAddForm && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <p className="text-sm font-medium text-foreground">{t('newSecondaryServer')}</p>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-3">
                    <Label>{t('serverNameLabel')}</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jellyfin Salon" />
                  </div>
                  <div className="lg:col-span-5">
                    <Label>{t('serverUrlLabel')}</Label>
                    <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jellyfin-secondaire.local" />
                  </div>
                  <div className="lg:col-span-4">
                    <Label>{t('serverApiKeyLabel')}</Label>
                    <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key Jellyfin" type="password" />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={allowAuthFallback} onChange={(e) => setAllowAuthFallback(e.target.checked)} />
                  {t('allowAuthFallback')}
                </label>

                <button type="button" onClick={handleAddServer} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-border hover:bg-muted text-sm font-medium disabled:opacity-60">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t('addThisServer')}
                </button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{t('addServerPermanentDesc')}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
