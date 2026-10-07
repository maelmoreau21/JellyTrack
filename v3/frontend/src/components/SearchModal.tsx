import React, { useEffect, useState } from "react";
import { Search, Film, User, X } from "lucide-react";
import { getJSON } from "../api.ts";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia?: (id: string) => void;
  onSelectUser?: (id: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectMedia,
  onSelectUser,
}) => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ media: any[]; users: any[] }>({
    media: [],
    users: [],
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
      } else if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults({ media: [], users: [] });
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults({ media: [], users: [] });
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      getJSON<{ media: any[]; users: any[] }>(`/api/search?q=${encodeURIComponent(query)}`)
        .then((res) => setResults(res))
        .catch(() => setResults({ media: [], users: [] }))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}>
          <Search size={18} color="var(--primary)" />
          <input
            autoFocus
            type="text"
            className="form-input"
            style={{ border: 0, padding: 0, background: "transparent", fontSize: 16 }}
            placeholder="Rechercher films, séries, musiques, utilisateurs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-icon" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div style={{ marginTop: 16, maxHeight: 360, overflowY: "auto" }}>
          {loading && <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Recherche en cours…</p>}

          {!loading && query.length >= 2 && results.media.length === 0 && results.users.length === 0 && (
            <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Aucun résultat trouvé pour « {query} »</p>
          )}

          {results.media.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                Médias ({results.media.length})
              </div>
              {results.media.map((m) => (
                <div
                  key={m.id || m.jellyfinMediaId}
                  className="nav-item"
                  style={{ padding: "8px 12px", cursor: "pointer", justifyContent: "space-between" }}
                  onClick={() => {
                    if (onSelectMedia) onSelectMedia(m.id || m.jellyfinMediaId);
                    onClose();
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Film size={16} color="var(--primary)" />
                    <div>
                      <div style={{ fontWeight: 650, fontSize: 13 }}>{m.title}</div>
                      {m.library && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.library}</div>}
                    </div>
                  </div>
                  <span className="badge badge-tag">{m.type}</span>
                </div>
              ))}
            </div>
          )}

          {results.users.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                Utilisateurs ({results.users.length})
              </div>
              {results.users.map((u) => (
                <div
                  key={u.id || u.jellyfinUserId}
                  className="nav-item"
                  style={{ padding: "8px 12px", cursor: "pointer" }}
                  onClick={() => {
                    if (onSelectUser) onSelectUser(u.id);
                    onClose();
                  }}
                >
                  <User size={16} color="var(--primary)" />
                  <span style={{ fontWeight: 650, fontSize: 13 }}>{u.username}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
