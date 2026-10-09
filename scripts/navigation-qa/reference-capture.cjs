const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { encode } = require(path.join(process.env.REFERENCE_ROOT || path.resolve(__dirname,'../../scratch/navigation-qa/main-reference'),'node_modules/next-auth/jwt'));
const base = process.env.REFERENCE_URL || 'http://localhost:3323';
const reportDirectory=process.env.GO_QA_OUTPUT || path.resolve(__dirname,'../../scratch/navigation-qa');fs.mkdirSync(reportDirectory,{recursive:true});
const out = path.join(reportDirectory, 'captures');
fs.mkdirSync(out, { recursive: true });
const report = { source: 'git archive main; original components and design CSS; Tailwind scan bounded via source(none) + src/app and src/components; official PRISMA_USE_STUB=true; genuine Sora files cached using Next test font hook; local synthetic signed NextAuth sessions', cases: [] };
(async () => {
 const browser = await chromium.launch({ headless: true });
 for (const admin of [true, false]) {
  for (const mobile of [false, true]) {
   const context = await browser.newContext({ viewport: mobile ? {width:390,height:844} : {width:1440,height:900}, locale:'fr-FR', colorScheme:'dark' });
   const now = Math.floor(Date.now()/1000);
   const token = await encode({ secret:process.env.REFERENCE_SECRET || 'navigation-qa-reference-secret-at-least-32-characters', token:{name:admin?'Admin QA':'Alice QA',sub:'qa-local',isAdmin:admin,jellyfinUserId:admin?'local-admin':'jf-0',authServerName:'QA principal',authServerIsPrimary:true,sessionExpiresAt:now+86400,sessionIssuedAt:now,sessionExpired:false},maxAge:86400 });
   await context.addCookies([{name:'next-auth.session-token',value:token,url:base},{name:'locale',value:'fr',url:base}]);
   await context.addInitScript(() => localStorage.setItem('theme','dark'));
   const page = await context.newPage();
   const item = { admin,mobile,consoleErrors:[],failedRequests:[] };
   page.on('pageerror', e => item.consoleErrors.push(e.message));
   page.on('console', m => {if(m.type()==='error')item.consoleErrors.push(m.text());});
   page.on('requestfailed', r => item.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
   await page.goto(base+'/about',{waitUntil:'domcontentloaded',timeout:120000});
   await page.waitForFunction(({admin})=>{const links=Array.from(document.querySelectorAll('nav a')).map(a=>a.getAttribute('href'));return admin?links.includes('/users')&&links.includes('/users/local-admin'):links.includes('/users/jf-0')&&links.includes('/wrapped/jf-0');},{admin},{timeout:60000});
   await page.waitForTimeout(700);
   item.session = await page.evaluate(async () => (await fetch('/api/auth/session')).json());
   item.url = page.url(); item.bodyText = (await page.locator('body').innerText()).slice(0,3000);
   if (mobile) {
    await page.screenshot({path:path.join(out,`main-${admin?'admin':'user'}-mobile-closed.png`)});
    await page.getByRole('button',{name:'Open menu',exact:true}).click();
    await page.waitForTimeout(400);
   }
   await page.screenshot({path:path.join(out,`main-${admin?'admin':'user'}-${mobile?'mobile-open':'desktop-open'}.png`)});
   if (!mobile) {
    await page.getByRole('button',{name:/Réduire|Collapse/}).click();
    await page.waitForTimeout(400);
    await page.screenshot({path:path.join(out,`main-${admin?'admin':'user'}-desktop-collapsed.png`)});
   }
   item.navLinks = await page.locator('nav a').evaluateAll(as => as.map(a=>({href:a.getAttribute('href'),text:a.textContent,aria:a.getAttribute('aria-label')})));
   report.cases.push(item); await context.close();
  }
 }
 await browser.close(); fs.writeFileSync(path.join(reportDirectory,'reference-results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{fs.writeFileSync(path.join(reportDirectory,'reference-error.txt'),e.stack);console.error(e);process.exit(1)});
