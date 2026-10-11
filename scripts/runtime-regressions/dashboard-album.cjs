const fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://localhost:3350',out=path.resolve('docs/runtime-regressions'),report={checks:[],errors:[]};
function check(name,ok,data){report.checks.push({name,ok:!!ok,data});if(!ok)throw Error(name+': '+JSON.stringify(data));}
(async()=>{const browser=await chromium.launch();try{
const ctx=await browser.newContext({baseURL:base,viewport:{width:1440,height:900},locale:'fr-FR'});
await ctx.addInitScript(()=>{localStorage.setItem('jt_locale','fr');localStorage.setItem('jt_theme','dark');});
const login=await ctx.request.post('/api/auth/login',{headers:{Origin:base},data:{username:'mediaadmin',password:'Media-pages-QA-test-2026!'}});check('Fixture login',login.ok());
const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));
const responsePromise=p.waitForResponse(r=>r.url().includes('/api/dashboard?')&&r.status()===200);await p.goto('/');const data=await (await responsePromise).json();
await p.waitForFunction(()=>document.querySelector('#today-plays-val')?.textContent!=='0');
check('Today plays displays actual nonzero API result',await p.locator('#today-plays-val').textContent()===String(data.todayPlays),data.todayPlays);
check('Today hours matches API',await p.locator('#today-hours-val').textContent()===data.todayHours+'h',data.todayHours);
await p.locator('[data-tab="analytics"]').click();await p.locator('.attendance-table').waitFor();
for(const theme of ['dark','light']){await p.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme);
for(const width of [1440,768,390,320]){await p.setViewportSize({width,height:900});await p.evaluate(()=>window.JellyTrackNavigation.closeMobile());
const box=await p.locator('.attendance-heatmap-container').evaluate(e=>({scroll:e.scrollWidth,width:e.clientWidth,columns:e.querySelectorAll('thead th').length,cell:e.querySelector('.attendance-cell').getBoundingClientRect().width}));check('All 24 hours fit '+theme+' '+width,box.scroll<=box.width&&box.columns===25&&box.cell>0,box);
check('No page overflow '+theme+' '+width,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await p.locator('.attendance-card').screenshot({path:path.join(out,`attendance-${theme}-${width}.png`)});}}
await p.goto('/logs?tab=system');await p.locator('.history-media').first().waitFor();check('System tab removed',await p.locator('#history-tab-system').count()===0);check('Playback logs remain visible',await p.locator('#history-playback-panel').isVisible());
await p.goto('/media/qa-primary-album');await p.locator('.mr-media-hero').waitFor();check('Album renders',await p.locator('h1').last().textContent()==='Album principal QA');check('Album has real tracks',await p.locator('a[href*="qa-primary-track"]').count()>=3);await p.screenshot({path:path.join(out,'album-runtime.png'),fullPage:true});
check('No JavaScript errors',report.errors.length===0,report.errors);
}finally{await browser.close();fs.writeFileSync(path.join(out,'dashboard-album-results.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
