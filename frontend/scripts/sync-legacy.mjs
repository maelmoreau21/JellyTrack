import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

// Copy only public, tracked frontend assets; never copy environment or data files.
const source = new URL('../../web/dist/', import.meta.url);
const destination = new URL('../static/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('assets/', source), new URL('assets/', destination), { recursive: true });
const html = await readFile(new URL('index.html', source), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1];
if (!head || !body) throw new Error('Legacy document structure changed; review the bridge.');
await writeFile(new URL('../src/app.html', import.meta.url), `<!doctype html>
<html lang="fr" class="dark"><head>${head}\n%sveltekit.head%</head>
<body><div style="display: contents">%sveltekit.body%</div></body></html>\n`);
const appPath = new URL('assets/app.js', destination);
const app = await readFile(appPath, 'utf8');
const bootstrap = "document.addEventListener('DOMContentLoaded', async () => {";
if (app.split(bootstrap).length !== 2) throw new Error('Legacy bootstrap changed; review the bridge.');
let migratedApp = app.replace(bootstrap, `((start) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else void start();
  })(async () => {`);
const cleanup = 'State.pageController?.abort();';
if (migratedApp.split(cleanup).length !== 2) throw new Error('Router cleanup changed; review the bridge.');
migratedApp = migratedApp.replace(cleanup, 'window.JellyTrackMigration.disposePage();\n      ' + cleanup);
const history = `      if (replace) {
        window.history.replaceState({}, '', path);
      } else {
        window.history.pushState({}, '', path);
      }`;
// Source files may use CRLF; normalize this generated copy before exact checks.
migratedApp = migratedApp.replaceAll('\r\n', '\n');
function replaceService(name, initializer) {
  const declaration = `  const ${name} = {`;
  if (migratedApp.split(declaration).length !== 2) throw new Error(`${name} service changed; review migration.`);
  const pattern = new RegExp(`  const ${name} = \\{[\\s\\S]*?\\n  \\};`);
  if (!pattern.test(migratedApp)) throw new Error(`${name} service boundary changed.`);
  migratedApp = migratedApp.replace(pattern, `  const ${name} = ${initializer};`);
}
replaceService('I18n', `window.JellyTrackMigration.createI18n(State, () => window.JellyTrackNavigation.render(), (path, replace, force) => Router.navigate(path, replace, force))`);
replaceService('Theme', `window.JellyTrackMigration.createTheme(() => Router.renderCurrent())`);
replaceService('API', `window.JellyTrackMigration.createAPI(State, () => Auth.updateUserUI(), path => Router.navigate(path))`);
migratedApp = migratedApp.replace('getJSON: url => API.getJSON(url)', 'getJSON: (url, options) => API.getJSON(url, options)');
const dashboardSkeleton = /      \/\/ Render base dashboard skeleton\n      main\.innerHTML = `[\s\S]*?\n      `;/;
if (!dashboardSkeleton.test(migratedApp)) throw new Error('Dashboard skeleton changed; review migration.');
migratedApp = migratedApp.replace(dashboardSkeleton, `      // Mount the converted structure; charts still own their empty containers.
      const dashboardFrame = window.JellyTrackMigration.dashboardFrame(main, {t: I18n.t.bind(I18n), locale: State.locale});`);
const todayStats = /          const todayPlaysEl = document\.getElementById\('today-plays-val'\);[\s\S]*?          if \(todayUsersEl\) todayUsersEl\.textContent = Utils\.formatNumber\(dashboardData\.todayActiveUsers \|\| 0\);/;
if (!todayStats.test(migratedApp)) throw new Error('Dashboard today values changed; review migration.');
migratedApp = migratedApp.replace(todayStats, `          dashboardFrame.setToday(Utils.formatNumber(dashboardData.todayPlays || 0), String(dashboardData.todayHours ?? 0) + 'h', Utils.formatNumber(dashboardData.todayActiveUsers || 0));`);
const kpiGenerator = /          0: \(\) => `[\s\S]*?\n          `,/;
if (!kpiGenerator.test(migratedApp)) throw new Error('Dashboard KPI generator changed; review migration.');
migratedApp = migratedApp.replace(kpiGenerator, "          0: () => '',");
const blockRender = '        // Render blocks in current dashboardOrder';
if (migratedApp.split(blockRender).length !== 2) throw new Error('Dashboard block render changed.');
migratedApp = migratedApp.replace(blockRender, blockRender + '\n        window.JellyTrackMigration.disposeDashboardKpis();');
const chartLabels = '        const historicalChartLabels = {';
if (migratedApp.split(chartLabels).length !== 2) throw new Error('Dashboard chart labels changed.');
migratedApp = migratedApp.replace(chartLabels, `        const kpiTarget = container.querySelector('[data-block-id="0"]');
        if (kpiTarget) window.JellyTrackMigration.dashboardKpis(kpiTarget, {
          data: d, activeStreamsCount: State.activeStreamsCount || 0, currentTimeRange,
          locale: State.locale, t: I18n.t.bind(I18n), icon: window.JellyTrackNavigation.icon,
          formatNumber: Utils.formatNumber, historyURL
        });
\n` + chartLabels);
const dashboardRefresh = '      const refreshFilteredDashboard = () => {';
if (migratedApp.split(dashboardRefresh).length !== 2) throw new Error('Dashboard refresh changed.');
migratedApp = migratedApp.replace(dashboardRefresh, '      const refreshFilteredDashboard = async () => {');
const dashboardHistory = "        window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());";
if (migratedApp.split(dashboardHistory).length !== 2) throw new Error('Dashboard filter history changed.');
migratedApp = migratedApp.replace(dashboardHistory, "        await window.JellyTrackMigration.history(window.location.pathname + '?' + params.toString(), true);");
const healthLoader = /      const loadSystemHealth = async \(snapshot\) => \{[\s\S]*?\n      \/\/ 3\. Load Hardware Monitor/;
if (!healthLoader.test(migratedApp)) throw new Error('Dashboard health loader changed.');
migratedApp = migratedApp.replace(healthLoader, `      const loadSystemHealth = async (snapshot) => {
        try {
          const health = snapshot || await API.getJSON('/api/admin/health');
          if (pageSignal.aborted) return;
          const container = document.getElementById('dash-system-health-container');
          if (container) window.JellyTrackMigration.dashboardHealth(container, {health, locale: State.locale, t: I18n.t.bind(I18n), icon: window.JellyTrackNavigation.icon, timeAgo: Utils.timeAgo});
        } catch (e) {}
      };
\n      // 3. Load Hardware Monitor`);
const hardwareLoader = /      const loadHardware = async \(snapshot\) => \{[\s\S]*?\n      const startLiveEvents =/;
if (!hardwareLoader.test(migratedApp)) throw new Error('Dashboard hardware loader changed.');
migratedApp = migratedApp.replace(hardwareLoader, `      const loadHardware = async (snapshot) => {
        try {
          const hardware = snapshot || await API.getJSON('/api/hardware');
          if (pageSignal.aborted) return;
          const container = document.getElementById('dash-hardware-container');
          if (container && hardware?.cpu) window.JellyTrackMigration.dashboardHardware(container, {hardware, locale: State.locale, t: I18n.t.bind(I18n), icon: window.JellyTrackNavigation.icon, timeAgo: Utils.timeAgo});
        } catch (e) {}
      };
\n      const startLiveEvents =`);
const liveBody = /        if \(liveStreamsData\.length === 0\) \{[\s\S]*?\n      \/\/ 5\. Main Dashboard Data Loader/;
if (!liveBody.test(migratedApp)) throw new Error('Dashboard live body changed.');
migratedApp = migratedApp.replace(liveBody, `        window.JellyTrackMigration.dashboardLive(container, {
          streams: liveStreamsData, liveBandwidth, liveBandwidthKnown, forceCardsView,
          multiServer: Boolean(State.navigation.multiServer), isAdmin: Boolean(State.user?.isAdmin), t: I18n.t.bind(I18n)
        });
      };
\n      // 5. Main Dashboard Data Loader`);
if (!migratedApp.includes(history)) throw new Error('Router history changed; review the bridge.');
migratedApp = migratedApp.replace(history, '      await window.JellyTrackMigration.history(path, replace);');
const navigate = '    navigate(path, replace = false, force = false) {';
if (migratedApp.split(navigate).length !== 2) throw new Error('Router navigate changed; review the bridge.');
migratedApp = migratedApp.replace(navigate, '    async navigate(path, replace = false, force = false) {');
const login = /    async login\(\) \{[\s\S]*?\n    \/\/ 3\. Setup Wizard/;
if (!login.test(migratedApp)) throw new Error('Login renderer changed; review the bridge.');
migratedApp = migratedApp.replace(login, `    async login() {
      window.JellyTrackMigration.login(document.getElementById('app-main'), {
        API, Auth, I18n, Theme, State, Toast, Router, StreamsPoller,
        icon: name => window.JellyTrackNavigation.icon(name)
      });
    },

    // 3. Setup Wizard`);
await writeFile(appPath, migratedApp);
const settingsPath = new URL('assets/settings.js', destination);
await writeFile(new URL('assets/accounts.js', destination), `window.AccountsUI = {
  render(main, context) { window.JellyTrackMigration.accounts(main, context); }
};\n`);
const settings = (await readFile(settingsPath, 'utf8')).replaceAll('\r\n', '\n');
const settingsMount = "    async mount(ctx, subpage = 'jellyfin') {";
if (settings.split(settingsMount).length !== 2) throw new Error('Settings mount changed; review migration.');
await writeFile(settingsPath, settings.replace(settingsMount, settingsMount + `
      if (subpage === 'dataBackups') {
        window.JellyTrackMigration.backups(ctx.main, { ...ctx,
          tabs: window.JellyTrackNavigation.settingsTabs('/settings/dataBackups'),
          icon: name => window.JellyTrackNavigation.icon(name)
        });
        return;
      }`));
const navigationPath = new URL('assets/navigation.js', destination);
const navigation = (await readFile(navigationPath, 'utf8')).replaceAll('\r\n', '\n');
const sidebar = /    init\(options\) \{[\s\S]*?    settingsTabs\(path\) \{/;
if (!sidebar.test(navigation)) throw new Error('Sidebar boundaries changed; review the bridge.');
await writeFile(navigationPath, navigation.replace(sidebar, `    controller: null,
    init(options) {
      config = options;
      this.controller = window.JellyTrackMigration.sidebar(document.getElementById('app-sidebar'), config, icon, logo);
    },
    render() { this.controller.render(); },
    updateTheme() { this.controller.updateTheme(); },
    updateRoute() { this.controller.updateRoute(); },
    openMobile() { this.controller.openMobile(); },
    closeMobile() { this.controller.closeMobile(); },
    openSearch() { this.controller.openSearch(); },
    closeSearch(clear) { this.controller.closeSearch(clear); },
    search() { return this.controller.search(); },
    settingsTabs(path) {`));
await writeFile(new URL('assets/about-recovery.js', destination), `window.JellyTrackAbout = {
  render(main, context) { window.JellyTrackMigration.about(main, context); }
};\n`);
