import React, { useEffect, useState } from "react";
import { Film, Search, ChevronLeft, ChevronRight, X, Play, Clock } from "lucide-react";
import { getJSON } from "../../api.ts";
import type { MediaItem } from "../../types.ts";

export const MediaView: React.FC = () => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [pageOffset, setPageOffset] = useState(0);
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);
  const limit = 24;

  const loadMedia = () => {
    setLoading(true);
    let url = `/api/media?limit=${limit}&offset=${pageOffset}`;
    if (search.trim()) url += `&q=${encodeURIComponent(search.trim())}`;
    if (filterType) url += `&type=${encodeURIComponent(filterType)}`;

    getJSON<{ items: MediaItem[] }>(url)
      .then((res) => setMedia(res.items || []))
      .catch(() => setMedia([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMedia();
  }, [pageOffset, filterType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPageOffset(0);
    loadMedia();
  };

  const handleOpenDetail = (id: string) => {
    getJSON<any>(`/api/media/${id}`)
      .then((res) => setSelectedMedia(res))
      .catch((err) => alert(err.message));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Médiathèque</h1>
          <p className="page-subtitle">Parcourez l'ensemble des titres indexés de vos bibliothèques Jellyfin.</p>
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            className="form-input"
            style={{ width: 240 }}
            placeholder="Filtrer par titre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">
            <Search size={15} />
          </button>
        </form>
      </div>

      {/* Filter Tabs */}
      <div className="tabs-header">
        {[
          { id: "", label: "Tous" },
          { id: "Movie", label: "Films" },
          { id: "Series", label: "Séries" },
          { id: "Episode", label: "Épisodes" },
          { id: "Audio", label: "Musique" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-btn ${filterType === tab.id ? "active" : ""}`}
            onClick={() => { setFilterType(tab.id); setPageOffset(0); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "var(--text-muted)" }}>Chargement des médias…</p>}

      {!loading && media.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
          <Film size={36} color="var(--text-muted)" style={{ margin: "0 auto 16px" }} />
          <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Aucun média trouvé</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
            Aucun titre ne correspond à vos filtres actuels.
          </p>
        </div>
      )}

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {media.map((m) => (
          <div
            key={m.id}
            className="card"
            style={{ cursor: "pointer", transition: "transform 0.15s ease", padding: 18 }}
            onClick={() => handleOpenDetail(m.id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <span className="badge badge-tag">{m.type}</span>
              {m.resolution && <span className="badge badge-tag">{m.resolution}</span>}
            </div>
            <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.title}
            </h4>
            <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
              <span>{m.library || "—"}</span>
              {m.durationMs > 0 && <span>{Math.round(m.durationMs / 60000)} min</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 32 }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pageOffset === 0}
          onClick={() => setPageOffset(Math.max(0, pageOffset - limit))}
        >
          <ChevronLeft size={16} />
          <span>Précédent</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={media.length < limit}
          onClick={() => setPageOffset(pageOffset + limit)}
        >
          <span>Suivant</span>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Detail Modal */}
      {selectedMedia && (
        <div className="modal-overlay" onClick={() => setSelectedMedia(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <span className="badge badge-tag" style={{ marginBottom: 8 }}>{selectedMedia.type}</span>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{selectedMedia.title}</h2>
                {selectedMedia.library && <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13 }}>Bibliothèque : {selectedMedia.library}</p>}
              </div>
              <button className="btn btn-icon" onClick={() => setSelectedMedia(null)} type="button">
                <X size={18} />
              </button>
            </div>

            <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 20 }}>
              <div className="stat-card" style={{ padding: 14 }}>
                <div className="stat-top" style={{ marginBottom: 8 }}>
                  <span className="stat-label">Lectures totales</span>
                  <Play size={16} color="var(--primary)" />
                </div>
                <div className="stat-value" style={{ fontSize: 24 }}>{selectedMedia.totalPlays}</div>
              </div>
              <div className="stat-card" style={{ padding: 14 }}>
                <div className="stat-top" style={{ marginBottom: 8 }}>
                  <span className="stat-label">Temps visionné</span>
                  <Clock size={16} color="var(--primary)" />
                </div>
                <div className="stat-value" style={{ fontSize: 24 }}>{Math.round(selectedMedia.totalDurationMs / 3600000)} h</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              {selectedMedia.resolution && <div><strong>Résolution :</strong> {selectedMedia.resolution}</div>}
              {selectedMedia.genres?.length > 0 && <div><strong>Genres :</strong> {selectedMedia.genres.join(", ")}</div>}
              {selectedMedia.directors?.length > 0 && <div><strong>Réalisateur(s) :</strong> {selectedMedia.directors.join(", ")}</div>}
              {selectedMedia.actors?.length > 0 && <div><strong>Acteurs :</strong> {selectedMedia.actors.join(", ")}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
