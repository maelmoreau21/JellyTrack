const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.env.REFERENCE_ROOT||path.resolve(__dirname,'../../scratch/navigation-qa/main-reference');
const {encode}=require(path.join(root,'node_modules/next-auth/jwt'));
const base=process.env.REFERENCE_URL||'http://localhost:3341';
const locale=process.env.QA_LOCALE==='en'?'en':'fr';
if(!/^http:\/\/(localhost|127\.0\.0\.1):3341$/.test(base))throw Error('Use the isolated historical server on port 3341');
const out=path.resolve(__dirname,'../../docs/settings-admin-captures');fs.mkdirSync(out,{recursive:true});
const reportDirectory=path.resolve(__dirname,'../../docs/settings-admin-validation');fs.mkdirSync(reportDirectory,{recursive:true});
const routes=(process.env.QA_ROUTES||'/settings/jellyfin,/settings/sso,/settings/plugin/security,/settings/media,/settings/scheduler,/settings/dataBackups,/settings/notifications,/settings/plugin,/settings/analytics,/admin/health,/admin/log-health,/admin/plugin-health,/admin/server-compare,/admin/cleanup').split(',');
const result={source:'Historical main archive, original settings/admin components. Synthetic Prisma stub and signed NextAuth session.',cases:[]};
(async()=>{
const browser=await chromium.launch();
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:locale==='en'?'en-US':'fr-FR',colorScheme:'dark'});
 const now=Math.floor(Date.now()/1000);
 const token=await encode({secret:'navigation-qa-reference-secret-at-least-32-characters',token:{name:'QA administrateur',sub:'qa-local',isAdmin:true,jellyfinUserId:'local-admin',authServerName:'QA principal',authServerIsPrimary:true,sessionExpiresAt:now+86400,sessionIssuedAt:now,sessionExpired:false},maxAge:86400});
 await context.addCookies([{name:'next-auth.session-token',value:token,url:base},{name:'locale',value:locale,url:base}]);
 await context.addInitScript(()=>localStorage.setItem('theme','dark'));
 for(const route of routes){
  const page=await context.newPage(),record={route,errors:[],httpErrors:[]};
  page.on('pageerror',e=>record.errors.push(e.message));
  page.on('response',response=>{if(response.status()>=400)record.httpErrors.push({path:new URL(response.url()).pathname,status:response.status()});});
  try{
   await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:90000});
   await page.waitForFunction(()=>!document.body.innerText.includes('Compiling'),{timeout:30000});
   await page.waitForLoadState('networkidle',{timeout:60000});
   await page.waitForFunction(()=>!/(Chargement|Loading)[^\n]*\.\.\./.test(document.body.innerText),null,{timeout:60000});
   await page.waitForTimeout(700);
   record.url=new URL(page.url()).pathname;
   record.headings=await page.locator('h1,h2,h3,[data-slot="card-title"]').allTextContents();
   record.links=await page.locator('main a').evaluateAll(elements=>elements.map(el=>({text:el.textContent.trim(),href:el.getAttribute('href')})));
   record.controls=await page.locator('main input,main select,main button').evaluateAll(elements=>elements.map(el=>({tag:el.tagName,type:el.getAttribute('type'),id:el.id,name:el.name||'',text:el.tagName==='BUTTON'?el.textContent.trim():'',disabled:el.disabled})));
   record.body=(await page.locator('body').innerText()).slice(0,14000);
   const slug=route.replace(/^\//,'').replaceAll('/','-')+(locale==='en'?'-en':'');
   await page.screenshot({path:path.join(out,'main-'+slug+'-desktop-dark.png')});
   if(route==='/admin/health'&&locale==='fr'){
    record.interactions=[];
    for(const [label,name]of [['security',/^Sécurité & Anomalies/],['logs',/^Moteur & Logs/],['cleanup',/^Nettoyage & Stockage/]]){
     const tab=page.getByRole('tab',{name});await tab.click();await page.waitForTimeout(400);
     record.interactions.push({panel:label,selected:await tab.getAttribute('aria-selected')==='true'});
     await page.screenshot({path:path.join(out,'main-admin-health-'+label+'-desktop-dark.png')});
    }
    for(const [label,name]of [['abandoned',/^Médias Abandonnés/],['duplicates',/^Doublons/],['ghosts',/^Médias Fantômes/]]){
     const tab=page.getByRole('tab',{name});await tab.click();await page.waitForTimeout(250);
     record.interactions.push({cleanup:label,selected:await tab.getAttribute('aria-selected')==='true'});
     await page.screenshot({path:path.join(out,'main-admin-health-'+label+'-desktop-dark.png')});
    }
   }
   if(['/settings/jellyfin','/settings/scheduler','/admin/health'].includes(route)){
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,'main-'+slug+'-mobile-dark.png')});
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(()=>{localStorage.setItem('theme','light');document.documentElement.classList.remove('dark');});
    await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'main-'+slug+'-desktop-light.png')});
   }
   record.rendered=(record.controls.length>0||record.headings.length>0)&&!/Application error|Something went wrong!|Une erreur est survenue/.test(record.body);
  }catch(error){record.failure=error.message;record.rendered=false;}
  result.cases.push(record);fs.writeFileSync(path.join(reportDirectory,locale==='en'?'reference-en-results.json':'reference-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({route,rendered:record.rendered,headings:record.headings,errors:record.errors,failure:record.failure}));
  await page.close();
 }
 await context.close();
}finally{await browser.close();}
if(result.cases.some(item=>!item.rendered))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
