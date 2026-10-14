import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const baseline = execFileSync('git', ['show', 'HEAD:web/dist/assets/history.js'], { encoding: 'utf8' });
const current = await readFile(new URL('../../web/dist/assets/history.js', import.meta.url), 'utf8');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/html');
  res.end(req.url === '/before.js' ? baseline : req.url === '/after.js' ? current : '<main id="fixture"></main>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
const results = [];
try {
  for (const mode of ['before', 'after']) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/logs`);
    await page.addScriptTag({ url: `/${mode}.js` });
    const measurement = await page.evaluate(async () => {
      window.JellyTrackNavigation = { icon: () => '' };
      const items = Array.from({ length: 50 }, (_, i) => ({
        id: `p${i}`, serverId: 's', userId: 'u', username: 'User', mediaId: `m${i}`, title: `Movie ${i}`,
        type: 'Movie', startedAt: '2026-10-14T10:00:00Z', endedAt: '2026-10-14T11:00:00Z',
        durationMs: 3600000, mediaDurationMs: 7200000, playMethod: 'DirectPlay',
        telemetryEvents: Array.from({ length: 200 }, (_, j) => ({ eventType: 'Pause', positionMs: j * 1000, createdAt: '2026-10-14T10:01:00Z', metadata: {} })),
      }));
      const started = performance.now();
      await window.JellyTrackHistory.mount({
        main: document.querySelector('main'), signal: new AbortController().signal,
        user: { role: 'user' }, navigation: { multiServer: false }, i18n: { t: key => key },
        api: { request: async () => Response.json({ items, total: 100000 }) },
        utils: { formatMs: String, formatDateTime: String, escapeHtml: value => {
          const span = document.createElement('span'); span.textContent = String(value); return span.innerHTML;
        } },
      });
      return { renderMs: performance.now() - started, nodes: document.querySelectorAll('*').length,
        prebuiltTimelines: [...document.querySelectorAll('[data-expanded] td')].filter(cell => cell.innerHTML).length };
    });
    if (mode === 'after') assert.equal(measurement.prebuiltTimelines, 0);
    await page.locator('[data-expand="0"]').click();
    assert.equal(await page.locator('[data-expanded="0"]').evaluate(row => row.hidden), false);
    const timeline = await page.locator('[data-expanded="0"] td').innerHTML();
    assert.ok(timeline.length > 100);
    await page.locator('[data-expand="0"]').click();
    assert.equal(await page.locator('[data-expanded="0"]').evaluate(row => row.hidden), true);
    await page.locator('[data-expand="0"]').click();
    assert.equal(await page.locator('[data-expanded="0"] td').innerHTML(), timeline);
    await page.locator('[data-session="1"]').press('Enter');
    await page.locator('dialog[open]').waitFor();
    results.push({ mode, ...measurement, timeline });
    await page.close();
  }
  assert.equal(results[1].timeline, results[0].timeline, 'Expanded timeline must retain historical markup');
  assert.ok(results[1].nodes < results[0].nodes);
  console.log(JSON.stringify({ sessions: 50, eventsPerSession: 200, results: results.map(({ timeline, ...result }) => result) }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
