const modules: Record<string, () => Promise<unknown>> = {
  'chart.min': () => import('../pages/chart.min.js'),
  profile: () => import('../pages/profile.js'),
  settings: () => import('../pages/settings.js'),
  admin: () => import('../pages/admin.js'),
  history: () => import('../pages/history.js'),
  'media-recovery': () => import('../pages/media-recovery.js'),
  users: async () => {
    Object.assign(window, { UsersUI: { render: window.JellyTrackUI.users } });
  },
  accounts: async () => {
    Object.assign(window, { AccountsUI: { render: window.JellyTrackUI.accounts } });
  },
  'about-recovery': async () => {
    Object.assign(window, { JellyTrackAbout: { render: window.JellyTrackUI.about } });
  }
};
const loaded = new Map<string, Promise<unknown>>();
export function loadPageModule(name: string): Promise<unknown> {
  if (!loaded.has(name)) {
    const loader = modules[name];
    if (!loader) return Promise.reject(new Error('Module de page inconnu : ' + name));
    loaded.set(name, loader().catch(error => { loaded.delete(name); throw error; }));
  }
  return loaded.get(name)!;
}
