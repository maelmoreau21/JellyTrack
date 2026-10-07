import React, { useEffect, useState } from "react";
import { Activity, Radio, XOctagon, Send, Wifi } from "lucide-react";
import { getJSON, mutateJSON } from "../../api.ts";
import type { ActiveStream } from "../../types.ts";

interface StreamsViewProps {
  csrfToken: string;
  isAdmin: boolean;
}

export const StreamsView: React.FC<StreamsViewProps> = ({ csrfToken, isAdmin }) => {
  const [streams, setStreams] = useState<ActiveStream[]>([]);
  const [bandwidth, setBandwidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msgTarget, setMsgTarget] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [msgStatus, setMsgStatus] = useState("");

  const fetchStreams = () => {
    getJSON<{ streams: ActiveStream[]; totalBandwidthMbps: number }>("/api/streams")
      .then((res) => {
        setStreams(res.streams || []);
        setBandwidth(res.totalBandwidthMbps || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStreams();
    const timer = setInterval(fetchStreams, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleKill = async (sessionId: string) => {
    if (!confirm("Voulez-vous vraiment forcer l'arrêt de cette session ?")) return;
    try {
      await mutateJSON("/api/jellyfin/kill-stream", "POST", { sessionId }, csrfToken);
      fetchStreams();
    } catch (e: any) {
      alert(e.message || "Impossible d'arrêter le flux.");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgTarget || !msgText.trim()) return;
    try {
      await mutateJSON("/api/jellyfin/send-message", "POST", { sessionId: msgTarget, text: msgText, header: "Message JellyTrack" }, csrfToken);
      setMsgStatus("Message envoyé avec succès !");
      setTimeout(() => {
        setMsgTarget(null);
        setMsgText("");
        setMsgStatus("");
      }, 1500);
    } catch (err: any) {
      setMsgStatus(`Erreur : ${err.message}`);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Flux en direct</h1>
          <p className="page-subtitle">Surveillance en temps réel des lectures en cours sur votre serveur Jellyfin.</p>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="badge badge-tag" style={{ padding: "8px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <Wifi size={15} color="var(--primary)" />
            <span>Bande passante : <strong>{bandwidth.toFixed(1)} Mbps</strong></span>
          </div>

          <div className="badge badge-direct" style={{ padding: "8px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <Radio size={15} />
            <span>{streams.length} flux {streams.length > 1 ? "actifs" : "actif"}</span>
          </div>
        </div>
      </div>

      {loading && streams.length === 0 && <p style={{ color: "var(--text-muted)" }}>Chargement des flux…</p>}

      {!loading && streams.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <Activity size={36} color="var(--text-muted)" style={{ margin: "0 auto 16px" }} />
          <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Aucun flux en cours</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
            Aucun utilisateur ne regarde actuellement de contenu sur le serveur.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
        {streams.map((s) => (
          <div key={s.id || s.sessionId} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{s.mediaTitle || "Média inconnu"}</h3>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                  Utilisateur : <strong>{s.user}</strong>
                </p>
              </div>
              <span className={`badge ${s.playMethod === "DirectPlay" ? "badge-direct" : "badge-transcode"}`}>
                {s.playMethod}
              </span>
            </div>

            {/* Progress Bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                <span>Progression</span>
                <span>{s.progressPercent}%</span>
              </div>
              <div style={{ width: "100%", height: 6, background: "var(--bg-app)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${s.progressPercent}%`, height: "100%", background: "var(--primary)", transition: "width 0.3s ease" }} />
              </div>
            </div>

            <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
              <div>Appareil : {s.deviceName || s.clientName || "Inconnu"}</div>
              {s.city || s.country ? (
                <div>Localisation : {s.city ? `${s.city}, ` : ""}{s.country}</div>
              ) : null}
            </div>

            {isAdmin && (
              <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--border-color)" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: "7px 12px", fontSize: 12 }}
                  onClick={() => { setMsgTarget(s.sessionId); setMsgText(""); setMsgStatus(""); }}
                >
                  <Send size={13} />
                  <span>Message</span>
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: "7px 12px", fontSize: 12 }}
                  onClick={() => handleKill(s.sessionId)}
                  title="Arrêter le flux"
                >
                  <XOctagon size={14} />
                  <span>Arrêter</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Message Modal */}
      {msgTarget && (
        <div className="modal-overlay" onClick={() => setMsgTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ margin: "0 0 16px" }}>Envoyer un message à l'écran</h3>
            <form onSubmit={handleSend}>
              <div className="form-group">
                <label className="form-label">Message à afficher</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="form-input"
                  placeholder="Ex: Le serveur va redémarrer dans 5 minutes..."
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                />
              </div>
              {msgStatus && <p style={{ fontSize: 12, color: "var(--primary)", marginBottom: 12 }}>{msgStatus}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setMsgTarget(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Envoyer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
