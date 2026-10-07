import React, { useEffect, useState } from "react";
import { User, Clock, Play, X, ChevronLeft, ChevronRight } from "lucide-react";
import { getJSON } from "../../api.ts";
import type { UserItem } from "../../types.ts";

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const loadUsers = () => {
    setLoading(true);
    getJSON<{ items: UserItem[] }>(`/api/users?limit=${limit}&offset=${offset}`)
      .then((res) => setUsers(res.items || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, [offset]);

  const handleOpenUser = (id: string) => {
    getJSON<any>(`/api/users/${id}`)
      .then((data) => setSelectedUser(data))
      .catch((err) => alert(err.message));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Utilisateurs</h1>
          <p className="page-subtitle">Comptes utilisateurs synchronisés et historique d'activité individuelle.</p>
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-muted)" }}>Chargement des utilisateurs…</p>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom d'utilisateur</th>
                <th>Identifiant Jellyfin</th>
                <th>Dernière activité</th>
                <th>Serveur</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="stat-icon-wrap" style={{ width: 30, height: 30 }}>
                        <User size={15} />
                      </div>
                      <span style={{ fontWeight: 650 }}>{u.username}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>{u.jellyfinUserId}</td>
                  <td>{u.lastActive ? new Date(u.lastActive).toLocaleDateString() : "Jamais"}</td>
                  <td>{u.server || "Principal"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      onClick={() => handleOpenUser(u.id)}
                    >
                      Détails
                    </button>
                  </td>
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
          disabled={users.length < limit}
          onClick={() => setOffset(offset + limit)}
        >
          <span>Suivant</span>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div className="stat-icon-wrap" style={{ width: 44, height: 44 }}>
                  <User size={22} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{selectedUser.username}</h2>
                  <p style={{ margin: "2px 0 0", color: "var(--text-muted)", fontSize: 12 }}>ID : {selectedUser.jellyfinUserId}</p>
                </div>
              </div>
              <button className="btn btn-icon" onClick={() => setSelectedUser(null)} type="button">
                <X size={18} />
              </button>
            </div>

            <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 20 }}>
              <div className="stat-card" style={{ padding: 14 }}>
                <div className="stat-top" style={{ marginBottom: 6 }}>
                  <span className="stat-label">Lectures totales</span>
                  <Play size={16} color="var(--primary)" />
                </div>
                <div className="stat-value" style={{ fontSize: 24 }}>{selectedUser.totalPlays}</div>
              </div>
              <div className="stat-card" style={{ padding: 14 }}>
                <div className="stat-top" style={{ marginBottom: 6 }}>
                  <span className="stat-label">Temps total</span>
                  <Clock size={16} color="var(--primary)" />
                </div>
                <div className="stat-value" style={{ fontSize: 24 }}>{Math.round(selectedUser.totalDurationMs / 3600000)} h</div>
              </div>
            </div>

            <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>Lectures récentes</h3>
            <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedUser.recentActivity?.map((it: any) => (
                <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg-app)", borderRadius: 8, fontSize: 13 }}>
                  <div>
                    <strong>{it.title}</strong>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(it.startedAt).toLocaleString()} · {it.playMethod}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{Math.round(it.durationMs / 60000)} min</span>
                </div>
              ))}
              {(!selectedUser.recentActivity || selectedUser.recentActivity.length === 0) && (
                <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Aucune lecture récente enregistrée.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
