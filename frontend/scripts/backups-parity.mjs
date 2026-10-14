import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

function serve(root) {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const file = pathname.startsWith('/assets/') || pathname.startsWith('/_app/') ? pathname.slice(1) : 'index.html';
      if (file.includes('..')) throw new Error('Invalid path');
      const data = await readFile(new URL(file, root));
      const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      response.writeHead(200, { 'Content-Type': type }); response.end(data);
    } catch { response.writeHead(404); response.end(); }
  });
}
const servers = [serve(new URL('../../web/dist/', import.meta.url)), serve(new URL('../build/', import.meta.url))];
for (const server of servers) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const output = new URL('../../scratch/frontend-sveltekit-backups-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const cases = [];
try {
  for (const width of [390, 1440]) for (const theme of ['dark', 'light']) for (const empty of [false, true]) {
    const snapshots = [];
    for (const [index, server] of servers.entries()) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/Paris' });
      await context.addInitScript(theme => { localStorage.setItem('jt_theme', theme); localStorage.setItem('jt_locale', 'fr'); }, theme);
      const calls = [];
      let failMutation = false;
      let list = empty ? [] : [{ name: 'JellyTrack-auto-2026-10-14.zip', date: '2026-10-14T10:00:00Z', sizeMb: 1.25, type: 'auto' }, { name: 'Manuel <QA>.jtb', date: '2026-10-13T10:00:00Z', sizeMb: 2, type: 'manual' }];
      await context.route('**/api/**', route => {
        const request = route.request(); const path = new URL(request.url()).pathname;
        if (request.method() !== 'GET') {
          calls.push({ path, body: request.postData(), csrf: request.headers()['x-csrf-token'] });
          if (failMutation) return route.fulfill({ status: 400, json: { error: 'Sauvegarde de test refusée.' } });
          if (path.endsWith('/delete')) list = list.filter(entry => entry.name !== request.postDataJSON().fileName);
          if (path.endsWith('/trigger')) list = [...list, { name: 'Nouvelle.zip', date: '2026-10-14T11:00:00Z', sizeMb: 1, type: 'manual' }];
          return route.fulfill({ json: { success: true } });
        }
        const json = path === '/api/auth/me' ? { username: 'QA', role: 'super_admin', csrfToken: 'fixture-csrf' }
          : path === '/api/navigation' ? { multiServer: false, wrappedVisible: true, appVersion: '3.0.0' }
          : path === '/api/backup/auto' ? { backups: list } : {};
        return route.fulfill({ json });
      });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(`http://127.0.0.1:${server.address().port}/settings/dataBackups`);
      await page.locator('.settings-backups').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: '*,*::before,*::after { animation:none!important; transition:none!important; caret-color:transparent!important; }' });
      const snapshot = await page.locator('.jt-settings').evaluate(root => ({
        text: root.textContent.replace(/\s+/g, ' ').trim(),
        links: [...root.querySelectorAll('a')].map(a => [a.getAttribute('href'), a.textContent.trim()]),
        boxes: [...root.querySelectorAll('.settings-card,.settings-summary,.settings-section,.settings-import')].map(node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })
      }));
      // Text-node whitespace can differ while the rendered labels remain equal.
      snapshot.text = await page.locator('.jt-settings h2,.jt-settings h3,.jt-settings p,.jt-settings small,.jt-settings strong,.jt-settings td,.jt-settings button').allTextContents();
      snapshot.text = snapshot.text.map(text => text.replace(/\s+/g, ' ').trim());
      snapshots.push(snapshot);
      const capture = `${index ? 'svelte' : 'reference'}-${width}-${theme}-${empty ? 'empty' : 'rows'}.png`;
      await page.screenshot({ path: fileURLToPath(new URL(capture, output)), fullPage: true });
      assert.equal(await page.locator('.settings-filename img').count(), 0);
      failMutation = true;
      await page.locator('[data-action="backup-now"]').click();
      await page.getByRole('alert').filter({ hasText: 'Sauvegarde de test refusée.' }).waitFor();
      assert.equal(await page.locator('[data-action="backup-now"]').isEnabled(), true);
      if (!empty) {
        await page.locator('[data-action="backup-restore"]').first().click();
        assert.deepEqual(JSON.parse(calls.at(-1).body), { fileName: list[0].name });
        assert.equal(calls.at(-1).csrf, 'fixture-csrf');
      }
      await page.locator('input[name="backupFile"]').setInputFiles({ name: 'fixture.jtb', mimeType: 'application/octet-stream', buffer: Buffer.from('encrypted-fixture') });
      await page.locator('.settings-import-submit').click();
      await page.waitForFunction(() => !document.querySelector('.settings-import-submit').disabled);
      assert.equal(calls.at(-1).path, '/api/backup/import');
      assert.equal(calls.at(-1).body, 'encrypted-fixture');
      assert.equal(calls.at(-1).csrf, 'fixture-csrf');
      failMutation = false;
      await page.locator('[data-action="backup-now"]').click();
      await page.locator('.settings-filename').filter({ hasText: 'Nouvelle.zip' }).waitFor();
      await page.locator('[data-action="backup-delete"][data-name="Nouvelle.zip"]').click();
      await page.locator('.settings-filename').filter({ hasText: 'Nouvelle.zip' }).waitFor({ state: 'detached' });
      if (width < 768) await page.locator('#mobile-menu-btn').click();
      await page.locator('#nav-version').click();
      await page.locator('.about-historical').waitFor();
      assert.equal(await page.locator('.settings-backups').count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    }
    assert.deepEqual(snapshots[1], snapshots[0], `${width}/${theme}/${empty} backups parity`);
    cases.push({ width, theme, empty, passed: true });
    console.log(`PASS backups ${width} ${theme} ${empty ? 'empty' : 'rows'}`);
  }
} finally {
  await writeFile(new URL('results.json', output), JSON.stringify({ limits: 'Mock API, no real restore or production provider.', cases }, null, 2));
  await browser.close();
  for (const server of servers) await new Promise(resolve => server.close(resolve));
}
