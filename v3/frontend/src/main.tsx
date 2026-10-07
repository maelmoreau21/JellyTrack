import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Fish } from "lucide-react";
import "./style.css";
import { getJSON, mutateJSON } from "./api.ts";
import { subscribeLocale } from "./i18n.ts";
import type { Session } from "./types.ts";

import { Sidebar, type NavTab } from "./components/Sidebar.tsx";
import { TopHeader } from "./components/TopHeader.tsx";
import { SearchModal } from "./components/SearchModal.tsx";

import { DashboardView } from "./components/views/DashboardView.tsx";
import { StreamsView } from "./components/views/StreamsView.tsx";
import { MediaView } from "./components/views/MediaView.tsx";
import { UsersView } from "./components/views/UsersView.tsx";
import { HistoryView } from "./components/views/HistoryView.tsx";
import { AnalyticsView } from "./components/views/AnalyticsView.tsx";
import { SettingsView } from "./components/views/SettingsView.tsx";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<NavTab>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [, setLocaleTick] = useState(0);

  // Login form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [oidcEnabled, setOidcEnabled] = useState(false);

  useEffect(() => {
    // Check saved theme
    const savedTheme = (localStorage.getItem("jellytrack_theme") as "dark" | "light") || "dark";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);

    // Subscribe to locale changes
    const unsubLocale = subscribeLocale(() => setLocaleTick((t) => t + 1));

    // Check OIDC options and active session
    getJSON<{ oidc: boolean }>("/api/auth/options")
      .then((opts) => setOidcEnabled(opts.oidc))
      .catch(() => undefined);

    getJSON<Session>("/api/auth/me")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));

    return () => unsubLocale();
  }, []);

  const handleToggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("jellytrack_theme", next);
    } catch {}
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await mutateJSON<Session>("/api/auth/login", "POST", { username, password });
      setSession(res);
      setPassword("");
    } catch (err: any) {
      setError(err.message || "Identifiants invalides.");
    }
  };

  const handleLogout = async () => {
    if (!session) return;
    try {
      await mutateJSON("/api/auth/logout", "POST", {}, session.csrfToken);
    } catch {}
    setSession(null);
  };

  const handleSync = async () => {
    if (!session || syncing) return;
    setSyncing(true);
    try {
      await mutateJSON("/api/sync", "POST", {}, session.csrfToken);
      // Trigger refresh on views by a subtle state change if needed
    } catch (err: any) {
      alert(`Synchronisation : ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <main className="loading">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div className="sidebar-brand-icon" style={{ width: 48, height: 48 }}>
            <Fish size={28} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 750 }}>JellyTrack</span>
        </div>
      </main>
    );
  }

  // Login view
  if (!session) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="brand" style={{ marginBottom: 12 }}>
            <span className="brand-icon">
              <Fish size={24} />
            </span>
            <span>JellyTrack</span>
          </div>
          <p className="eyebrow">VOTRE MÉDIATHÈQUE, EN UN COUP D’ŒIL</p>
          <h1>Bienvenue</h1>
          <p className="muted">
            Connectez-vous avec votre compte Jellyfin ou les identifiants d'administration locale.
          </p>

          <label>
            Nom d’utilisateur
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label>
            Mot de passe
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p role="alert" className="error" style={{ marginTop: 16 }}>{error}</p>}

          <button className="primary full" type="submit">
            Se connecter
          </button>

          {oidcEnabled && (
            <a className="secondary full oidc-link" href="/api/auth/oidc/start" style={{ textAlign: "center", display: "block" }}>
              Se connecter avec SSO
            </a>
          )}
        </form>
      </main>
    );
  }

  return (
    <div className="app-container">
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        isAdmin={session.role === "admin"}
      />

      <div className="main-wrapper">
        <TopHeader
          session={session}
          onLogout={handleLogout}
          onOpenSearch={() => setSearchOpen(true)}
          onSync={handleSync}
          syncing={syncing}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        <main className="main-content">
          {currentTab === "dashboard" && (
            <DashboardView onSync={handleSync} syncing={syncing} isAdmin={session.role === "admin"} />
          )}
          {currentTab === "streams" && (
            <StreamsView csrfToken={session.csrfToken} isAdmin={session.role === "admin"} />
          )}
          {currentTab === "media" && <MediaView />}
          {currentTab === "users" && <UsersView />}
          {currentTab === "history" && <HistoryView />}
          {currentTab === "analytics" && <AnalyticsView />}
          {currentTab === "settings" && session.role === "admin" && (
            <SettingsView csrfToken={session.csrfToken} />
          )}
        </main>
      </div>

      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectMedia={() => setCurrentTab("media")}
        onSelectUser={() => setCurrentTab("users")}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
