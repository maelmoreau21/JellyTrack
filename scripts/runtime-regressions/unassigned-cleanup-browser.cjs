const fs = require('fs');
const {chromium} = require('C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<html lang="fr"><body><main></main></body></html>');
    await page.addScriptTag({path: 'web/dist/assets/settings.js'});
    const messages = JSON.parse(fs.readFileSync('web/dist/assets/messages/fr.json', 'utf8'));
    await page.evaluate(async messages => {
      window.JellyTrackNavigation = {settingsTabs: () => '', icon: () => '<svg></svg>'};
      window.calls = [];
      await JellyTrackSettings.mount({main: document.querySelector('main'), user: {isAdmin: true}, navigate: () => {},
        i18n: {locale: 'fr', t: (key, values = {}) => {let text = key.split('.').reduce((value, part) => value?.[part], messages); if (typeof text !== 'string') return ''; for (const [key, value] of Object.entries(values)) text = text.replaceAll('{'+key+'}', value); return text;}},
        utils: {escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')},
        api: {getJSON: async () => ({}), request: async (url, options) => {calls.push({url, body: options.body}); return {ok: true, json: async () => options.body.apply ? {success: true, message: 'Nettoyage terminé.', backupURL: '/api/admin/library-repair-backup/JellyTrack-library-repair-20261012T123456000000001Z.sqlite'} : {success: true, message: 'Aperçu : 2 médias, 4 lectures, 3 événements.', preview: {media: 2, history: 4, telemetry: 3, token: 'reviewed-lot', samples: [{title: 'Old unstable fixture', reason: 'Identifiant absent', remoteId: 'old'}]}}};}}
      }, 'scheduler/tasks');
    }, messages);
    if (await page.evaluate(() => calls.length) !== 0) throw Error('Automatic cleanup request');
    const run = page.locator('[data-url="/api/admin/cleanup-unassigned-history"]');
    if (!(await run.locator('..').innerText()).includes('Lancement manuel uniquement')) throw Error('Manual label missing');
    await run.click();
    const remove = page.locator('[data-action="apply-unassigned-cleanup"]');
    await remove.waitFor();
    if (await page.evaluate(() => calls.length) !== 1) throw Error('Preview deleted records');
    page.once('dialog', dialog => dialog.dismiss());
    await remove.click();
    if (await page.evaluate(() => calls.length) !== 1) throw Error('Cancelled deletion was sent');
    page.once('dialog', dialog => {if (!dialog.message().includes('4 lectures')) throw Error('Counts missing'); return dialog.accept();});
    await remove.click();
    await page.locator('[data-task-feedback]').filter({hasText: 'Nettoyage terminé.'}).waitFor();
    const calls = await page.evaluate(() => window.calls);
    if (calls.length !== 2 || calls[1].body.token !== 'reviewed-lot' || calls[1].body.apply !== true) throw Error('Reviewed deletion request missing');
    await page.getByText('Télécharger la sauvegarde avant réparation', {exact: true}).waitFor();
    console.log('PASS: manual launch, preview without deletion, cancel, confirmed counts/token, result and backup download (mock API).');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});
