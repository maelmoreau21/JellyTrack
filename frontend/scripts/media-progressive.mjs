import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

// Local browser contract: metadata delay never reaches a real provider/account.
const root = new URL('../../web/dist/', import.meta.url);
const oldMedia = execFileSync('git', ['show', 'HEAD:web/dist/assets/media-recovery.js'], { encoding: 'utf8' });
let historical = false;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = path.startsWith('/assets/') ? path.slice(1) : 'index.html';
    const content = historical && file === 'assets/media-recovery.js' ? oldMedia : await readFile(new URL(file, root));
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const item = { id: 'film', serverId: 'server-a', title: 'Film QA', type: 'Movie', totalPlays: 7, totalDurationMs: 3600000, durationMs: 7200000, historyPage: 1, historyPages: 1, history: [], telemetry: [], viewers: [], actors: ['Actor QA'], completion: [{ percent: 50, count: 3 }] };
const metadata = { id: 'film', metadataSource: 'jellyfin', overview: 'Description fournie tardivement', year: 2026, markers: [{ key: 'introEnd', positionMs: 60000 }], metadataAvailable: { peopleRoles: true, versions: true }, people: [{ name: 'Actor QA', role: 'Role QA' }], versions: [{ name: 'Original', container: 'mkv' }, { name: 'Mobile', container: 'mp4' }] };
const presentation = page => page.evaluate(() => Array.from(document.querySelectorAll('.mr-media-hero,.mr-cast-section,.mr-versions-section,.mr-completion-markers'), node => {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('[data-mr-image-wired]').forEach(image => image.removeAttribute('data-mr-image-wired'));
  return clone.outerHTML;
}));
let expectedPresentation;
try {
  for (const scenario of ['historical', 'enrichment', 'offline', 'navigation']) {
    historical = scenario === 'historical';
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => localStorage.setItem('jt_locale', 'fr'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let metadataCompleted = false, aborted = false, rotations = 0;
    page.on('requestfailed', request => { if (new URL(request.url()).pathname.startsWith('/api/media-metadata/')) aborted = true; });
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (path.startsWith('/api/media-metadata/')) {
        assert.equal(url.searchParams.get('servers'), 'server-a');
        await new Promise(resolve => setTimeout(resolve, 1000));
        metadataCompleted = true;
        return route.fulfill({ json: scenario === 'offline' ? { id: 'film', metadataAvailable: {} } : metadata }).catch(() => {});
      }
      if (path.endsWith('/poster-rotator/rotate')) rotations++;
      if (path === '/api/media/film') assert.equal(url.searchParams.has('metadata'), historical);
      return route.fulfill({ json: path === '/api/auth/me' ? { username: 'QA', role: 'super_admin', jellyfinUserId: 'qa' }
        : path === '/api/navigation' ? { multiServer: true }
        : path === '/api/media/film' ? historical ? { ...item, ...metadata } : item : { items: [], servers: [] } });
    });
    await page.goto(base + '/media/film?servers=server-a');
    await page.locator('.mr-stats').waitFor();
    if (historical) {
      await page.waitForTimeout(300);
      expectedPresentation = await presentation(page);
      assert.deepEqual(errors, []);
      await context.close();
      continue;
    }
    assert.equal(metadataCompleted, false, 'Statistics must appear before slow metadata finishes');
    await page.evaluate(() => {
      window.qaStats = document.querySelector('.mr-stats');
      window.qaChart = document.querySelector('#mr-completion');
      window.qaPoster = document.querySelector('.mr-hero-poster');
      window.qaExplorer = document.querySelector('.mr-timeline-explorer');
      window.qaExplorer.open = true;
    });
    if (scenario === 'navigation') {
      await page.locator('a[data-link][href="/about"]').first().click();
      await page.locator('.about-historical h1').waitFor();
      await page.waitForTimeout(1100);
      assert.ok(aborted, 'Navigation must abort metadata');
      assert.equal(await page.locator('.mr-media-hero').count(), 0);
    } else {
      if (scenario === 'enrichment') {
        await page.getByText(metadata.overview, { exact: true }).waitFor();
        assert.equal(await page.locator('.mr-cast-section').count(), 1);
        assert.equal(await page.locator('.mr-versions-section').count(), 1);
        assert.equal(await page.locator('.mr-completion-markers').count(), 1);
        assert.deepEqual(await presentation(page), expectedPresentation, 'Final presentation must match the historical metadata-rich detail');
        await page.locator('#mr-rotate').click();
        await page.waitForFunction(() => !document.querySelector('#mr-rotate').disabled);
        assert.equal(rotations, 1, 'Retained poster rotation action must still work');
        await page.locator('.mr-cast-person').click();
        await page.locator('#mr-person-results').waitFor();
        await page.locator('#action-modal-cancel').click();
      } else await page.waitForTimeout(1100);
      assert.equal(await page.evaluate(() => window.qaStats === document.querySelector('.mr-stats') && window.qaChart === document.querySelector('#mr-completion') && window.qaPoster === document.querySelector('.mr-hero-poster') && window.qaExplorer === document.querySelector('.mr-timeline-explorer') && window.qaExplorer.open), true, 'Statistics, charts, poster action and expanded timeline must survive enrichment');
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS media progressive ${scenario}`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
