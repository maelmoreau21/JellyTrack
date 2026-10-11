/* Real isolated API/session/browser checks. Never posts to an external service. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),base=process.env.PARITY_GO_BASE||'http://localhost:3350',out=path.join(root,'docs/parity-restoration');
const report={date:new Date().toISOString(),scope:'Real isolated Go API, real standard/admin sessions, recorded SQLite fixture. No intercepted responses, no external send, no production data edits.',checks:[],pageErrors:[],assets:[]};
const check=(name,ok,details)=>{report.checks.push({name,ok:!!ok,...(details===undefined?{}:{details})});console.log((ok?'PASS ':'FAIL ')+name);};
const save=()=>fs.writeFileSync(path.join(out,'core-runtime.json'),JSON.stringify(report,null,2));
const group=async(name,fn)=>{try{await fn();}catch(e){check(name,false,e.message);}save();};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{const browser=await chromium.launch();try{
 const anon=await browser.newContext({baseURL:base,locale:'fr-FR',viewport:{width:1440,height:900}});
 const user=await browser.newContext({baseURL:base,locale:'fr-FR',viewport:{width:1440,height:900}});
 await user.addCookies([{name:'jellytrack_session',value:JSON.parse(fs.readFileSync(path.join(root,'scratch/media-pages-qa/standard-cookie.json'),'utf8')).cookie,url:base}]);
 const admin=await browser.newContext({baseURL:base,locale:'fr-FR',viewport:{width:1440,height:900},timezoneId:'UTC'});
 const login=await admin.request.post('/api/auth/login',{headers:{Origin:base},data:{username:'mediaadmin',password:'Media-pages-QA-test-2026!'}});if(!login.ok())throw Error('Fixture login '+login.status());
 for(const context of [anon,user,admin])await context.addInitScript(()=>{if(!localStorage.getItem('jt_locale'))localStorage.setItem('jt_locale','fr');if(!localStorage.getItem('jt_theme'))localStorage.setItem('jt_theme','dark');});
 for(const asset of ['app.js','app.css','history.js','profile.js','history-recovery.css','wrapped-recovery.css']) {const r=await admin.request.get('/assets/'+asset),same=hash(await r.body())===hash(fs.readFileSync(path.join(root,'web/dist/assets',asset)));report.assets.push({asset,status:r.status(),same});check('Embedded '+asset+' matches current source',r.ok()&&same);}
 const p=await admin.newPage(),u=await user.newPage(),a=await anon.newPage();for(const page of[p,u,a])page.on('pageerror',e=>report.pageErrors.push(e.message));
 await group('Newsletter access and PNG',async()=>{
  const identity=await(await user.request.get('/api/auth/me')).json();check('Genuine ordinary-user identity',identity.role==='user');
  const data=await user.request.get('/api/newsletter');check('Ordinary user newsletter GET 200',data.status()===200);
  const refused=await user.request.post('/api/newsletter/discord-post',{headers:{Origin:base,'X-CSRF-Token':identity.csrfToken},data:{}});check('Ordinary user Discord POST403 with valid CSRF',refused.status()===403);
  check('Anonymous newsletter GET401',(await anon.request.get('/api/newsletter')).status()===401);
  await a.goto('/newsletter',{waitUntil:'domcontentloaded'});await a.waitForURL(url=>url.pathname==='/login');await a.locator('#login-language-select').waitFor();check('Anonymous newsletter redirects to login',new URL(a.url()).pathname==='/login');
  await u.goto('/newsletter',{waitUntil:'domcontentloaded'});await u.locator('#btn-download-rewind').waitFor();check('Ordinary user newsletter remains on requested page',new URL(u.url()).pathname==='/newsletter');
  const downloadPromise=u.waitForEvent('download');await u.locator('#btn-download-rewind').click();const download=await downloadPromise,filename=path.join(root,'scratch/media-pages-qa/core-rewind.png');await download.saveAs(filename);
  const bytes=fs.readFileSync(filename);check('PNG download has valid signature and historical dimensions',bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.readUInt32BE(16)===1080&&bytes.readUInt32BE(20)===1350,{filename:download.suggestedFilename(),width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),bytes:bytes.length});
 });
 await group('Login language and theme',async()=>{
  await a.goto('/login',{waitUntil:'domcontentloaded'});await a.locator('#login-theme-card svg').waitFor();const initial=await a.locator('#login-theme-card svg').innerHTML();check('Dark login offers Sun icon',await a.locator('#login-theme-card svg circle').count()>0&&await a.locator('#login-theme-card svg path').count()>0);
  await a.locator('#login-theme-card').click();check('Login theme switches to light',!(await a.locator('html').getAttribute('class')||'').includes('dark'));const next=await a.locator('#login-theme-card svg').innerHTML();check('Light login offers distinct Moon icon',next!==initial&&await a.locator('#login-theme-card svg circle').count()===0);
  await a.locator('#login-language-select').selectOption('en');await a.waitForFunction(()=>document.querySelector('#login-language-select')?.value==='en'&&document.documentElement.lang==='en');check('Login English preference persisted',await a.evaluate(()=>localStorage.getItem('jt_locale'))==='en');
  await a.reload({waitUntil:'domcontentloaded'});await a.locator('#login-language-select').waitFor();await a.waitForFunction(()=>document.querySelector('#login-language-select')?.value==='en'&&document.documentElement.lang==='en');check('Login language survives reload',await a.locator('#login-language-select').inputValue()==='en');
 });
 await group('Wrapped historical charts and controls',async()=>{
  const data=await(await admin.request.get('/api/wrapped/qa-primary-alice')).json();await p.goto('/wrapped/qa-primary-alice',{waitUntil:'domcontentloaded'});await p.locator('#btn-wrap-next').waitFor();
  check('Wrapped eighteen fixture slides',/\/\s*18$/.test(await p.locator('.wrapped-controls small').innerText()));
  check('Wrapped global close button visible on intro',await p.locator('#wrapped-close-btn').isVisible());
  await p.locator('#wrapped-config-nav').click();check('Wrapped type filter order matches main',JSON.stringify(await p.locator('[data-wrapped-type]').evaluateAll(es=>es.map(e=>e.dataset.wrappedType)))===JSON.stringify(['general','Movies','Music','TV','Books']));await p.keyboard.press('Escape');
  const profileData=await(await admin.request.get('/api/users/qa-primary-alice?export=true&dateFrom='+data.year+'-01-01&dateTo='+data.year+'-12-31')).json(),clients={};
  for(const row of profileData.history.items)if(row.clientName&&(row.eventSource==='download'||row.durationWatched>=60||row.endedAt==null))clients[row.clientName]=(clients[row.clientName]||0)+row.durationWatched;
  const favourite=Object.entries(clients).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0];check('Wrapped favourite device is recorded client ranked by watched time',favourite===data.topDevice,{favourite,topDevice:data.topDevice,topPhysicalDevice:data.topPhysicalDevice,clients});
  let genreSeen=false,rankSeen=false,monthlySeen=false,dayRingSeen=false,clientSeen=false;const slides=[];
  for(let index=0;index<18;index++){
   const content=await p.locator('.wrapped-slide').innerText();slides.push({index:index+1,title:await p.locator('.wrapped-slide h1').innerText()});
   if(await p.locator('.wrapped-device-card').count()&&(await p.locator('.wrapped-device-card').textContent()).trim()===favourite)clientSeen=true;
   if(await p.locator('.wrapped-days-clock').count())dayRingSeen=await p.locator('.wrapped-days-clock svg').count()>0;
   if(await p.locator('.wrapped-genres').count()){
    genreSeen=true;const observed=await p.locator('.wrapped-genres li').evaluateAll(es=>es.map(e=>({name:e.querySelector('span').textContent,count:Number(e.querySelector('small').textContent),width:parseFloat(e.querySelector('i').style.width)})));
    const max=Math.max(...data.topGenres.map(g=>g.count));check('Wrapped genre names/counts match stored API metadata',JSON.stringify(observed.map(g=>({name:g.name,count:g.count})))===JSON.stringify(data.topGenres.map(g=>({name:g.name,count:g.count}))));check('Wrapped genre bars use historical count proportions',observed.every(g=>g.width===Math.round(g.count/max*100)),observed);
   }
   if(!rankSeen&&await p.locator('.wrapped-ranked').count()){
    rankSeen=true;const observed=await p.locator('.wrapped-ranked li').evaluateAll(es=>es.map(e=>({title:e.querySelector('span').textContent,width:parseFloat(e.querySelector('i').style.width)})));const expected=data.topMedia,max=Math.max(...expected.map(m=>m.seconds));check('Wrapped podium consumes API ranking and time proportions',observed.every((m,i)=>m.title===expected[i].title&&m.width===Math.round(expected[i].seconds/max*100)),observed);
   }
   if(await p.locator('.wrapped-months').count()){
    monthlySeen=true;const values=await p.locator('.wrapped-months>div>span').evaluateAll(es=>es.map(e=>parseFloat(e.style.height))),max=Math.max(...data.monthlyHours.map(m=>m.hours));check('Wrapped twelve monthly bars reflect real hours',values.length===12&&values.every((value,i)=>Math.abs(value-(max?data.monthlyHours[i].hours/max*100:0))<0.001),values);
   }
   if(index<17)await p.locator('#btn-wrap-next').click();
  }
  report.wrappedSlides=slides;check('Wrapped charts and day Clock ring encountered',genreSeen&&rankSeen&&monthlySeen&&dayRingSeen,{genreSeen,rankSeen,monthlySeen,dayRingSeen});
  check('Wrapped favourite client is actually rendered on its slide',clientSeen);
  check('Wrapped global close visible on final slide',await p.locator('#wrapped-close-btn').isVisible());await p.locator('#wrapped-close-btn').click();await p.waitForURL('**/users/qa-primary-alice');check('Wrapped close returns to same profile',new URL(p.url()).pathname==='/users/qa-primary-alice');
  await p.locator('.profile-history-table tr[data-session]').first().waitFor();const renderedProfile=await(await admin.request.get('/api/users/qa-primary-alice')).json(),unknownProfile=renderedProfile.history.items.map((row,index)=>({row,index})).filter(({row})=>!['Audio','Track','MusicTrack','MusicAlbum'].includes(row.type)&&row.bitrate>1536&&row.audioBitrateKbps==null);
  check('Profile shares explicit unknown-audio API contract',unknownProfile.length>0,unknownProfile.map(({row})=>({id:row.id,bitrate:row.bitrate,audioBitrateKbps:row.audioBitrateKbps})));
  check('Profile unknown audio cells show em dash',unknownProfile.length>0&&(await Promise.all(unknownProfile.map(({index})=>p.locator('.profile-history-table tr[data-session="'+index+'"] .profile-col-audioBitrate').innerText()))).every(text=>text==='—'));

 });
 await group('Historical logs date and reset interactions',async()=>{
  await p.goto('/logs',{waitUntil:'domcontentloaded'});await p.locator('.history-date').first().waitFor();check('Logs reset absent without active filters',await p.locator('#history-reset').isHidden());
  const dimensions=await p.locator('.history-date>div').first().evaluate(el=>{const d=el.querySelector('span'),t=el.querySelector('small');return{date:d.textContent,time:t.textContent,dateY:d.getBoundingClientRect().y,timeY:t.getBoundingClientRect().y,direction:getComputedStyle(el).flexDirection};});check('Logs date and time occupy two lines',dimensions.direction==='column'&&dimensions.timeY>dimensions.dateY&&dimensions.date.length>0&&/\d{2}:\d{2}/.test(dimensions.time),dimensions);
  const histories=await(await admin.request.get('/api/history?days=all&limit=50&offset=0')).json();const unknown=histories.items.map((row,index)=>({row,index})).filter(({row})=>!['Audio','Track','MusicTrack','MusicAlbum'].includes(row.type)&&row.bitrate>1536&&row.audioBitrateKbps==null);
  check('Logs expose unknown audio independently of known video bitrate',unknown.length>0,unknown.map(({row})=>({id:row.id,bitrate:row.bitrate,audioBitrateKbps:row.audioBitrateKbps})));
  check('Logs unknown audio renders em dash instead of combined video bitrate',unknown.length>0&&(await Promise.all(unknown.map(({index})=>p.locator('tr[data-session="'+index+'"] .history-col-audioBitrate').innerText()))).every(text=>text==='—'));
  await p.goto('/logs?query=Film&sort=duration_desc',{waitUntil:'domcontentloaded'});await p.locator('.history-date').first().waitFor();check('Logs reset shown for search/sort filters',await p.locator('#history-reset').isVisible());await p.locator('#history-reset').click();await p.waitForFunction(()=>document.querySelector('#history-reset')?.hidden===true);check('Logs reset clears filters and default search',!new URL(p.url()).searchParams.has('query')&&!new URL(p.url()).searchParams.has('sort')&&await p.locator('[name=query]').inputValue()==='');
 });
 await group('Dashboard analytics charts and real drilldown',async()=>{
  await p.goto('/',{waitUntil:'domcontentloaded'});await p.locator('#dash-time-select').waitFor();await p.locator('#dash-time-select').selectOption('custom');await p.locator('#dash-custom-from').fill('2026-10-01');await p.locator('#dash-custom-to').fill('2026-10-11');const submit=p.getByRole('button',{name:'Appliquer',exact:true});await submit.click();await p.waitForLoadState('networkidle');
  check('Dashboard custom dates update URL',new URL(p.url()).searchParams.get('from')==='2026-10-01'&&new URL(p.url()).searchParams.get('to')==='2026-10-11');
  const dashboardCharts=await p.locator('canvas').evaluateAll(es=>es.map(e=>({id:e.id,type:Chart.getChart(e)?.config.type,values:Chart.getChart(e)?.data.datasets[0]?.data})));report.dashboardCharts=dashboardCharts;check('Dashboard has live Chart instances with recorded values',dashboardCharts.some(c=>c.type&&c.values?.some(v=>Number(v)>0)),dashboardCharts);
  await p.locator('[data-tab="analytics"]').click();await p.locator('#chart-deep-audio').waitFor();await p.waitForFunction(()=>window.Chart&&Chart.getChart(document.querySelector('#chart-deep-audio'))?.data.datasets[0].data.some(v=>v>0));
  const canvas=p.locator('#chart-deep-audio');await canvas.scrollIntoViewIfNeeded();const target=await canvas.evaluate(el=>{const c=Chart.getChart(el),index=c.data.labels.findIndex(l=>String(l).startsWith('FR'));if(index<0)return null;const arc=c.getDatasetMeta(0).data[index],point=arc.getCenterPoint();return{x:point.x,y:point.y,label:c.data.labels[index],expected:c.data.datasets[0].data[index]};});if(!target)throw Error('Recorded FR audio chart segment missing');
  const box=await canvas.boundingBox();await p.mouse.click(box.x+target.x,box.y+target.y);await p.waitForURL(url=>url.pathname==='/logs');await p.waitForLoadState('networkidle');check('Analytics audio arc opens actual filtered history',new URL(p.url()).searchParams.get('audio')===target.label,{label:target.label,url:p.url()});const query=new URL(p.url()).searchParams;query.set('days','all');const filtered=await(await admin.request.get('/api/history?'+query)).json();check('Analytics plotted segment count equals actual filtered histories',filtered.total===target.expected,{expected:target.expected,total:filtered.total});
 });
 await group('Catalogue deep versus dashboard contracts',async()=>{
  check('Ordinary user catalogue deep GET403',(await user.request.get('/api/stats/deep?catalogue=true')).status()===403);
  check('Anonymous catalogue deep GET401',(await anon.request.get('/api/stats/deep?catalogue=true')).status()===401);
  const response=await admin.request.get('/api/stats/deep?catalogue=true&servers=all'),data=await response.json(),catalogue=await(await admin.request.get('/api/media?limit=200&servers=all')).json();check('Catalogue comparison reads entire isolated metadata catalogue',response.status()===200&&catalogue.items.length===catalogue.total,{total:catalogue.total,rows:catalogue.items.length});
  const titles=catalogue.items.filter(row=>['Movie','Series'].includes(row.type));report.catalogueTitleCount=titles.length;
  for(const [field,key]of[['directors','topDirectors'],['actors','topActors'],['studios','topStudios']]){const counts={};for(const title of titles)for(const name of title[field]||[])if(name.trim())counts[name]=(counts[name]||0)+1;const expected=Object.entries(counts).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,10);check('Catalogue '+key+' equals Movie/Series metadata counts',JSON.stringify(data[key])===JSON.stringify(expected),{titles:titles.length,expected,observed:data[key]});}
  const dashboard=await(await admin.request.get('/api/stats/deep?timeRange=all&servers=all')).json();check('Dashboard deep keeps session count and extra charts',Array.isArray(dashboard.audioChartData)&&dashboard.topDirectors?.[0]?.count>data.topDirectors?.[0]?.count&&!Object.hasOwn(data,'audioChartData'),{dashboardDirectors:dashboard.topDirectors,catalogueDirectors:data.topDirectors});
 });
 check('No uncaught browser JavaScript errors',report.pageErrors.length===0,report.pageErrors);await anon.close();await user.close();await admin.close();
 }catch(e){check('Core suite bootstrap',false,e.message);}finally{save();await browser.close();}console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(c=>!c.ok)}));if(report.checks.some(c=>!c.ok))process.exitCode=1;})();
