// Run against isolated QA data only. Browser presentation scenarios are explicitly mocked.
const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if(!process.env.GO_QA_PASSWORD)throw Error('GO_QA_PASSWORD is required for an isolated QA account');
const base=process.env.GO_QA_URL||'http://localhost:3310';
const reportDirectory=process.env.GO_QA_OUTPUT || path.resolve(__dirname,'../../scratch/navigation-qa');fs.mkdirSync(reportDirectory,{recursive:true});const out=path.join(reportDirectory,'captures');fs.mkdirSync(out,{recursive:true});
const report={source:'Live Go server; real admin login; role/configuration variants intercept only navigation presentation context',checks:[],cases:[]};
function check(name,ok,detail){report.checks.push({name,ok:!!ok,detail});fs.writeFileSync(path.join(reportDirectory,'go-results-progress.json'),JSON.stringify(report,null,2));console.log((ok?'PASS ':'FAIL ')+name);}
(async()=>{
 const browser=await chromium.launch({headless:true});
 const auth=await browser.newContext({baseURL:base});
 const response=await auth.request.post('/api/auth/login',{headers:{Origin:base},data:{username:process.env.GO_QA_USER||'navigationadmin',password:process.env.GO_QA_PASSWORD}});
 if(!response.ok())throw new Error('QA login HTTP '+response.status()+': '+await response.text());
 const realUser=await response.json(),storageState=await auth.storageState();
 for(const scenario of [
  {name:'admin-single',role:'admin',multi:false,uid:'local-admin'},
  {name:'admin-multi',role:'admin',multi:true,uid:'jf-0'},
  {name:'user-wrapped',role:'user',multi:false,uid:'jf-0',wrapped:true},
  {name:'user-no-wrapped',role:'user',multi:false,uid:'jf-0',wrapped:false},
  {name:'user-backup',role:'user',multi:true,uid:'jf-0',wrapped:true,backup:true},
  {name:'user-no-id',role:'user',multi:false,uid:''},
 ]){
  for(const mobile of scenario.name==='admin-single'||scenario.name==='user-backup'?[false,true]:[false]){
   const context=await browser.newContext({baseURL:base,storageState,viewport:mobile?{width:390,height:844}:{width:1440,height:900},locale:'fr-FR',colorScheme:'dark'});
   await context.addInitScript(()=>{if(!localStorage.getItem('qa_initialized')){localStorage.setItem('jt_theme','dark');localStorage.setItem('jt_locale','fr');localStorage.removeItem('jellytrack_sidebar_collapsed');localStorage.setItem('qa_initialized','true');}});
   await context.route('**/api/auth/me',route=>route.fulfill({json:{...realUser,username:scenario.role==='admin'?'Admin QA':'Alice QA',role:scenario.role,jellyfinUserId:scenario.uid,authServerIsPrimary:!scenario.backup,authServerName:scenario.backup?'QA secours':'QA principal'}}));
   await context.route('**/api/navigation',route=>route.fulfill({json:{multiServer:scenario.multi,wrappedVisible:scenario.wrapped!==false,appVersion:'2.1.1'}}));
   const page=await context.newPage(),item={scenario:scenario.name,mobile,consoleErrors:[],httpErrors:[],links:[]};
   page.on('pageerror',e=>item.consoleErrors.push(e.message));
   page.on('console',m=>{if(m.type()==='error')item.consoleErrors.push(m.text());});
   page.on('response',r=>{if(r.status()>=400)item.httpErrors.push({url:r.url(),status:r.status()});});
   await page.goto('/about',{waitUntil:'networkidle'});await page.waitForTimeout(350);
   if(mobile){await page.screenshot({path:path.join(out,`go-${scenario.name}-mobile-closed.png`)});await page.locator('#mobile-menu-btn').click();await page.waitForTimeout(350);}
   const nav=await page.locator('#historical-nav a').evaluateAll(as=>as.map(a=>a.getAttribute('href')));
   item.links=nav;
   const expected=[];if(scenario.uid&&scenario.uid!=='local-admin')expected.push('/users/'+scenario.uid);
   if(scenario.role==='admin'){expected.push('/','/recent','/media','/users','/admin/health','/logs','/settings');if(scenario.multi)expected.push('/admin/server-compare');}
   else{expected.push('/media','/recent');if(scenario.uid&&scenario.wrapped!==false)expected.push('/wrapped/'+scenario.uid);}
   check(`${scenario.name}/${mobile?'mobile':'desktop'} order`,JSON.stringify(nav)===JSON.stringify(expected),{nav,expected});
   check(`${scenario.name} backup visibility`,await page.locator('#backup-server-banner').isVisible()===!!scenario.backup);
   check(`${scenario.name} Go extra visibility`,await page.locator('#go-navigation-extras').isVisible()===(scenario.role==='admin'));
   await page.screenshot({path:path.join(out,`go-${scenario.name}-${mobile?'mobile-open':'desktop-open'}.png`)});
   if(!mobile){
    await page.locator('#sidebar-collapse-btn').click();await page.waitForTimeout(350);
    const width=await page.locator('#app-sidebar').evaluate(el=>el.getBoundingClientRect().width);
    check(`${scenario.name} collapsed width`,Math.abs(width-80)<1,width);
    await page.screenshot({path:path.join(out,`go-${scenario.name}-desktop-collapsed.png`)});
    await page.reload({waitUntil:'networkidle'});check(`${scenario.name} collapse persistence`,await page.locator('#app-sidebar').evaluate(el=>el.classList.contains('collapsed')));
    await page.locator('#sidebar-collapse-btn').click();await page.waitForTimeout(350);
   }
   await page.locator('#language-trigger').click();check(`${scenario.name} language choices`,await page.locator('#language-menu [data-locale]').count()===10);
   await page.locator('[data-locale="en"]').click();await page.waitForTimeout(550);
   check(`${scenario.name} language change`,await page.locator('html').getAttribute('lang')==='en');
   if(mobile && !(await page.locator('#app-sidebar').evaluate(el=>el.classList.contains('mobile-open')))){await page.locator('#mobile-menu-btn').click();await page.waitForTimeout(350);}
   await page.locator('#language-trigger').click();await page.locator('[data-locale="fr"]').click();await page.waitForTimeout(350);
   if(mobile && !(await page.locator('#app-sidebar').evaluate(el=>el.classList.contains('mobile-open')))){await page.locator('#mobile-menu-btn').click();await page.waitForTimeout(350);}
   const themeBefore=await page.locator('html').getAttribute('class');await page.locator('#btn-theme-toggle').click();await page.waitForTimeout(350);check(`${scenario.name} theme toggle`,await page.locator('html').getAttribute('class')!==themeBefore);
   if(mobile && !(await page.locator('#app-sidebar').evaluate(el=>el.classList.contains('mobile-open')))){await page.locator('#mobile-menu-btn').click();await page.waitForTimeout(350);}
   await page.locator('#btn-theme-toggle').click();await page.waitForTimeout(350);
   if(mobile && !(await page.locator('#app-sidebar').evaluate(el=>el.classList.contains('mobile-open')))){await page.locator('#mobile-menu-btn').click();await page.waitForTimeout(350);}
   await page.locator('#nav-search-input').fill('Movie');await page.waitForTimeout(650);check(`${scenario.name} global search visible`,await page.locator('#nav-search-results').isVisible());
   await page.screenshot({path:path.join(out,`go-${scenario.name}-${mobile?'mobile':'desktop'}-search.png`)});
   await page.keyboard.press('Escape');
   if(mobile){check(`${scenario.name} escape closes mobile`,!(await page.locator('#app-sidebar').evaluate(el=>el.classList.contains('mobile-open'))));await page.locator('#mobile-menu-btn').click();}
   if(scenario.name==='admin-single'&&!mobile){
    const historicalLinks=[...nav.filter(h=>h!=='/users/local-admin'),'/about'];
    for(const href of historicalLinks){await page.goto(href,{waitUntil:'networkidle'});const active=await page.locator('#historical-nav a.active').evaluateAll(as=>as.map(a=>a.getAttribute('href')));item.routeResults??=[];item.routeResults.push({href,url:page.url(),active,title:await page.locator('main').innerText({timeout:1000})});check(`route ${href} location`,new URL(page.url()).pathname===(href==='/settings'?'/settings/jellyfin':href));}
    await page.goto('/settings',{waitUntil:'networkidle'});
    const tabs=await page.locator('.historical-settings-tabs a').evaluateAll(as=>as.map(a=>a.getAttribute('href')));check('settings historical tab count',tabs.length===7,tabs);
    for(const href of tabs){await page.locator(`.historical-settings-tabs a[href="${href}"]`).click();await page.waitForTimeout(550);check(`settings ${href} active`,await page.locator(`.historical-settings-tabs a[href="${href}"]`).getAttribute('aria-current')==='page');}
    await page.locator('#go-navigation-extras summary').click();
    const extras=await page.locator('#go-extras-links a').evaluateAll(as=>as.map(a=>a.getAttribute('href')));
    for(const href of extras){await page.goto(href,{waitUntil:'networkidle'});check(`extra ${href} location`,new URL(page.url()).pathname===href);}
    await page.goto('/admin/health',{waitUntil:'networkidle'});
    check('health historical main tabs',await page.locator('[data-health-panel]').count()===3);
    check('health cleanup nested tabs',await page.locator('[data-cleanup-panel]').count()===3);
    for(const category of ['ghosts','abandoned','duplicates']){await page.locator(`[data-cleanup-panel="${category}"]`).click();check(`health cleanup ${category} active`,await page.locator(`[data-cleanup-panel="${category}"]`).getAttribute('aria-selected')==='true');}
    for(const panel of ['security','logs','cleanup']){await page.locator(`[data-health-panel="${panel}"]`).click();await page.waitForTimeout(500);check(`health ${panel} active`,await page.locator(`[data-health-panel="${panel}"]`).getAttribute('aria-selected')==='true');}
    await page.screenshot({path:path.join(out,'go-admin-health.png')});
    await page.goto('/settings/scheduler',{waitUntil:'networkidle'});
    check('scheduler intervals section',await page.locator('#form-scheduler-intervals').count()===1);
    check('scheduler Wrapped section',await page.locator('main').innerText().then(t=>t.includes('Wrapped')));
    await page.screenshot({path:path.join(out,'go-admin-scheduler.png')});
    await page.goto('/logs?tab=system',{waitUntil:'networkidle'});check('logs system query retained',new URL(page.url()).search==='?tab=system');
   }
   await page.goto('/media',{waitUntil:'networkidle'});
   check(`${scenario.name} analysis visibility`,await page.locator('main a[href="/media/analysis"]').count()===(scenario.role==='admin'?1:0));
   if(scenario.role!=='admin'){await page.goto('/admin/health',{waitUntil:'networkidle'});check(`${scenario.name} protected route denied`,new URL(page.url()).pathname!=='/admin/health'||(await page.locator('main').innerText()).includes('Accès réservé'));
   }
   if(mobile){if(!(await page.locator('#app-sidebar').evaluate(el=>el.classList.contains('mobile-open'))))await page.locator('#mobile-menu-btn').click();await page.locator('#historical-nav a[href="/recent"]').click();await page.waitForTimeout(650);check('mobile route change closes drawer',!(await page.locator('#app-sidebar').evaluate(el=>el.classList.contains('mobile-open'))));}
   check(`${scenario.name} runtime JS errors`,item.consoleErrors.length===0,item.consoleErrors);
   report.cases.push(item);await context.close();
  }
 }
 const logout=await browser.newContext({baseURL:base,storageState});const page=await logout.newPage();await page.goto('/about',{waitUntil:'networkidle'});await page.locator('#btn-logout').click();await page.waitForTimeout(550);check('real logout redirects login',new URL(page.url()).pathname==='/login');const me=await logout.request.get('/api/auth/me');check('real logout invalidates session',me.status()===401,me.status());await logout.close();
 await browser.close();fs.writeFileSync(path.join(reportDirectory,'go-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(c=>!c.ok),cases:report.cases.map(c=>({scenario:c.scenario,mobile:c.mobile,consoleErrors:c.consoleErrors,httpErrors:c.httpErrors}))},null,2));if(report.checks.some(c=>!c.ok)||report.cases.some(c=>c.consoleErrors.length||c.httpErrors.length))process.exitCode=1;
})().catch(e=>{fs.writeFileSync(path.join(reportDirectory,'go-results.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(reportDirectory,'go-error.txt'),e.stack);console.error(e);process.exit(1)});
