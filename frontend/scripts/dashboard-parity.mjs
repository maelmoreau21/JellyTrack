import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const fixture = {
  totalPlays: 2500, views: 2500, hoursWatched: 120, totalUsers: 40,
  playsGrowth: 12.5, previousPlays: 2200, hoursGrowth: -5.2, previousHoursWatched: 130,
  currentActiveUsers: 18, previousActiveUsers: 20, activeUsersGrowth: -10, directPlayPercent: 92,
  todayPlays: 1250, todayHours: '42.5', todayActiveUsers: 12,
  breakdown: { movieViews: 1000, movieHours: 60, seriesViews: 1200, seriesHours: 45, musicViews: 280, musicHours: 10, booksViews: 20, booksHours: 5 },
  trendData: [], categoryPieData: [], hourlyChartData: [], dayOfWeekChartData: [], platformChartData: [],
  topUsers: [], monthlyWatchData: [], completionData: [], clientCategoryData: [], serverLoadData: [], serverActivity: [],
  yearlyHeatmap: { dataByType: {}, availableYears: [2026], libraryTypes: [] }
};
function serve(root, csp = false) {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const file = pathname.startsWith('/assets/') || pathname.startsWith('/_app/') ? pathname.slice(1) : 'index.html';
      if (file.includes('..')) throw Error('Invalid path');
      const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      if (csp) response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      response.writeHead(200, { 'Content-Type': type }); response.end(await readFile(new URL(file, root)));
    } catch { response.writeHead(404); response.end(); }
  });
}
const reference = serve(new URL('../../web/dist/', import.meta.url));
const production = process.argv.includes('--production');
const widgets = process.argv.includes('--widgets');
const built = production ? serve(new URL('../build/', import.meta.url), true) : null;
for (const server of [reference, built].filter(Boolean)) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = server => `http://127.0.0.1:${server.address().port}`;
const out = new URL(widgets ? '../../scratch/frontend-sveltekit-widget-qa/' : '../../scratch/frontend-sveltekit-dashboard-qa/', import.meta.url);
await mkdir(out, { recursive: true });
for (const name of await readdir(out)) if (name.endsWith('.png') || name.endsWith('.json')) await unlink(new URL(name, out));
const report = { mode: production ? 'static build with strict CSP' : 'development', limits: 'API and live event fixtures; no provider or production validation. Charts and analytics retain legacy controllers.', cases: [] };
const browser = await chromium.launch();
try {
  for (const width of [390, 1440]) for (const theme of ['dark', 'light']) for (const locale of ['fr', 'en']) {
    const snapshots = [];
    for (const [name, url] of [['reference', base(reference)], ['svelte', built ? base(built) : process.env.FRONTEND_QA_URL || 'http://127.0.0.1:5173']]) {
      const streams = widgets ? Array.from({ length: width === 390 ? theme === 'dark' ? 0 : 1 : theme === 'dark' ? 3 : 4 }, (_, index) => ({
        sessionId: `fixture-session-${index}`, serverId: index % 2 ? 'server-b' : 'server-a', serverName: index % 2 ? 'Serveur B' : 'Serveur A', serverStatus: 'online',
        user: `Alice ${index}`, mediaTitle: `Film <QA> ${index}`, itemId: `fixture-item-${index}`, mediaId: `fixture-media-${index}`, posterItemId: `fixture-poster-${index}`,
        mediaType: index === 0 ? 'Episode' : index === 1 ? 'Audio' : 'Movie', progressPercent: 35 + index * 12, isPaused: index === 1,
        playMethod: index % 2 ? 'Transcode' : 'DirectPlay', audioCodec: 'aac', audioLanguage: 'fr', subtitleCodec: 'srt', subtitleLanguage: 'en',
        transcodingSpeed: 1.3, videoCodec: 'h264', resolution: '1080p', clientName: 'QA Player', device: 'QA Device', city: 'Paris', country: 'FR'
      })) : [];
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(({ theme, locale }) => {
        if (!localStorage.getItem('qa_initialized')) { localStorage.setItem('jt_theme', theme); localStorage.setItem('jt_locale', locale); localStorage.setItem('qa_initialized', 'true'); }
        // Live provider behavior is outside this presentation test.
        window.EventSource = class extends EventTarget { close() {} };
      }, { theme, locale });
      const requests = [];
      await context.route('**/api/**', async route => {
        const target = new URL(route.request().url());
        let json = {};
        if (target.pathname === '/api/auth/me') json = { username: 'QA', role: 'admin', jellyfinUserId: 'local-admin', csrfToken: 'fixture-csrf' };
        else if (target.pathname === '/api/navigation') json = { multiServer: true, appVersion: '3.0.0' };
        else if (target.pathname === '/api/settings/jellyfin-servers') json = { servers: [{ id: 'server-a', name: 'Serveur A' }, { id: 'server-b', name: 'Serveur B' }] };
        else if (target.pathname === '/api/dashboard') {
          requests.push(Object.fromEntries(target.searchParams)); json = fixture;
          if (widgets) await context.pages()[0].evaluate(() => {
            // The old controller supports this hook but exposes no visible toggle.
            if (!document.getElementById('btn-toggle-live-view')) {
              const hook = document.createElement('button'); hook.id = 'btn-toggle-live-view'; hook.hidden = true;
              document.getElementById('dash-time-select').parentElement.appendChild(hook);
            }
          });
        }
        else if (target.pathname === '/api/streams') json = { streams, totalBandwidthMbps: 18.5, bandwidthKnown: locale === 'fr' };
        else if (widgets && target.pathname === '/api/admin/health') json = {
          status: { monitor: { status: locale === 'fr' ? 'ok' : 'error', lastPollAt: '2026-10-01T00:00:00Z' }, sync: { lastSuccessAt: '2026-10-01T00:00:00Z' }, backup: { lastSuccessAt: null } },
          counts: { activeStreams: 5, openPlaybackOrphans: 2, dbStreamsWithoutValkey: 1 }, excludedLibraries: ['fixture-a', 'fixture-b'], isValkeyEnabled: locale === 'fr'
        };
        else if (widgets && target.pathname === '/api/hardware') {
          // Explicit fixture-only target: the delivered Go dashboard has no hardware slot.
          await context.pages()[0].evaluate(() => {
            if (!document.getElementById('dash-hardware-container')) {
              const target = document.createElement('div'); target.id = 'dash-hardware-container';
              document.getElementById('app-main').appendChild(target);
            }
          });
          json = { cpu: { usagePercent: locale === 'fr' ? 37.5 : null }, memory: { allocMb: 128.125 }, temperature: { main: locale === 'fr' ? 58 : 0 } };
        }
        else if (widgets && target.pathname === '/api/jellyfin/image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160"><rect width="120" height="160" fill="#334155"/></svg>' });
        else if (target.pathname === '/api/predictions') json = { predictions: [], insights: [], recommendations: [] };
        return route.fulfill({ json });
      });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(url + '/');
      await page.locator('.stat-grid-5 .stat-card-modern').first().waitFor();
      await page.waitForFunction(() => document.getElementById('today-plays-val')?.textContent !== '0');
      await page.evaluate(() => document.fonts.ready);
      if (widgets) {
        await page.locator('#dash-hardware-container .hardware-card').first().waitFor();
        await page.locator('#dash-live-streams-body').waitFor();
        await page.waitForFunction(() => !document.querySelector('#dash-live-streams-body .skeleton'));
        await page.locator('#dash-live-streams-body').getByText('Chargement des flux...', { exact: true }).waitFor({ state: 'hidden' });
        for (const [label, selector] of [['health','#dash-system-health-container'],['hardware','#dash-hardware-container'],['live','#dash-live-streams-body']]) {
          await page.locator(selector).screenshot({ path: fileURLToPath(new URL(`${name}-${width}-${theme}-${locale}-${label}.png`, out)), animations: 'disabled' });
        }
        assert.equal(await page.locator('#dash-system-health-container .stat-card-modern').count(), locale === 'fr' ? 4 : 3);
        assert.equal(await page.locator('#dash-live-streams-body [data-stream-action="kill"]').count(), streams.length);
        if (streams.length >= 3) {
          await page.locator('#btn-toggle-live-view').evaluate(node => node.click());
          await page.locator('#dash-live-streams-body .stream-card').first().waitFor();
          await page.locator('#dash-live-streams-body').screenshot({ path: fileURLToPath(new URL(`${name}-${width}-${theme}-${locale}-live-cards.png`, out)), animations: 'disabled' });
          assert.equal(await page.locator('#dash-live-streams-body .stream-card').count(), streams.length);
          await page.locator('#btn-toggle-live-view').evaluate(node => node.click());
        }
        if (streams.length) {
          const action = page.locator('#dash-live-streams-body [data-stream-action="message"]').first();
          assert.equal(await action.getAttribute('data-server-id'), 'server-a');
          await action.click();
          await page.locator('#send-msg-text').waitFor();
          await page.locator('#action-modal-cancel').click();
        }
      }
      const snapshot = await page.evaluate(() => {
        const kpi = document.querySelector('[data-block-id="0"]');
        const normalize = value => value.replace(/\s+/g, ' ').trim();
        return {
          title: document.querySelector('.dashboard-header').innerText,
          banner: normalize(document.querySelector('.dashboard-banner').innerText),
          cards: [...kpi.querySelectorAll('.stat-card-modern')].map(node => { const r = node.getBoundingClientRect(); return { text: normalize(node.innerText), href: node.getAttribute('href'), x: r.x, width: r.width, height: r.height }; }),
          icons: [...kpi.querySelectorAll('svg path, svg polygon, svg rect, svg line, svg circle, svg polyline')].map(node => node.outerHTML),
          order: [...document.querySelectorAll('.draggable-block-wrapper')].map(node => node.dataset.blockId)
        };
      });
      // Compare resting presentation, not different points in entry animations.
      await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}-${theme}-${locale}.png`, out)), fullPage: true, animations: 'disabled' });
      await page.locator('#dash-time-select').selectOption('30d');
      await page.waitForFunction(() => new URL(location.href).searchParams.get('timeRange') === '30d');
      await page.waitForFunction(() => document.querySelector('[data-block-id="0"] a')?.getAttribute('href')?.includes('days=30'));
      assert.equal(requests.at(-1).timeRange, '30d');
      await page.locator('#dash-media-filter [data-type="Movie"]').click();
      await page.waitForFunction(() => new URL(location.href).searchParams.has('excludeTypes'));
      await page.waitForFunction(() => document.querySelector('[data-block-id="0"] a')?.getAttribute('href')?.includes('excludeTypes='));
      assert.equal(requests.at(-1).excludeTypes, 'Series,MusicAlbum,Book');
      await page.locator('#dash-server-filter-container [data-server-id="server-a"]').click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get('servers') === 'server-a');
      await page.waitForFunction(() => document.querySelector('[data-block-id="0"] a')?.getAttribute('href')?.includes('servers=server-a'));
      assert.equal(requests.at(-1).servers, 'server-a');
      if (width === 1440 && theme === 'dark' && locale === 'fr') {
        await page.locator('#dash-time-select').selectOption('custom');
        await page.locator('#dash-custom-from').fill('2026-01-01');
        await page.locator('#dash-custom-to').fill('2026-02-01');
        await page.locator('#action-modal-confirm').click();
        await page.waitForFunction(() => new URL(location.href).searchParams.get('from') === '2026-01-01');
        await page.waitForFunction(() => document.querySelector('[data-block-id="0"] a')?.getAttribute('href')?.includes('dateFrom=2026-01-01'));
        assert.equal(requests.at(-1).timeRange, 'custom');
        assert.equal(requests.at(-1).to, '2026-02-01');
        for (const tab of ['analytics', 'network', 'overview']) {
          await page.locator(`#dashboard-tablist [data-tab="${tab}"]`).click();
          await page.locator(`#tab-content-${tab}`).waitFor({ state: 'visible' });
          assert.equal(await page.locator(`#dashboard-tablist [data-tab="${tab}"]`).evaluate(node => node.classList.contains('active')), true);
        }
      }
      await page.locator('#btn-toggle-draggable-edit').click();
      await page.locator('[data-block-id="0"] [data-action="down"]').click();
      await page.waitForFunction(() => document.querySelector('.draggable-block-wrapper')?.getAttribute('data-block-id') === '1');
      assert.equal(await page.locator('.stat-grid-5').count(), 1);
      await page.locator('#nav-version').evaluate(node => node.click());
      await page.locator('.about-historical').waitFor();
      assert.equal(await page.locator('.stat-grid-5').count(), 0);
      await page.goBack();
      await page.locator('.stat-grid-5').waitFor();
      assert.equal(await page.locator('.stat-grid-5').count(), 1);
      assert.deepEqual(errors, [], `${name} browser errors`);
      snapshots.push(snapshot); await context.close();
    }
    assert.deepEqual(snapshots[1], snapshots[0], `${width}/${theme}/${locale} dashboard parity`);
    report.cases.push({ width, theme, locale, ...(widgets ? { widgets: true, hardwareTarget: 'fixture injected only' } : {}), passed: true }); console.log(`PASS dashboard ${width} ${theme} ${locale}`);
  }
} finally {
  await writeFile(new URL(production ? 'results-production.json' : 'results.json', out), JSON.stringify(report, null, 2));
  await browser.close();
  for (const server of [reference, built].filter(Boolean)) await new Promise(resolve => server.close(resolve));
}
