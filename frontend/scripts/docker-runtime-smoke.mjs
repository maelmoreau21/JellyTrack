import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, request } from '@playwright/test';
const base=process.env.FRONTEND_DOCKER_QA_URL;
assert.ok(base&&/^http:\/\/127\.0\.0\.1:\d+$/.test(base),'explicit local disposable Docker URL required');
const output=new URL('../../scratch/frontend-sveltekit-docker-qa/',import.meta.url);
await mkdir(output,{recursive:true});
const api=await request.newContext({baseURL:base});
const health=await api.get('/api/health');assert.deepEqual(await health.json(),{status:'ok'});
const manifest=await api.get('/frontend-manifest.json');const metadata=await manifest.json();assert.equal(metadata.framework,'SvelteKit');
const login=await api.post('/api/auth/login',{headers:{Origin:base},data:{username:'qa-admin',password:'Fixture-admin-password-42!'}});assert.ok(login.ok(),'Go authentication');
const browser=await chromium.launch();const cases=[];
try {
 const context=await browser.newContext({baseURL:base,storageState:await api.storageState(),viewport:{width:1440,height:900}});
 await context.addInitScript(()=>{localStorage.setItem('jt_locale','fr');localStorage.setItem('jt_theme','dark');});
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [uri,selector] of [['/','.dashboard-header'],['/users','.users-reference'],['/users/me','.jt-profile'],['/settings/dataBackups','.settings-backups'],['/about','.about-historical']]){
  await page.goto(uri);await page.locator(selector).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#app-root').count(),1);
  assert.equal(await page.locator('#app-main').count(),1);
  const modules=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/_app/')&&entry.name.endsWith('.js')).length);
  assert.ok(modules>0,'compiled SvelteKit modules loaded');
  cases.push({uri,passed:true,modules});console.log('PASS Docker '+uri);
 }
 assert.deepEqual(errors,[],'no runtime JavaScript errors');
 await page.locator('#nav-version').click();await page.locator('.about-historical').waitFor();
 await page.goBack();await page.locator('.settings-backups').waitFor();
 await context.close();
} finally {await writeFile(new URL('results.json',output),JSON.stringify({framework:metadata.framework,version:metadata.version,cases},null,2));await browser.close();await api.dispose();}
