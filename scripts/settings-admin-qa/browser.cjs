const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.GO_QA_URL||'http://localhost:3340';
if(!/^http:\/\/(localhost|127\.0\.0\.1):3340$/.test(base))throw Error('QA is restricted to the isolated settings/admin server on port 3340');
const output=path.resolve(__dirname,'../../docs/settings-admin-validation'),captures=path.resolve(__dirname,'../../docs/settings-admin-captures');
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(captures,{recursive:true});
const routes=['/settings/jellyfin','/settings/sso','/settings/plugin/security','/settings/media','/settings/scheduler','/settings/scheduler/tasks','/settings/scheduler/schedules','/settings/dataBackups','/settings/notifications','/settings/plugin','/settings/overview','/settings/network','/settings/analytics','/settings/go-overview','/settings/go-network','/admin/health','/admin/system-health','/admin/log-health','/admin/plugin-health','/admin/log-diagnostics','/admin/plugin-diagnostics','/admin/server-compare','/admin/cleanup'];
const settingsTabs=['/settings/jellyfin','/settings/sso','/settings/plugin/security','/settings/media','/settings/scheduler','/settings/dataBackups','/settings/notifications'];
const report={date:'2026-10-10',scope:'Fresh isolated SQLite, real administrator login and signed standard session. No role response interception. No destructive admin or backup request executed.',checks:[],pages:[],pageErrors:[]};
function assert(name,ok,details){report.checks.push({name,ok:!!ok,...(details?{details}:{})});}
async function test(name,run){try{await run();}catch(error){assert(name,false,error.message);}}
function write(){fs.writeFileSync(path.join(output,'go-results.json'),JSON.stringify(report,null,2));}
(async()=>{
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({baseURL:base,viewport:{width:1440,height:900},locale:'fr-FR',colorScheme:'dark'});
  const login=await context.request.post('/api/auth/login',{headers:{Origin:base},data:{username:'settingsadmin',password:'Settings-admin-QA-test-2026!'}});
  if(!login.ok())throw Error('Real admin login failed: '+login.status());
  assert('Real administrator session',true);
  report.embeddedAssets=[];
  for(const file of ['app.js','app.css','navigation.js','navigation.css','settings.js','settings.css','admin.js','admin.css']){
   const response=await context.request.get('/assets/'+file),actual=await response.body(),expected=fs.readFileSync(path.resolve(__dirname,'../../web/dist/assets',file));
   const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
   assert('Embedded runtime asset matches final source '+file,response.ok()&&hash(actual)===hash(expected));report.embeddedAssets.push({file,sha256:hash(actual),status:response.status()});
  }
  const principal=await (await context.request.get('/api/auth/me')).json();
  const headers={Origin:base,'X-CSRF-Token':principal.csrfToken};
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
  await context.addInitScript(()=>{localStorage.setItem('jt_locale','fr');localStorage.setItem('jt_theme','dark');});
  for(const route of routes){await test('Route '+route,async()=>{
   const httpErrors=[];const handler=response=>{if(response.status()>=400)httpErrors.push({path:new URL(response.url()).pathname,status:response.status()});};page.on('response',handler);
   try{
    await page.goto(route,{waitUntil:'networkidle'});
    const record={route,actual:new URL(page.url()).pathname,headings:await page.locator('#app-main h1,#app-main h2,#app-main h3').allTextContents(),httpErrors};
    record.controls=await page.locator('#app-main input,#app-main select,#app-main button').evaluateAll(elements=>elements.map(el=>({tag:el.tagName,type:el.getAttribute('type'),id:el.id,name:el.name||'',text:el.tagName==='BUTTON'?el.textContent.trim():'',disabled:el.disabled})));
    report.pages.push(record);
    assert('Rendered '+route,record.headings.length>0&&!(await page.locator('#app-main').innerText()).includes('Erreur de chargement'));
    assert('HTTP content successful '+route,httpErrors.length===0,httpErrors.length?JSON.stringify(httpErrors):undefined);
    if(route.startsWith('/settings/')&&!['/settings/analytics'].includes(route)){
     const links=await page.locator('.historical-settings-tabs a').evaluateAll(elements=>elements.map(el=>el.getAttribute('href')));
     assert('Seven historical tabs in order '+route,JSON.stringify(links)===JSON.stringify(settingsTabs));
     const labels=await page.locator('.historical-settings-tabs a span').allTextContents();
     assert('Exact French historical tab labels '+route,JSON.stringify(labels)===JSON.stringify(['Jellyfin','SSO','Sécurité','Paramètres Média','Planificateur de Tâches','Sauvegardes de Données','Notifications']));
     const expected=record.actual==='/settings/plugin'?'/settings/jellyfin':settingsTabs.find(href=>record.actual.startsWith(href));
     const selected=await page.locator('.historical-settings-tabs a.active').evaluateAll(elements=>elements.map(el=>el.getAttribute('href')));
     assert('Historical active tab '+route,JSON.stringify(selected)===JSON.stringify(expected?[expected]:[]));
    }
    const slug=route.replace(/^\//,'').replaceAll('/','-');await page.screenshot({path:path.join(captures,'go-'+slug+'-desktop-dark.png')});
    if(['/settings/jellyfin','/settings/media','/settings/scheduler','/admin/health','/admin/server-compare'].includes(route)){
     await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
     assert('Viewport fits '+route,await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
     await page.screenshot({path:path.join(captures,'go-'+slug+'-mobile-dark.png')});
     await page.setViewportSize({width:1440,height:900});await page.locator('#btn-theme-toggle').click();await page.waitForTimeout(150);
     assert('Light theme '+route,await page.evaluate(()=>!document.documentElement.classList.contains('dark')));
     await page.screenshot({path:path.join(captures,'go-'+slug+'-desktop-light.png')});await page.locator('#btn-theme-toggle').click();
    }
   }finally{page.off('response',handler);write();}
  });}
  await test('Historical alias and browser back',async()=>{
   await page.goto('/settings?qa=1',{waitUntil:'networkidle'});assert('Settings alias retains query',new URL(page.url()).pathname==='/settings/jellyfin'&&new URL(page.url()).search==='?qa=1');
   await page.locator('.historical-settings-tabs a[href="/settings/media"]').click();await page.waitForTimeout(150);
   await page.goBack({waitUntil:'networkidle'});assert('Browser back restores settings parent',new URL(page.url()).pathname==='/settings/jellyfin');
  });
  await test('Exact historical aliases with replace history',async()=>{
   for(const [alias,target] of [['/settings/overview','/settings/jellyfin'],['/settings/network','/settings/jellyfin'],['/admin/log-health','/admin/health'],['/admin/plugin-health','/admin/health']]){
    await page.goto('/media',{waitUntil:'networkidle'});
    await page.evaluate(url=>window.JellyTrackNavigation ? document.querySelector('#app-main').insertAdjacentHTML('beforeend', '<a data-link id="qa-alias" href="'+url+'">QA</a>'):null,alias);
    await page.locator('#qa-alias').click();await page.waitForTimeout(500);
    assert('Historical redirect '+alias,new URL(page.url()).pathname===target);
    await page.goBack({waitUntil:'networkidle'});assert('Alias replaces history '+alias,new URL(page.url()).pathname==='/media');
   }
  });
  await test('FR EN navigation translations',async()=>{
   await page.goto('/settings/media',{waitUntil:'networkidle'});await page.locator('#language-trigger').click();await page.locator('[data-locale=en]').click();await page.waitForTimeout(300);
   assert('English settings tabs',await page.locator('.historical-settings-tabs').innerText().then(text=>text.includes('Media')&&!text.includes('Paramètres')));
   assert('English page headings',await page.locator('#app-main').innerText().then(text=>!text.includes('settings.')&&!text.includes('ssoSettings.')&&!text.includes('securitySettings.')));
   await page.screenshot({path:path.join(captures,'go-settings-media-en-desktop-dark.png')});
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(captures,'go-settings-media-en-mobile-dark.png')});await page.setViewportSize({width:1440,height:900});
   await page.goto('/admin/health',{waitUntil:'networkidle'});await page.screenshot({path:path.join(captures,'go-admin-health-en-desktop-dark.png')});
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(captures,'go-admin-health-en-mobile-dark.png')});await page.setViewportSize({width:1440,height:900});
   await page.locator('#language-trigger').click();await page.locator('[data-locale=fr]').click();
  });
  const restricted=['/api/settings','/api/settings/sso','/api/settings/jellyfin-servers','/api/admin/health','/api/admin/cleanup','/api/admin/security/overview','/api/admin/security/smart-settings','/api/admin/plugin/health','/api/admin/server-compare','/api/logs/system','/api/backup/auto','/api/backup/export','/api/plugin/api-key'];
  const anonymous=await browser.newContext({baseURL:base});
  const standard=await browser.newContext({baseURL:base});
  const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../scratch/settings-admin-qa/standard-cookie.json')));
  await standard.addCookies([{name:'jellytrack_session',value:fixture.cookie,url:base}]);
  const standardMe=await standard.request.get('/api/auth/me');assert('Genuine standard session',standardMe.ok()&&(await standardMe.json()).role==='user');
  for(const route of restricted){assert('Anonymous denied '+route,(await anonymous.request.get(route)).status()===401);assert('Standard denied '+route,(await standard.request.get(route)).status()===403);}
  const userPage=await standard.newPage();
  await userPage.goto('/media',{waitUntil:'networkidle'});
  assert('Standard sidebar hides administrative menus',await userPage.locator('#historical-nav a[href="/settings"],#historical-nav a[href="/admin/health"],#historical-nav a[href="/admin/server-compare"]').count()===0);
  for(const route of ['/settings/media','/settings/sso','/admin/health','/admin/server-compare']){
   await userPage.goto(route,{waitUntil:'networkidle'});assert('Standard UI redirect '+route,!new URL(userPage.url()).pathname.startsWith('/settings')&&!new URL(userPage.url()).pathname.startsWith('/admin'));
  }
  const userPrincipal=await(await standard.request.get('/api/auth/me')).json();
  for(const[method,route]of [['POST','/api/settings'],['PUT','/api/settings/sso'],['PATCH','/api/admin/security/smart-settings'],['POST','/api/settings/jellyfin-servers/plugin-key'],['POST','/api/backup/auto/trigger'],['PATCH','/api/settings/jellyfin-servers']]){
   const denied=await standard.request.fetch(route,{method,headers:{Origin:base,'X-CSRF-Token':userPrincipal.csrfToken},data:{}});
   assert('Standard mutation denied '+method+' '+route,denied.status()===403);
  }
  // Invalid requests cannot change unrelated valid fields: independently check API readback.
  await test('Rejected settings payload is atomic',async()=>{
   const before=await(await context.request.get('/api/settings')).json();
   const rejected=await context.request.post('/api/settings',{headers,data:{wrappedVisible:!before.wrappedVisible,defaultLocale:'not-a-locale'}});
   const after=await(await context.request.get('/api/settings')).json();
   assert('Invalid settings rejected',rejected.status()===400);assert('Valid field in invalid payload unchanged',before.wrappedVisible===after.wrappedVisible);
  });
  assert('No uncaught JavaScript errors',report.pageErrors.length===0,report.pageErrors.length?JSON.stringify(report.pageErrors):undefined);
  await context.close();await anonymous.close();await standard.close();
 }finally{write();await browser.close();}
 const failed=report.checks.filter(check=>!check.ok);console.log(JSON.stringify({checks:report.checks.length,failed,pageErrors:report.pageErrors}));if(failed.length)process.exitCode=1;
})().catch(error=>{report.fatal=error.message;write();console.error(error);process.exitCode=1;});
