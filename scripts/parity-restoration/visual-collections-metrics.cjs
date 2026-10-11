const fs = require('fs'), path = require('path');
const { chromium } = require('C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
(async () => {
  const browser = await chromium.launch(), report = { date: new Date().toISOString(), scope: 'Actual computed Collections layout dimensions, main and Go, identical viewport/theme. Source/client mode caveats recorded independently.', cases: [] };
  try {
    for (const mode of ['main', 'go']) {
      const baseURL = 'http://localhost:' + (mode === 'main' ? 3341 : 3350), context = await browser.newContext({ baseURL, locale: 'fr-FR', viewport: { width: 1440, height: 900 } });
      if (mode === 'main') {
        const { encode } = require(path.join(root, 'scratch/navigation-qa/main-reference/node_modules/next-auth/jwt'));
        await context.addCookies([{ name: 'locale', value: 'fr', url: baseURL }, { name: 'next-auth.session-token', url: baseURL, value: await encode({ secret: 'navigation-qa-reference-secret-at-least-32-characters', token: { name: 'QA administrateur', sub: 'qa-local', isAdmin: true, jellyfinUserId: 'local-admin', authServerName: 'QA principal', authServerIsPrimary: true, sessionExpiresAt: Math.floor(Date.now() / 1000) + 86400, sessionExpired: false }, maxAge: 86400 }) }]);
      } else { await context.request.post('/api/auth/login', { headers: { Origin: baseURL }, data: { username: 'mediaadmin', password: 'Media-pages-QA-test-2026!' } }); }
      await context.addInitScript(m => { localStorage.setItem(m === 'main' ? 'theme' : 'jt_theme', 'dark'); if (m === 'go') localStorage.setItem('jt_locale', 'fr'); }, mode);
      const page = await context.newPage(); await page.goto('/media/collections', { waitUntil: 'domcontentloaded', timeout: 75000 }); await page.waitForTimeout(4000);
      const sessionResponse = await context.request.get(mode === 'main' ? '/api/auth/session' : '/api/auth/me');
      const sessionBody = await sessionResponse.json();
      await page.locator('a[href="/media/analysis"]').first().waitFor({ timeout: 30000 });
      const result = await page.evaluate(() => {
        const inspect = element => {
          if (!element) return null;
          const style = getComputedStyle(element), bounds = element.getBoundingClientRect(), props = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'margin', 'gap', 'backgroundColor', 'backgroundImage', 'border', 'borderRadius', 'display', 'gridTemplateColumns', 'height', 'minHeight'];
          return { tag: element.tagName, className: String(element.className), text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 160), rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, ...Object.fromEntries(props.map(prop => [prop, style[prop]])) };
        };
        const main = document.querySelector('#app-main') || document.querySelector('main');
        const text = value => [...main.querySelectorAll('h1,h2,h3,div,span,p')].filter(element => element.textContent.trim().toLowerCase() === value.toLowerCase()).at(-1);
        const title = main.querySelector('h1'), nav = [...main.querySelectorAll('nav')].find(element => element.querySelector('a[href="/media/all"]'));
        const allButton = [...main.querySelectorAll('button')].find(element => element.textContent.trim() === 'Tout');
        const keys = { root: main, mediaNav: nav, mediaFirstTab: nav?.querySelector('a'), title, page: title?.closest('.mr-collections-page') || title?.parentElement, titleParent: title?.parentElement, filter: main.querySelector('.mr-server-options') || allButton?.parentElement?.parentElement, filterInner: allButton?.parentElement, filterButton: allButton, detailsTitle: text('Détails par Collection') };
        for (const [kind, label] of [['volume', 'VOLUME DU DISQUE'], ['content', 'CONTENU TOTAL'], ['time', 'TEMPS TOTAL']]) {
          const heading = text(label), card = heading?.closest('[data-slot="card"],.mr-stat,.card');
          keys[kind + 'Card'] = card; keys[kind + 'Title'] = heading;
          keys[kind + 'CardHeader'] = card?.querySelector('[data-slot="card-header"]');
          keys[kind + 'CardContent'] = card?.querySelector('[data-slot="card-content"]');
          keys[kind + 'Value'] = card?.querySelector('.text-4xl,.text-xl,strong');
          keys[kind + 'Desc'] = card?.querySelector('p,small');
          keys[kind + 'Grid'] = card?.parentElement;
        }
        const sidebarRoutes = ['/', '/recent', '/media', '/users', '/admin/health', '/logs', '/settings', '/admin/server-compare', '/users/local-admin'];
        return { nodes: Object.fromEntries(Object.entries(keys).map(([key, element]) => [key, inspect(element)])), sidebar: [...document.querySelectorAll('a')].filter(element => !element.closest('main,#app-main') && sidebarRoutes.includes(element.getAttribute('href')) && element.getClientRects().length).map(element => ({ href: element.getAttribute('href'), text: element.textContent.trim() })) };
      });
      const sessionValue = sessionBody.user || sessionBody;
      const session = Object.fromEntries(['username', 'name', 'isAdmin', 'role', 'jellyfinUserId', 'authServerName', 'authServerIsPrimary'].filter(key => sessionValue[key] !== undefined).map(key => [key, sessionValue[key]]));
      report.cases.push({ mode, session, ...result }); await context.close();
    }
    const first = report.cases[0].nodes, second = report.cases[1].nodes;
    report.comparison = Object.keys(first).map(key => ({ key, main: first[key], go: second[key] }));
    fs.writeFileSync(path.join(root, 'docs/parity-restoration/visual-collections-metrics.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.comparison.filter(row => ['mediaNav', 'title', 'filter', 'volumeCard', 'volumeValue', 'volumeGrid'].includes(row.key)), null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
