// Run after building scratch/security-qa/jellytrack.exe (or set QA_BINARY).
// Uses only disposable SQLite data, local Jellyfin mocks and fixture secrets.
const { chromium } = require('playwright');
const http = require('http'), net = require('net'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn, execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jellytrack-security-qa-'));
const output = process.env.QA_OUTPUT_DIR || path.join(root, 'scratch/security-qa'); fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [];
function check(name, ok) { checks.push({ name, ok: !!ok }); if (!ok) throw new Error(name); }
const metadata = disabled => ({ Id: 'same', Name: 'Alice', Policy: { IsDisabled: disabled, IsAdministrator: false, EnableAllFolders: true, AuthenticationProviderId: 'Jellyfin.Server.Implementations.Users.DefaultAuthenticationProvider' } });
let disabled = false, avatarHits = 0;
async function mock(id) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const uri = new URL(req.url, 'http://fixture');
    if (uri.pathname === '/Users/AuthenticateByName') { res.end(JSON.stringify({ User: metadata(disabled), AccessToken: 'fixture-token' })); return; }
    if (uri.pathname === '/Users') { res.end(JSON.stringify([metadata(disabled)])); return; }
    if (uri.pathname === '/Users/same') { res.end(JSON.stringify(metadata(disabled))); return; }
    if (uri.pathname.endsWith('/Images/Primary')) { avatarHits++; res.setHeader('Content-Type', 'image/png'); res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64')); return; }
    if (uri.pathname.startsWith('/System/Info')) { res.end(JSON.stringify({ Id: id, ServerName: id, Version: 'fixture' })); return; }
    if (uri.pathname === '/Library/VirtualFolders') { res.end(JSON.stringify([{ ItemId: 'films', Name: 'Films', CollectionType: 'movies' }])); return; }
    if (uri.pathname === '/Items') { res.end(JSON.stringify({ Items: [], TotalRecordCount: 0 })); return; }
    if (uri.pathname === '/Sessions') { res.end('[]'); return; }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}
function seed(script, ...args) { execFileSync(process.env.PYTHON || 'python', ['-c', 'import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); ' + script + '; db.commit(); db.close()', path.join(work, 'qa.db'), ...args], { windowsHide: true }); }
(async () => {
  const first = await mock('jfqa1'), second = await mock('jfqa2');
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const base = 'http://localhost:' + port;
  const log = fs.openSync(path.join(work, 'server.log'), 'w');
  const child = spawn(process.env.QA_BINARY || path.join(root, 'scratch/security-qa/jellytrack.exe'), [], { cwd: root, windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, DATABASE_DRIVER: 'sqlite', DATABASE_PATH: path.join(work, 'qa.db'), DATABASE_URL: '', PORT: String(port), JELLYTRACK_PORT: String(port), JELLYTRACK_SECRET: 'fixture-session-secret-0123456789abcdef', JELLYTRACK_LOCAL_ADMIN_USER: 'qa-admin', JELLYTRACK_LOCAL_ADMIN_PASSWORD: 'Fixture-admin-password-42!', JELLYFIN_URL: first.url, JELLYFIN_API_KEY: 'fixture-key', JELLYFIN_SERVER_ID: 'qa1', JELLYFIN_AUTH_ENABLED: 'true', LDAP_SSO_ONLY: 'false', OIDC_ENABLED: 'false', OIDC_AUTO_REDIRECT: 'false', ENABLE_PPROF: 'true', JELLYTRACK_URL: base, AUTH_URL: base, BACKUP_DIR: work, BACKUP_ENCRYPTION_KEY: 'KioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKio=' } });
  let browser;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    seed(`db.execute('INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey","allowAuthFallback") VALUES(?,?,?,?,?,TRUE) ON CONFLICT("id") DO UPDATE SET "url"=excluded."url", "jellyfinApiKey"=excluded."jellyfinApiKey"',("qa1","jfqa1","One",sys.argv[2],"fixture-key")); db.execute('INSERT INTO "Server"("id","jellyfinServerId","name","url","jellyfinApiKey","allowAuthFallback") VALUES(?,?,?,?,?,TRUE)',("qa2","jfqa2","Two",sys.argv[3],"fixture-key")); db.execute('INSERT INTO "GlobalSettings"("id","wrappedVisible","wrappedPeriodEnabled") VALUES(?,TRUE,FALSE) ON CONFLICT("id") DO UPDATE SET "wrappedVisible"=TRUE,"wrappedPeriodEnabled"=FALSE',("global",))`, first.url, second.url);
    browser = await chromium.launch({ headless: true });
    const contexts = await Promise.all([browser.newContext({ baseURL: base }), browser.newContext({ baseURL: base })]);
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of pages) page.on('pageerror', error => errors.push(error.message));
    let chartOnLogin = false; pages[0].on('request', request => { if (request.url().includes('chart.min') && new URL(pages[0].url()).pathname === '/login') chartOnLogin = true; });
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]; await page.goto('/login?manual=1'); await page.waitForSelector('#form-login-local');
      await page.selectOption('#login-server', 'qa' + (i + 1)); await page.fill('#login-username', 'Alice'); await page.fill('#login-password', 'fixture-password'); await page.locator('#form-login-local button[type=submit]').click();
      await page.waitForURL(url => !url.pathname.startsWith('/login')); await page.goto('/accounts'); await page.getByRole('button', { name: 'Associer mon compte', exact: true }).waitFor();
    }
    check('Chart.js is deferred on login', !chartOnLogin);
    seed('rows=db.execute(\'SELECT "id","serverId" FROM "User" WHERE "jellyfinUserId"=?\',("same",)).fetchall(); [db.execute(\'INSERT INTO "Media"("id","serverId","jellyfinMediaId","title","type","libraryName") VALUES(?,?,?,?,?,?)\',("m"+sid,sid,"same-film","Film <img src=x onerror=alert(1)>","Movie","Films")) for uid,sid in rows]; [db.execute(\'INSERT INTO "PlaybackHistory"("id","serverId","userId","mediaId","playMethod","durationWatched","startedAt","endedAt") VALUES(?,?,?,?,?,?,?,?)\',("p"+sid,sid,uid,"m"+sid,"DirectPlay",3600 if sid=="qa1" else 1800,"2025-01-02T10:00:00Z","2025-01-02T11:00:00Z")) for uid,sid in rows]');
    await pages[1].getByRole('button', { name: 'Générer un code pour ce compte' }).click(); await pages[1].waitForFunction(() => document.querySelector('output')?.textContent.length === 43);
    const code = await pages[1].locator('output').textContent(); await pages[0].locator('form input').fill(code); await pages[0].getByRole('button', { name: 'Associer mon compte', exact: true }).click(); await pages[0].getByRole('status').filter({ hasText: 'Compte associé' }).waitFor();
    check('voluntary association renders both servers', (await pages[0].textContent('main')).includes('Two'));
    const data = await contexts[0].request.get('/api/me/wrapped?year=2025&servers=all').then(response => response.json()); check('combined Wrapped contains only owned playback', data.totalSeconds === 5400 && data.totalPlays === 2 && data.topMovies.length === 2);
    for (const url of ['/api/dashboard?servers=all', '/api/newsletter', '/api/settings', '/debug/pprof/heap']) check('ordinary account denied ' + url, (await contexts[0].request.get(url)).status() === 403);
    const before = avatarHits; check('foreign-server avatar denied', (await contexts[0].request.get('/api/jellyfin/user-image?serverId=qa2&userId=same')).status() === 404); check('denied avatar has no provider call', avatarHits === before);
    await pages[0].screenshot({ path: path.join(output, 'accounts-desktop.png') }); await pages[0].setViewportSize({ width: 390, height: 844 }); await pages[0].reload(); await pages[0].getByRole('button', { name: 'Associer mon compte', exact: true }).waitFor(); await pages[0].screenshot({ path: path.join(output, 'accounts-mobile.png') }); check('accounts fit mobile viewport', await pages[0].evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await pages[0].goto('/wrapped/me?combined=1&year=2025'); await pages[0].waitForSelector('.wrapped-recovery'); await pages[0].screenshot({ path: path.join(output, 'wrapped-mobile.png') }); check('Wrapped fits mobile viewport', await pages[0].evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await pages[0].goto('/accounts'); await pages[0].locator('p').filter({ hasText: 'Alice — Two' }).getByRole('button', { name: 'Dissocier' }).click(); await pages[0].getByRole('status').filter({ hasText: 'Compte dissocié' }).waitFor();
    const personal = await contexts[0].request.get('/api/me/wrapped?year=2025').then(response => response.json()); check('unlink immediately changes aggregate', personal.totalSeconds === 3600);
    disabled = true; check('legacy Wrapped respects provider revocation', (await contexts[0].request.get('/api/wrapped/me?year=2025')).status() === 403);
    disabled = false;
    const admin = await browser.newContext({ baseURL: base });
    const login = await admin.request.post('/api/auth/login', { headers: { Origin: base }, data: { username: 'qa-admin', password: 'Fixture-admin-password-42!' } });
    const identity = await login.json(); if (!login.ok() || identity.role !== 'super_admin') console.error({ status: login.status(), role: identity.role, error: identity.error }); check('local administrator remains global', login.ok() && identity.role === 'super_admin');
    check('authorized administrator can use pprof', (await admin.request.get('/debug/pprof/heap?debug=1')).status() === 200);
    const adminPage = await admin.newPage(); adminPage.on('pageerror', error => errors.push(error.message));
    const live = adminPage.waitForResponse(response => response.url().includes('/api/dashboard/live'));
    await adminPage.goto('/'); check('administrator dashboard uses authenticated SSE', (await live).status() === 200);
    const encrypted = await admin.request.post('/api/backup/export/full', { headers: { Origin: base, 'X-CSRF-Token': identity.csrfToken } });
    const archive = await encrypted.body(); check('complete API export is encrypted', encrypted.ok() && archive.subarray(0, 20).toString() === 'JELLYTRACK-BACKUP-1\n' && !archive.includes(Buffer.from('fixture-key')));
    adminPage.on('dialog', dialog => dialog.accept());
    await adminPage.goto('/settings/dataBackups'); await adminPage.locator('form[data-form=import] input[type=file]').setInputFiles({ name: 'restore.jtb', mimeType: 'application/octet-stream', buffer: archive });
    const restored = adminPage.waitForResponse(response => response.url().endsWith('/api/backup/import'));
    await adminPage.locator('form[data-form=import] button[type=submit]').click(); check('encrypted archive can be imported from the UI', (await restored).status() === 200);
    check('restoration revokes old sessions', (await contexts[0].request.get('/api/me/accounts')).status() === 401);
    check('no runtime JavaScript errors', errors.length === 0);
  } finally {
    if (browser) await browser.close(); child.kill(); await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve)); fs.closeSync(log);
    await Promise.all([first, second].map(mock => new Promise(resolve => mock.server.close(resolve))));
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(JSON.stringify({ checks, errors }, null, 2));
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
