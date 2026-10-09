const fs=require('fs'),path=require('path');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const mode=process.env.QA_MODE==='single'?'single':'multi',base='http://localhost:3340',checks=[];
const check=(name,ok)=>checks.push({name,ok:!!ok});
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({baseURL:base,viewport:{width:1440,height:900}});
 const login=await context.request.post('/api/auth/login',{headers:{Origin:base},data:{username:'settingsadmin',password:'Settings-admin-QA-test-2026!'}});if(!login.ok())throw Error('QA login failed');
 const navigation=await(await context.request.get('/api/navigation')).json(),servers=await(await context.request.get('/api/settings/jellyfin-servers')).json(),compare=await(await context.request.get('/api/admin/server-compare')).json();
 check('Navigation reflects real '+mode+' mode',navigation.multiServer===(mode==='multi'));
 check('Server form backend reflects real '+mode+' mode',servers.isMultiMode===(mode==='multi'));
 check('Comparison condition reflects real '+mode+' mode',compare.multiServerEnabled===(mode==='multi'));
 const page=await context.newPage();await page.goto('/settings/jellyfin',{waitUntil:'networkidle'});
 check('Main comparison menu visibility '+mode,await page.locator('#historical-nav a[href="/admin/server-compare"]').count()===(mode==='multi'?1:0));
 check('Historical secondary-server add visibility '+mode,await page.locator('[data-action=add-toggle]').count()===(mode==='multi'?1:0));
 await page.goto('/admin/server-compare',{waitUntil:'networkidle'});
 check('Comparison scope buttons '+mode,await page.locator('[data-ar-server]').count()===(mode==='multi'?3:0));
 if(mode==='single')await page.screenshot({path:path.resolve(__dirname,'../../docs/settings-admin-captures/go-admin-server-compare-single-desktop-dark.png')});
 await context.close();
}finally{await browser.close();fs.writeFileSync(path.resolve(__dirname,'../../docs/settings-admin-validation/modes-'+mode+'.json'),JSON.stringify({mode,checks},null,2));}
console.log(JSON.stringify({mode,checks:checks.length,failed:checks.filter(c=>!c.ok)}));if(checks.some(c=>!c.ok))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
