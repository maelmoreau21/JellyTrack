/* Read-only checks against real isolated Go APIs; fixture data stays in QA SQLite. */
require('./robust-evidence.cjs');
require('../final-audit/robust-writes.cjs');
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
   const file='media-restored-'+route.slice(1).replaceAll('/','-')+'-'+variant+'-'+theme+'.png';await page.screenshot({path:path.join(captures,file),fullPage:route==='/media/collections'||route==='/media/analysis'||route.startsWith('/media/qa-')});entry.variants.push({variant,theme,file,metrics});
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
   await page.setViewportSize({width:1440,height:900});
   const collectionGeometry=await main.evaluate(el=>{const card=el.querySelector('.mr-collections-stats .mr-stat'),value=card.querySelector('strong'),title=el.querySelector('.mr-header h1');return {cardHeight:card.getBoundingClientRect().height,cardY:card.getBoundingClientRect().y,cardX:card.getBoundingClientRect().x,gap:getComputedStyle(card).gap,valueLine:getComputedStyle(value).lineHeight,titleWeight:getComputedStyle(title).fontWeight,cardBackground:getComputedStyle(card).backgroundColor,collectionGradient:getComputedStyle(el.querySelector('.mr-library-card')).backgroundImage};});
   check('Collection main geometry Card170 gap24 value40 and aligned247/312',collectionGeometry.cardHeight===170&&collectionGeometry.gap==='24px'&&collectionGeometry.valueLine==='40px'&&collectionGeometry.cardX===312&&collectionGeometry.cardY===247&&collectionGeometry.titleWeight==='700',collectionGeometry);
   check('Collection real computed surfaces and type gradient',collectionGeometry.cardBackground!=='rgba(0, 0, 0, 0)'&&collectionGeometry.collectionGradient!=='none',collectionGeometry);
   check('Collection historical Library/Info KPI and inline library badges',await main.locator('.mr-collections-stats header svg').count()===3&&await main.locator('.mr-collection-stat-content>p>svg').count()===3&&await main.locator('.mr-library-title>div').evaluateAll(els=>els.every(el=>getComputedStyle(el).display==='flex')));
   check('Collection cards equal normalized API groups',await main.locator('.mr-library-card').count()===collection.collections.length);
   const firstCard=main.locator('.mr-library-card').first(),label=await firstCard.locator('h3').first().innerText();await main.locator('#mr-library-search').fill(label);check('Collection search filters by localized label',await main.locator('.mr-library-card').count()>0&&await main.locator('.mr-library-card').count()<=collection.collections.length);
   await main.locator('#mr-library-search').fill('no-match-parity-2026');check('Collection empty search state',await main.locator('.mr-library-card').count()===0&&await main.locator('.mr-empty').count()>0);await main.locator('#mr-library-search').fill('');
   const url=await main.locator('.mr-library-card h3 a').first().getAttribute('href');check('Collection drilldown preserves exact raw scopes',JSON.parse(new URL(url,base).searchParams.get('libraryScopes')).length>0);
   await main.locator('.mr-library-card h3 a').first().click();await main.locator('.mr-poster').first().waitFor({state:'visible',timeout:10000});check('Collection drilldown loads real catalogue',await main.locator('.mr-poster').count()>0&&await main.locator('.mr-error').count()===0);
  }
  if(route.startsWith('/media/qa-')){
   const music=route.endsWith('album');
   const item=await (await ctx.request.get('/api/media/'+route.split('/').pop())).json();
   const historicalTypes=['stop','download','pause','seek','replay','speed_change','audio_change','subtitle_change'],recorded=(item.telemetry||[]).filter(e=>historicalTypes.includes(e.eventType)&&e.positionMs!=null&&Number.isFinite(Number(e.positionMs))&&Number(e.positionMs)>=0);
   if(item.durationMs>0&&recorded.length){
    check(route+' historical timeline50 buckets8 pills5 extent ticks',await main.locator('.mr-hist-bucket').count()===50&&await main.locator('[data-hist-type]').count()===8&&await main.locator('.mr-hist-axis>span').count()===5);
    const timelineMetrics=await main.locator('.mr-historical-timeline').evaluate(el=>({height:el.querySelector('.mr-hist-bars').getBoundingClientRect().height,maxHeight:getComputedStyle(el.querySelector('.mr-hist-sessions')).maxHeight,rows:el.querySelectorAll('.mr-hist-session').length,marks:[...el.querySelectorAll('.mr-hist-mark')].map(x=>getComputedStyle(x).width),background:getComputedStyle(el.querySelector('.mr-hist-chart')).backgroundImage}));
    check(route+' historical140 chart260 scroll30 lanes4px marks with real surface',timelineMetrics.height===140&&timelineMetrics.maxHeight==='260px'&&timelineMetrics.rows<=30&&timelineMetrics.marks.every(w=>w==='4px')&&timelineMetrics.background!=='none',timelineMetrics);
    const expectedBuckets=Array(50).fill(0);for(const event of recorded)expectedBuckets[Math.min(49,Math.floor(Number(event.positionMs)/item.durationMs*50))]+=Math.max(1,Number(event.count)||1);
    check(route+' buckets match actual recorded positions and counts',JSON.stringify(await main.locator('.mr-hist-bucket').evaluateAll(els=>els.map(e=>Number(e.dataset.count))))===JSON.stringify(expectedBuckets));
    const activeType=recorded[0].eventType;await main.locator(`[data-hist-type="${activeType}"]`).click();
    check(route+' historical type toggle removes bucket segments and marks',await main.locator(`[data-hist-type="${activeType}"]`).getAttribute('aria-pressed')==='false'&&await main.locator(`.mr-hist-stack [data-type="${activeType}"],.mr-hist-mark[data-type="${activeType}"]`).count()===0);
    await main.locator(`[data-hist-type="${activeType}"]`).click();
    check(route+' historical type toggle restores counts',JSON.stringify(await main.locator('.mr-hist-bucket').evaluateAll(els=>els.map(e=>Number(e.dataset.count))))===JSON.stringify(expectedBuckets));
    const userSelect=main.locator('[data-hist-user]');if(await userSelect.count()){const selected=await userSelect.locator('option').nth(1).getAttribute('value');await userSelect.selectOption(selected);check(route+' historical user only filters session lanes',await main.locator('.mr-hist-session').evaluateAll((els,id)=>els.every(e=>e.dataset.user===id),selected)&&JSON.stringify(await main.locator('.mr-hist-bucket').evaluateAll(els=>els.map(e=>Number(e.dataset.count))))===JSON.stringify(expectedBuckets));await main.locator('[data-hist-user]').selectOption('all');}
    const bucket=main.locator('.mr-hist-bucket').filter({has:page.locator('[data-type]')}).first();await bucket.click();await page.locator('#action-modal.open').waitFor({state:'visible'});check(route+' historical bucket opens recorded event details',await page.locator('#action-modal .mr-event-detail').count()>0);await page.keyboard.press('Escape');
    const mark=main.locator('.mr-hist-mark').first();await mark.hover();check(route+' historical mark tooltip uses recorded position',await main.locator('.mr-hist-tooltip').isVisible()&&(await main.locator('.mr-hist-tooltip').innerText()).includes('@ '));
    const session=main.locator('[data-hist-session]').first();await session.click();await page.locator('#action-modal.open').waitFor({state:'visible'});check(route+' historical session click preserves rich Go modal',await page.locator('#action-modal').innerText().then(t=>t.length>50));await page.keyboard.press('Escape');
   }else check(route+' missing timeline positions remain explicit empty',await main.locator('.mr-hist-bucket').count()===0&&await main.locator('.mr-historical-timeline .mr-empty').count()===1);
   const explorer=main.locator('.mr-timeline-explorer');check(route+' secondary Go explorer retains controls and clusters',await explorer.locator('#mr-timeline-user').count()===1&&await explorer.locator('#mr-timeline-session').count()===1);
   await explorer.locator('summary').click();if(await explorer.locator('.mr-event').count()){await explorer.locator('.mr-event').first().click();await page.locator('#action-modal.open').waitFor({state:'visible'});check(route+' secondary clustered event modal still works',await page.locator('#action-modal').innerText().then(t=>t.length>20));await page.keyboard.press('Escape');}await explorer.locator('summary').click();
   check(route+' historical raw media type badge',await main.locator('.mr-hero-badges .badge').first().innerText()===item.type);
   check(route+' historical SVG breadcrumb separators',await main.locator('.mr-breadcrumb>svg').count()>0&&await main.locator('.mr-breadcrumb>a:first-child>svg').count()===1);
   if(await main.locator('.mr-quick-nav>a').count())check(route+' colored quick links all have historical icons',await main.locator('.mr-quick-nav>a>svg').count()===await main.locator('.mr-quick-nav>a').count());
   if(music)check(route+' music artist has Headphones in hero',await main.locator('.mr-music-credits>a>svg').count()===1);
   check(route+' historical section heading SVG',await main.locator('.mr-section-heading h2>svg').count()===(music?3:5)+((item.children||[]).length?1:0)+((item.versions||[]).length>1?1:0));
   check(route+' historical behavior heading SVG',await main.locator('.mr-behavior-grid h3>svg').count()===3);
   if(!music)check(route+' six historical telemetry icons',await main.locator('.mr-telemetry-summary span>svg').count()===6);
   check(route+' language rows preserve recorded counts and historical bars',await main.locator('.mr-language-track').count()===(item.audioDistribution||[]).length+(music?0:(item.subtitleDistribution||[]).length)&&await main.locator('.mr-language-track').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().width===96&&el.getBoundingClientRect().height===8)));
   check(route+' viewers inline with historical subtitle',await main.locator('.mr-section:has(.mr-viewers) .mr-section-heading p').count()===1&&await main.locator('.mr-viewers>a').evaluateAll(els=>els.every(el=>getComputedStyle(el).flexDirection==='row')));
   check(route+' detailed history has total sessions subtitle',await main.locator('.mr-section:has(.mr-table)').last().locator('.mr-section-heading p').count()===1);
   if((item.children||[]).length){check(route+' children retain poster square and type badge',await main.locator('.mr-child-image').count()===item.children.length&&await main.locator('.mr-section:has(.mr-child-title) tbody .badge').count()===item.children.length);if(music)check(route+' album children omit resolution column as main',!(await main.locator('.mr-section:has(.mr-child-title) th').allTextContents()).some(t=>t.includes('Résolution')));}
  }
  if(route==='/media/analysis'){
   check('Analysis canvases backed by Chart instances',await page.evaluate(()=>[...document.querySelectorAll('#app-main canvas')].length>0&&[...document.querySelectorAll('#app-main canvas')].every(c=>!!window.Chart?.getChart(c))));
   const analysisResponse=await ctx.request.get('/api/media/analysis'),analysis=await analysisResponse.json();
   check('Analysis real API',analysisResponse.ok());
   check('Analysis historical genre horizontal bars, 20px width and 300px canvas',await page.evaluate(()=>{const c=window.Chart.getChart(document.getElementById('mr-catalogue-genres'));return c.config.type==='bar'&&c.options.indexAxis==='y'&&c.data.datasets[0].barThickness===20&&c.height===300&&document.querySelector('.mr-genre-chart').getBoundingClientRect().height===340&&c.options.layout.padding.left===40&&c.options.layout.padding.right===30;}));
   check('Analysis genre labels and counts match real catalogue API',await page.evaluate(rows=>{const c=window.Chart.getChart(document.getElementById('mr-catalogue-genres'));return JSON.stringify(c.data.labels)===JSON.stringify(rows.map(r=>r.name))&&JSON.stringify(c.data.datasets[0].data)===JSON.stringify(rows.map(r=>Number(r.count||0)));},(analysis.genres||[]).slice(0,10)));

   check('Analysis library card restores historical subtitle',await main.locator('.mr-analysis-overview>.mr-section').nth(2).locator('.mr-section-heading p').count()===1);
   await main.locator('.mr-deep-card').first().waitFor({state:'visible'});
   const deepResponse=await ctx.request.get('/api/stats/deep?catalogue=true'),deep=await deepResponse.json(),data=deep.deep||deep.insights||deep;
   check('Catalogue deep API is available',deepResponse.ok());
   for(const [key,kind] of [['topDirectors','directors'],['topActors','actors'],['topStudios','studios']])check('Deep catalogue '+key+' measured counts match UI',await main.locator('.mr-deep-'+kind+' .mr-deep-copy b').allTextContents().then(values=>JSON.stringify(values.map(v=>Number(v.replace(/[^0-9]/g,''))))===JSON.stringify((data[key]||[]).map(row=>Number(row.count)))));
   check('Deep analysis three historical titled cards and icons',await main.locator('.mr-deep-card').count()===3&&await main.locator('.mr-deep-card header h2').count()===3&&await main.locator('.mr-deep-icon svg').count()===3);
   check('Deep analysis ranks and rows equal real API',await main.locator('.mr-deep-row').count()===['topDirectors','topActors','topStudios'].reduce((n,key)=>n+(data[key]||[]).length,0)&&await main.locator('.mr-deep-row>svg').count()===await main.locator('.mr-deep-row').count());
   if(await main.locator('.mr-deep-row').count()){
    const row=main.locator('.mr-deep-row').first(),name=await row.getAttribute('data-person');await row.click();await page.locator('#action-modal.open').waitFor({state:'visible'});await page.locator('#mr-person-results .mr-search-results,#mr-person-results .mr-empty').first().waitFor({state:'visible'});
    check('Deep analysis person button opens real searchable modal',await page.locator('#action-modal').innerText().then(text=>text.includes(name)));
    await page.keyboard.press('Escape');check('Deep analysis modal Escape closes and returns focus',await page.locator('#action-modal.open').count()===0&&await row.evaluate(el=>el===document.activeElement));
   }
   const bingeRows=analysis.binge?.allBingedSeries||[];
   check('Binge summary reflects real leader or explicit empty state',bingeRows.length?await main.locator('.mr-binge-summary>div').count()===3&&(await main.locator('.mr-binge-summary').innerText()).includes(bingeRows[0].seriesTitle):await main.locator('.mr-binge-empty').count()===1&&await main.locator('.mr-binge-summary').count()===0);
   check('Binge ranked rows retain measured series',await main.locator('.mr-binge-ranking>article').count()===Math.min(4,bingeRows.length));
   const suggestions=analysis.taste?.acquisitionSuggestions||[],genres=analysis.taste?.topGenres||[];
   check('Smart Insights single historical card and measured suggestions',await main.locator('.mr-insight-smart').count()===1&&await main.locator('.mr-smart-recommendations>.mr-suggestion').count()===suggestions.length&&await main.locator('.mr-suggestion footer').count()===suggestions.length);
   check('Smart Insights dominant genre proportional bars',await main.locator('.mr-smart-genre-track>i').count()===Math.min(4,genres.length)&&await main.locator('.mr-smart-genre-track>i').evaluateAll((els,rows)=>els.every((el,i)=>Math.abs(parseFloat(el.style.width)-Math.min(100,Math.max(4,Number(rows[i].percentage)||0)))<0.0001),genres));
   if((analysis.genres||[]).length){const position=await main.locator('#mr-catalogue-genres').evaluate(canvas=>{const bar=window.Chart.getChart(canvas).getDatasetMeta(0).data[0];return{x:(bar.x+bar.base)/2,y:bar.y};});await main.locator('#mr-catalogue-genres').click({position});await page.waitForURL(/genre=/);await main.locator('.mr-poster').first().waitFor({state:'visible'});check('Historical horizontal genre bar click drills into real catalogue',new URL(page.url()).searchParams.get('genre')===analysis.genres[0].name);await page.goto('/media/analysis',{waitUntil:'networkidle'});await main.locator('.mr-deep-card').first().waitFor({state:'visible'});}
   for(const server of [...new Set(collection.collections.flatMap(c=>c.scopes.map(s=>s.serverId)))]){
    const response=await ctx.request.get('/api/media/analysis?servers='+encodeURIComponent(server)),scoped=await response.json();
    if((scoped.binge?.allBingedSeries||[]).length===0){await page.goto('/media/analysis?servers='+encodeURIComponent(server),{waitUntil:'networkidle'});await main.locator('.mr-binge-empty').waitFor({state:'visible'});check('Binge empty real server scope does not fabricate zero KPIs',await main.locator('.mr-binge-summary').count()===0);break;}
   }
  }
  report.pages.push(entry);save();await page.close();
 }
 check('No JavaScript runtime exceptions',report.errors.length===0,report.errors);await ctx.close();
}catch(error){report.errors.push({fatal:error.message});check('Media runtime suite completes',false,error.message);}finally{await browser.close();save();}
const failed=report.checks.filter(c=>!c.ok);console.log(JSON.stringify({checks:report.checks.length,failed:failed.length,errors:report.errors}));if(failed.length)process.exitCode=1;
})();
