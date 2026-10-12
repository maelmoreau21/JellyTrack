const fs = require('fs');
const { chromium } = require('C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const html = fs.readFileSync('web/dist/index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '');
    await page.setContent(html);
    await page.addScriptTag({ path: 'web/dist/assets/navigation.js' });
    await page.addScriptTag({ path: 'web/dist/assets/profile.js' });
    const messages = JSON.parse(fs.readFileSync('web/dist/assets/messages/fr.json', 'utf8'));
    await page.evaluate(messages => {
      window.t = key => key.split('.').reduce((value, part) => value?.[part], messages) || '';
      window.escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
      window.account = { username: 'Admin <local>', isAdmin: true, jellyfinUserId: 'local-admin' };
      JellyTrackNavigation.init({ user: () => account, context: () => ({ wrappedVisible: true }), escape, t, locale: () => 'fr', getJSON: async () => ({}), changeLocale: async () => {} });
    }, messages);
    for (const user of [
      { username: 'Local', isAdmin: true, jellyfinUserId: 'local-admin' },
      { username: 'SSO', isAdmin: true, jellyfinUserId: 'oidc-subject' },
      { username: 'Jellyfin', isAdmin: false, jellyfinUserId: 'jf-user' },
      { username: 'SSO', isAdmin: false, jellyfinUserId: 'oidc-subject' },
    ]) {
      await page.evaluate(user => { window.account = user; JellyTrackNavigation.render(); }, user);
      if (await page.locator('#historical-nav a[href="/users/me"]').count() !== 1) throw Error('Missing profile: ' + user.username);
      if (await page.locator('#historical-nav a[href="/users/me"]').getAttribute('aria-label') !== 'Mon Profil') throw Error('Incorrect profile label');
      if (!user.isAdmin && await page.locator('#historical-nav a[href="/settings"]').count()) throw Error('Admin link leaked');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => JellyTrackNavigation.render());
    if (await page.locator('#historical-nav a[href="/users/me"]').count() !== 1) throw Error('Mobile profile missing');
    await page.evaluate(async () => {
      window.requests = 0;
      await ProfileUI.render(document.getElementById('app-main'), 'me', {
        API: { getJSON: async () => { requests++; throw Error('Local profile must not request playback data'); } },
        State: { user: { username: 'Admin <local>', isAdmin: true, jellyfinUserId: 'local-admin' } },
        Utils: { escapeHtml: escape }, I18n: { t }, Router: {}, Toast: {},
      });
    });
    if (await page.evaluate(() => requests) !== 0) throw Error('Local admin fabricated a Jellyfin profile');
    if (!(await page.locator('#app-main').innerText()).includes('Compte administrateur local')) throw Error('Local account explanation missing');
    if (!(await page.locator('#app-main').innerText()).includes('Admin <local>')) throw Error('Username not escaped');
    if (errors.length) throw Error(errors.join('\n'));
    console.log('PASS: profile navigation for local/Jellyfin/SSO, admin/user, mobile, local account and escaping.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
