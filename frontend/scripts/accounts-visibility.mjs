import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Browser fixtures only; no real accounts, identity provider or backend calls.
const assets = new URL('../../web/dist/assets/', import.meta.url);
const accounts = await readFile(new URL('accounts.js', assets), 'utf8');
const navigation = await readFile(new URL('navigation.js', assets), 'utf8');
const profile = await readFile(new URL('profile.js', assets), 'utf8');
const browser = await chromium.launch();
let checks = 0;
try {
  for (const multiServer of [false, true]) for (const role of ['user', 'server_admin', 'admin']) {
    const page = await browser.newPage();
    await page.setContent('<aside id="app-sidebar"></aside><span id="mobile-brand-logo"></span><button id="wrapped-close-btn"></button><main></main><div id="profile"></div>');
    await page.addScriptTag({ content: accounts });
    await page.addScriptTag({ content: navigation });
    await page.addScriptTag({ content: profile });
    await page.evaluate(async ({ multiServer, role }) => {
      const user = { jellyfinUserId: 'fixture-user', username: 'Fixture', role, isAdmin: role === 'admin' };
      const context = { multiServer, wrappedVisible: true };
      window.calls = [];
      const API = {
        getJSON: async url => { window.calls.push(url); return { accounts: [{ id: 'fixture', username: 'Fixture', serverName: 'Fixture server', current: true }], servers: [{ name: 'Fixture server', users: 1, media: 2, plays: 3 }] }; },
        postJSON: async url => { window.calls.push(url); return { code: 'fixture-code', expiresIn: 1 }; }
      };
      window.JellyTrackNavigation.init({ user: () => user, context: () => context, t: key => key, escape: value => String(value), locale: () => 'fr' });
      window.JellyTrackNavigation.render();
      await window.AccountsUI.render(document.querySelector('main'), { API, State: { user, navigation: context, pageController: new AbortController(), pageCleanups: [] } });
      await window.ProfileUI.render(document.querySelector('#profile'), 'me', {
        API: { getJSON: async () => ({ username: 'Fixture', jellyfinUserId: 'fixture-user', stats: {}, charts: {}, activity: [], history: { items: [], total: 0, totalPages: 1, page: 1 } }) },
        State: { user, navigation: context, pageController: new AbortController(), pageCleanups: [] },
        Utils: { escapeHtml: value => String(value), formatNumber: value => String(value), formatDateTime: value => String(value), formatMs: value => String(value) },
        I18n: { t: () => '' }, Router: {}, Toast: {}
      });
    }, { multiServer, role });
    assert.equal(await page.locator('nav a[href="/accounts"]').count(), multiServer || role === 'server_admin' ? 1 : 0);
    assert.equal(await page.locator('main form').count(), multiServer ? 1 : 0);
    assert.equal(await page.locator('main output').count(), multiServer ? 1 : 0);
    assert.equal(await page.locator('main a[href*="combined=1"]').count(), multiServer ? 1 : 0);
    assert.equal((await page.evaluate(() => window.calls)).some(url => url.startsWith('/api/me/accounts')), multiServer);
    assert.equal(await page.locator('#profile a[href="/accounts"]').count(), multiServer && role !== 'admin' ? 1 : 0);
    if (role === 'server_admin') {
      await page.getByRole('button', { name: 'Synchroniser mon serveur' }).click();
      assert.ok((await page.evaluate(() => window.calls)).includes('/api/me/server/sync'));
    }
    checks++;
    await page.close();
  }
  console.log(`${checks} account visibility scenarios passed (single/multi server and user/server/global admin).`);
} finally {
  await browser.close();
}
