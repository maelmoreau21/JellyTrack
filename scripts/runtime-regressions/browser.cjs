const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://localhost:3350',report={checks:[],errors:[],limits:['Isolated SQLite fixture; no production Jellyfin service or production memory measurement.']};
const out=path.resolve(__dirname,'../../docs/runtime-regressions');fs.mkdirSync(out,{recursive:true});
const check=(name,ok,details)=>{report.checks.push({name,ok:!!ok,details});if(!ok)throw Error(name+': '+JSON.stringify(details));};
(async()=>{const browser=await chromium.launch();try{
const ctx=await browser.newContext({baseURL:base,viewport:{width:1440,height:900}});
await ctx.addInitScript(()=>{localStorage.setItem('jt_locale','fr');localStorage.setItem('jt_theme','dark');});
const login=await ctx.request.post('/api/auth/login',{headers:{Origin:base},data:{username:'mediaadmin',password:'Media-pages-QA-test-2026!'}});check('Real login',login.ok());
const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.setDefaultTimeout(10000);
await p.goto('/recent');await p.locator('.mr-card').first().waitFor().catch(()=>p.locator('#mr-list a').first().waitFor());
check('Recent five direct category buttons',await p.locator('[data-category]').count()===5);
check('Recent no extra dropdown',await p.locator('.mr-extra-filters').count()===0);
check('Sidebar extras removed',await p.locator('#go-navigation-extras').count()===0);
await p.locator('[data-category="MusicAlbum"]').click();await p.waitForURL(/excludeTypes/);await p.waitForTimeout(400);
check('Music group query',new URL(p.url()).searchParams.get('excludeTypes').includes('Book'));
await p.locator('[data-category="Book"]').click();await p.waitForTimeout(400);
check('Music plus Books selectable',!new URL(p.url()).searchParams.get('excludeTypes').includes('Book')&&await p.locator('[data-category="Book"]').getAttribute('aria-pressed')==='true');
await p.locator('[data-category="all"]').click();await p.waitForTimeout(400);check('Tout resets exclusions',!new URL(p.url()).searchParams.get('excludeTypes'));
for(const scheme of ['dark','light']){
await p.evaluate(v=>{document.documentElement.classList.toggle('dark',v==='dark');localStorage.setItem('jt_theme',v);},scheme);
for(const width of [1440,390]){await p.setViewportSize({width,height:width===390?844:900});if(width===390)await p.evaluate(()=>window.JellyTrackNavigation.closeMobile());await p.waitForTimeout(350);check('Recent no overflow '+scheme+' '+width,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,`recent-${scheme}-${width}.png`)});}}
await p.setViewportSize({width:1440,height:900});await p.goto('/media/all');await p.locator('.mr-extra-filters').waitFor();check('Other catalogue controls preserved',await p.locator('#mr-extra-types').count()===1&&await p.locator('#mr-search').count()===1);
await p.goto('/logs');await p.locator('.history-media').first().waitFor();const squares=await p.locator('.history-poster-square').evaluateAll(es=>es.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));check('Audio square covers',squares.length>0&&squares.every(e=>e.width===e.height),squares);
const option=await p.locator('select option').first().evaluate(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));check('Select options theme background',option.bg!=='rgba(0, 0, 0, 0)',option);
let cleanupRequested=false,release;const gate=new Promise(r=>release=r);
await p.route('**/api/admin/cleanup',async route=>{cleanupRequested=true;await gate;await route.continue().catch(()=>{});});
await p.goto('/admin/health?tab=security');await p.locator('[data-ar-tab="health:security"]').waitFor();check('Security avoids cleanup request',!cleanupRequested);
await p.locator('[data-ar-tab="health:cleanup"]').click();await p.waitForTimeout(300);check('Cleanup loads only on its tab',cleanupRequested);
check('Health remains usable during delayed cleanup',await p.locator('[data-ar-tab="health:security"]').isVisible());await p.locator('[data-ar-tab="health:security"]').click();release();await p.unroute('**/api/admin/cleanup');
await p.goto('/settings/jellyfin');await p.locator('#app-main').getByText('QA principal',{exact:false}).first().waitFor();check('Jellyfin configured server visible',true);
// Hold a read to verify the actual navigation AbortSignal, then accelerate
// only the 30-second timer to exercise the timeout failure branch.
await p.evaluate(()=>{const original=window.fetch;window.fetch=(url,opts)=>{if(String(url).startsWith('/api/media?'))window.runtimeReadSignal=opts.signal;return original(url,opts);};});
let unblock;const held=new Promise(r=>unblock=r);
await p.route('**/api/media?**',async route=>{await held;await route.continue().catch(()=>{});});
await p.locator('a[href="/recent"]').first().click();await p.waitForFunction(()=>window.runtimeReadSignal);
await p.locator('a[href="/logs"]').first().click();check('Leaving page cancels its request',await p.evaluate(()=>window.runtimeReadSignal.aborted));unblock();await p.unroute('**/api/media?**');
await p.evaluate(()=>{const timer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timer(fn,ms===30000?200:ms,...args);window.runtimeReadSignal=null;});
let timeoutRelease;const timeoutHeld=new Promise(r=>timeoutRelease=r);await p.route('**/api/media?**',async route=>{await timeoutHeld;await route.continue().catch(()=>{});});
await p.locator('a[href="/recent"]').first().click();await p.waitForFunction(()=>document.querySelector('#app-main')?.textContent.includes('Le serveur ne répond pas'));
check('Stuck read displays retryable timeout',true);timeoutRelease();await p.unroute('**/api/media?**');
const anonymous=await browser.newContext({baseURL:base,viewport:{width:390,height:844}});const lp=await anonymous.newPage();lp.on('pageerror',e=>report.errors.push(e.message));await lp.goto('/login');await lp.locator('.auth-language-picker summary').click();check('Login ten languages',await lp.locator('[data-login-locale]').count()===10);check('Login flags loaded',await lp.locator('.auth-language-options img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));
await lp.locator('[data-login-locale="en"]').click();await lp.waitForTimeout(200);check('Login language saved',await lp.evaluate(()=>localStorage.getItem('jt_locale'))==='en');await lp.screenshot({path:path.join(out,'login-mobile.png')});await anonymous.close();
check('No JavaScript runtime error',report.errors.length===0,report.errors);
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{await browser.close();fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.filter(c=>c.ok).length,failure:report.failure}));}})();
