import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getJSON } from "../../api.ts";
import type { HistoryItem } from "../../types.ts";

export const HistoryView: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [days, setDays] = useState(30);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const loadHistory = () => {
    setLoading(true);
    getJSON<{ items: HistoryItem[] }>(`/api/history?days=${days}&limit=${limit}&offset=${offset}`)
      .then((res) => setHistory(res.items || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadHistory();
  }, [days, offset]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Historique des lectures</h1>
          <p className="page-subtitle">Journal détaillé des sessions de visionnage et d'écoute enregistrées.</p>
        </div>

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
              onClick={() => { setDays(d); setOffset(0); }}
            >
              {d}j
            </button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-muted)" }}>Chargement de l'historique…</p>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date / Heure</th>
                <th>Titre</th>
                <th>Utilisateur</th>
                <th>Durée</th>
                <th>Méthode</th>
                <th>Bibliothèque</th>
              </tr>
            </thead>
            <tbody>
              {history.map((it) => (
                <tr key={it.id}>
                  <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {new Date(it.startedAt).toLocaleString()}
                  </td>
                  <td>
                    <div style={{ fontWeight: 650 }}>{it.title}</div>
                    <span className="badge badge-tag" style={{ fontSize: 10 }}>{it.type}</span>
                  </td>
                  <td>{it.username || "—"}</td>
                  <td>{Math.round(it.durationMs / 60000)} min</td>
                  <td>
                    <span className={`badge ${it.playMethod === "DirectPlay" ? "badge-direct" : "badge-transcode"}`}>
                      {it.playMethod}
                    </span>
                  </td>
                  <td>{it.library || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 24 }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
        >
          <ChevronLeft size={16} />
          <span>Précédent</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={history.length < limit}
          onClick={() => setOffset(offset + limit)}
        >
          <span>Suivant</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};
