const fs = require('fs'), path = require('path');
const { chromium } = require('C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: 'http://localhost:3350', viewport: { width: 1440, height: 900 } });
    await context.request.post('/api/auth/login', { headers: { Origin: 'http://localhost:3350' }, data: { username: 'mediaadmin', password: 'Media-pages-QA-test-2026!' } });
    await context.addInitScript(() => { localStorage.setItem('jt_locale', 'fr'); localStorage.setItem('jt_theme', 'dark'); });
    const page = await context.newPage(); await page.goto('/users/qa-primary-alice'); await page.waitForTimeout(1800);
    const geometry = await page.evaluate(() => { const chart = window.Chart.getChart(document.getElementById('profile-completion-chart')); return { labels: chart.data.labels, values: chart.data.datasets[0].data, cutout: chart.options.cutout, radius: chart.options.radius, arcs: chart.getDatasetMeta(0).data.map(arc => ({ innerRadius: arc.innerRadius, outerRadius: arc.outerRadius, startAngle: arc.startAngle, endAngle: arc.endAngle })) }; });
    fs.writeFileSync(path.resolve(__dirname, '../../docs/parity-restoration/visual-profile-geometry.json'), JSON.stringify({ date: new Date().toISOString(), mainSourceGeometry: { innerRadius: 60, outerRadius: 90 }, go: geometry }, null, 2));
    console.log(JSON.stringify(geometry));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
