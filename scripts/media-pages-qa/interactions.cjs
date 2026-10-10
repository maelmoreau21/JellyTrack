const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://localhost:3350',report={checks:[],pageErrors:[]},file=path.resolve(__dirname,'../../docs/media-pages-validation/interaction-results.json');
function check(name,ok,details){report.checks.push({name,ok:!!ok,...(details?{details}: {})});}
(async()=>{const browser=await chromium.launch();try{
 const context=await browser.newContext({baseURL:base,viewport:{width:1440,height:900}});
 const login=await context.request.post('/api/auth/login',{headers:{Origin:base},data:{username:'mediaadmin',password:'Media-pages-QA-test-2026!'}});if(!login.ok())throw Error('Isolated login failed');
 const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
 await page.goto('/');await page.waitForLoadState('networkidle');
 await page.locator('#dash-time-select').selectOption('custom');await page.locator('#dash-custom-from').fill('2026-10-01');await page.locator('#dash-custom-to').fill('2026-10-09');
 await page.getByRole('button',{name:'Appliquer',exact:true}).click();await page.waitForLoadState('networkidle');
 const query=new URL(page.url()).searchParams;check('Custom range applies real URL bounds',query.get('from')==='2026-10-01'&&query.get('to')==='2026-10-09');
 check('Historical volume title',await page.locator('#chart-composed-trend').locator('xpath=ancestor::*[contains(@class,"chart-card")]').locator('.card-title').innerText()==='Volume Temporel');
 await page.locator('[data-tab="analytics"]').click();await page.waitForTimeout(1500);
 const canvas=page.locator('#chart-deep-audio');await canvas.scrollIntoViewIfNeeded();
 const target=await canvas.evaluate(el=>{const c=Chart.getChart(el),i=c?.data.labels.findIndex(l=>String(l).startsWith('FR'));if(i<0||!c)return null;const arc=c.getDatasetMeta(0).data[i],p=arc.getCenterPoint();return {x:p.x,y:p.y,label:c.data.labels[i],expected:c.data.datasets[0].data[i]};});
 if(!target)throw Error('Measured FR audio segment missing');const box=await canvas.boundingBox();await page.mouse.click(box.x+target.x,box.y+target.y);await page.waitForURL(url=>url.pathname==='/logs',{timeout:5000}).catch(()=>{});await page.waitForLoadState('networkidle');
 check('Deep audio label drilldown',new URL(page.url()).pathname==='/logs'&&new URL(page.url()).searchParams.get('audio')===target.label,{url:page.url(),label:target.label});
 const response=await context.request.get('/api/history?days=all&hideZapped=true&audio='+encodeURIComponent(target.label)+'&dateFrom=2026-10-01&dateTo=2026-10-09');const data=await response.json();check('Normalized audio drilldown equals plotted count',response.ok()&&data.total===target.expected,{chart:target.expected,history:data.total,label:target.label});
 await page.goto('/wrapped/qa-primary-alice');await page.locator('.wrapped-controls small').waitFor();
 const first=await page.locator('.wrapped-controls small').innerText();await page.waitForTimeout(8300);const second=await page.locator('.wrapped-controls small').innerText();check('Wrapped advances automatically after 8 seconds',first!==second,{first,second});
 await page.locator('#wrapped-config-nav').click();const paused=await page.locator('.wrapped-controls small').innerText();await page.waitForTimeout(8300);check('Wrapped pauses while configuration is open',await page.locator('.wrapped-controls small').innerText()===paused);
 await page.keyboard.press('Escape');check('Wrapped configuration Escape',await page.locator('#wrapped-year').count()===0);
 await page.locator('#wrapped-close-btn').click();await page.waitForLoadState('networkidle');check('Wrapped closes to its own profile',new URL(page.url()).pathname==='/users/qa-primary-alice');
 await page.waitForTimeout(100);check('Wrapped timer cleaned up on navigation',await page.locator('.wrapped-recovery').count()===0);
 check('No uncaught JavaScript exceptions',report.pageErrors.length===0);await context.close();
}catch(error){check('Interaction suite',false,error.message);}finally{fs.writeFileSync(file,JSON.stringify(report,null,2));await browser.close();}console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(c=>!c.ok)}));if(report.checks.some(c=>!c.ok))process.exitCode=1;})();
