import React, { useEffect, useState } from "react";
import { Activity, Clock3, Users, Film, RefreshCw } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getJSON } from "../../api.ts";
import type { Summary } from "../../types.ts";
import { t } from "../../i18n.ts";

interface DashboardViewProps {
  onSync: () => void;
  syncing: boolean;
  isAdmin: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSync,
  syncing,
  isAdmin,
}) => {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = (period: number) => {
    setLoading(true);
    getJSON<Summary>(`/api/dashboard?days=${period}`)
      .then((data) => {
        setSummary(data);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData(days);
  }, [days]);

  const hours = summary ? Math.floor(summary.durationMs / 3600000) : 0;
  const stats = [
    {
      icon: Activity,
      label: t("charts.viewsTotal", "Total des vues"),
      value: summary ? summary.views.toLocaleString() : "—",
      sub: `${days} derniers jours`,
    },
    {
      icon: Clock3,
      label: t("charts.watchTime", "Temps regardé"),
      value: `${hours} h`,
      sub: `${Math.round(hours / 24)} jours cumulés`,
    },
    {
      icon: Users,
      label: t("nav.users", "Utilisateurs actifs"),
      value: summary ? summary.users.toLocaleString() : "—",
      sub: "Comptes actifs",
    },
    {
      icon: Film,
      label: "Catalogue de médias",
      value: summary ? summary.media.toLocaleString() : "—",
      sub: "Titres indexés",
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("nav.dashboard", "Tableau de bord")}</h1>
          <p className="page-subtitle">Aperçu analytique de l'activité de votre médiathèque Jellyfin.</p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Period buttons */}
          <div style={{ display: "flex", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 10, padding: 3 }}>
            {[7, 30, 90, 365].map((d) => (
              <button
                key={d}
                type="button"
                className="btn"
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  background: days === d ? "var(--primary)" : "transparent",
                  color: days === d ? "#fff" : "var(--text-muted)",
                }}
                onClick={() => setDays(d)}
              >
                {d}j
              </button>
            ))}
          </div>

          {isAdmin && (
            <button className="btn btn-primary" onClick={onSync} disabled={syncing} type="button">
              <RefreshCw size={15} className={syncing ? "spin" : ""} />
              <span>{syncing ? "Synchro…" : "Synchroniser"}</span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="card" style={{ color: "var(--accent-red)", marginBottom: 20 }}>{error}</div>}
      {loading && !summary && <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>Chargement des statistiques…</p>}

      {/* KPI Cards */}
      <div className="stat-grid">
        {stats.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div key={idx} className="stat-card">
              <div className="stat-top">
                <span className="stat-label">{s.label}</span>
                <div className="stat-icon-wrap">
                  <Icon size={18} />
                </div>
              </div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-foot">{s.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Activity Chart */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 className="card-title">{t("charts.activity", "Activité de lecture")}</h2>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
              Nombre de lectures quotidiennes enregistrées sur la période.
            </p>
          </div>
          <span className="badge badge-direct">
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            Données synchronisées
          </span>
        </div>

        <div style={{ height: 320, width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={summary?.activity ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  fontSize: 12,
                  boxShadow: "var(--shadow-md)",
                  color: "var(--text-main)",
                }}
              />
              <Area
                type="monotone"
                dataKey="views"
                name="Vues"
                stroke="var(--primary)"
                strokeWidth={3}
                fill="url(#chartGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
