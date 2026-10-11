// Fresh final detail proof, original main UI and isolated Go SQLite APIs.
const fs = require('fs'), path = require('path');
const { chromium } = require('C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'docs/parity-restoration/captures'), tag = process.env.VISUAL_TAG || 'final';
const report = { date: new Date().toISOString(), scope: 'Deep analysis lower cards and profile charts, desktop/mobile, dark/light; original main UI with aligned synthetic adapter versus isolated Go API.', cases: [] };
const save = () => fs.writeFileSync(path.join(root, `docs/parity-restoration/visual-deep-${tag}.json`), JSON.stringify(report, null, 2));
(async () => {
  const browser = await chromium.launch();
  try {
    for (const mode of (process.env.VISUAL_MODES || 'main,go').split(',')) {
      const baseURL = 'http://localhost:' + (mode === 'main' ? 3341 : 3350);
      const context = await browser.newContext({ baseURL, locale: 'fr-FR', timezoneId: 'UTC' });
      if (mode === 'main') {
        const { encode } = require(path.join(root, 'scratch/navigation-qa/main-reference/node_modules/next-auth/jwt'));
        await context.addCookies([{ name: 'locale', value: 'fr', url: baseURL }, { name: 'next-auth.session-token', url: baseURL, value: await encode({ secret: 'navigation-qa-reference-secret-at-least-32-characters', token: { name: 'QA administrateur', sub: 'qa-local', isAdmin: true, jellyfinUserId: 'local-admin', authServerName: 'QA principal', authServerIsPrimary: true, sessionExpiresAt: Math.floor(Date.now() / 1000) + 86400, sessionExpired: false }, maxAge: 86400 }) }]);
      } else {
        const login = await context.request.post('/api/auth/login', { headers: { Origin: baseURL }, data: { username: 'mediaadmin', password: 'Media-pages-QA-test-2026!' } });
        if (!login.ok()) throw Error('Login Go ' + login.status());
      }
      await context.addInitScript(m => { if (m === 'go') localStorage.setItem('jt_locale', 'fr'); }, mode);
      const page = await context.newPage();
      for (const canonical of (process.env.VISUAL_ROUTES || '/media/analysis,/users/alice').split(',')) {
        const route = mode === 'go' ? canonical.replace('/users/alice', '/users/qa-primary-alice') : canonical;
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 75000 });
        await page.waitForTimeout(3500);
        report.initialStates ||= [];
        const deepResponse = canonical === '/media/analysis' ? await context.request.get(mode === 'go' ? '/api/stats/deep?catalogue=true' : '/api/stats/deep', { timeout: 75000 }) : null;
        report.initialStates.push({ mode, route, errors, body: (await page.locator('body').innerText()).slice(-6000), deepStatus: deepResponse?.status(), deepBody: deepResponse ? (await deepResponse.text()).slice(0, 1200) : null }); save();
        for (const theme of ['dark', 'light']) for (const [viewport, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(({ mode, theme }) => { localStorage.setItem(mode === 'main' ? 'theme' : 'jt_theme', theme); document.documentElement.classList.toggle('dark', theme === 'dark'); }, { mode, theme });
          await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
          const targets = canonical === '/media/analysis' ? [/Aperçu des statistiques approfondies/i] : [/Activité par Jour/i, /Genres préférés/i];
          for (const [index, heading] of targets.entries()) {
            const target = page.getByText(heading).first();
            await target.waitFor(); await target.evaluate(element => element.scrollIntoView({ block: 'start' }));
            await page.waitForTimeout(1500);
            const file = `${mode}-deep-${tag}-${canonical.includes('analysis') ? 'analysis' : 'profile'}-${index}-${viewport}-${theme}.png`;
            await page.screenshot({ path: path.join(out, file) });
            report.cases.push({ mode, route, theme, viewport, heading: heading.source, file, errors, metrics: await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, headings: [...document.querySelectorAll('main h2,main h3,main [data-slot="card-title"]')].map(e => e.textContent.trim()), cards: [...document.querySelectorAll('.mr-deep-card')].map(e => ({ title: e.querySelector('h2')?.textContent, iconCount: e.querySelectorAll('svg').length, text: e.innerText })) })) });
            save();
          }
        }
        page.removeAllListeners('pageerror');
      }
      await context.close();
    }
  } finally { save(); await browser.close(); }
})().catch(error => { report.fatal = error.message; save(); console.error(error); process.exitCode = 1; });
