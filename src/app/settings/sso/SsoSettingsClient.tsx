"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface SsoConfigData {
  enabled: boolean;
  url: string;
  clientId: string;
  hasClientSecret: boolean;
  clientSecretMasked: string;
  userGroup: string;
  adminGroup: string;
  tokenAlg?: string;
  origins?: Record<string, "env" | "db" | "default">;
  isEnvControlled: {
    enabled: boolean;
    url: boolean;
    clientId: boolean;
    clientSecret: boolean;
    userGroup: boolean;
    adminGroup: boolean;
    tokenAlg?: boolean;
  };
  dbConfig?: {
    enabled: boolean;
    url: string;
    clientId: string;
    hasClientSecret: boolean;
    clientSecretMasked: string;
    userGroup: string;
    adminGroup: string;
    tokenAlg?: string;
  };
  localAdminConfigured: boolean;
  localAdminUser: string;
  callbackPath: string;
}

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

export function SsoSettingsClient() {
  const t = useTranslations("settings");
  const ts = useTranslations("ssoSettings");

  const [info, setInfo] = useState<SsoConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Form edit state
  const [formEnabled, setFormEnabled] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [formClientId, setFormClientId] = useState("");
  const [formClientSecret, setFormClientSecret] = useState("");
  const [formUserGroup, setFormUserGroup] = useState("");
  const [formAdminGroup, setFormAdminGroup] = useState("");
  const [formTokenAlg, setFormTokenAlg] = useState("RS256");

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const populateFormFromData = useCallback((data: SsoConfigData) => {
    setInfo(data);
    setFormEnabled(data.enabled);
    setFormUrl(data.url || "");
    setFormClientId(data.clientId || "");
    setFormClientSecret(data.hasClientSecret ? data.clientSecretMasked : "");
    setFormUserGroup(data.userGroup || "");
    setFormAdminGroup(data.adminGroup || "");
    setFormTokenAlg(data.tokenAlg || "RS256");
  }, []);

  const fetchSsoInfo = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/sso", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: SsoConfigData = await res.json();
      populateFormFromData(data);
    } catch {
      setMessage({ type: "error", text: ts("loadError") });
    } finally {
      setLoading(false);
    }
  }, [ts, populateFormFromData]);

  useEffect(() => {
    fetchSsoInfo();
  }, [fetchSsoInfo]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const isSecretUnchangedMask = formClientSecret.includes("••••••••");

    try {
      const res = await fetch("/api/settings/sso", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: formEnabled,
          url: formUrl,
          clientId: formClientId,
          clientSecret: isSecretUnchangedMask ? undefined : formClientSecret,
          keepExistingSecret: isSecretUnchangedMask,
          userGroup: formUserGroup,
          adminGroup: formAdminGroup,
          tokenAlg: formTokenAlg,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const updated: SsoConfigData = await res.json();
      populateFormFromData(updated);
      setMessage({ type: "success", text: ts("saveSuccess") || "Configuration SSO enregistrée avec succès." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || ts("saveError") || "Erreur lors de l'enregistrement de la configuration SSO." });
    } finally {
      setSaving(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const callbackUrl = `${origin}${info?.callbackPath || "/api/auth/callback/oidc"}`;

  const handleCopyCallback = async () => {
    await copyText(callbackUrl);
    setCopiedCallback(true);
    setTimeout(() => setCopiedCallback(false), 2500);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{ts("loading")}</p>
      </div>
    );
  }

  const isEnv = info?.isEnvControlled || {
    enabled: false,
    url: false,
    clientId: false,
    clientSecret: false,
    userGroup: false,
    adminGroup: false,
    tokenAlg: false,
  };

  const hasAnyEnvOverride = Object.values(isEnv).some(Boolean);

  return (
    <div className="space-y-6">
      {/* Alert / Feedback message */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-start gap-3 text-sm border shadow-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <p className="leading-5 font-medium">{message.text}</p>
        </div>
      )}

      {/* Main Status Banner */}
      <Card className="border-border/60 bg-gradient-to-br from-card/80 via-card/50 to-primary/5 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 pointer-events-none opacity-10 dark:opacity-5">
          <ShieldCheck className="w-48 h-48 text-primary" />
        </div>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  {ts("title")}
                </CardTitle>
                {info?.enabled ? (
                  <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600/90 text-white gap-1 px-2.5 py-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                    {ts("statusActive")}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 px-2.5 py-0.5">
                    <ShieldAlert className="w-3 h-3" />
                    {ts("statusInactive")}
                  </Badge>
                )}
                {hasAnyEnvOverride && (
                  <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-600 dark:text-amber-400 gap-1">
                    <Lock className="w-3 h-3" />
                    {ts("envPriorityBadge") || "Variables Docker (.env) prioritaires"}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-sm">
                {info?.enabled ? ts("descriptionActive") : ts("descriptionInactive")}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSsoInfo}
              className="gap-2 shrink-0 bg-background/50 backdrop-blur-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {ts("refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-background/60 border border-border/50 space-y-1">
              <span className="text-xs text-muted-foreground font-medium">{ts("authMode")}</span>
              <p className="font-semibold text-sm flex items-center gap-1.5">
                {info?.enabled ? (
                  <>
                    <Sparkles className="w-4 h-4 text-primary" />
                    OpenID Connect (SSO)
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4 text-muted-foreground" />
                    Jellyfin Direct
                  </>
                )}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-background/60 border border-border/50 space-y-1">
              <span className="text-xs text-muted-foreground font-medium">{ts("localAdminAccess")}</span>
              <p className="font-semibold text-sm flex items-center gap-1.5">
                {info?.localAdminConfigured ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {ts("configured")} ({info.localAdminUser})
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {ts("disabled")}
                  </span>
                )}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-background/60 border border-border/50 space-y-1">
              <span className="text-xs text-muted-foreground font-medium">{ts("groupsSupport")}</span>
              <p className="font-semibold text-sm flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-500" />
                {info?.adminGroup || info?.userGroup ? ts("groupsActive") : ts("openAccess")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Redirect URI Callback Box */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Copy className="w-4 h-4 text-primary" />
            {ts("redirectUriTitle")}
          </CardTitle>
          <CardDescription className="text-xs leading-5">
            {ts("redirectUriDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              readOnly
              value={callbackUrl}
              className="font-mono text-xs bg-muted/50 selection:bg-primary/20"
            />
            <Button
              onClick={handleCopyCallback}
              variant={copiedCallback ? "default" : "secondary"}
              className="shrink-0 gap-2 font-medium"
            >
              {copiedCallback ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {t("copied")}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  {t("copy")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SSO Configuration Form */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  {ts("ssoConfigFormTitle") || "Configuration & Rôles SSO"}
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  {ts("ssoConfigFormDesc") || "Modifiez les réglages SSO ci-dessous. Les variables définies dans votre docker-compose / .env restent toujours prioritaires."}
                </CardDescription>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl border bg-muted/30">
                <div className="space-y-0.5">
                  <Label htmlFor="sso-toggle" className="text-xs font-semibold cursor-pointer">
                    {ts("enableSsoLabel") || "Activer l'authentification SSO"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {isEnv.enabled ? (ts("envOverrideNotice") || "Verrouillé par OIDC_ENABLED dans .env") : (ts("dbConfigurableNotice") || "Enregistré en base de données")}
                  </p>
                </div>
                <Switch
                  id="sso-toggle"
                  checked={formEnabled}
                  disabled={isEnv.enabled}
                  onCheckedChange={setFormEnabled}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* OIDC Provider Parameters */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-2 lg:col-span-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="oidc-url" className="text-xs font-medium">
                    {ts("oidcUrlLabel")}
                  </Label>
                  {isEnv.url && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400 gap-1 font-normal">
                      <Lock className="w-2.5 h-2.5" />
                      {ts("dockerEnvLocked") || "Défini par Docker (.env)"}
                    </Badge>
                  )}
                </div>
                <Input
                  id="oidc-url"
                  value={formUrl}
                  disabled={isEnv.url}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://authentik.domain.com/application/o/jellytrack/"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground leading-4">
                  {ts("oidcUrlHint") || "URL de découverte ou base de votre fournisseur OpenID Connect (ex: Authentik, Keycloak, Authelia)."}
                </p>
              </div>

              <div className="space-y-2 lg:col-span-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="oidc-client-id" className="text-xs font-medium">
                    {ts("clientIdLabel")}
                  </Label>
                  {isEnv.clientId && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400 gap-1 font-normal">
                      <Lock className="w-2.5 h-2.5" />
                      {ts("dockerEnvLocked") || "Défini par Docker (.env)"}
                    </Badge>
                  )}
                </div>
                <Input
                  id="oidc-client-id"
                  value={formClientId}
                  disabled={isEnv.clientId}
                  onChange={(e) => setFormClientId(e.target.value)}
                  placeholder="jellytrack"
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2 lg:col-span-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="oidc-client-secret" className="text-xs font-medium">
                    {ts("clientSecretLabel")}
                  </Label>
                  {isEnv.clientSecret && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400 gap-1 font-normal">
                      <Lock className="w-2.5 h-2.5" />
                      {ts("dockerEnvLocked") || "Défini par Docker (.env)"}
                    </Badge>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="oidc-client-secret"
                    type={showSecret ? "text" : "password"}
                    value={formClientSecret}
                    disabled={isEnv.clientSecret}
                    onChange={(e) => setFormClientSecret(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2 lg:col-span-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="oidc-token-alg" className="text-xs font-medium">
                    Algorithme de signature
                  </Label>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 gap-1 font-normal">
                    <Lock className="w-2.5 h-2.5" />
                    Standard OIDC
                  </Badge>
                </div>
                <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-xs font-mono text-muted-foreground">
                  RS256 (Clé RSA / Certificat Authentik)
                </div>
              </div>
            </div>

            {/* Groups & Roles Mapping */}
            <div className="pt-2 border-t border-border/40">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                {ts("groupsTitle")}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="user-group" className="text-xs font-medium">
                      {ts("userGroupLabel")}
                    </Label>
                    {isEnv.userGroup && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400 gap-1 font-normal">
                        <Lock className="w-2.5 h-2.5" />
                        {ts("dockerEnvLocked") || "Docker (.env)"}
                      </Badge>
                    )}
                  </div>
                  <Input
                    id="user-group"
                    value={formUserGroup}
                    disabled={isEnv.userGroup}
                    onChange={(e) => setFormUserGroup(e.target.value)}
                    placeholder="jellyfin-users"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground leading-4">
                    {ts("userGroupHint")}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="admin-group" className="text-xs font-medium">
                      {ts("adminGroupLabel")}
                    </Label>
                    {isEnv.adminGroup && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400 gap-1 font-normal">
                        <Lock className="w-2.5 h-2.5" />
                        {ts("dockerEnvLocked") || "Docker (.env)"}
                      </Badge>
                    )}
                  </div>
                  <Input
                    id="admin-group"
                    value={formAdminGroup}
                    disabled={isEnv.adminGroup}
                    onChange={(e) => setFormAdminGroup(e.target.value)}
                    placeholder="jellyfin-admins"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground leading-4">
                    {ts("adminGroupHint")}
                  </p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <p className="text-xs text-muted-foreground">
                {hasAnyEnvOverride ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    * Les champs définis dans le docker-compose / .env restent prioritaires sur la base de données.
                  </span>
                ) : (
                  <span>Tous les réglages ci-dessus sont configurés et stockés dans votre base de données.</span>
                )}
              </p>

              <Button
                type="submit"
                disabled={saving}
                className="gap-2 font-medium bg-gradient-to-r from-indigo-600 to-cyan-600 text-white hover:from-indigo-500 hover:to-cyan-500 shadow-md"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {ts("saving") || "Enregistrement..."}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {ts("saveButton") || "Enregistrer les réglages SSO"}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
