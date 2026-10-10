const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../../scratch/navigation-qa/main-reference');
const {encode}=require(path.join(root,'node_modules/next-auth/jwt'));
const base='http://localhost:3341',out=path.resolve(__dirname,'../../docs/media-pages-captures'),data=path.resolve(__dirname,'../../docs/media-pages-validation');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(data,{recursive:true});
const routes=(process.env.QA_ROUTES||'/,/recent,/media/all,/media/popular,/media/collections,/media/analysis,/media/movie,/media/series,/media/episode1,/media/artist/Artiste%20QA,/logs,/newsletter,/wrapped/alice').split(',');
const report=process.env.QA_APPEND&&fs.existsSync(path.join(data,'reference-results.json'))?JSON.parse(fs.readFileSync(path.join(data,'reference-results.json'))):{date:'2026-10-10',source:'Original main component archive, signed isolated NextAuth session, synthetic Prisma adapter. No browser API response replacement.',cases:[]};
function save(){fs.writeFileSync(path.join(data,'reference-results.json'),JSON.stringify(report,null,2));}
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:'fr-FR',colorScheme:'dark',timezoneId:'UTC'});
 const now=Math.floor(Date.now()/1000),token=await encode({secret:'navigation-qa-reference-secret-at-least-32-characters',token:{name:'QA administrateur',sub:'qa-local',isAdmin:true,jellyfinUserId:'local-admin',authServerName:'QA principal',authServerIsPrimary:true,sessionExpiresAt:now+86400,sessionIssuedAt:now,sessionExpired:false},maxAge:86400});
 await context.addCookies([{name:'next-auth.session-token',value:token,url:base},{name:'locale',value:'fr',url:base}]);
 await context.addInitScript(()=>localStorage.setItem('theme','dark'));
 for(const route of routes){const page=await context.newPage(),record={route,errors:[],httpErrors:[]};
  page.on('pageerror',e=>record.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)record.httpErrors.push({path:new URL(r.url()).pathname,status:r.status()});});
  try{await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});await page.waitForTimeout(800);
   if(route==='/'){
    await page.getByRole('button',{name:/Modifier l'ordre|Edit order/i}).waitFor({state:'visible',timeout:20000}).catch(()=>{});
    record.overviewHydrated=await page.getByRole('button',{name:/Modifier l'ordre|Edit order/i}).count()>0;
    if(!record.overviewHydrated)record.limit='Historical DraggableDashboard stayed in its initial opacity-0 hydration state; overview capture cannot prove visual parity.';
   }
   record.url=new URL(page.url()).pathname;record.headings=await page.locator('h1,h2,h3,[data-slot="card-title"]').allTextContents();record.body=(await page.locator('body').innerText()).slice(0,22000);
   record.rendered=record.headings.length>0&&!/Application error|Something went wrong!|Une erreur est survenue|This page could not be found|^Chargement\.\.\.$/.test(record.body)&&!record.errors.length;
   record.controls=await page.locator('main input,main select,main button').evaluateAll(es=>es.map(e=>({tag:e.tagName,id:e.id,text:e.tagName==='BUTTON'?e.textContent.trim():'',type:e.getAttribute('type')})));
   const slug=route==='/'?'dashboard':route.slice(1).replaceAll('/','-').replaceAll('%20','-');
   await page.screenshot({path:path.join(out,'main-'+slug+'-desktop-dark.png'),fullPage:true});
   const focus=page.locator('main .recharts-wrapper,main canvas,main table').first();if(await focus.count()){await focus.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'main-'+slug+'-content-desktop-dark.png')});}
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'main-'+slug+'-mobile-dark.png')});
   if(route==='/'){
    await page.setViewportSize({width:1440,height:900});
    for(const [name,re] of [['analytics',/analyses|analytics|approfondies|détaillées/i],['network',/réseau|network/i]]){
     const tab=page.getByRole('tab',{name:re}).first();if(await tab.count()){await tab.click();await page.waitForTimeout(1200);record[name]={selected:await tab.getAttribute('data-state'),headings:await page.locator('h1,h2,h3,[data-slot="card-title"]').allTextContents(),charts:await page.locator('.recharts-surface').count()};await page.screenshot({path:path.join(out,'main-dashboard-'+name+'-desktop-dark.png'),fullPage:true});}
    }
   }
  }catch(error){record.failure=error.message;record.rendered=false;await page.screenshot({path:path.join(out,'main-failed-'+report.cases.length+'.png')}).catch(()=>{});}
  report.cases=report.cases.filter(x=>x.route!==route);report.cases.push(record);save();console.log(JSON.stringify({route,rendered:record.rendered,headings:record.headings,errors:record.errors,failure:record.failure}));await page.close();
 }
 await context.close();
}finally{save();await browser.close();}})().catch(e=>{report.fatal=e.message;save();console.error(e);process.exitCode=1;});
