import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { serveStatic } from './qa-static.mjs';

const server=serveStatic(new URL('../build/',import.meta.url));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const output=new URL('../../scratch/frontend-sveltekit-settings-qa/',import.meta.url);
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
const report=[];
try {
 for(const width of [390,1440])for(const theme of ['dark','light'])for(const tab of ['jellyfin','media','plugin/security']){
  const context=await browser.newContext({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write']});
  await context.addInitScript(theme=>{localStorage.setItem('jt_theme',theme);localStorage.setItem('jt_locale','fr');},theme);
  let model={defaultLocale:'fr',timeFormat:'24h',authRememberThirtyDaysEnabled:false,excludedLibraries:['srvlib|missing|Orphan'],availableLibraryScopes:[{serverId:'s1',libraryName:'Films'},{serverId:'s1',libraryName:'Music'},{serverId:'s2',libraryName:'Films'}],resolutionThresholds:{extensionKey:'preserved',ssoButtonLabel:'Connexion SSO',completionRules:{default:{completionEnabled:true,abandonedThreshold:10,partialThreshold:20,completedThreshold:80}}},pluginTelemetrySettings:{precisionProfile:'very_precise',extensionKey:'preserved'}};
  let servers=[{id:'s1',jellyfinServerId:'js1',name:'Jellyfin Principal',url:'https://principal.example.test',isPrimary:true,hasApiKey:true,hasPluginKey:true,pluginKeyMasked:'••••••••',connectionState:'online',version:'12.2.0'},{id:'s2',jellyfinServerId:'js2',name:'Jellyfin Secondaire',url:'https://secondaire.example.test',isPrimary:false,allowAuthFallback:true,hasApiKey:true,hasPluginKey:true,connectionState:'offline',version:'12.2.0'}];
  let smart={ipAttemptThreshold:50,ipWindowMinutes:60,newCountryGraceMinutes:120};
  let fail=false;const calls=[];
  await context.route('**/api/**',route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(request.method()!=='GET'){
    const body=request.postData()?request.postDataJSON():undefined;
    calls.push({path,method:request.method(),body,csrf:request.headers()['x-csrf-token']});
    if(fail)return route.fulfill({status:400,json:{error:'Réglage de test refusé.'}});
    if(path==='/api/settings'){
     const {ssoButtonLabel,...rest}=body;model={...model,...rest};
     if(ssoButtonLabel!==undefined)model.resolutionThresholds={...model.resolutionThresholds,ssoButtonLabel};
    }
    if(path==='/api/admin/security/smart-settings')smart={...smart,...body.thresholds};
    if(path==='/api/settings/jellyfin-servers'){
     if(request.method()==='PATCH')servers=servers.map(v=>v.id===body.id?{...v,...body}:v);
     else{const added={...body,id:'new-server',isPrimary:false,hasApiKey:true};servers.push(added);return route.fulfill({json:{success:true,id:added.id}});}
    }
    if(request.method()==='DELETE')servers=servers.filter(v=>v.id!==decodeURIComponent(path.split('/').pop()));
    if(path.endsWith('/plugin-key'))return route.fulfill({json:{success:true,pluginApiKey:'qa-plugin-secret'}});
    return route.fulfill({json:{success:true}});
   }
   const json=path==='/api/auth/me'?{username:'QA',role:'super_admin',csrfToken:'fixture-csrf'}:path==='/api/navigation'?{multiServer:true,wrappedVisible:true,appVersion:'3.0.0'}:path==='/api/settings'?model:path==='/api/settings/jellyfin-servers'?{servers,pluginEndpointPath:'/api/plugin/events',pluginConnected:true,pluginVersion:'2.2.0',pluginLastSeen:'2026-10-14T10:00:00Z'}:path==='/api/admin/security/overview'?{plugin:{connected:true,serverName:'Jellyfin Principal',version:'2.2.0',lastSeen:'2026-10-14T10:00:00Z'}}:path==='/api/admin/security/smart-settings'?{thresholds:smart}:{};
   return route.fulfill({json});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto(base+'/settings/'+tab);
  await page.locator('.settings-modern .settings-card').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${tab} no horizontal overflow at ${width}`);
  // Temporarily release the application's viewport scroll container so the
  // screenshot includes the entire settings page, including its lower forms.
  const captureStyle=await page.addStyleTag({content:'.main-wrapper { height:auto!important; max-height:none!important; overflow:visible!important; } #app-root { height:auto!important; } body { overflow:auto!important; }'});
  await page.locator('.settings-modern').screenshot({path:new URL(`${tab.replace('/','-')}-${width}-${theme}.png`,output).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  await captureStyle.evaluate(style=>style.remove());
  if(tab==='jellyfin'){
   const card=page.locator('.settings-server-card').first();
   await card.locator('.settings-card-header button').first().click();
   await card.locator('input[name=name]').fill('Principal renommé');
   await card.locator('button[type=submit]').click();
   await page.locator('.settings-message.success').waitFor();assert.equal(servers[0].name,'Principal renommé');
   assert.ok(!calls.at(-1).body.apiKey,'empty edit key preserves saved credential');
   await card.locator('summary').click();
   await card.getByRole('button',{name:'Copier la clé',exact:true}).click();
   await page.locator('.settings-message.success').waitFor();assert.equal(calls.at(-1).body.id,'s1');assert.equal(calls.at(-1).body.regenerate,false);
   await card.getByRole('button',{name:'Régénérer la clé du serveur',exact:true}).click();
   await page.locator('.settings-message.success').waitFor();assert.equal(calls.at(-1).body.regenerate,true);
   await page.locator('.settings-card').filter({has:page.locator('h2', {hasText:'Ajouter'})}).getByRole('button',{name:'Ajouter un serveur',exact:true}).click();
   const add=page.locator('form[data-form=add-server]');
   await add.locator('[name=name]').fill('Nouveau');await add.locator('[name=url]').fill('https://new.example.test');await add.locator('[name=apiKey]').fill('qa-api-key');
   await add.locator('[type=submit]').click();await page.locator('.settings-message.success').waitFor();assert.equal(servers.length,3);
   await page.locator('.settings-server-card').filter({hasText:'Nouveau'}).getByRole('button',{name:'Supprimer',exact:true}).click();
   await page.locator('.settings-message.success').waitFor();assert.equal(servers.length,2);
   await page.locator('.settings-extra summary').click();const form=page.locator('form[data-form=locale]');
   await form.locator('[name=ssoButtonLabel]').fill('Se connecter');await form.locator('[type=submit]').click();
   await page.locator('.settings-message.success').waitFor();assert.equal(model.resolutionThresholds.ssoButtonLabel,'Se connecter');
  }else if(tab==='media'){
   const form=page.locator('form[data-form=media]');
   await form.locator('[name=rule-default-completedThreshold]').fill('85');
   await page.locator('.settings-library-group').first().getByRole('button',{name:/Films/}).click();
   assert.equal(await form.locator('[name=rule-default-completedThreshold]').inputValue(),'85','exclusion preserves unsaved thresholds');
   await form.locator('[type=submit]').click();await page.locator('.settings-message.success').waitFor();
   assert.deepEqual(model.excludedLibraries,['srvlib|missing|Orphan','srvlib|s1|Films']);assert.equal(model.resolutionThresholds.completionRules.default.completedThreshold,85);assert.equal(model.resolutionThresholds.extensionKey,'preserved');
   await page.locator('.settings-library-group').nth(1).getByRole('button',{name:/Films/}).click();
   await form.locator('[type=submit]').click();await page.locator('.settings-message.success').waitFor();
   assert.equal(model.excludedLibraries.includes('srvlib|s2|Films'),true,'same-name libraries remain server-scoped');
  }else{
   await page.getByRole('button',{name:'Équilibré',exact:true}).click();
   const telemetry=page.locator('form[data-form=telemetry]');
   assert.equal(await telemetry.locator('[name=playingIntervalSeconds]').inputValue(),'15');
   await telemetry.locator('[name=mergeWindowSeconds]').fill('0');await telemetry.locator('[type=submit]').click();
   await page.locator('.settings-message.success').waitFor();assert.equal(model.pluginTelemetrySettings.precisionProfile,'balanced');assert.equal(model.pluginTelemetrySettings.mergeWindowSeconds,0);assert.equal(model.pluginTelemetrySettings.extensionKey,'preserved');
   const thresholds=page.locator('form[data-form=smart]');await thresholds.locator('[name=ipAttemptThreshold]').fill('75');await thresholds.locator('[type=submit]').click();
   await page.locator('.settings-message.success').waitFor();assert.equal(smart.ipAttemptThreshold,75);
   const sessions=page.locator('form[data-form=sessions]');await sessions.locator('[name=authRememberThirtyDaysEnabled]').check();await sessions.locator('[name=ssoButtonLabel]').fill('Connexion sécurisée');await sessions.locator('[type=submit]').click();
   await page.locator('.settings-message.success').waitFor();assert.equal(model.authRememberThirtyDaysEnabled,true);assert.equal(model.resolutionThresholds.ssoButtonLabel,'Connexion sécurisée');
  }
  fail=true;const form=page.locator('form[data-form]').last();
  if(await form.count()){
   await form.locator('[type=submit]').click();await page.locator('.settings-message.error').waitFor();
   assert.equal(await form.locator('[type=submit]').isEnabled(),true,'failure allows retry');
  }
  assert.ok(calls.every(call=>call.csrf==='fixture-csrf'),'all mutations carry CSRF');
  assert.deepEqual(errors,[],`${tab} JavaScript errors`);
  await page.locator('#nav-version').evaluate(link=>link.click());await page.locator('.about-historical').waitFor();await page.goBack();await page.locator('.settings-modern .settings-card').first().waitFor();
  assert.deepEqual(errors,[],`${tab} back navigation`);
  report.push({tab,width,theme,passed:true,mutations:calls.length});console.log(`PASS native settings ${tab} ${width} ${theme}`);
  await context.close();
 }
}finally{await writeFile(new URL('results.json',output),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
