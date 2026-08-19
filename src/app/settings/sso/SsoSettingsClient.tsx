"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Loader2,
  RefreshCw,
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

interface SsoInfo {
  enabled: boolean;
  url: string;
  clientId: string;
  hasClientSecret: boolean;
  clientSecretMasked: string;
  userGroup: string;
  adminGroup: string;
  localAdminConfigured: boolean;
  localAdminUser: string;
  callbackPath: string;
}

interface TestResult {
  success: boolean;
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  scopesSupported?: string[];
  wellKnownUrl?: string;
  error?: string;
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

  const [info, setInfo] = useState<SsoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCallback, setCopiedCallback] = useState(false);
  const [testUrl, setTestUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchSsoInfo = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/sso", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: SsoInfo = await res.json();
      setInfo(data);
      if (!testUrl && data.url) {
        setTestUrl(data.url);
      }
    } catch {
      setMessage({ type: "error", text: ts("loadError") });
    } finally {
      setLoading(false);
    }
  }, [ts, testUrl]);

  useEffect(() => {
    fetchSsoInfo();
  }, [fetchSsoInfo]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/sso/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: testUrl }),
      });
      const data: TestResult = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || "Network error when testing OIDC provider",
      });
    } finally {
      setTesting(false);
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

      {/* OIDC Config & Groups Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OIDC Parameters */}
        <Card className="border-border/60 shadow-sm flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              {ts("oidcParamsTitle")}
            </CardTitle>
            <CardDescription className="text-xs">
              {ts("oidcParamsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{ts("oidcUrlLabel")}</Label>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 font-mono text-xs truncate">
                {info?.url || <span className="text-muted-foreground italic">{ts("notConfigured")}</span>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{ts("clientIdLabel")}</Label>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 font-mono text-xs truncate">
                {info?.clientId || <span className="text-muted-foreground italic">{ts("notConfigured")}</span>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{ts("clientSecretLabel")}</Label>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 font-mono text-xs truncate">
                {info?.hasClientSecret ? (
                  info.clientSecretMasked
                ) : (
                  <span className="text-muted-foreground italic">{ts("notConfiguredOrPublic")}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Groups & Roles Mapping */}
        <Card className="border-border/60 shadow-sm flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              {ts("groupsTitle")}
            </CardTitle>
            <CardDescription className="text-xs">
              {ts("groupsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{ts("userGroupLabel")}</Label>
                <Badge variant="outline" className="text-[10px] font-normal">
                  {ts("userRole")}
                </Badge>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 font-mono text-xs truncate flex items-center justify-between">
                <span>{info?.userGroup || <span className="text-muted-foreground italic">{ts("allAllowed")}</span>}</span>
                {info?.userGroup && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
              </div>
              <p className="text-[11px] text-muted-foreground leading-4">
                {ts("userGroupHint")}
              </p>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{ts("adminGroupLabel")}</Label>
                <Badge variant="default" className="bg-indigo-600 text-white text-[10px] font-normal">
                  {ts("adminRole")}
                </Badge>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 font-mono text-xs truncate flex items-center justify-between">
                <span>{info?.adminGroup || <span className="text-muted-foreground italic">{ts("notConfigured")}</span>}</span>
                {info?.adminGroup && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
              </div>
              <p className="text-[11px] text-muted-foreground leading-4">
                {ts("adminGroupHint")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Discovery & Connectivity Tester */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {ts("testConnectionTitle")}
          </CardTitle>
          <CardDescription className="text-xs">
            {ts("testConnectionDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              placeholder="https://authentik.domain.com/application/o/jellytrack/"
              className="text-xs font-mono"
            />
            <Button
              onClick={handleTestConnection}
              disabled={testing || !testUrl.trim()}
              className="gap-2 shrink-0 font-medium"
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {ts("testing")}
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  {ts("testButton")}
                </>
              )}
            </Button>
          </div>

          {testResult && (
            <div
              className={`p-4 rounded-xl border space-y-3 text-xs animate-in fade-in duration-200 ${
                testResult.success
                  ? "bg-emerald-500/5 border-emerald-500/20 text-foreground"
                  : "bg-red-500/5 border-red-500/20 text-red-500"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">{ts("testSuccess")}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span>{ts("testFailed")}: {testResult.error}</span>
                  </>
                )}
              </div>

              {testResult.success && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-border/40 font-mono text-[11px]">
                  <div>
                    <span className="text-muted-foreground font-sans">{ts("issuer")}:</span>{" "}
                    <span className="truncate">{testResult.issuer}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-sans">{ts("authorizationEndpoint")}:</span>{" "}
                    <span className="truncate">{testResult.authorizationEndpoint}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-sans">{ts("tokenEndpoint")}:</span>{" "}
                    <span className="truncate">{testResult.tokenEndpoint}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-sans">{ts("userinfoEndpoint")}:</span>{" "}
                    <span className="truncate">{testResult.userinfoEndpoint}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Authentik Setup Guide */}
      <Card className="border-border/60 bg-muted/20 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" />
            {ts("authentikGuideTitle")}
          </CardTitle>
          <CardDescription className="text-xs">
            {ts("authentikGuideDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground leading-relaxed">
          <ol className="list-decimal list-inside space-y-2 pl-1">
            <li>
              <strong className="text-foreground">{ts("step1Title")}</strong> : {ts("step1Desc")}
            </li>
            <li>
              <strong className="text-foreground">{ts("step2Title")}</strong> : {ts("step2Desc")} (<code>{callbackUrl}</code>).
            </li>
            <li>
              <strong className="text-foreground">{ts("step3Title")}</strong> : {ts("step3Desc")}
            </li>
            <li>
              <strong className="text-foreground">{ts("step4Title")}</strong> : {ts("step4Desc")}
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
