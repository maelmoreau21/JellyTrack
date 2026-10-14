import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

// Controlled latency comparison only: no real account, database or provider.
const root = new URL('../../web/dist/', import.meta.url);
const oldApp = execFileSync('git', ['show', 'HEAD:web/dist/assets/app.js'], { encoding: 'utf8' });
let baseline = true;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = path.startsWith('/assets/') ? path.slice(1) : 'index.html';
    const data = baseline && file === 'assets/app.js' ? oldApp : await readFile(new URL(file, root));
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const results = [];
try {
  for (const original of [true, false]) {
    baseline = original;
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('jt_locale', 'fr'));
    const events = [];
    const delay = () => new Promise(resolve => setTimeout(resolve, 250));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/api/')) {
        events.push({ path, at: Date.now() });
        await delay();
        const json = path === '/api/auth/me' ? { username: 'QA', role: 'super_admin', jellyfinUserId: 'qa' }
          : path === '/api/navigation' ? { multiServer: false } : path === '/api/users' ? { items: [], total: 0 } : {};
        return route.fulfill({ json });
      }
      if (path.startsWith('/assets/messages/')) { events.push({ path, at: Date.now() }); await delay(); }
      if (path === '/assets/chart.min.js' || path === '/assets/users.js') { events.push({ path, at: Date.now() }); await delay(); }
      return route.continue();
    });
    const start = Date.now();
    await page.goto(base + '/about');
    await page.locator('.about-historical h1').waitFor();
    const startupMs = Date.now() - start;
    const navStart = Date.now();
    await page.locator('a[data-link][href="/users"]').first().click();
    await page.locator('#users-body[aria-busy="false"]').waitFor();
    const usersMs = Date.now() - navStart;
    assert.deepEqual(errors, []);
    if (!original) {
      assert.equal(events.filter(e => e.path === '/assets/messages/fr.json').length, 1);
      assert.equal(events.filter(e => e.path === '/assets/chart.min.js').length, 0);
      const locale = events.find(e => e.path === '/assets/messages/fr.json');
      const auth = events.find(e => e.path === '/api/auth/me');
      assert.ok(Math.abs(locale.at - auth.at) < 150, 'Locale and session should begin concurrently');
    }
    results.push({ mode: original ? 'before' : 'after', startupMs, usersMs, frenchRequests: events.filter(e => e.path === '/assets/messages/fr.json').length, chartRequests: events.filter(e => e.path === '/assets/chart.min.js').length });
    await context.close();
  }
  // Wall times are observations, not CI assertions: concurrent builds can
  // dominate CPU time. Assert the actual dependency graph and request counts.
  const dashboard = [];
  baseline = false;
  for (const multiServer of [false, true]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const events = [];
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      events.push({ path, at: Date.now() });
      if (path === '/api/settings/jellyfin-servers') await new Promise(resolve => setTimeout(resolve, 750));
      return route.fulfill({ json: path === '/api/auth/me' ? { username: 'QA', role: 'super_admin', jellyfinUserId: 'qa' }
        : path === '/api/navigation' ? { multiServer } : {} });
    });
    const requested = page.waitForResponse(response => new URL(response.url()).pathname === '/api/dashboard');
    await page.goto(base + '/');
    await requested;
    const filter = events.find(event => event.path === '/api/settings/jellyfin-servers');
    const data = events.find(event => event.path === '/api/dashboard');
    assert.equal(Boolean(filter), multiServer, 'Single-server dashboard must skip unused server options');
    if (filter) assert.ok(data.at - filter.at < 300, 'Dashboard data must not wait for slow server options');
    dashboard.push({ multiServer, serverOptionsRequests: filter ? 1 : 0, dataStartAfterOptionsMs: filter ? data.at - filter.at : null });
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  let cancelled = false;
  page.on('requestfailed', request => { if (new URL(request.url()).pathname === '/api/users') cancelled = true; });
  let releaseUsers;
  const usersRequested = new Promise(resolve => { releaseUsers = resolve; });
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/users') {
      releaseUsers();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    await route.fulfill({ json: path === '/api/auth/me' ? { username: 'QA', role: 'super_admin', jellyfinUserId: 'qa' }
      : path === '/api/navigation' ? { multiServer: false } : { items: [], total: 0 } }).catch(() => {});
  });
  await page.goto(base + '/users');
  await usersRequested;
  await page.locator('a[data-link][href="/about"]').first().click();
  await page.locator('.about-historical h1').waitFor();
  await page.waitForTimeout(600);
  assert.ok(cancelled, 'Changing route must abort the old page request');
  assert.equal(await page.locator('#users-body').count(), 0, 'Old page must not overwrite the new route');
  await context.close();
  console.log(JSON.stringify({ artificialLatencyMs: 250, results, dashboard, navigationCancellation: 'passed' }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
