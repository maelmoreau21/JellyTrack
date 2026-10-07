import React from "react";
import {
  LayoutDashboard,
  Activity,
  Film,
  Users,
  Clock3,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Fish,
} from "lucide-react";
import { t } from "../i18n.ts";

export type NavTab =
  | "dashboard"
  | "streams"
  | "media"
  | "users"
  | "history"
  | "analytics"
  | "settings";

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isAdmin: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  isAdmin,
}) => {
  const navItems = [
    { id: "dashboard" as NavTab, label: t("nav.dashboard", "Tableau de bord"), icon: LayoutDashboard },
    { id: "streams" as NavTab, label: "Flux en direct", icon: Activity },
    { id: "media" as NavTab, label: t("nav.library", "Médiathèque"), icon: Film },
    { id: "users" as NavTab, label: t("nav.users", "Utilisateurs"), icon: Users },
    { id: "history" as NavTab, label: "Historique", icon: Clock3 },
    { id: "analytics" as NavTab, label: "Analyses", icon: BarChart3 },
    ...(isAdmin ? [{ id: "settings" as NavTab, label: t("nav.settings", "Paramètres"), icon: Settings }] : []),
  ];

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <a href="#" className="sidebar-brand" onClick={(e) => { e.preventDefault(); onSelectTab("dashboard"); }}>
          <div className="sidebar-brand-icon">
            <Fish size={22} />
          </div>
          {!collapsed && <span>JellyTrack</span>}
        </a>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => onSelectTab(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={19} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button
          className="btn btn-icon w-full flex items-center justify-center"
          onClick={onToggleCollapse}
          title={collapsed ? "Agrandir" : "Réduire"}
          style={{ width: "100%" }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  );
};
