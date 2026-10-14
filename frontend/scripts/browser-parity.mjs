import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Presentation fixtures only: no requests reach a real backend or account.
const reference = new URL('../../web/dist/', import.meta.url);
function staticServer(root, strictCsp = false) { return createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = pathname.startsWith('/assets/') || pathname.startsWith('/_app/') ? pathname.slice(1) : 'index.html';
    if (file.includes('..')) throw new Error('Invalid path');
    const content = await readFile(new URL(file, root));
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    if (strictCsp) response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    response.writeHead(200, { 'Content-Type': type }); response.end(content);
  } catch { response.writeHead(404); response.end(); }
}); }
const server = staticServer(reference);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseline = `http://127.0.0.1:${server.address().port}`;
const production = process.argv.includes('--production');
const productionServer = production ? staticServer(new URL('../build/', import.meta.url), true) : null;
if (productionServer) await new Promise(resolve => productionServer.listen(0, '127.0.0.1', resolve));
const migrated = productionServer ? `http://127.0.0.1:${productionServer.address().port}` : process.env.FRONTEND_QA_URL || 'http://127.0.0.1:5173';
const out = new URL('../../scratch/frontend-sveltekit-qa/', import.meta.url);
await mkdir(out, { recursive: true });
const report = { limits: 'Mock API presentation only; no real authentication, permissions, OIDC or production validation.', cases: [] };
report.mode = production ? 'static build with strict Go-style CSP' : 'development';
const browser = await chromium.launch();
try {
  const smoke = process.argv.includes('--smoke');
  const sidebar = process.argv.includes('--sidebar');
  for (const role of smoke ? ['admin'] : ['admin', 'user']) for (const width of smoke ? [1440] : sidebar ? [390, 1440] : [320, 390, 768, 1440]) for (const theme of smoke ? ['dark'] : ['dark', 'light']) {
    const snapshots = [];
    for (const [name, base] of [['reference', baseline], ['svelte', migrated]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(({ theme }) => { if (!localStorage.getItem('qa_initialized')) { localStorage.setItem('jt_locale', 'fr'); localStorage.setItem('jt_theme', theme); localStorage.setItem('qa_initialized', 'true'); } }, { theme });
      await context.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        const json = path === '/api/auth/me' ? { username: 'QA', role, jellyfinUserId: 'qa-user', authServerIsPrimary: role !== 'user', authServerName: 'QA secours' }
          : path === '/api/navigation' ? { multiServer: true, wrappedVisible: true, appVersion: '3.0.0' } : {};
        if (path === '/api/search') return route.fulfill({ json: { media: [{ id: 'fixture-film', title: 'Film <QA>', subtitle: '2026', type: 'Movie' }], users: [{ id: 'fixture-person', username: 'Alice <QA>' }] } });
        return route.fulfill({ status: 200, json });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(base + '/about');
      await page.locator('.about-historical-features li').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const nav = await page.locator('#historical-nav a').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), text: node.textContent })));
      const headings = await page.locator('.about-historical h1, .about-historical h2').allTextContents();
      const features = await page.locator('.about-historical-features li').allTextContents();
      const boxes = await page.locator('.about-historical-card').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, width: r.width }; }));
      assert.deepEqual(errors, [], `${name} browser errors`);
      assert.equal(await page.locator('#app-root').count(), 1);
      assert.equal(await page.locator('#action-modal').count(), 1);
      await page.screenshot({ path: new URL(`${name}-${role}-${width}-${theme}.png`, out).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
      let controls;
      if (sidebar) {
        if (width < 768) await page.locator('#mobile-menu-btn').click();
        else {
          await page.locator('#sidebar-collapse-btn').click();
          await page.waitForFunction(() => document.getElementById('app-sidebar').classList.contains('collapsed'));
          await page.locator('#sidebar-search-trigger').focus();
          await page.locator('#navigation-tooltip').waitFor({ state: 'visible' });
        }
        await page.keyboard.press('/');
        await page.waitForFunction(() => document.activeElement?.id === 'nav-search-input');
        await page.locator('#nav-search-input').fill('Movie');
        await page.locator('#nav-search-results a').filter({ hasText: 'Film <QA>' }).waitFor();
        const results = await page.locator('#nav-search-results a').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), text: node.textContent })));
        assert.equal(results.length, 2);
        assert.equal(await page.locator('#nav-search-results img').count(), 0);
        await page.locator('#nav-search-clear').click();
        assert.equal(await page.locator('#nav-search-input').inputValue(), '');
        assert.equal(await page.locator('#nav-search-results').isVisible(), false);
        if (width >= 768) await page.locator('#sidebar-collapse-btn').click();
        if (width < 768) {
          await page.locator('#nav-version').focus();
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('brand-link')), true);
        }
        await page.locator('#language-trigger').focus();
        await page.keyboard.press('ArrowDown');
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-locale') === 'fr');
        await page.keyboard.press('Escape');
        if (width < 768) assert.equal(await page.locator('#mobile-menu-btn').getAttribute('aria-expanded'), 'false');
        else assert.equal(await page.evaluate(() => document.activeElement?.id), 'language-trigger');
        controls = { results, backup: await page.locator('#backup-server-banner').evaluate(node => ({ hidden: node.hidden, text: node.textContent.replace(/\s+/g, ' ').trim() })) };
      }
      // Exercise rerender/unmount, locale and theme changes on the converted page.
      if (width < 768 && !await page.locator('#app-sidebar').evaluate(node => node.classList.contains('mobile-open'))) await page.locator('#mobile-menu-btn').click();
      await page.locator('#btn-theme-toggle').click();
      await page.locator('.about-historical-features li').first().waitFor();
      assert.equal(await page.locator('html').evaluate(node => node.classList.contains('dark')), theme !== 'dark');
      if (width < 768 && !await page.locator('#app-sidebar').evaluate(node => node.classList.contains('mobile-open'))) await page.locator('#mobile-menu-btn').click();
      await page.locator('#language-trigger').click();
      await page.locator('[data-locale="en"]').click();
      await page.getByRole('heading', { name: 'Features', exact: true }).waitFor();
      assert.equal(await page.locator('.about-historical').count(), 1);
      await page.goto(base + '/about');
      await page.getByRole('heading', { name: 'Features', exact: true }).waitFor().catch(async error => {
        console.log(JSON.stringify({ name, errors, locale: await page.evaluate(() => localStorage.getItem('jt_locale')), body: await page.locator('body').innerText() }));
        throw error;
      });
      assert.deepEqual(errors, [], `${name} rerender errors`);
      if (width === 1440) {
        await page.goto(base + '/about?qa=history');
        await page.getByRole('heading', { name: 'Features', exact: true }).waitFor();
        await page.locator('#nav-version').click();
        await page.waitForURL(base + '/about');
        await page.goBack();
        await page.waitForURL(base + '/about?qa=history');
        await page.getByRole('heading', { name: 'Features', exact: true }).waitFor();
        await page.goForward();
        await page.waitForURL(base + '/about');
        await page.getByRole('heading', { name: 'Features', exact: true }).waitFor();
        assert.deepEqual(errors, [], `${name} history errors`);
      }
      snapshots.push({ nav, headings, features, boxes, ...(sidebar ? { controls } : {}) });
      await context.close();
    }
    assert.deepEqual(snapshots[1], snapshots[0], `${role}/${width}/${theme} presentation parity`);
    report.cases.push({ role, width, theme, passed: true });
    console.log(`PASS ${role} ${width} ${theme}`);
  }
} finally {
  await writeFile(new URL(process.argv.includes('--sidebar') ? 'results-sidebar.json' : production ? (process.argv.includes('--smoke') ? 'results-history.json' : 'results-production.json') : 'results.json', out), JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (productionServer) await new Promise(resolve => productionServer.close(resolve));
}
