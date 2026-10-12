const fs=require('fs');
const {chromium}=require('C:/Users/Mael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch();try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<html lang="fr"><body><main></main></body></html>');await page.addScriptTag({path:'web/dist/assets/settings.js'});const messages=JSON.parse(fs.readFileSync('web/dist/assets/messages/fr.json','utf8'));
await page.evaluate(async messages=>{
 window.JellyTrackNavigation={settingsTabs:()=>'',icon:()=>'<svg></svg>'};window.calls=[];window.mode='success';window.release=null;window.taskTimeout=null;window.lastSignal=null;
 const original=setTimeout;window.setTimeout=(fn,ms,...args)=>ms===31*60*1000?(window.taskTimeout=fn,original(()=>{},ms)):original(fn,ms,...args);
 await JellyTrackSettings.mount({main:document.querySelector('main'),user:{isAdmin:true},navigate:()=>{},i18n:{locale:'fr',t:(key,vars={})=>{let value=key.split('.').reduce((v,k)=>v?.[k],messages);if(typeof value!=='string')return '';for(const [k,v]of Object.entries(vars))value=value.replaceAll('{'+k+'}',v);return value;}},utils:{escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')},api:{getJSON:async()=>({}),request:async(url,options)=>{
 calls.push({url,body:options.body});lastSignal=options.signal;
 if(mode==='hung')await new Promise(()=>{});
 if(mode==='body-hung')return{ok:true,json:async()=>new Promise(()=>{})};
 if(mode==='slow')await new Promise(resolve=>release=resolve);
 if(mode==='invalid-json')return{ok:true,json:async()=>{throw new SyntaxError('Invalid JSON')}};
 if(mode==='error'||mode==='cleanup-error')return{ok:false,json:async()=>({error:'Erreur contrôlée.'})};
 return{ok:true,json:async()=>url.includes('cleanup')&&!options.body.apply?{success:true,message:'Aperçu prêt.',preview:{media:1,history:2,telemetry:0,token:'token',samples:[]}}:{success:true,message:'Tâche terminée.'}};
 }}},'scheduler/tasks');
},messages);
const button=page.locator('[data-url="/api/admin/repair-library-names"]');const html=await button.innerHTML();
for(const mode of ['slow','error','invalid-json','hung','body-hung']){
 await page.evaluate(mode=>window.mode=mode,mode);await button.click();
 if(['slow','hung','body-hung'].includes(mode)){
  if(!await button.isDisabled())throw Error('Pending task enabled');
  if(mode==='slow')await page.evaluate(()=>release());else await page.evaluate(()=>taskTimeout());
 }
 await page.waitForFunction(()=>!document.querySelector('[data-url="/api/admin/repair-library-names"]').disabled);
 if(await button.innerHTML()!==html)throw Error('Task label/icon not restored: '+mode);
 if(await button.getAttribute('aria-busy')!==null)throw Error('Busy state left behind');
 if(['hung','body-hung'].includes(mode)&&!await page.evaluate(()=>lastSignal.aborted))throw Error('Hung request not aborted');
}
await page.evaluate(()=>window.mode='success');const cleanup=page.locator('[data-url="/api/admin/cleanup-unassigned-history"]');await cleanup.click();const apply=page.locator('[data-action="apply-unassigned-cleanup"]');await apply.waitFor();await page.evaluate(()=>{window.oldApply=document.querySelector('[data-action="apply-unassigned-cleanup"]');window.mode='cleanup-error';});page.once('dialog',d=>d.accept());await apply.click();await page.locator('[data-task-feedback]').filter({hasText:'Erreur contrôlée.'}).last().waitFor();if(!await page.evaluate(()=>oldApply.disabled===false&&oldApply.getAttribute('aria-busy')===null))throw Error('Cleanup button not released on failure');if(await cleanup.isDisabled())throw Error('Preview cannot be relaunched');
if(errors.length)throw Error(errors.join(';'));console.log('PASS: pending/success/error/invalid JSON/no response/stalled body, labels/icons restored, cleanup failure recovery (mock API and controlled timeout).');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
