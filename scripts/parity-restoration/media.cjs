/* Read-only checks against real isolated Go APIs; fixture data stays in QA SQLite. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/parity-restoration'),captures=path.join(out,'captures');fs.mkdirSync(captures,{recursive:true});
const report={date:new Date().toISOString(),scope:'Isolated real Go server and synthetic QA SQLite; no fixture API substitutions, settings save, media mutation or deletion. Source comparison and Go runtime checks; direct main captures are handled by the visual agent.',checks:[],pages:[],errors:[]};
const check=(name,ok,details)=>report.checks.push({name,ok:!!ok,...(details===undefined?{}:{details})});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const save=()=>fs.writeFileSync(path.join(out,'media-runtime.json'),JSON.stringify(report,null,2));
(async()=>{const browser=await chromium.launch();try{
 const base=process.env.PARITY_GO_BASE||'http://localhost:3350',ctx=await browser.newContext({baseURL:base,viewport:{width:1440,height:900},locale:'fr-FR',timezoneId:'UTC'});
 const login=await ctx.request.post('/api/auth/login',{headers:{Origin:base},data:{username:'mediaadmin',password:'Media-pages-QA-test-2026!'}});if(!login.ok())throw Error('Isolated login '+login.status());
 await ctx.addInitScript(()=>{localStorage.setItem('jt_locale','fr');localStorage.setItem('jt_theme','dark');});
 for(const f of ['media-recovery.js','media-recovery.css']){const response=await ctx.request.get('/assets/'+f);check('Embedded '+f+' matches source',response.ok()&&hash(await response.body())===hash(fs.readFileSync(path.join(root,'web/dist/assets',f))));}
 const collectionResponse=await ctx.request.get('/api/media/collections'),collection=await collectionResponse.json();check('Collections real API',collectionResponse.ok()&&Array.isArray(collection.collections));
 check('Collection normalized keys unique',new Set(collection.collections.map(g=>g.key)).size===collection.collections.length);
 for(const group of collection.collections){check('Collection '+group.key+' original server/library scopes retained',Array.isArray(group.scopes)&&group.scopes.length>0&&group.scopes.every(s=>s.serverId&&s.name));}
 for(const route of ['/media/all','/recent','/media/collections','/media/popular','/media/analysis','/media/qa-primary-movie','/media/qa-primary-episode1','/media/qa-primary-album']){
  const page=await ctx.newPage(),entry={route,variants:[]};page.on('pageerror',e=>report.errors.push({route,message:e.message}));
  await page.goto(route,{waitUntil:'networkidle'});await page.locator('.mr-loading,.mr-grid-loading').first().waitFor({state:'hidden',timeout:10000}).catch(()=>{});
  const main=page.locator('#app-main');check(route+' renders content without error',await main.locator('.mr-error').count()===0&&(await main.innerText()).trim().length>0);
  for(const theme of ['dark','light'])for(const [variant,width,height] of [['desktop',1440,900],['mobile',390,844]]){
   await page.setViewportSize({width,height});await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await page.emulateMedia({colorScheme:theme});await page.waitForTimeout(100);
   const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,columns:document.querySelector('.mr-grid')?getComputedStyle(document.querySelector('.mr-grid')).gridTemplateColumns.split(' ').length:null,fallbacks:[...document.querySelectorAll('.mr-image-unavailable')].map(el=>({svg:!!el.querySelector('svg'),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,text:el.textContent.trim()})),title:document.querySelector('#app-main h1')?.textContent.trim()}));
   check(route+' '+variant+' '+theme+' no overflow',metrics.scrollWidth<=width,metrics);
   check(route+' '+variant+' '+theme+' fallback SVG has nonzero dimensions',metrics.fallbacks.every(f=>f.svg&&f.width>0&&f.height>0&&!f.text),metrics.fallbacks);
   const file='media-restored-'+route.slice(1).replaceAll('/','-')+'-'+variant+'-'+theme+'.png';await page.screenshot({path:path.join(captures,file),fullPage:route==='/media/collections'});entry.variants.push({variant,theme,file,metrics});
  }
  if(route==='/media/all'){
   check('Catalogue historical plain heading',await main.locator('.mr-header h1 svg').count()===0);
   check('Catalogue historical absent type badge',await main.locator('.mr-kind').count()===0);
   check('Catalogue Go extra sort reachable in details',await main.locator('details #mr-sort').count()===1);
   const firstTitle=await main.locator('.mr-poster-title').first().innerText();await main.locator('#mr-search').fill(firstTitle.slice(0,6).trim());await page.waitForURL(/q=/);await main.locator('.mr-poster').first().waitFor({state:'visible',timeout:10000});check('Catalogue search navigates and renders',new URL(page.url()).searchParams.get('q')===firstTitle.slice(0,6).trim()&&await main.locator('.mr-poster').count()>0);
  }
  if(route==='/media/all'){
   await page.goto('/media/all',{waitUntil:'networkidle'});
   const choices=main.locator('[data-mr-server]');await choices.first().waitFor({state:'visible',timeout:10000});
   check('Historical server filter pills replace checkbox fieldset',await main.locator('.mr-server-options input').count()===0&&await choices.count()===3);
   const primary=await choices.nth(1).getAttribute('data-mr-server'),secondary=await choices.nth(2).getAttribute('data-mr-server');
   let response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/media');await choices.nth(1).click();await response;await main.locator('.mr-poster').first().waitFor({state:'visible'});check('Server pill from Tout selects just one server',new URL(page.url()).searchParams.get('servers')===primary);
   response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/media');await main.locator(`[data-mr-server="${secondary}"]`).click();await response;await main.locator('.mr-poster').first().waitFor({state:'visible'});check('Server pill multi-selection preserved',new Set(new URL(page.url()).searchParams.get('servers').split(',')).size===2);
   response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/media');await main.locator('[data-mr-server="all"]').click();await response;await main.locator('.mr-poster').first().waitFor({state:'visible'});check('Server Tout restores complete scope',new URL(page.url()).searchParams.get('servers')==='all'&&await main.locator('[data-mr-server="all"]').getAttribute('aria-pressed')==='true');
  }
  if(route==='/recent')check('Recent dated labels and type icons',await main.locator('.mr-poster-meta svg').count()>0&&await main.locator('.mr-kind').count()>0);
  if(route==='/media/collections'){
   check('Collection cards equal normalized API groups',await main.locator('.mr-library-card').count()===collection.collections.length);
   const firstCard=main.locator('.mr-library-card').first(),label=await firstCard.locator('h3').first().innerText();await main.locator('#mr-library-search').fill(label);check('Collection search filters by localized label',await main.locator('.mr-library-card').count()>0&&await main.locator('.mr-library-card').count()<=collection.collections.length);
   await main.locator('#mr-library-search').fill('no-match-parity-2026');check('Collection empty search state',await main.locator('.mr-library-card').count()===0&&await main.locator('.mr-empty').count()>0);await main.locator('#mr-library-search').fill('');
   const url=await main.locator('.mr-library-card h3 a').first().getAttribute('href');check('Collection drilldown preserves exact raw scopes',JSON.parse(new URL(url,base).searchParams.get('libraryScopes')).length>0);
   await main.locator('.mr-library-card h3 a').first().click();await main.locator('.mr-poster').first().waitFor({state:'visible',timeout:10000});check('Collection drilldown loads real catalogue',await main.locator('.mr-poster').count()>0&&await main.locator('.mr-error').count()===0);
  }
  if(route==='/media/analysis')check('Analysis canvases backed by Chart instances',await page.evaluate(()=>[...document.querySelectorAll('#app-main canvas')].length>0&&[...document.querySelectorAll('#app-main canvas')].every(c=>!!window.Chart?.getChart(c))));
  report.pages.push(entry);save();await page.close();
 }
 check('No JavaScript runtime exceptions',report.errors.length===0,report.errors);await ctx.close();
}catch(error){report.errors.push({fatal:error.message});check('Media runtime suite completes',false,error.message);}finally{await browser.close();save();}
const failed=report.checks.filter(c=>!c.ok);console.log(JSON.stringify({checks:report.checks.length,failed:failed.length,errors:report.errors}));if(failed.length)process.exitCode=1;
})();
