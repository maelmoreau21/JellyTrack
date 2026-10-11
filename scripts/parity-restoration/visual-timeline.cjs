// Direct rendered timeline comparison; both apps use isolated comparable histories.
const fs = require('fs'), path = require('path');
const { chromium } = require('C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'docs/parity-restoration/captures'), tag = process.env.VISUAL_TAG || 'final5';
const report = { date: new Date().toISOString(), scope: 'Real media timeline below first screen, film and episode, desktop/mobile light/dark, main original UI versus Go SQLite API. Event data not replaced.', cases: [] };
const save = () => fs.writeFileSync(path.join(root, `docs/parity-restoration/visual-timeline-${tag}.json`), JSON.stringify(report, null, 2));
(async () => {
  const browser = await chromium.launch();
  try {
    for (const mode of ['main', 'go']) {
      const baseURL = 'http://localhost:' + (mode === 'main' ? 3341 : 3350), context = await browser.newContext({ baseURL, locale: 'fr-FR', timezoneId: 'UTC' });
      if (mode === 'main') {
        const { encode } = require(path.join(root, 'scratch/navigation-qa/main-reference/node_modules/next-auth/jwt'));
        await context.addCookies([{ name: 'locale', value: 'fr', url: baseURL }, { name: 'next-auth.session-token', url: baseURL, value: await encode({ secret: 'navigation-qa-reference-secret-at-least-32-characters', token: { name: 'QA administrateur', sub: 'qa-local', isAdmin: true, jellyfinUserId: 'local-admin', authServerName: 'QA principal', authServerIsPrimary: true, sessionExpiresAt: Math.floor(Date.now() / 1000) + 86400, sessionExpired: false }, maxAge: 86400 }) }]);
      } else { await context.request.post('/api/auth/login', { headers: { Origin: baseURL }, data: { username: 'mediaadmin', password: 'Media-pages-QA-test-2026!' } }); }
      await context.addInitScript(mode => { if (mode === 'go') localStorage.setItem('jt_locale', 'fr'); }, mode);
      const page = await context.newPage();
      for (const item of ['movie', 'episode1']) for (const theme of ['dark', 'light']) for (const [viewport, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
        const route = '/media/' + (mode === 'go' ? 'qa-primary-' : '') + item, errors = [];
        page.removeAllListeners('pageerror'); page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width, height });
        await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 75000 });
        await page.evaluate(({ mode, theme }) => { localStorage.setItem(mode === 'main' ? 'theme' : 'jt_theme', theme); }, { mode, theme });
        await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
        const heading = page.getByText('Chronologie Profonde', { exact: true }).first();
        await heading.waitFor(); await heading.evaluate(element => element.scrollIntoView({ block: 'start' })); await page.waitForTimeout(1500);
        const file = `${mode}-${tag}-timeline-${item}-${viewport}-${theme}.png`;
        await page.screenshot({ path: path.join(out, file) });
        const metrics = await heading.evaluate(heading => {
          const card = heading.closest('[data-slot="card"],.card') || heading.parentElement.parentElement;
          const histogram = card.querySelector('.mr-hist-bars') || [...card.querySelectorAll('div')].find(element => String(element.className).includes('h-[140px]'));
          const pills = card.querySelector('.mr-hist-filters')?.querySelectorAll('button') || [...card.querySelectorAll('button')].filter(element => String(element.className).includes('rounded-full'));
          const lanes = card.querySelector('.mr-hist-sessions') || [...card.querySelectorAll('div')].find(element => String(element.className).includes('max-h-[260px]'));
          const ticks = card.querySelector('.mr-hist-axis') || [...card.querySelectorAll('div')].find(element => String(element.className).includes('justify-between text-[11px]'));
          const shape = element => element ? { x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, padding: getComputedStyle(element).padding, gap: getComputedStyle(element).gap, maxHeight: getComputedStyle(element).maxHeight } : null;
          return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, card: shape(card), histogram: shape(histogram), buckets: histogram?.children.length || 0, nonemptyBuckets: histogram ? [...histogram.children].filter(element => parseFloat(element.firstElementChild?.style.height) > 0).length : 0, pills: [...pills].map(element => ({ text: element.textContent.trim(), pressed: element.getAttribute('aria-pressed') })), ticks: ticks?.innerText, laneContainer: shape(lanes), lanes: lanes?.children.length || 0, body: card.innerText.slice(0, 2400) };
        });
        report.cases.push({ mode, item, route, theme, viewport, file, metrics, errors }); save();
      }
      await context.close();
    }
  } finally { save(); await browser.close(); }
})().catch(error => { report.fatal = error.message; save(); console.error(error); process.exitCode = 1; });
