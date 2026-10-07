import React, { useState } from "react";
import {
  Search,
  RefreshCw,
  Sun,
  Moon,
  LogOut,
  Globe,
  Check,
} from "lucide-react";
import { LOCALES, getLocale, setLocale, type Locale } from "../i18n.ts";
import type { Session } from "../types.ts";

interface TopHeaderProps {
  session: Session;
  onLogout: () => void;
  onOpenSearch: () => void;
  onSync: () => void;
  syncing: boolean;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  session,
  onLogout,
  onOpenSearch,
  onSync,
  syncing,
  theme,
  onToggleTheme,
}) => {
  const [langOpen, setLangOpen] = useState(false);
  const currentLang = getLocale();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="search-trigger" onClick={onOpenSearch} type="button">
          <Search size={16} />
          <span>Rechercher un média ou utilisateur...</span>
          <kbd>Ctrl+K</kbd>
        </button>
      </div>

      <div className="topbar-actions">
        {session.role === "admin" && (
          <button
            className="btn btn-secondary"
            onClick={onSync}
            disabled={syncing}
            title="Synchroniser Jellyfin"
            type="button"
          >
            <RefreshCw size={15} className={syncing ? "spin" : ""} />
            <span>{syncing ? "Synchro…" : "Synchroniser"}</span>
          </button>
        )}

        {/* Language selector */}
        <div style={{ position: "relative" }}>
          <button
            className="btn btn-icon"
            onClick={() => setLangOpen(!langOpen)}
            title="Changer de langue"
            type="button"
          >
            <Globe size={17} />
          </button>

          {langOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 8,
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                boxShadow: "var(--shadow-md)",
                padding: 6,
                zIndex: 40,
                minWidth: 150,
              }}
            >
              {LOCALES.map((loc) => (
                <button
                  key={loc.code}
                  className="nav-item"
                  style={{
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                  onClick={() => {
                    setLocale(loc.code as Locale);
                    setLangOpen(false);
                  }}
                >
                  <span>
                    {loc.flag} {loc.label}
                  </span>
                  {currentLang === loc.code && <Check size={14} color="var(--primary)" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          className="btn btn-icon"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Mode clair" : "Mode sombre"}
          type="button"
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* User badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            background: "var(--bg-app)",
            borderRadius: 10,
            border: "1px solid var(--border-color)",
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 650 }}>{session.username}</span>
          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              padding: "2px 6px",
              borderRadius: 4,
              background: session.role === "admin" ? "var(--primary)" : "var(--border-color)",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            {session.role}
          </span>
        </div>

        {/* Logout */}
        <button
          className="btn btn-icon"
          onClick={onLogout}
          title="Se déconnecter"
          type="button"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
};
