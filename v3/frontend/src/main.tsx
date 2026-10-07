import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Clock3, Film, Fish, LogOut, RefreshCw, Users, type LucideIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./style.css";

type Session = { username: string; role: string; csrfToken: string };
type Summary = { periodDays: number; views: number; durationMs: number; users: number; media: number; activity: { day: string; views: number }[] };

async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 401 ? "unauthorized" : "La demande n’a pas abouti.");
  return response.json() as Promise<T>;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { getJSON<Session>("/api/auth/me").then(setSession).catch(() => setSession(null)).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (session) getJSON<Summary>("/api/dashboard").then(setSummary).catch(e => setError(e.message)); }, [session]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Origin: window.location.origin }, body: JSON.stringify({ username, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Connexion impossible.");
      setSession(result); setPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "Connexion impossible."); }
  }

  async function sync() {
    if (!session) return; setSyncing(true); setError("");
    try {
      const response = await fetch("/api/sync", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken, Origin: window.location.origin }, body: JSON.stringify({}) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Synchronisation impossible.");
      setSummary(await getJSON<Summary>("/api/dashboard"));
    } catch (e) { setError(e instanceof Error ? e.message : "Synchronisation impossible."); }
    finally { setSyncing(false); }
  }

  async function logout() {
    if (!session) return;
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": session.csrfToken, Origin: window.location.origin } });
    setSession(null);
  }

  if (loading) return <main className="loading">JellyTrack</main>;
  if (!session) return <main className="login-shell"><form className="login-card" onSubmit={login}>
    <div className="brand"><span className="brand-icon"><Fish size={23} /></span><span>JellyTrack</span></div>
    <p className="eyebrow">VOTRE MÉDIATHÈQUE, EN UN COUP D’ŒIL</p><h1>Bienvenue</h1><p className="muted">Connectez-vous avec le compte administrateur local configuré sur le serveur.</p>
    <label>Nom d’utilisateur<input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} /></label>
    <label>Mot de passe<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
    {error && <p role="alert" className="error">{error}</p>}<button className="primary full" type="submit">Se connecter</button>
  </form></main>;

  const hours = summary ? Math.floor(summary.durationMs / 3_600_000) : 0;
  const stats: { Icon: LucideIcon; label: string; value: string | number }[] = [
    { Icon: Activity, label: "Vues", value: summary?.views ?? "—" },
    { Icon: Clock3, label: "Temps regardé", value: `${hours} h` },
    { Icon: Users, label: "Utilisateurs", value: summary?.users ?? "—" },
    { Icon: Film, label: "Médias", value: summary?.media ?? "—" },
  ];
  return <main className="app-shell"><header className="topbar"><div className="brand"><span className="brand-icon"><Fish size={23} /></span><span>JellyTrack</span></div><div className="top-actions"><span className="user-badge">{session.username}</span><button className="icon-button" onClick={logout} aria-label="Se déconnecter"><LogOut size={18} /></button></div></header>
    <section className="content"><div className="heading-row"><div><p className="eyebrow">APERÇU</p><h1>Tableau de bord</h1><p className="muted">L’activité de votre serveur Jellyfin sur les 30 derniers jours.</p></div><button className="primary" onClick={sync} disabled={syncing}><RefreshCw size={17} className={syncing ? "spin" : ""} />{syncing ? "Synchronisation…" : "Synchroniser Jellyfin"}</button></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="stat-grid">{stats.map(({ Icon, label, value }) => <article className="stat-card" key={label}><div className="stat-label"><span className="stat-icon"><Icon size={18}/></span>{label}</div><strong>{value}</strong><span className="stat-foot">30 derniers jours</span></article>)}</div>
      <div className="panel-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h2>Activité de lecture</h2><p className="muted">Vues enregistrées par période</p></div><span className="live-indicator"><i/>Données locales</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={summary?.activity ?? []}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6658d9" stopOpacity={0.22}/><stop offset="100%" stopColor="#6658d9" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf0f5" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="views" stroke="#6658d9" strokeWidth={3} fill="url(#fill)"/></AreaChart></ResponsiveContainer></div></section>
      <section className="panel quick-panel"><div className="panel-heading"><div><h2>Premiers pas</h2><p className="muted">Reliez votre bibliothèque à JellyTrack.</p></div></div><div className="step"><span>1</span><div><strong>Connecter Jellyfin</strong><p>Configurez l’URL du serveur et une clé API dans les variables d’environnement.</p></div></div><div className="step"><span>2</span><div><strong>Synchroniser les médias</strong><p>La synchronisation importe vos utilisateurs et le catalogue par petites pages.</p></div></div><button className="secondary full" onClick={sync} disabled={syncing}>Lancer la synchronisation</button></section></div>
      <footer className="footer">JellyTrack v3 · Open source · <a href="https://db-ip.com" target="_blank" rel="noreferrer">IP Geolocation by DB-IP</a></footer>
    </section></main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
