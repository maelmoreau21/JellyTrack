const fs=require('fs'),path=require('path'),child=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://localhost:3340';
const output=path.resolve(__dirname,'../../docs/settings-admin-validation');fs.mkdirSync(output,{recursive:true});
const report={scope:'Real UI submissions and real API readback on isolated settings-admin.db. Backup creation and download only; every restore/delete/import canceled or rejected before request.',checks:[],pageErrors:[]};
const check=(name,ok,details)=>report.checks.push({name,ok:!!ok,...(details?{details}:{})});
async function test(name,fn){try{await fn();}catch(error){check(name,false,error.message);}}
(async()=>{
const browser=await chromium.launch();
try{
 const context=await browser.newContext({baseURL:base,permissions:['clipboard-read','clipboard-write'],viewport:{width:1440,height:900}});
 const login=await context.request.post('/api/auth/login',{headers:{Origin:base},data:{username:'settingsadmin',password:'Settings-admin-QA-test-2026!'}});if(!login.ok())throw Error('QA admin login failed');
 const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
 const get=async route=>(await context.request.get(route)).json();
 const go=async route=>{await page.goto(route,{waitUntil:'networkidle'});await page.locator('.settings-body[aria-busy=true]').waitFor({state:'hidden'});};
 async function submit(kind,endpoint='/api/settings',method='POST',expected=200){
  const [response]=await Promise.all([page.waitForResponse(res=>new URL(res.url()).pathname===endpoint&&res.request().method()===method),page.locator(`[data-form="${kind}"] [type=submit]`).click()]);
  check('Actual '+kind+' submission HTTP '+expected,expected===200?response.ok():response.status()===expected,(expected===200?response.ok():response.status()===expected)?undefined:'HTTP '+response.status());
  await page.waitForLoadState('networkidle');return response;
 }
 await test('Jellyfin server editing and plugin copy',async()=>{
  await go('/settings/jellyfin');
  check('Plugin controls nested under each server',await page.locator('.settings-server .settings-nested').count()===2);
  await page.locator('[data-action=edit-server][data-id=qa-primary]').click();
  const form=page.locator('[data-form=server]');check('Existing Jellyfin secret never filled into edit',await form.locator('[name=apiKey]').inputValue()==='');
  await form.locator('[name=name]').fill('QA principal modifié');await submit('server','/api/settings/jellyfin-servers','PATCH');
  check('Server name readback', (await get('/api/settings/jellyfin-servers')).servers.find(s=>s.id==='qa-primary').name==='QA principal modifié');
  await page.locator('[data-action=edit-server][data-id=qa-primary]').click();await page.locator('[data-form=server] [name=name]').fill('Must not save');await page.locator('[data-action=cancel-server]').click();
  check('Cancel server edit writes nothing',(await get('/api/settings/jellyfin-servers')).servers.find(s=>s.id==='qa-primary').name==='QA principal modifié');
  async function copyKey(){const[response]=await Promise.all([page.waitForResponse(res=>new URL(res.url()).pathname==='/api/settings/jellyfin-servers/plugin-key'&&res.request().method()==='POST'),page.locator('[data-action=plugin-copy][data-id=qa-primary]').click()]);return response.json();}
  const first=await copyKey(),second=await copyKey();check('Copy plugin key stable across repeated copies',!!first.pluginApiKey&&first.pluginApiKey===second.pluginApiKey);
  const management=page.locator('details:has([data-action=delete-server])');await management.locator('summary').click();let deletes=0;const watch=request=>{if(request.method()==='DELETE'&&new URL(request.url()).pathname.startsWith('/api/settings/jellyfin-servers'))deletes++;};page.on('request',watch);page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-action=delete-server]').first().click();check('Secondary server delete canceled before request',deletes===0);page.off('request',watch);
  await page.reload({waitUntil:'networkidle'});check('Server edit persists after reload',await page.locator('[name=display-name-qa-primary]').inputValue()==='QA principal modifié');
 });
 await test('SSO masked secret and groups',async()=>{
  await go('/settings/sso');const form=page.locator('[data-form=sso]');
  check('SSO secret masked',/[•●]/.test(await form.locator('[name=clientSecret]').inputValue()));
  await form.locator('[name=adminGroup]').fill('qa-admins-updated');await form.locator('[name=userGroup]').fill('qa-users-updated');await submit('sso','/api/settings/sso','PUT');
  const saved=await get('/api/settings/sso');check('SSO groups persisted',saved.adminGroup==='qa-admins-updated'&&saved.userGroup==='qa-users-updated');check('SSO stays disabled while preserving configured secret',saved.enabled===false&&saved.hasClientSecret===true);
  await page.reload({waitUntil:'networkidle'});check('SSO form reloads saved groups',await page.locator('[name=adminGroup]').inputValue()==='qa-admins-updated');
 });
 await test('Media all six rules scopes and hidden values',async()=>{
  await go('/settings/media');const before=await get('/api/settings');
  check('Six historical completion rule groups',await page.locator('[data-rule]').count()===6);
  check('Four resolution blocks eight inputs',await page.locator('[name^="res-"]').count()===8);
  check('Same-name libraries kept separate by server',await page.locator('[data-action=exclude]').count()===2);
  check('Historical music defaults',await page.locator('[name=rule-music-abandonedThreshold]').inputValue()==='12'&&await page.locator('[name=rule-music-partialThreshold]').inputValue()==='30'&&await page.locator('[name=rule-music-completedThreshold]').inputValue()==='60');
  await page.locator('[name=showLibraryMediaBadges]').uncheck();await page.locator('[name=res-1080p-maxW]').fill('2100');await page.locator('[name=rule-movies-abandonedThreshold]').fill('11');
  await page.locator('[data-action=exclude][data-key="srvlib|qa-primary|Films%20QA"]').click();await submit('media');
  const saved=await get('/api/settings');check('Media resolution and badges persisted',saved.resolutionThresholds['1080p'].maxW===2100&&saved.resolutionThresholds.showLibraryMediaBadges===false);
  check('Unshown completion library preserved',JSON.stringify(saved.resolutionThresholds.completionRules.libraries.photos)===JSON.stringify(before.resolutionThresholds.completionRules.libraries.photos));
  check('Unrelated JSON and scheduler preserved',saved.resolutionThresholds.qaPreserve.fixture===true&&JSON.stringify(saved.schedulerIntervals)===JSON.stringify(before.schedulerIntervals));
  check('Legacy and orphan exclusions preserved',saved.excludedLibraries.includes('legacy-qa-library')&&saved.excludedLibraries.includes('srvlib|qa-orphan|Films%20QA'));
  check('Server exclusion does not exclude namesake secondary',saved.excludedLibraries.includes('srvlib|qa-primary|Films%20QA')&&!saved.excludedLibraries.includes('srvlib|qa-secondary|Films%20QA'));
  await page.reload({waitUntil:'networkidle'});check('Media reload uses persisted values',await page.locator('[name=res-1080p-maxW]').inputValue()==='2100'&&!(await page.locator('[name=showLibraryMediaBadges]').isChecked()));
  await page.locator('[name=rule-movies-completionEnabled]').uncheck();check('Disabled completion disables dependent thresholds',await page.locator('[name=rule-movies-abandonedThreshold]').isDisabled());
 });
 await test('Schedules and Wrapped independent saves',async()=>{
  await go('/settings/scheduler');check('Five historical runnable tasks',await page.locator('[data-action=run-task]').count()===5);
  const form=page.locator('[data-form=schedules]');for(const[key,value]of Object.entries({recentSyncEveryHours:7,fullSyncEveryHours:72,integrityCheckEveryHours:8,backupEveryHours:48}))await form.locator(`[name=${key}]`).fill(String(value));await form.locator('[name=logRetentionDays]').selectOption('14');await submit('schedules');
  const saved=await get('/api/settings');check('All five schedules readback',saved.schedulerIntervals.recentSyncEveryHours===7&&saved.schedulerIntervals.fullSyncEveryHours===72&&saved.schedulerIntervals.integrityCheckEveryHours===8&&saved.schedulerIntervals.backupEveryHours===48&&saved.schedulerIntervals.logRetentionDays===14);
  await page.locator('[data-form=wrapped] [name=wrappedPeriodEnabled]').uncheck();check('Wrapped automatic dates hide conditionally',!(await page.locator('.settings-wrapped-fields').isVisible()));await submit('wrapped');
  check('Wrapped disabled readback',(await get('/api/settings')).wrappedPeriodEnabled===false);
  await page.locator('[data-form=wrapped] [name=wrappedPeriodEnabled]').check();for(const[key,value]of Object.entries({wrappedStartMonth:11,wrappedStartDay:5,wrappedEndMonth:2,wrappedEndDay:28}))await page.locator(`[data-form=wrapped] [name=${key}]`).fill(String(value));await page.locator('[data-form=wrapped] [name=wrappedVisible]').uncheck();await submit('wrapped');
  const wrapped=await get('/api/settings');check('Wrapped dates and visibility readback',wrapped.wrappedStartMonth===11&&wrapped.wrappedStartDay===5&&wrapped.wrappedEndMonth===2&&wrapped.wrappedEndDay===28&&wrapped.wrappedVisible===false);
  check('Wrapped save preserves schedules',wrapped.schedulerIntervals.recentSyncEveryHours===7&&wrapped.schedulerIntervals.integrityCheckEveryHours===8);
  await page.reload({waitUntil:'networkidle'});check('Schedules reload values',await page.locator('[data-form=schedules] [name=recentSyncEveryHours]').inputValue()==='7');
  await page.locator('[data-form=wrapped] [name=wrappedEndDay]').fill('31');const invalid=await submit('wrapped','/api/settings','POST',400);check('Impossible calendar date rejected',invalid.status()===400);check('Rejected Wrapped save leaves database unchanged',(await get('/api/settings')).wrappedEndDay===28);
 });
 await test('Notifications conditions and max transcodes',async()=>{
  await go('/settings/notifications');const form=page.locator('[data-form=notifications]');await form.locator('[name=discordAlertsEnabled]').check();check('Discord enable reveals all three fields',await page.locator('.settings-notification-fields').isVisible());
  await form.locator('[name=discordWebhookUrl]').fill('https://discord.com/api/webhooks/qa/token');await form.locator('[name=discordAlertCondition]').selectOption('TRANSCODE_ONLY');await form.locator('[name=maxConcurrentTranscodes]').fill('3');await submit('notifications');
  const saved=await get('/api/settings');check('All notification fields readback',saved.discordAlertsEnabled&&saved.discordAlertCondition==='TRANSCODE_ONLY'&&saved.maxConcurrentTranscodes===3&&saved.discordWebhookUrl==='https://discord.com/api/webhooks/qa/token');
  await page.locator('[name=discordAlertsEnabled]').uncheck();check('Discord disable hides dependent fields',!(await page.locator('.settings-notification-fields').isVisible()));await submit('notifications');check('Disable preserves webhook',(await get('/api/settings')).discordWebhookUrl==='https://discord.com/api/webhooks/qa/token');
 });
 await test('Telemetry presets and Smart preserve media/scheduler',async()=>{
  await go('/settings/plugin/security');await page.locator('[data-action=preset][data-value=balanced]').click();check('Balanced preset selected',await page.locator('[data-action=preset][data-value=balanced]').getAttribute('aria-pressed')==='true');check('Balanced preset values',await page.locator('[name=playingIntervalSeconds]').inputValue()==='15'&&await page.locator('[name=pausedIntervalSeconds]').inputValue()==='60');await page.locator('[name=trackSeek]').uncheck();await submit('telemetry');
  const telem=(await get('/api/settings')).pluginTelemetrySettings;check('Telemetry profile values and switch readback',telem.precisionProfile==='balanced'&&telem.playingIntervalSeconds===15&&telem.pausedIntervalSeconds===60&&telem.trackSeek===false);
  await page.locator('[data-form=smart] [name=ipAttemptThreshold]').fill('61');await page.locator('[data-form=smart] [name=ipWindowMinutes]').fill('75');await page.locator('[data-form=smart] [name=newCountryGraceMinutes]').fill('180');await submit('smart','/api/admin/security/smart-settings','PATCH');
  const smart=(await get('/api/admin/security/smart-settings')).thresholds;check('Smart thresholds readback',smart.ipAttemptThreshold===61&&smart.ipWindowMinutes===75&&smart.newCountryGraceMinutes===180);
  const preserved=await get('/api/settings');check('Smart save preserves media and scheduler JSON',preserved.resolutionThresholds['1080p'].maxW===2100&&preserved.resolutionThresholds.qaPreserve.fixture===true&&preserved.schedulerIntervals.recentSyncEveryHours===7);
 });
 await test('Backup creation download and canceled destructive controls',async()=>{
  await go('/settings/dataBackups');const[created]=await Promise.all([page.waitForResponse(res=>new URL(res.url()).pathname==='/api/backup/auto/trigger'),page.locator('[data-action=backup-now]').click()]);check('Backup creation real success',created.ok()&&(await created.json()).success===true);await page.waitForLoadState('networkidle');
  const backups=(await get('/api/backup/auto')).backups;check('Created backup listed',backups.length>0);
  const archive=await context.request.get('/api/backup/auto/download?fileName='+encodeURIComponent(backups[0].name));const bytes=await archive.body();check('Backup download valid ZIP signature',archive.ok()&&bytes[0]===80&&bytes[1]===75);
  let destructive=0;const watch=request=>{if(request.method()==='POST'&&/\/api\/backup\/(auto\/(delete|restore)|import)$/.test(new URL(request.url()).pathname))destructive++;};page.on('request',watch);
  for(const action of ['backup-restore','backup-delete']){page.once('dialog',dialog=>dialog.dismiss());await page.locator(`[data-action=${action}]`).first().click();}
  await page.locator('[name=backupFile]').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('QA invalid file')});await page.locator('[data-form=import] [type=submit]').click();await page.waitForTimeout(150);
  check('Invalid import explicit feedback',await page.locator('.settings-feedback').innerText().then(text=>text.length>0));check('Canceled restore/delete and invalid import never call destructive API',destructive===0);page.off('request',watch);
 });
 await test('Load delay and failure, failed save feedback',async()=>{
  await context.route('**/api/settings',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue();});
  await page.goto('/settings/notifications',{waitUntil:'domcontentloaded'});await page.locator('.settings-loading').waitFor();check('Real settings loading state visible',await page.locator('.settings-loading').isVisible());await page.waitForLoadState('networkidle');await context.unroute('**/api/settings');
  const before=await get('/api/settings');await context.route('**/api/settings',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{error:'QA save unavailable'}}):route.continue());
  await page.locator('[name=discordAlertsEnabled]').check();const failed=await submit('notifications','/api/settings','POST',503);check('Injected save failure remains failure',failed.status()===503);check('Save error visible and unsaved values retained',(await page.locator('.settings-feedback').innerText()).includes('QA save unavailable')&&await page.locator('[name=discordAlertsEnabled]').isChecked());await context.unroute('**/api/settings');check('Failed UI save never changes database',(await get('/api/settings')).discordAlertsEnabled===before.discordAlertsEnabled);
  await context.route('**/api/settings',route=>route.fulfill({status:503,json:{error:'QA load unavailable'}}));await page.goto('/settings/media',{waitUntil:'networkidle'});check('Load error shown with retry control',(await page.locator('.settings-feedback').innerText()).includes('QA load unavailable')&&await page.locator('[data-action=refresh]').count()===1);await context.unroute('**/api/settings');await page.locator('[data-action=refresh]').click();await page.locator('[data-form=media]').waitFor({state:'visible'});check('Retry recovers actual loaded form',await page.locator('[data-form=media]').count()===1);
 });
 const storage=JSON.parse(child.execFileSync(process.env.PYTHON||'python',[path.resolve(__dirname,'verify-storage.py')],{encoding:'utf8'}));for(const[name,value]of Object.entries(storage))check('Synthetic '+name,value);
 check('No uncaught JavaScript errors',report.pageErrors.length===0);await context.close();
}finally{await browser.close();fs.writeFileSync(path.join(output,'forms-results.json'),JSON.stringify(report,null,2));}
const failed=report.checks.filter(item=>!item.ok);console.log(JSON.stringify({checks:report.checks.length,failed,pageErrors:report.pageErrors}));if(failed.length)process.exitCode=1;
})().catch(error=>{report.fatal=error.message;fs.writeFileSync(path.join(output,'forms-results.json'),JSON.stringify(report,null,2));console.error(error);process.exitCode=1;});
