import React, { useEffect, useState } from "react";
import { Globe, Clapperboard, Users2, Building2 } from "lucide-react";
import { getJSON } from "../../api.ts";
import type { DeepStats, GeoStats } from "../../types.ts";

export const AnalyticsView: React.FC = () => {
  const [deepStats, setDeepStats] = useState<DeepStats | null>(null);
  const [geoStats, setGeoStats] = useState<GeoStats | null>(null);
  const [heatmap, setHeatmap] = useState<{ dayOfWeek: number; hour: number; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getJSON<DeepStats>("/api/stats/deep").catch(() => null),
      getJSON<GeoStats>("/api/geo-stats").catch(() => null),
      getJSON<{ heatmap: any[] }>("/api/heatmap-detail").catch(() => ({ heatmap: [] })),
    ]).then(([deep, geo, heat]) => {
      setDeepStats(deep);
      setGeoStats(geo);
      setHeatmap(heat?.heatmap || []);
      setLoading(false);
    });
  }, []);

  const daysOfWeek = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analyses approfondies</h1>
          <p className="page-subtitle">Statistiques des artistes, répartition géographique et distribution temporelle.</p>
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-muted)" }}>Chargement des données analytiques…</p>}

      {/* Top Directors, Actors, Studios */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginBottom: 28 }}>
        {/* Directors */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div className="stat-icon-wrap"><Clapperboard size={18} /></div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Top Réalisateurs</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {deepStats?.topDirectors?.map((d, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--border-color)", paddingBottom: 6 }}>
                <span>{i + 1}. {d.name}</span>
                <span className="badge badge-tag">{d.count} titres</span>
              </div>
            ))}
            {(!deepStats?.topDirectors || deepStats.topDirectors.length === 0) && (
              <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Aucune donnée disponible.</p>
            )}
          </div>
        </div>

        {/* Actors */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div className="stat-icon-wrap"><Users2 size={18} /></div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Top Acteurs</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {deepStats?.topActors?.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--border-color)", paddingBottom: 6 }}>
                <span>{i + 1}. {a.name}</span>
                <span className="badge badge-tag">{a.count} titres</span>
              </div>
            ))}
            {(!deepStats?.topActors || deepStats.topActors.length === 0) && (
              <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Aucune donnée disponible.</p>
            )}
          </div>
        </div>

        {/* Studios */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div className="stat-icon-wrap"><Building2 size={18} /></div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Top Studios</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {deepStats?.topStudios?.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--border-color)", paddingBottom: 6 }}>
                <span>{i + 1}. {s.name}</span>
                <span className="badge badge-tag">{s.count} titres</span>
              </div>
            ))}
            {(!deepStats?.topStudios || deepStats.topStudios.length === 0) && (
              <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Aucune donnée disponible.</p>
            )}
          </div>
        </div>
      </div>

      {/* Geo Distribution */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div className="stat-icon-wrap"><Globe size={18} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Répartition géographique des sessions</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Pays et villes d'où proviennent vos lectures.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pays</th>
                <th>Sessions</th>
                <th>Principales villes</th>
              </tr>
            </thead>
            <tbody>
              {geoStats?.countries?.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 650 }}>{c.name}</td>
                  <td>{c.sessions}</td>
                  <td>{c.cities.join(", ") || "—"}</td>
                </tr>
              ))}
              {(!geoStats?.countries || geoStats.countries.length === 0) && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    Aucune donnée géographique enregistrée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Heatmap Matrix */}
      <div className="card">
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Moments de visionnage préférés</h3>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--text-muted)" }}>Densité des sessions par jour et heure.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowX: "auto" }}>
          {daysOfWeek.map((dayName, dayIdx) => (
            <div key={dayIdx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 34, fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>{dayName}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: 24 }).map((_, hour) => {
                  const match = heatmap.find((h) => h.dayOfWeek === dayIdx && h.hour === hour);
                  const count = match ? match.count : 0;
                  const intensity = Math.min(1, count / 10);
                  const bg = count === 0
                    ? "var(--bg-app)"
                    : `rgba(102, 88, 217, ${0.2 + intensity * 0.8})`;

                  return (
                    <div
                      key={hour}
                      title={`${dayName} à ${hour}h : ${count} sessions`}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 3,
                        backgroundColor: bg,
                        border: "1px solid var(--border-color)",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 4, marginLeft: 40, marginTop: 4 }}>
            {Array.from({ length: 24 }).map((_, hour) => (
              <div key={hour} style={{ width: 18, textAlign: "center", fontSize: 9, color: "var(--text-muted)" }}>
                {hour % 3 === 0 ? `${hour}h` : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
