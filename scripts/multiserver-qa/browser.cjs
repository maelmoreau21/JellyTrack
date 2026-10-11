const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve(__dirname,'../../docs/multiserver');fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[],scope:'Disposable SQLite browser fixtures with two simulated Jellyfin endpoints; API and ingestion contracts separately tested on SQLite and PostgreSQL.'};
function check(name,ok){report.checks.push({name,ok});console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw Error(name)}
(async()=>{const browser=await chromium.launch();try{
for(const [mode,port] of [['multi',3358],['single',3359]]){
 const base=`http://127.0.0.1:${port}`;const context=await browser.newContext({baseURL:base,viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{localStorage.setItem('jt_locale','fr')});
 const login=await context.request.post('/api/auth/login',{headers:{Origin:base},data:{username:'multiadmin',password:'Multi-test-only-2026!'}});check(mode+' real login',login.ok());
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(mode+': '+e.message));
 const body=async()=>await page.locator('#app-main').innerText();
 await page.goto('/');await page.locator('#dash-server-filter-container').waitFor({state:'attached'});await page.waitForFunction(()=>document.querySelector('#dash-server-filter-container')?.innerHTML || !document.querySelector('.skeleton'));
 if(mode==='multi'){
  await page.locator('#dash-server-comparison').waitFor();check('multi dashboard comparison',await page.locator('#dash-server-comparison').innerText().then(t=>t.includes('Serveur A')&&t.includes('Serveur B')));
  check('multi dashboard server filter',await page.locator('#dash-server-filter-container').isVisible());
  check('multi live session server names',await page.locator('.stream-card .badge-info').innerText().catch(()=>page.locator('.stream-card .badge-info').allInnerTexts()).then(t=>String(t).includes('Serveur A')));
  const links=await page.locator('.stream-card a.stream-title').evaluateAll(items=>items.map(a=>a.getAttribute('href')));check('live links keep server identity',links.length===2&&links.every(link=>link.includes('serverId=')));
  await page.locator('#dash-server-filter-container [data-server-id=a]').click();await page.waitForFunction(()=>document.querySelectorAll('.stream-card').length===1);check('server filter updates live sessions',await page.locator('.stream-card').count()===1);
  await page.goto('/');await page.locator('#dash-server-comparison').waitFor();
 }else{check('mono dashboard filter hidden',!(await page.locator('#dash-server-filter-container').isVisible()));check('mono comparison absent',await page.locator('#dash-server-comparison').count()===0)}
 await page.screenshot({path:path.join(out,mode+'-dashboard.png'),fullPage:true});
 await page.goto('/logs?servers=all');await page.locator('.history-media').first().waitFor();
 check(mode+' history server labels',await page.locator('.history-media .badge-info').count()===(mode==='multi'?2:0));
 await page.screenshot({path:path.join(out,mode+'-history.png'),fullPage:true});
 await page.goto('/users/ua?serverId=a');await page.locator('.profile-metrics').waitFor();
 check(mode+' profile extra visibility',(await body()).includes('Activit\u00e9 par serveur')===(mode==='multi'));
 await page.screenshot({path:path.join(out,mode+'-profile.png'),fullPage:true});
 await page.goto('/media/ma?serverId=a');await page.locator('.mr-detail-layout h1').waitFor();
 check(mode+' availability extra visibility',(await body()).includes('Disponible sur')===(mode==='multi'));
 if(mode==='multi')check('media availability provider match',(await body()).includes('Serveur B'));
 await page.screenshot({path:path.join(out,mode+'-media.png'),fullPage:true});
 await page.goto('/admin/health?tab=logs');await page.locator('#ar-health-panel').waitFor();
 check(mode+' health extra visibility',(await body()).includes('Serveurs Jellyfin')===(mode==='multi'));
 if(mode==='multi')check('health latency and connection visible',(await body()).includes('5 ms')&&(await body()).includes('6 ms'));
 if(mode==='multi')check('health values are actual table cells',await page.locator('.ar-panel').filter({hasText:'Serveurs Jellyfin'}).locator('tbody tr').count()===2&&await page.locator('.ar-panel').filter({hasText:'Serveurs Jellyfin'}).locator('tbody td').count()===8);
 await page.screenshot({path:path.join(out,mode+'-health.png'),fullPage:true});
 await page.goto('/settings/jellyfin');await page.locator('[data-action=add-toggle]').waitFor();check(mode+' can add another server',await page.locator('[data-action=add-toggle]').isVisible());
 await page.setViewportSize({width:390,height:844});await page.goto('/admin/health?tab=logs');await page.locator('#ar-health-panel').waitFor();
 check(mode+' mobile health fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:path.join(out,mode+'-health-mobile.png'),fullPage:true});
 await context.close();
}
check('no browser runtime errors',report.errors.length===0);
}finally{fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
