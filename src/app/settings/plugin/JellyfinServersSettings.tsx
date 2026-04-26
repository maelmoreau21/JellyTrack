"use client";

import { useEffect, useMemo, useState } from "react";
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
  Server,
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
  const [globalPluginApiKey, setGlobalPluginApiKey] = useState<string | null>(null);
  const [globalPluginKeyLoading, setGlobalPluginKeyLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isMultiMode, setIsMultiMode] = useState<boolean>(false);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [allowAuthFallback, setAllowAuthFallback] = useState<boolean>(true);

  useEffect(() => {
    fetchInfo();
  }, []);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/jellyfin-servers', { cache: 'no-store' });
      if (!res.ok) {
        setMessage({ type: 'error', text: `Impossible de charger: ${res.status}` });
        setLoading(false);
        return;
      }
      const json = await res.json();
      setServers(json.servers || []);
      setPluginKeyReady(Boolean(json.pluginKeyReady));
      setPluginLastSeen(json.pluginLastSeen || null);
      setPluginEndpointPath(json.pluginEndpointPath || '/api/plugin/events');
      setPluginConnected(Boolean(json.pluginConnected));
      setIsMultiMode(Boolean(json.isMultiMode));
    } catch (e) {
      setMessage({ type: 'error', text: 'Erreur réseau lors du chargement des serveurs.' });
    } finally {
      setLoading(false);
    }
  };

  const effectivePluginEndpoint = typeof window !== 'undefined' ? `${window.location.origin}${pluginEndpointPath}` : pluginEndpointPath;
  const hasGlobalPluginApiKey = Boolean((globalPluginApiKey || '').trim());

  const getPluginStateForServer = (server: JellyfinServerRow): PluginConnectionState => {
    if (server.hasPluginKey && pluginConnected) return 'connected';
    if (server.hasPluginKey) return 'ready';
    return 'missing';
  };

  const handleGenerateGlobalPluginKey = async () => {
    setGlobalPluginKeyLoading(true);
    try {
      const res = await fetch('/api/plugin/api-key', { method: 'POST' });
      if (!res.ok) throw new Error('Erreur');
      const json = await res.json().catch(() => ({}));
      const nextGlobalKey = typeof json.apiKey === 'string' ? json.apiKey : '';
      if (!nextGlobalKey) throw new Error('missing-key');
      setGlobalPluginApiKey(nextGlobalKey);
      setMessage({ type: 'success', text: 'Clé plugin globale générée. Copiez maintenant les clés serveur (la clé brute n est plus récupérable ensuite).' });
      await fetchInfo();
    } catch (e) {
      setMessage({ type: 'error', text: 'Impossible de générer la clé plugin globale.' });
    } finally {
      setGlobalPluginKeyLoading(false);
    }
  };

  const fetchServerPluginKey = async (id?: string, jellyfinServerId?: string, explicitGlobalApiKey?: string) => {
    if (!id && !jellyfinServerId) return null;

    const rawGlobalApiKey = explicitGlobalApiKey || globalPluginApiKey || '';
    if (!rawGlobalApiKey) {
      setMessage({
        type: 'error',
        text: 'La clé plugin globale brute n est pas disponible dans cette session. Collez votre clé globale ci-dessous pour dériver la clé serveur sans rotation.',
      });
      return null;
    }

    setPluginLoadingServerId(id || null);
    try {
      const res = await fetch('/api/settings/jellyfin-servers/plugin-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, jellyfinServerId, globalApiKey: rawGlobalApiKey }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: (err && err.error) || 'Impossible de récupérer la clé plugin.' });
        return null;
      }
      const json = await res.json();
      return json.pluginApiKey as string | null;
    } catch (e) {
      setMessage({ type: 'error', text: 'Erreur réseau lors de la récupération de la clé plugin.' });
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
      setMessage({ type: 'error', text: "Impossible de copier la clé plugin." });
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
      setMessage({ type: 'success', text: 'Clé plugin serveur dérivée depuis la clé globale actuelle.' });
    } catch {
      setMessage({ type: 'error', text: 'Impossible de dériver la clé plugin serveur.' });
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
        setMessage({ type: 'error', text: (err && err.error) || 'Erreur lors de l ajout du serveur.' });
        setSaving(false);
        return;
      }
      setName('');
      setUrl('');
      setApiKey('');
      setAllowAuthFallback(true);
      setShowAddForm(false);
      setMessage({ type: 'success', text: 'Serveur ajouté.' });
      await fetchInfo();
    } catch (e) {
      setMessage({ type: 'error', text: "Erreur réseau lors de l'ajout du serveur." });
    } finally {
      setSaving(false);
    }
  };

  const primaryServer = servers.find((s) => s.isPrimary);
  const fallbackServerInUse =
    primaryServer?.connectionState === 'offline'
      ? servers.find((s) => !s.isPrimary && s.allowAuthFallback && s.connectionState === 'online') || null
      : null;

  return (
    <Card className="app-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="w-5 h-5" />
          Connexion Jellyfin
        </CardTitle>
        <CardDescription>
          Un seul bloc par serveur: paramètres Jellyfin + connexion plugin. Le serveur principal est verrouillé.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div
            className={`p-3 rounded-md flex items-center gap-2 text-sm border ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : 'bg-red-500/10 text-red-500 border-red-500/20'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        {fallbackServerInUse && (
          <div className="p-3 rounded-md flex items-start gap-2 text-sm border bg-amber-500/10 text-amber-200 border-amber-500/30">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-100">Serveur principal indisponible</p>
              <p className="text-amber-100/90">Connexion de secours disponible sur {fallbackServerInUse.name}.</p>
            </div>
          </div>
        )}

        {!pluginKeyReady && (
          <div className="p-3 rounded-md flex flex-col gap-3 text-sm border bg-red-500/10 text-red-300 border-red-500/30 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <p className="font-semibold text-red-200">Clé plugin globale manquante</p>
                <p className="text-red-200/90">Générez-la pour activer les clés plugin de chaque serveur.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGenerateGlobalPluginKey}
              disabled={globalPluginKeyLoading}
              className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-red-400/30 bg-red-500/20 hover:bg-red-500/30 text-red-100 text-xs font-medium disabled:opacity-60"
            >
              {globalPluginKeyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Generer la cle plugin globale
            </button>
          </div>
        )}

        {pluginKeyReady && (
          <div className="p-3 rounded-md flex flex-col gap-3 text-sm border bg-amber-500/10 text-amber-100 border-amber-500/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-50">Clé globale brute (optionnelle)</p>
                <p className="text-amber-100/90">Collez votre clé plugin globale pour dériver les clés serveur sans rotation automatique.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
              <div className="lg:col-span-9">
                <Input
                  type="password"
                  value={globalPluginApiKey || ''}
                  onChange={(event) => setGlobalPluginApiKey(event.target.value)}
                  placeholder="jt_..."
                  className="font-mono text-xs"
                />
              </div>
              <div className="lg:col-span-3 flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setGlobalPluginApiKey('');
                    setMessage({ type: 'success', text: 'Clé locale effacée de la session.' });
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-amber-300/40 hover:bg-amber-500/20 text-xs font-medium transition-colors"
                >
                  Effacer la locale
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {loading ? (
            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Chargement des serveurs...</div>
          ) : servers.length === 0 ? (
            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Aucun serveur configure.</div>
          ) : (
            servers.map((server) => (
              <div key={server.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{server.name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${
                        server.isPrimary ? 'bg-primary/15 text-primary border-primary/30' : 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30'
                      }`}>
                        <span className={`h-2 w-2 rounded-full ${server.isPrimary ? 'bg-primary' : 'bg-zinc-400'}`} />
                        {server.isPrimary ? 'Serveur principal' : 'Serveur secondaire'}
                      </span>

                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${
                        server.connectionState === 'online'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : server.connectionState === 'no_api_key'
                          ? 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30'
                          : 'bg-red-500/10 text-red-400 border-red-500/30'
                      }`}>
                        <span className={`h-2 w-2 rounded-full ${
                          server.connectionState === 'online' ? 'bg-emerald-400' : server.connectionState === 'no_api_key' ? 'bg-zinc-400' : 'bg-red-400'
                        }`} />
                        {server.connectionState === 'online' ? 'Jellyfin connecte' : server.connectionState === 'no_api_key' ? "Cle API manquante" : 'Jellyfin hors ligne'}
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
                        {getPluginStateForServer(server) === 'connected' ? 'Plugin connecte' : getPluginStateForServer(server) === 'ready' ? 'Plugin pret' : 'Plugin non configure'}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground max-w-lg">{server.connectionMessage}</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-3">
                    <Label className="text-xs">Nom du serveur</Label>
                    <Input value={server.name} readOnly className="text-xs" />
                  </div>
                  <div className="lg:col-span-5">
                    <Label className="text-xs">URL serveur</Label>
                    <Input value={server.url} readOnly className="font-mono text-xs" />
                  </div>
                  <div className="lg:col-span-4">
                    <Label className="text-xs">Cle d&apos;API serveur</Label>
                    <Input value={server.hasApiKey ? server.apiKeyMasked : 'non configuree'} readOnly className="font-mono text-xs" />
                  </div>
                </div>

                {server.isPrimary && <p className="text-[11px] text-muted-foreground">Serveur principal verrouille: ces champs viennent de la configuration Docker/.env.</p>}

                <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/10">
                  <p className="text-xs font-semibold text-foreground">Connexion plugin ({server.name})</p>

                  {pluginLastSeen && <p className="text-[11px] text-muted-foreground">Dernier heartbeat plugin: {new Date(pluginLastSeen).toLocaleString('fr-FR')}</p>}

                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
                    <div className="xl:col-span-8">
                      <Label className="text-xs">URL plugin</Label>
                      <Input value={effectivePluginEndpoint} readOnly className="font-mono text-xs" />
                    </div>
                    <div className="xl:col-span-4 flex items-end">
                      <button type="button" onClick={() => handleCopyPluginEndpoint(server.id)} className="w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-border hover:bg-muted text-xs font-medium">
                        <Copy className="w-3.5 h-3.5" />
                        {copiedPluginEndpointServerId === server.id ? 'URL copiée' : 'Copier URL'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
                    <div className="xl:col-span-8 relative">
                      <Label className="text-xs">Clé plugin serveur</Label>
                      <Input readOnly type={pluginKeyVisible[server.id] ? 'text' : 'password'} value={pluginKeyVisible[server.id] ? pluginKeyByServerId[server.id] || '' : server.pluginKeyMasked || ''} className="font-mono text-xs pr-10" placeholder={pluginKeyReady ? (hasGlobalPluginApiKey ? 'Cliquez sur Afficher' : 'Collez la clé globale ci-dessus') : 'Générez la clé plugin globale'} />
                      <button type="button" onClick={() => handleTogglePluginKeyVisibility(server.id)} disabled={!pluginKeyReady || pluginLoadingServerId === server.id} className="absolute right-2 top-[30px] text-zinc-500 hover:text-zinc-300 disabled:opacity-40">
                        {pluginKeyVisible[server.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="xl:col-span-4 flex items-end">
                      <button type="button" onClick={() => handleCopyPluginKey(server.id)} disabled={!pluginKeyReady || pluginLoadingServerId === server.id || (!hasGlobalPluginApiKey && !pluginKeyByServerId[server.id])} className="w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-border hover:bg-muted text-xs font-medium disabled:opacity-60">
                        {pluginLoadingServerId === server.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedPluginKeyServerId === server.id ? 'Clé copiée' : 'Copier clé'}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" onClick={() => handleDeriveServerPluginKey(server.id)} disabled={!pluginKeyReady || pluginLoadingServerId === server.id || !hasGlobalPluginApiKey} className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-border hover:bg-muted text-xs font-medium disabled:opacity-60">
                      {pluginLoadingServerId === server.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Deriver la cle serveur
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
                {showAddForm ? <>Masquer l&apos;ajout</> : <>Ajouter un serveur</>}
              </button>
            </div>

            {showAddForm && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <p className="text-sm font-medium text-foreground">Nouveau serveur secondaire</p>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-3">
                    <Label>Nom du serveur</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jellyfin Salon" />
                  </div>
                  <div className="lg:col-span-5">
                    <Label>URL serveur</Label>
                    <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jellyfin-secondaire.local" />
                  </div>
                  <div className="lg:col-span-4">
                    <Label>Cle d&apos;API serveur</Label>
                    <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key Jellyfin" type="password" />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={allowAuthFallback} onChange={(e) => setAllowAuthFallback(e.target.checked)} />
                  Autoriser ce serveur en fallback d&apos;authentification
                </label>

                <button type="button" onClick={handleAddServer} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 border border-border hover:bg-muted text-sm font-medium disabled:opacity-60">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Ajouter ce serveur
                </button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Le bouton &quot;Ajouter un serveur&quot; reste disponible en permanence pour en ajouter autant que necessaire.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
