import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Local presentation and API contracts only. No provider, account or deployment is contacted.
const reference = new URL('../../web/dist/', import.meta.url);
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = pathname.startsWith('/assets/') ? pathname.slice(1) : 'index.html';
    if (file.includes('..')) throw new Error('Invalid path');
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type }); response.end(await readFile(new URL(file, reference)));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseline = `http://127.0.0.1:${server.address().port}`;
const production = process.argv.includes('--production');
const built = production ? createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = pathname.startsWith('/assets/') || pathname.startsWith('/_app/') ? pathname.slice(1) : 'index.html';
    if (file.includes('..')) throw new Error('Invalid path');
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    const data = await readFile(new URL(file, new URL('../build/', import.meta.url)));
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    response.writeHead(200, { 'Content-Type': type }); response.end(data);
  } catch { response.writeHead(404); response.end(); }
}) : null;
if (built) await new Promise(resolve => built.listen(0, '127.0.0.1', resolve));
const migrated = built ? `http://127.0.0.1:${built.address().port}` : process.env.FRONTEND_QA_URL || 'http://127.0.0.1:5173';
const out = new URL('../../scratch/frontend-sveltekit-login-qa/', import.meta.url);
await mkdir(out, { recursive: true });
const report = { limits: 'Mock API only; no real authentication, provider, server or production verification.', cases: [] };
const browser = await chromium.launch();
const servers = [{ id: 'server-a', name: 'Serveur A' }, { id: 'server-b', name: 'Serveur B' }];
async function open(base, width, theme, options, query = '') {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(({ theme }) => { localStorage.setItem('jt_locale', 'fr'); localStorage.setItem('jt_theme', theme); }, { theme });
  const state = { loggedIn: false, submissions: [], oidc: [], failLogin: false };
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ status: state.loggedIn ? 200 : 401, json: state.loggedIn ? { username: 'QA', role: 'admin', jellyfinUserId: 'qa-user' } : {} });
    if (path === '/api/auth/options') return route.fulfill({ json: options });
    if (path === '/api/auth/login') {
      state.submissions.push(route.request().postDataJSON());
      if (state.failLogin) return route.fulfill({ status: 401, json: { error: 'Identifiants de test refusés.' } });
      state.loggedIn = true;
      return route.fulfill({ json: { username: 'QA', role: 'admin', jellyfinUserId: 'qa-user' } });
    }
    if (path === '/api/auth/oidc/start') { state.oidc.push(route.request().url()); return route.fulfill({ contentType: 'text/html', body: '<p>SSO fixture</p>' }); }
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/login' + query); await page.locator('.auth-card-title').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
  return { context, page, state, errors };
}
async function snapshot(page) {
  return page.locator('.auth-wrapper').evaluate(root => ({
    text: root.innerText.replace(/\s+/g, ' ').trim(),
    controls: [...root.querySelectorAll('input,select,a,button')].map(node => ({ tag: node.tagName, id: node.id, type: node.getAttribute('type'), href: node.getAttribute('href'), placeholder: node.getAttribute('placeholder'), text: (node.innerText || node.textContent).replace(/\s+/g, ' ').trim() })),
    shapes: [...root.querySelectorAll('svg path, svg polygon, svg polyline')].map(node => node.getAttribute('d') || node.getAttribute('points')),
    boxes: [...root.querySelectorAll('.auth-card,.auth-card-header,.auth-card-body,.auth-controls-container,.auth-input-field')].map(node => { const r = node.getBoundingClientRect(); return [node.className, ...[r.x, r.y, r.width, r.height].map(n => Math.round(n * 100) / 100)]; })
  }));
}
try {
  const scenarios = [
    { name: 'local', options: { jellyfin: true, servers } },
    { name: 'sso-manual', options: { jellyfin: true, oidc: true, autoRedirect: true, ssoButtonLabel: 'Mon SSO', servers }, query: '?manual=1' },
    { name: 'sso-only', options: { jellyfin: false, oidc: true }, query: '?manual=1' },
    { name: 'error', options: { jellyfin: true, oidc: true }, query: '?error=AccessDeniedGroup' },
    { name: 'logout', options: { jellyfin: false, localAdmin: true, oidc: true, autoRedirect: true }, query: '?logout=1' }
  ];
  for (const scenario of (process.argv.includes('--contracts') ? [] : scenarios)) for (const width of [390, 1440]) for (const theme of ['dark', 'light']) {
    const snapshots = [];
    for (const [name, base] of [['reference', baseline], ['svelte', migrated]]) {
      const { context, page, state, errors } = await open(base, width, theme, scenario.options, scenario.query);
      snapshots.push(await snapshot(page));
      await page.screenshot({ path: fileURLToPath(new URL(`${name}-${scenario.name}-${width}-${theme}.png`, out)), fullPage: true });
      assert.equal(state.oidc.length, 0, 'manual/error/logout must suppress automatic SSO');
      await page.locator('#login-theme-card').click();
      assert.equal(await page.locator('html').evaluate(node => node.classList.contains('dark')), theme !== 'dark');
      await page.locator('.auth-language-picker summary').click();
      await page.locator('[data-login-locale="en"]').click();
      await page.getByRole('heading', { name: 'JellyTrack Sign In', exact: true }).waitFor();
      await page.locator('.auth-language-picker summary').focus(); await page.keyboard.press('Escape');
      assert.equal(await page.locator('.auth-language-picker').evaluate(node => node.open), false);
      assert.deepEqual(errors, [], `${name} ${scenario.name} browser errors`);
      await context.close();
    }
    assert.deepEqual(snapshots[1], snapshots[0], `${scenario.name}/${width}/${theme} presentation parity`);
    report.cases.push({ scenario: scenario.name, width, theme, passed: true });
    console.log(`PASS ${scenario.name} ${width} ${theme}`);
  }
  for (const [name, base] of [['reference', baseline], ['svelte', migrated]]) {
    for (const callback of ['/about?qa=1', '//example.invalid', '/login?manual=1', '/\\example.invalid']) {
      const { context, page, state, errors } = await open(base, 1440, 'dark', { jellyfin: true, servers }, '?callbackUrl=' + encodeURIComponent(callback));
      await page.locator('#login-server').selectOption('server-b');
      await page.locator('#login-username').fill('  QA  '); await page.locator('#login-password').fill('fixture-password'); await page.locator('#login-remember').check();
      await page.locator('#btn-login-submit').click();
      const expected = callback === '/about?qa=1' ? callback : '/';
      await page.waitForURL(url => url.pathname + url.search === expected);
      assert.deepEqual(state.submissions, [{ username: 'QA', password: 'fixture-password', rememberMe: true, serverId: 'server-b' }]);
      assert.equal(await page.locator('body').evaluate(node => node.classList.contains('is-auth-page')), false, name + ' callback ' + callback + ' auth body cleanup');
      assert.deepEqual(errors, [], `${name} callback browser errors`);
      report.cases.push({ app: name, callback, passed: true }); await context.close();
    }
    const failed = await open(base, 390, 'dark', { jellyfin: true }); failed.state.failLogin = true;
    await failed.page.locator('#login-username').fill('QA'); await failed.page.locator('#login-password').fill('bad'); await failed.page.locator('#btn-login-submit').click();
    await failed.page.getByText('Identifiants de test refusés.', { exact: true }).waitFor();
    assert.equal(await failed.page.locator('#btn-login-submit').isEnabled(), true);
    assert.equal(await failed.page.locator('#login-password').inputValue(), '');
    assert.deepEqual(failed.errors, []); await failed.context.close(); report.cases.push({ app: name, scenario: 'failed-login', passed: true });
    const sso = await open(base, 390, 'dark', { jellyfin: true, oidc: true, autoRedirect: false, servers });
    await sso.page.locator('#login-server').selectOption('server-b'); await sso.page.locator('#btn-sso-start').click();
    await sso.page.waitForURL('**/api/auth/oidc/start?serverId=server-b'); assert.equal(sso.state.oidc.length, 1);
    assert.deepEqual(sso.errors, []); await sso.context.close(); report.cases.push({ app: name, scenario: 'sso-server', passed: true });
    const auto = await open(base, 390, 'dark', { jellyfin: false, oidc: true, autoRedirect: true });
    await auto.page.waitForURL('**/api/auth/oidc/start'); assert.equal(auto.state.oidc.length, 1);
    assert.deepEqual(auto.errors, []); await auto.context.close(); report.cases.push({ app: name, scenario: 'sso-auto', passed: true });
  }
} finally {
  await writeFile(new URL(process.argv.includes('--contracts') ? 'results-contracts.json' : 'results.json', out), JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
  if (built) await new Promise(resolve => built.close(resolve));
}






