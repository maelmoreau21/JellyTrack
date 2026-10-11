// Real embedded SPA, real sessions and downloads; no intercepted API responses.
const fs=require('fs'), path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://localhost:3350', root=path.resolve(__dirname,'../..');
const report={date:new Date().toISOString(),checks:[],errors:[]};
const check=(name,ok,details)=>{report.checks.push({name,ok:!!ok,details}); console.log((ok?'PASS ':'FAIL ')+name);};
(async()=>{const browser=await chromium.launch();try {
 const ctx=await browser.newContext({baseURL:base,locale:'fr-FR'}), p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));
 await p.goto('/media/all?query=Film',{waitUntil:'domcontentloaded'});await p.waitForURL('**/login?callbackUrl=*');await p.locator('#login-username').waitFor();
 check('Anonymous callback retains path and query',new URL(p.url()).pathname==='/login'&&new URL(p.url()).searchParams.get('callbackUrl')==='/media/all?query=Film');
 await p.locator('#login-username').fill('mediaadmin');await p.locator('#login-password').fill('Media-pages-QA-test-2026!');await p.locator('#login-remember').check();
 check('Remember control labelled',await p.getByRole('checkbox',{name:/Se souvenir/}).count()===1);
 await p.locator('#btn-login-submit').click();await p.waitForURL('**/media/all?query=Film');
 check('Login restores callback',new URL(p.url()).pathname==='/media/all'&&new URL(p.url()).searchParams.get('query')==='Film');
 const session=(await ctx.cookies()).find(c=>c.name==='jellytrack_session');
 check('Remember thirty-day cookie',session&&Math.abs(session.expires-Date.now()/1000-30*86400)<60);
 await p.goto('/setup',{waitUntil:'domcontentloaded'});await p.waitForURL(base+'/');check('Historical setup redirect',new URL(p.url()).pathname==='/');
 await p.goto('/setup/go',{waitUntil:'domcontentloaded'});await p.locator('#form-setup').waitFor();check('Go setup wizard preserved',await p.locator('#form-setup').count()===1);
 await p.goto('/logs?query=Film&sort=duration_desc',{waitUntil:'domcontentloaded'});
 const requests=[];p.on('request',r=>{if(r.url().includes('/api/logs/export'))requests.push(r.url());});
 const downloadP=p.waitForEvent('download');await p.locator('[data-export="json"]').click();const download=await downloadP;
 const saved=path.join(root,'scratch/final-audit/browser-export.json');await download.saveAs(saved);const rows=JSON.parse(fs.readFileSync(saved,'utf8'));
 check('Export uses connected historical API with filters',requests.some(url=>new URL(url).searchParams.get('query')==='Film'&&new URL(url).searchParams.get('sort')==='duration_desc'&&new URL(url).searchParams.get('format')==='json'));
 check('Downloaded historical JSON schema',rows.length>0&&rows.every(row=>row.mediaTitle.includes('Film')&&'durationWatchedSeconds'in row&&'startedAt'in row));
 check('Historical download filename',download.suggestedFilename()==='jellytrack_logs_export.json');
 const locales=[['de-DE',null,null,'de'],['en-US','fr',null,'fr'],['pt-BR',null,null,'pt-BR'],['de-DE','fr','en','en']];
 for(const [browserLocale,cookie,stored,expected]of locales){const c=await browser.newContext({baseURL:base,locale:browserLocale});if(cookie)await c.addCookies([{name:'locale',value:cookie,url:base}]);if(stored)await c.addInitScript(value=>localStorage.setItem('jt_locale',value),stored);const q=await c.newPage();await q.goto('/login',{waitUntil:'domcontentloaded'});check('Locale browser/cookie/preference '+[browserLocale,cookie,stored].join('/'),await q.locator('[data-login-locale][aria-current=true]').getAttribute('data-login-locale')===expected);await c.close();}
 const evil=await browser.newContext({baseURL:base});const q=await evil.newPage();await q.goto('/login?callbackUrl=%2F%2Fevil.example',{waitUntil:'domcontentloaded'});await q.locator('#login-username').fill('mediaadmin');await q.locator('#login-password').fill('Media-pages-QA-test-2026!');await q.locator('#btn-login-submit').click();await q.waitForURL(base+'/');check('External callback rejected',new URL(q.url()).origin===base);
 const defaultSession=(await evil.cookies()).find(c=>c.name==='jellytrack_session');const policy=await evil.request.get('/api/settings').then(r=>r.json());const expectedDays=policy.authRememberThirtyDaysEnabled?30:1;check('Unchecked remember respects configured session policy',defaultSession&&Math.abs(defaultSession.expires-Date.now()/1000-expectedDays*86400)<60,{expectedDays});await evil.close();
 await p.goto('/wrapped/qa-primary-alice',{waitUntil:'domcontentloaded'});await p.locator('.wrapped-progress').waitFor();report.wrappedText=(await p.locator('#app-main').innerText()).slice(0,2000);check('Native Wrapped eighteen slides',/\/\s*18/.test(await p.locator('.wrapped-progress').getAttribute('aria-label')));
 await ctx.close();check('No uncaught JavaScript errors',report.errors.length===0,report.errors);
 }catch(e){report.fatal=e.stack;process.exitCode=1;}finally{fs.writeFileSync(path.join(root,'docs/final-audit/final-controls.json'),JSON.stringify(report,null,2));await browser.close();if(report.checks.some(c=>!c.ok))process.exitCode=1;}})();
