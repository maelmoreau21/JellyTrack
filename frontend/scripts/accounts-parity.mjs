import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { serveStatic } from './qa-static.mjs';
const servers = [serveStatic(new URL('../../web/dist/', import.meta.url)), serveStatic(new URL('../build/', import.meta.url))];
for (const server of servers) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const output = new URL('../../scratch/frontend-sveltekit-accounts-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch(); const cases = [];
try {
  for (const width of [390, 1440]) for (const theme of ['dark', 'light']) for (const multiServer of [false, true]) for (const role of ['user', 'server_admin']) {
    const snapshots = [];
    for (const [index, server] of servers.entries()) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(theme => { localStorage.setItem('jt_locale', 'fr'); localStorage.setItem('jt_theme', theme); }, theme);
      let accounts = [{ id: 'a', username: 'Alice <QA>', serverName: 'Serveur A', current: true }, { id: 'b', username: 'Bob', serverName: 'Serveur B' }];
      const calls = []; let fail = false;
      await context.route('**/api/**', route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (request.method() !== 'GET') {
          calls.push({ path, method: request.method(), body: request.postData(), csrf: request.headers()['x-csrf-token'] });
          if (fail) return route.fulfill({ status: 403, json: { error: 'Action de test refusée.' } });
          if (request.method() === 'DELETE') accounts = accounts.filter(account => !path.endsWith('/' + account.id));
          return route.fulfill({ json: { code: 'fixture-personal-code', expiresIn: 300, success: true } });
        }
        return route.fulfill({ json: path === '/api/auth/me' ? { username: 'Alice', role, jellyfinUserId: 'jf-a', authServerId: 'a', csrfToken: 'fixture-csrf' }
          : path === '/api/navigation' ? { multiServer, wrappedVisible: true, appVersion: '3.0.0' }
          : path === '/api/me/accounts' ? { accounts }
          : path === '/api/me/server' ? { servers: [{ name: 'Serveur A', users: 2, media: 3, plays: 4 }] } : {} });
      });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/accounts`);
      await page.getByRole('heading', { name: 'Mes comptes Jellyfin' }).waitFor();
      if (multiServer) await page.getByText('Alice <QA> — Serveur A (session courante)', { exact: true }).waitFor();
      if (role === 'server_admin') await page.getByText('Serveur A : 2 utilisateurs, 3 médias, 4 lectures', { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: '*,*::before,*::after { animation:none!important; transition:none!important; caret-color:transparent!important; }' });
      snapshots.push(await page.locator('#app-main').evaluate(root => ({ text: root.textContent.replace(/\s+/g, ' ').trim(), labels: [...root.querySelectorAll('button,a,summary,label')].map(node => node.textContent.trim()), boxes: [...root.querySelectorAll('section,details,form')].map(node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }) })));
      snapshots.at(-1).text = await page.locator('#app-main h1,#app-main h2,#app-main p,#app-main li').allTextContents();
      await page.screenshot({ path: fileURLToPath(new URL(`${index ? 'svelte' : 'reference'}-${width}-${theme}-${multiServer}-${role}.png`, output)), fullPage: true });
      assert.equal(await page.locator('#app-main img').count(), 0);
      assert.equal(await page.locator('#app-main form').count(), multiServer ? 1 : 0);
      if (multiServer) {
        await page.getByRole('button', { name: 'Générer un code pour ce compte' }).click();
        await page.locator('output').filter({ hasText: 'fixture-personal-code' }).waitFor();
        await page.locator('#app-main input').fill('  link-fixture  ');
        await page.getByRole('button', { name: 'Associer mon compte' }).click();
        await page.getByRole('status').filter({ hasText: 'Compte associé.' }).waitFor();
        assert.deepEqual(JSON.parse(calls.at(-1).body), { code: 'link-fixture' });
        assert.equal(calls.at(-1).csrf, 'fixture-csrf');
        await page.getByRole('button', { name: 'Dissocier' }).last().click();
        await page.getByRole('status').filter({ hasText: 'Compte dissocié.' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Dissocier' }).count(), 0);
        fail = true;
        await page.getByRole('button', { name: 'Générer un code pour ce compte' }).click();
        await page.getByRole('status').filter({ hasText: 'Action de test refusée.' }).waitFor();
      }
      if (role === 'server_admin') {
        fail = false;
        await page.getByRole('button', { name: 'Synchroniser mon serveur' }).click();
        await page.getByRole('status').filter({ hasText: 'Synchronisation terminée.' }).waitFor();
        assert.equal(calls.at(-1).path, '/api/me/server/sync');
      }
      if (width < 768) await page.locator('#mobile-menu-btn').click();
      await page.locator('#nav-version').click(); await page.locator('.about-historical').waitFor();
      assert.equal(await page.locator('#app-main output').count(), 0);
      assert.deepEqual(errors, []); await context.close();
    }
    assert.deepEqual(snapshots[1], snapshots[0], `${width}/${theme}/${multiServer}/${role}`);
    cases.push({ width, theme, multiServer, role, passed: true });
    console.log(`PASS accounts ${width} ${theme} ${multiServer} ${role}`);
  }
} finally {
  await writeFile(new URL('results.json', output), JSON.stringify({ limits: 'Mock API only; authorization remains verified by Go tests.', cases }, null, 2));
  await browser.close(); for (const server of servers) await new Promise(resolve => server.close(resolve));
}
