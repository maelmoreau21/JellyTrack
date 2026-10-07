import React, { useEffect, useState } from "react";
import {
  Archive,
  Wrench,
  Download,
  Upload,
  Trash2,
  RotateCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { getJSON, mutateJSON } from "../../api.ts";
import type { BackupItem, ServerItem } from "../../types.ts";

interface SettingsViewProps {
  csrfToken: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ csrfToken }) => {
  const [tab, setTab] = useState<"servers" | "libraries" | "plugin" | "backups" | "maintenance">("servers");
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error?: boolean } | null>(null);

  // New server form
  const [serverUrl, setServerUrl] = useState("");
  const [serverApiKey, setServerApiKey] = useState("");
  const [serverName, setServerName] = useState("");

  // Excluded libraries
  const [excludedInput, setExcludedInput] = useState("");

  const refreshAll = () => {
    Promise.all([
      getJSON<{ servers: ServerItem[] }>("/api/settings/jellyfin-servers").catch(() => ({ servers: [] })),
      getJSON<any>("/api/settings").catch(() => ({})),
      getJSON<{ backups: BackupItem[] }>("/api/backup/auto").catch(() => ({ backups: [] })),
    ]).then(([srvRes, setRes, bRes]) => {
      setServers(srvRes.servers || []);
      setExcludedInput((setRes.excludedLibraries || []).join(", "));
      setBackups(bRes.backups || []);
    });
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const notify = (text: string, error = false) => {
    setStatusMsg({ text, error });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleSaveServer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await mutateJSON("/api/settings/jellyfin-servers", "POST", { name: serverName, url: serverUrl, jellyfinApiKey: serverApiKey, isActive: true }, csrfToken);
      notify("Serveur Jellyfin enregistré !");
      setServerName("");
      setServerUrl("");
      setServerApiKey("");
      refreshAll();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleDeleteServer = async (id: string) => {
    if (!confirm("Supprimer ce serveur ?")) return;
    try {
      await mutateJSON(`/api/settings/jellyfin-servers/${id}`, "DELETE", undefined, csrfToken);
      notify("Serveur supprimé.");
      refreshAll();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleSaveLibraries = async () => {
    const list = excludedInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await mutateJSON("/api/settings", "POST", { excludedLibraries: list }, csrfToken);
      notify("Bibliothèques exclues mises à jour !");
      refreshAll();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleRotatePluginKey = async () => {
    if (!confirm("Renouveler la clé plugin ? L'ancienne restera valide selon la période de grâce.")) return;
    try {
      const res = await mutateJSON<{ pluginApiKey: string }>("/api/settings/jellyfin-servers/plugin-key", "POST", {}, csrfToken);
      notify(`Nouvelle clé générée : ${res.pluginApiKey}`);
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleTriggerBackup = async () => {
    try {
      const res = await mutateJSON<{ fileName: string }>("/api/backup/auto/trigger", "POST", {}, csrfToken);
      notify(`Sauvegarde créée : ${res.fileName}`);
      refreshAll();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleRestoreBackup = async (fileName: string) => {
    if (!confirm(`Restauration à partir de ${fileName} ? Les données actuelles seront remplacées.`)) return;
    try {
      await mutateJSON("/api/backup/auto/restore", "POST", { fileName }, csrfToken);
      notify("Restauration terminée avec succès !");
      refreshAll();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleDeleteBackup = async (fileName: string) => {
    if (!confirm(`Supprimer la sauvegarde ${fileName} ?`)) return;
    try {
      await mutateJSON("/api/backup/auto/delete", "POST", { fileName }, csrfToken);
      notify("Sauvegarde supprimée.");
      refreshAll();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleUploadBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch("/api/backup/import", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/zip",
          "X-CSRF-Token": csrfToken,
          Origin: window.location.origin,
        },
        body: buf,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'import");
      notify("Sauvegarde importée avec succès !");
      refreshAll();
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleConsolidate = async () => {
    try {
      const res = await mutateJSON<{ clustersMerged: number; sessionsPruned: number }>("/api/admin/consolidate-history", "POST", {}, csrfToken);
      notify(`Consolidation terminée : ${res.clustersMerged} groupe(s) fusionné(s), ${res.sessionsPruned} coupure(s) nettoyée(s).`);
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  const handleIntegrity = async () => {
    try {
      const res = await mutateJSON<{ staleStreamsDeleted: number; sessionsClosed: number }>("/api/admin/integrity-cleanup", "POST", {}, csrfToken);
      notify(`Nettoyage terminé : ${res.staleStreamsDeleted} flux fantôme(s) purgé(s), ${res.sessionsClosed} session(s) fermée(s).`);
    } catch (err: any) {
      notify(err.message, true);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Paramètres de JellyTrack</h1>
          <p className="page-subtitle">Gestion des serveurs, des sauvegardes, de la sécurité du plugin et de la maintenance.</p>
        </div>
      </div>

      {statusMsg && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: statusMsg.error ? "#fee2e2" : "#ecfdf5",
            color: statusMsg.error ? "#dc2626" : "#059669",
            borderColor: statusMsg.error ? "#fecaca" : "#a7f3d0",
          }}
        >
          {statusMsg.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span style={{ fontSize: 13, fontWeight: 600 }}>{statusMsg.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-header">
        <button type="button" className={`tab-btn ${tab === "servers" ? "active" : ""}`} onClick={() => setTab("servers")}>
          Serveurs Jellyfin
        </button>
        <button type="button" className={`tab-btn ${tab === "libraries" ? "active" : ""}`} onClick={() => setTab("libraries")}>
          Bibliothèques exclues
        </button>
        <button type="button" className={`tab-btn ${tab === "plugin" ? "active" : ""}`} onClick={() => setTab("plugin")}>
          Clé du plugin
        </button>
        <button type="button" className={`tab-btn ${tab === "backups" ? "active" : ""}`} onClick={() => setTab("backups")}>
          Sauvegardes
        </button>
        <button type="button" className={`tab-btn ${tab === "maintenance" ? "active" : ""}`} onClick={() => setTab("maintenance")}>
          Maintenance
        </button>
      </div>

      {/* Tab: Servers */}
      {tab === "servers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="card">
            <h3 style={{ margin: "0 0 16px" }}>Serveurs configurés</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>URL</th>
                    <th>État</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 650 }}>{s.name}</td>
                      <td>{s.url}</td>
                      <td>
                        <span className={`badge ${s.isActive ? "badge-direct" : "badge-tag"}`}>
                          {s.isActive ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => handleDeleteServer(s.id)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {servers.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                        Aucun serveur configuré (le serveur configuré par variable d'environnement reste prioritaire).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 16px" }}>Ajouter un serveur Jellyfin</h3>
            <form onSubmit={handleSaveServer} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1.5fr auto", gap: 12, alignItems: "end" }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nom du serveur</label>
                <input required className="form-input" placeholder="Ex: Mon Jellyfin" value={serverName} onChange={(e) => setServerName(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">URL de base</label>
                <input required className="form-input" placeholder="http://jellyfin:8096" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Clé API Jellyfin</label>
                <input required className="form-input" type="password" placeholder="Clé API" value={serverApiKey} onChange={(e) => setServerApiKey(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ height: 42 }}>Ajouter</button>
            </form>
          </div>
        </div>
      )}

      {/* Tab: Libraries */}
      {tab === "libraries" && (
        <div className="card">
          <h3 style={{ margin: "0 0 6px" }}>Bibliothèques exclues des statistiques</h3>
          <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 13 }}>
            Les titres appartenant à ces bibliothèques ne seront ni affichés sur le tableau de bord ni comptabilisés dans les vues globales.
          </p>
          <div className="form-group">
            <label className="form-label">Noms des bibliothèques (séparés par des virgules)</label>
            <input
              className="form-input"
              placeholder="Ex: Enfants, Dessins Animés, Famille"
              value={excludedInput}
              onChange={(e) => setExcludedInput(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={handleSaveLibraries}>
            Enregistrer les exclusions
          </button>
        </div>
      )}

      {/* Tab: Plugin Key */}
      {tab === "plugin" && (
        <div className="card">
          <h3 style={{ margin: "0 0 6px" }}>Sécurité du plugin Jellyfin</h3>
          <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 13 }}>
            Le plugin Jellyfin installé sur votre serveur utilise cette clé secrète pour envoyer les événements de lecture à JellyTrack.
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="button" className="btn btn-primary" onClick={handleRotatePluginKey}>
              <RotateCw size={15} />
              <span>Générer / Renouveler la clé</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab: Backups */}
      {tab === "backups" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h3 style={{ margin: "0 0 4px" }}>Gestion des sauvegardes</h3>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
                Sauvegardes complètes compressées au format ZIP avec rotation automatique.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <a href="/api/backup/export" download className="btn btn-secondary">
                <Download size={15} />
                <span>Télécharger ZIP</span>
              </a>

              <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                <Upload size={15} />
                <span>Importer ZIP</span>
                <input type="file" accept=".zip,.json" style={{ display: "none" }} onChange={handleUploadBackup} />
              </label>

              <button type="button" className="btn btn-primary" onClick={handleTriggerBackup}>
                <Archive size={15} />
                <span>Créer sauvegarde</span>
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fichier</th>
                    <th>Type</th>
                    <th>Taille</th>
                    <th>Date</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.name}>
                      <td style={{ fontWeight: 650, fontFamily: "monospace" }}>{b.name}</td>
                      <td>
                        <span className={`badge ${b.type === "auto" ? "badge-direct" : "badge-tag"}`}>
                          {b.type === "auto" ? "Automatique" : "Manuelle"}
                        </span>
                      </td>
                      <td>{b.sizeMb} Mo</td>
                      <td>{new Date(b.date).toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <a
                            href={`/api/backup/auto/download?fileName=${encodeURIComponent(b.name)}`}
                            download
                            className="btn btn-icon"
                            title="Télécharger"
                          >
                            <Download size={13} />
                          </a>
                          <button
                            type="button"
                            className="btn btn-icon"
                            title="Restaurer"
                            onClick={() => handleRestoreBackup(b.name)}
                          >
                            <RotateCw size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon"
                            style={{ color: "#dc2626" }}
                            title="Supprimer"
                            onClick={() => handleDeleteBackup(b.name)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {backups.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                        Aucune sauvegarde enregistrée sur disque.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Maintenance */}
      {tab === "maintenance" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="card">
            <h3 style={{ margin: "0 0 6px" }}>Consolidation de l'historique</h3>
            <p style={{ margin: "0 0 18px", color: "var(--text-muted)", fontSize: 13 }}>
              Fusionne les sessions fragmentées par des déconnexions ou micro-coupures réseau au sein d'une même fenêtre horaire.
            </p>
            <button type="button" className="btn btn-primary" onClick={handleConsolidate}>
              <Wrench size={15} />
              <span>Lancer la consolidation</span>
            </button>
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 6px" }}>Nettoyage d'intégrité des sessions</h3>
            <p style={{ margin: "0 0 18px", color: "var(--text-muted)", fontSize: 13 }}>
              Purge les flux fantômes inactifs depuis plus de 10 minutes et clôture les historiques orphelins.
            </p>
            <button type="button" className="btn btn-primary" onClick={handleIntegrity}>
              <Wrench size={15} />
              <span>Lancer le nettoyage</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
