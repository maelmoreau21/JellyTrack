import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, open, readdir, unlink } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { chromium, request } from '@playwright/test';
import { serveStatic } from './qa-static.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = path.join(root, 'scratch/frontend-sveltekit-integration-qa');
await mkdir(evidence, { recursive: true });
for(const name of await readdir(evidence))if(name.endsWith('.png')||name.endsWith('.json'))await unlink(path.join(evidence,name));
const work = await mkdtemp(path.join(root, 'scratch/frontend-integration-'));
const seed = await readFile(path.join(root, 'scripts/media-pages-qa/seed.py'), 'utf8');
const seedPoint = "WORK = ROOT / 'scratch/media-pages-qa'";
assert.equal(seed.split(seedPoint).length, 2);
const seeder = seed.replace("ROOT = Path(__file__).resolve().parents[2]", 'ROOT = Path(sys.argv[1])').replace('import base64,', 'import sys, base64,').replace(seedPoint, 'WORK = Path(sys.argv[2])');
execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', seeder, root, work], { windowsHide: true });
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const base = `http://localhost:${port}`;
const binary = process.env.QA_BINARY || path.join(root, 'scratch/frontend-integration-qa', process.platform === 'win32' ? 'jellytrack.exe' : 'jellytrack');
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(JELLYTRACK_|JELLYFIN_|JELLYGATE_|OIDC_|AUTH_|AUTHENTIK_|DATABASE_|POSTGRES_|DB_|LOCAL_ADMIN_|NEXTAUTH_|REDIS_|VALKEY_)/.test(key) || ['BACKUP_DIR','LOG_DIR','PLUGIN_KEY_PEPPER','PORT','TZ'].includes(key)) delete env[key];
Object.assign(env, { DATABASE_DRIVER: 'sqlite', DATABASE_PATH: path.join(work,'media-pages.db'), JELLYTRACK_PORT: String(port), JELLYTRACK_SECRET: 'Media-pages-QA-only-secret-2026-0123456789abcdef', JELLYTRACK_LOCAL_ADMIN_USER: 'mediaadmin', JELLYTRACK_LOCAL_ADMIN_PASSWORD: 'Media-pages-QA-test-2026!', JELLYTRACK_MODE: 'multi', TZ: 'UTC', BACKUP_DIR: path.join(work,'backups'), LOG_DIR: path.join(work,'logs'), OIDC_ENABLED: 'false', JELLYFIN_URL: '', JELLYFIN_API_KEY: '' });
const log = await open(path.join(work,'server.log'),'w');
const child = spawn(binary, [], { cwd: work, env, windowsHide: true, stdio: ['ignore',log.fd,log.fd] });
const reference = serveStatic(new URL('../../web/dist/', import.meta.url));
await new Promise(resolve => reference.listen(0,'127.0.0.1',resolve));
const referenceBase = `http://localhost:${reference.address().port}`;
const report = { limits: 'Disposable SQLite and Go APIs recorded from a local administrator session, replayed identically for visual comparison. No production, real Jellyfin or OIDC validation. Existing JavaScript page controllers are compiled by SvelteKit.', cases: [] };
let browser, backend;
const routes = ['/', '/users', '/users/qa-primary-alice?serverId=qa-primary', '/users/me', '/accounts', '/logs', '/recent', '/media/all', '/media/popular', '/media/collections', '/media/analysis', '/media/qa-primary-movie?serverId=qa-primary', '/media/qa-primary-series?serverId=qa-primary', '/media/qa-primary-episode1?serverId=qa-primary', '/media/artist/Artiste%20QA', '/newsletter', '/wrapped/qa-primary-alice?serverId=qa-primary&year=2026', '/about', '/setup/go', '/settings/jellyfin', '/settings/plugin/security', '/settings/media', '/settings/scheduler', '/settings/scheduler/tasks', '/settings/scheduler/schedules', '/settings/dataBackups', '/settings/notifications', '/settings/go-overview', '/settings/go-network', '/admin/health', '/admin/log-diagnostics', '/admin/plugin-diagnostics', '/admin/server-compare', '/admin/cleanup'];
try {
  let healthy = false;
  for (let attempt=0;attempt<100;attempt++) {
    try { if ((await fetch(base+'/api/health')).ok) { healthy=true;break; } } catch {}
    if (child.exitCode !== null) throw new Error('QA server stopped before becoming ready');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(healthy,'Go QA server ready');
  backend = await request.newContext({ baseURL: base });
  const login = await backend.post('/api/auth/login', { headers: { Origin: base }, data: { username: 'mediaadmin', password: 'Media-pages-QA-test-2026!' } });
  assert.ok(login.ok(),'real local administrator login');
  browser = await chromium.launch();
  const frozenTime = Date.now();
  for (const [routeIndex, uri] of routes.entries()) {
    const cache = new Map(), snapshots=[];
    for (const [name, origin] of [['reference',referenceBase],['svelte',base]]) {
      const context = await browser.newContext({ viewport: { width:1440,height:900 }, timezoneId:'Europe/Paris' });
      await context.addInitScript(frozenTime=>{
        localStorage.setItem('jt_locale','fr');localStorage.setItem('jt_theme','dark');
        const OriginalDate=Date;
        window.Date=class extends OriginalDate { constructor(...args){super(...(args.length?args:[frozenTime]));} static now(){return frozenTime;} };
        let chart;
        Object.defineProperty(window,'Chart',{configurable:true,get:()=>chart,set:value=>{chart=new Proxy(value,{construct(target,args){args[1].options={...args[1].options,animation:false};return Reflect.construct(target,args);}});}});
        window.EventSource=class extends EventTarget { close(){} };
        const originalJSON=Response.prototype.json;
        Response.prototype.json=async function(){
          const value=await originalJSON.call(this);
          if(new URL(this.url).pathname==='/api/streams')setTimeout(()=>window.fixtureStreamSettled=true,0);
          return value;
        };
        Math.random=()=>0.42;
      },frozenTime);
      const pending=new Set(),errors=[];
      await context.route('**/api/**',async route=>{
        const req=route.request(),url=new URL(req.url()),key=req.method()+' '+url.pathname+url.search;
        if (req.method()!=='GET') throw new Error('Comparison must not mutate the fixture: '+key);
        pending.add(key);
        try {
          if (!cache.has(key)) {
            assert.equal(name,'reference','compiled client changed API contract: '+key);
            cache.set(key,(async()=>{const response=await backend.get(url.pathname+url.search);return {status:response.status(),body:await response.body(),contentType:response.headers()['content-type']||'application/json'};})());
          }
          await route.fulfill(await cache.get(key));
        } finally { pending.delete(key); }
      });
      const page=await context.newPage();page.setDefaultTimeout(15000);
      if (uri === '/') {
        // The counter is a snapshot taken during dashboard creation. Complete
        // the live-stream request first in both clients, so response scheduling
        // does not compare two different snapshots of the same API fixture.
        await page.route('**/api/dashboard?*', async route => {
          const req=route.request(),url=new URL(req.url()),key=req.method()+' '+url.pathname+url.search;
          pending.add(key);
          await page.waitForFunction(()=>window.fixtureStreamSettled===true);
          if(!cache.has(key))cache.set(key,(async()=>{const response=await backend.get(url.pathname+url.search);return{status:response.status(),body:await response.body(),contentType:response.headers()['content-type']||'application/json'};})());
          await route.fulfill(await cache.get(key));
          pending.delete(key);
        });
      }
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+uri);
      await page.waitForFunction(()=>document.getElementById('app-main')?.textContent.trim().length>0);
      for(let attempt=0;attempt<100;attempt++) { if(pending.size===0) {await new Promise(resolve=>setTimeout(resolve,100));if(pending.size===0)break;} else await new Promise(resolve=>setTimeout(resolve,100)); }
      await page.evaluate(()=>document.fonts.ready);
      await page.addStyleTag({content:'*,*::before,*::after { animation:none!important;transition:none!important;caret-color:transparent!important; }'});
      await page.evaluate(()=>{for(const image of document.images)image.loading='eager';});
      await page.waitForFunction(()=>[...document.images].every(image=>image.complete));
      await page.evaluate(async origin=>{
        await document.fonts.ready;
        const canonical='http://localhost:3300';
        const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
        while(walker.nextNode())walker.currentNode.textContent=walker.currentNode.textContent.replaceAll(origin,canonical);
        for(const input of document.querySelectorAll('input,textarea'))input.value=input.value.replaceAll(origin,canonical);
      },origin);
      await new Promise(resolve=>setTimeout(resolve,150));
      const snapshot=await page.locator('#app-main').evaluate(main=>({
        texts:[...main.querySelectorAll('h1,h2,h3,p,th,td,button,a,label')].map(node=>node.textContent.replace(/\s+/g,' ').trim()),
        links:[...main.querySelectorAll('a')].map(node=>node.getAttribute('href')),
        canvases:[...main.querySelectorAll('canvas')].map(node=>({id:node.id,width:node.width,height:node.height})),
        classes:[...main.querySelectorAll('section,article')].map(node=>node.className)
      }));
      snapshots.push(snapshot);
      await writeFile(path.join(evidence,`${name}-${String(routeIndex).padStart(2,'0')}-geometry.json`),JSON.stringify(await page.locator('#app-main h1,#app-main .profile-wrapped,#app-main .mr-server-filter,#app-main .mr-tabs').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return{text:node.textContent,x:r.x,y:r.y,width:r.width,height:r.height,font:s.font,fontFamily:s.fontFamily,letterSpacing:s.letterSpacing};})),null,2));
      await page.screenshot({path:path.join(evidence,`${name}-${String(routeIndex).padStart(2,'0')}.png`),fullPage:true});
      assert.deepEqual(errors,[],`${name} ${uri} JavaScript errors`);
      if(uri==='/logs'||uri.startsWith('/users/qa-primary-alice')){
        const form=uri==='/logs'?'#history-filters':'#profile-history-form';
        await page.locator(`${form} input[name="query"]`).fill('fixture-unmatched-title');
        await page.locator(form).evaluate(form=>form.requestSubmit());
        await page.waitForFunction(()=>new URL(location.href).searchParams.get('query')==='fixture-unmatched-title');
        await page.locator('#nav-version').click();await page.locator('.about-historical').waitFor();
        await page.goBack();
        await page.waitForFunction(()=>new URL(location.href).searchParams.get('query')==='fixture-unmatched-title');
        await page.locator(form).waitFor();
        assert.deepEqual(errors,[],`${name} ${uri} filtered history/back navigation`);
      }
      if(uri==='/admin/health'){
        await page.locator('#ar-health-security').click();
        await page.waitForFunction(()=>new URL(location.href).searchParams.get('tab')==='security');
        await page.locator('#ar-health-security[aria-selected="true"]').waitFor();
        await page.locator('#nav-version').click();await page.locator('.about-historical').waitFor();
        await page.goBack();await page.locator('#ar-health-security[aria-selected="true"]').waitFor();
        assert.deepEqual(errors,[],`${name} administrator tab/back navigation`);
      }
      await page.unrouteAll({behavior:'wait'});
      await context.close();
    }
    assert.deepEqual(snapshots[1],snapshots[0],uri+' presentation/API parity');
    report.cases.push({route:uri,passed:true}); console.log('PASS integration '+uri);
  }
} finally {
  await writeFile(path.join(evidence,'results.json'),JSON.stringify(report,null,2));
  if(browser)await browser.close();if(backend)await backend.dispose();
  child.kill();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));await log.close();
  await new Promise(resolve=>reference.close(resolve));
}
