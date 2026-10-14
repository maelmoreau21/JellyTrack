import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { serveStatic } from './qa-static.mjs';
const servers = [serveStatic(new URL('../../web/dist/', import.meta.url)),serveStatic(new URL('../build/', import.meta.url))];
for (const server of servers) await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const out = new URL('../../scratch/frontend-sveltekit-users-qa/',import.meta.url);
await mkdir(out,{recursive:true});
const browser = await chromium.launch(); const cases=[];
try {
 for(const width of [390,1440]) for(const theme of ['dark','light']) {
  const snapshots=[];
  for(const [index,server] of servers.entries()) {
   const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Europe/Paris'});
   await context.addInitScript(theme=>{localStorage.setItem('jt_theme',theme);localStorage.setItem('jt_locale','fr');},theme);
   let items=Array.from({length:52},(_,i)=>({id:`u${i}`,serverId:i%2?'s2':'s1',jellyfinUserId:i===3?'oidc-orphan':`jf${i}`,username:i===0?'Alice <QA>':`User ${i}`,totalHours:52-i,sessionsCount:i===51?0:10,lastActive:i%2?'2026-01-01T12:00:00Z':null,favoriteClient:i%2?'App':'Web',transcodeCount:5,directPlayCount:5,transcodeRatio:i%2?50:0}));
   const calls=[];let failDelete=true;
   await context.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(request.method()!=='GET'){
     calls.push({path,method:request.method(),csrf:request.headers()['x-csrf-token']});
     if(request.method()==='DELETE'){
      if(failDelete)return route.fulfill({status:400,json:{error:'Suppression de test refusée.'}});
      items=items.filter(item=>!path.endsWith('/'+item.id));
     }
     return route.fulfill({json:{success:true,result:{totalPruned:1,prunedUsers:['Ghost <QA>']}}});
    }
    if(path==='/api/jellyfin/user-image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><rect width="28" height="28" fill="#334155"/></svg>'});
    return route.fulfill({json:path==='/api/auth/me'?{username:'QA',role:'super_admin',csrfToken:'fixture-csrf'}:path==='/api/navigation'?{multiServer:true,wrappedVisible:true,appVersion:'3.0.0'}:path==='/api/users'?{items,total:items.length}:{}});
   });
   const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/users`);
   await page.locator('#users-count').filter({hasText:'52 utilisateurs trouvés'}).waitFor();
   await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>{for(const image of document.images)image.loading='eager';});
   await page.waitForFunction(()=>[...document.images].every(image=>image.complete));
   await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.addStyleTag({content:'*,*::before,*::after { animation:none!important; transition:none!important; caret-color:transparent!important; }'});
   snapshots.push(await page.locator('.users-reference').evaluate(root=>({text:[...root.querySelectorAll('button,th,td,h1,p')].map(node=>node.textContent.replace(/\s+/g,' ').trim()),links:[...root.querySelectorAll('a')].map(a=>a.getAttribute('href')),boxes:[...root.querySelectorAll('.users-toolbar,.users-filters,.users-table-card')].map(node=>{const r=node.getBoundingClientRect();return[r.x,r.y,r.width,r.height];})})));
   await page.screenshot({path:fileURLToPath(new URL(`${index?'svelte':'reference'}-${width}-${theme}.png`,out)),fullPage:true});
   assert.equal(await page.locator('#users-body tr').count(),25);
   await page.locator('#users-next').click();
   await page.locator('#users-pagination').filter({hasText:'Page 2 sur 3'}).waitFor();
   await page.locator('#users-search').fill('Alice');
   await page.locator('#users-count').filter({hasText:'1 utilisateur trouvé'}).waitFor();
   assert.equal(await page.locator('#users-body tr').count(),1);
   const download=page.waitForEvent('download');await page.locator('#users-export-json').click();const exported=await download;
   const stream=await exported.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
   assert.equal(JSON.parse(Buffer.concat(chunks).toString()).length,1);
   await page.locator('[data-user-id="u0"]').click();await page.locator('.users-dialog[open]').waitFor();
   await page.locator('#users-confirm-delete').click();await page.locator('#users-delete-error').filter({hasText:'Suppression de test refusée.'}).waitFor();
   assert.equal(await page.locator('#users-confirm-delete').isEnabled(),true);assert.equal(calls.at(-1).csrf,'fixture-csrf');
   await page.screenshot({path:fileURLToPath(new URL(`${index?'svelte':'reference'}-${width}-${theme}-dialog.png`,out)),fullPage:true});
   failDelete=false;await page.locator('#users-confirm-delete').click();await page.locator('.users-dialog[open]').waitFor({state:'detached'});
   await page.locator('#users-count').filter({hasText:'0 utilisateur trouvé'}).waitFor();
   await page.locator('#users-search').fill('');await page.locator('[data-filter="transcoders"]').click();
   await page.locator('#users-count').filter({hasText:'25 utilisateurs trouvés'}).waitFor();
   await page.locator('#users-prune').click();await page.getByText('Ghost <QA>',{exact:true}).waitFor();
   assert.equal(await page.locator('.users-pruned-list img').count(),0);
   await page.locator('[data-dialog-close]').click();
   if(width<768)await page.locator('#mobile-menu-btn').click();
   await page.locator('#nav-version').click();await page.locator('.about-historical').waitFor();
   assert.equal(await page.locator('.users-reference').count(),0);assert.deepEqual(errors,[]);await context.close();
  }
  assert.deepEqual(snapshots[1],snapshots[0],`${width}/${theme} users presentation`);cases.push({width,theme,passed:true});console.log(`PASS users ${width} ${theme}`);
 }
} finally {
 await writeFile(new URL('results.json',out),JSON.stringify({limits:'API fixtures only; no real user deletion or Jellyfin synchronization.',cases},null,2));
 await browser.close();for(const server of servers)await new Promise(resolve=>server.close(resolve));
}
