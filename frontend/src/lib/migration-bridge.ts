import { flushSync, mount, unmount, type Component } from 'svelte';
import Sidebar from './components/Sidebar.svelte';
import type { SidebarConfig, SidebarController } from './sidebar-types';
import About from './components/About.svelte';
import Login from './components/Login.svelte';
import type { LoginContext } from './login-types';
import { goto } from '$app/navigation';
import { createTheme } from './runtime/theme';
import { createI18n } from './runtime/i18n';
import { createAPI } from './runtime/api';
import DashboardFrame from './components/DashboardFrame.svelte';
import DashboardKpis from './components/DashboardKpis.svelte';
import type { DashboardFrameProps, DashboardFrameController } from './dashboard-types';
import type { DashboardKpiContext } from './dashboard-kpi-types';
import DashboardHealth from './components/DashboardHealth.svelte';
import DashboardHardware from './components/DashboardHardware.svelte';
import DashboardLiveStreams from './components/DashboardLiveStreams.svelte';
import type { DashboardHealthContext, DashboardHardwareContext } from './dashboard-status-types';
import type { DashboardLiveContext } from './dashboard-live-types';

function widgetRenderer<T>(component: Component<{ context: T }, { update(next: T): void }>) {
  let target: HTMLElement | undefined;
  let instance: (ReturnType<typeof mount> & { update(next: T): void }) | undefined;
  const dispose = () => {
    if (instance) void unmount(instance);
    instance = undefined; target = undefined;
  };
  return {
    render(nextTarget: HTMLElement, context: T) {
      if (target !== nextTarget) {
        dispose();
        // Legacy islands may contain a loading placeholder. Mount replaces it,
        // just as the old innerHTML renderer did; never append both presentations.
        nextTarget.replaceChildren(); target = nextTarget;
        instance = flushSync(() => mount(component, { target: nextTarget, props: { context } }));
      } else flushSync(() => instance?.update(context));
    },
    dispose,
    disposeWithin(container: HTMLElement | null) { if (target && container?.contains(target)) dispose(); }
  };
}

export type Translate = (key: string, params?: Record<string, string>) => unknown;
export interface NavigationContext {
  user: { isAdmin?: boolean; jellyfinUserId?: string; role?: string } | null;
  context: { multiServer?: boolean; wrappedVisible?: boolean };
  t: Translate;
  icon: (name: string) => string;
}
export interface AboutContext {
  i18n: { t: Translate };
  locale: string;
  version?: string;
}

declare global {
  interface Window {
    JellyTrackMigration: {
      createTheme: typeof createTheme;
      createI18n: typeof createI18n;
      createAPI: typeof createAPI;
      dashboardFrame: (target: HTMLElement, context: DashboardFrameProps) => DashboardFrameController;
      dashboardKpis: (target: HTMLElement, context: DashboardKpiContext) => void;
      disposeDashboardKpis: () => void;
      dashboardHealth: (target: HTMLElement, context: DashboardHealthContext) => void;
      dashboardHardware: (target: HTMLElement, context: DashboardHardwareContext) => void;
      dashboardLive: (target: HTMLElement, context: DashboardLiveContext) => void;
      sidebar: (target: HTMLElement, config: SidebarConfig, icon: (name: string) => string, logo: string) => SidebarController;
      about: (target: HTMLElement, context: AboutContext) => void;
      login: (target: HTMLElement, context: LoginContext) => void;
      disposePage: () => void;
      history: (path: string, replace: boolean) => Promise<void>;
    };
  }
}

export function installMigrationBridge() {
  const healthWidget = widgetRenderer(DashboardHealth);
  const hardwareWidget = widgetRenderer(DashboardHardware);
  const liveWidget = widgetRenderer(DashboardLiveStreams);
  let page: ReturnType<typeof mount> | undefined;
  let kpis: ReturnType<typeof mount> | undefined;
  const disposeDashboardKpis = () => {
    const container = document.getElementById('dash-draggable-container');
    hardwareWidget.disposeWithin(container);
    liveWidget.disposeWithin(container);
    if (kpis) { void unmount(kpis); kpis = undefined; }
  };
  const disposePage = () => {
    disposeDashboardKpis();
    healthWidget.dispose(); hardwareWidget.dispose(); liveWidget.dispose();
    if (page) { void unmount(page); page = undefined; }
  };
  window.JellyTrackMigration = {
    createTheme,
    createI18n,
    createAPI,
    dashboardHealth: (target, context) => healthWidget.render(target, context),
    dashboardHardware: (target, context) => hardwareWidget.render(target, context),
    dashboardLive: (target, context) => liveWidget.render(target, context),
    disposeDashboardKpis,
    dashboardFrame(target, context) {
      disposePage();
      const component = flushSync(() => mount(DashboardFrame, { target, props: context }));
      page = component;
      return { setToday: (plays, hours, users) => component.setToday(plays, hours, users) };
    },
    dashboardKpis(target, context) {
      disposeDashboardKpis();
      kpis = flushSync(() => mount(DashboardKpis, { target, props: { context } }));
    },
    history(path, replace) {
      return goto(path, { state: {}, shallow: true, replace });
    },
    sidebar(target, config, icon, logo) {
      const component = flushSync(() => mount(Sidebar, { target, props: { config, icon, logo } }));
      return {
        render: () => flushSync(() => component.render()),
        updateTheme: () => flushSync(() => component.updateTheme()),
        updateRoute: () => flushSync(() => component.updateRoute()),
        openMobile: () => component.openMobile(),
        closeMobile: () => component.closeMobile(),
        openSearch: () => component.openSearch(),
        closeSearch: clear => component.closeSearch(clear),
        search: () => component.search()
      };
    },
    about(target, context) {
      disposePage();
      page = mount(About, { target, props: context });
    },
    login(target, context) {
      disposePage();
      page = mount(Login, { target, props: { context } });
    },
    disposePage
  };
}
