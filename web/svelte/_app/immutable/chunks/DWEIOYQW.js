import{t as e}from"./CRzLMJPS.js";var t={"chart.min":()=>e(()=>import(`./B4ZVnPgN.js`),[],import.meta.url),profile:()=>e(()=>import(`./CCFg9vGx.js`),[],import.meta.url),settings:()=>e(()=>import(`./BmRljEu0.js`),[],import.meta.url),admin:()=>e(()=>import(`./D3GQ6GOp.js`),[],import.meta.url),history:()=>e(()=>import(`./Bq9Jn_T1.js`),[],import.meta.url),"media-recovery":()=>e(()=>import(`./D6l-xlNf.js`),[],import.meta.url),users:async()=>{Object.assign(window,{UsersUI:{render:window.JellyTrackUI.users}})},accounts:async()=>{Object.assign(window,{AccountsUI:{render:window.JellyTrackUI.accounts}})},"about-recovery":async()=>{Object.assign(window,{JellyTrackAbout:{render:window.JellyTrackUI.about}})}},n=new Map;function r(e){if(!n.has(e)){let r=t[e];if(!r)return Promise.reject(Error(`Module de page inconnu : `+e));n.set(e,r().catch(t=>{throw n.delete(e),t}))}return n.get(e)}var i;function a(e){if(!(e?.type===`enter`||e?.type===`goto`&&e.shallow))return i?.()}function o(){function e(){let e=[`fr`,`en`,`de`,`es`,`it`,`nl`,`pl`,`pt-BR`,`ru`,`zh`],t=localStorage.getItem(`jt_locale`);if(e.includes(t))return t;let n=``;try{n=decodeURIComponent(document.cookie.split(`; `).find(e=>e.startsWith(`locale=`))?.slice(7)||``)}catch{}if(e.includes(n))return n;for(let t of navigator.languages||[navigator.language]){let n=String(t||``).toLowerCase(),r=e.find(e=>e.toLowerCase()===n)||e.find(e=>e.toLowerCase().split(`-`)[0]===n.split(`-`)[0]);if(r)return r}return`en`}let t={navigation:{multiServer:!1,wrappedVisible:!1},user:null,locale:e(),translations:{},fallbackTranslations:{},activeStreamsCount:0,streamPollInterval:null,currentPath:window.location.pathname||`/`,pageController:null,pageCleanups:[]},n={escapeHtml(e){return e==null?``:String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#039;`)},formatSeconds(e){if(!e||e<=0)return`0 min`;let t=Math.round(e),n=Math.floor(t/3600),r=Math.floor(t%3600/60);return n>0?`${n}h ${r>0?r+`m`:``}`:`${r} min`},formatMs(e){return n.formatSeconds((e||0)/1e3)},formatDate(e){if(!e)return`-`;try{let n=new Date(e);return isNaN(n.getTime())?e:n.toLocaleDateString(t.locale,{year:`numeric`,month:`short`,day:`numeric`})}catch{return e}},formatDateTime(e){if(!e)return`-`;try{let n=new Date(e);return isNaN(n.getTime())?e:n.toLocaleString(t.locale,{year:`numeric`,month:`short`,day:`numeric`,hour:`2-digit`,minute:`2-digit`})}catch{return e}},formatNumber(e){return e==null?`0`:new Intl.NumberFormat(t.locale).format(e)},timeAgo(e){if(!e)return``;try{let t=new Date(e),n=Date.now()-t.getTime(),r=Math.floor(n/6e4);if(r<1)return o.t(`common.justNow`)||`À l’instant`;if(r<60)return`${r} min`;let i=Math.floor(r/60);return i<24?`${i}h`:`${Math.floor(i/24)}j`}catch{return``}},debounce(e,t=300){let n=null;return function(...r){clearTimeout(n),n=setTimeout(()=>e.apply(this,r),t)}}},a={show(e,t=`info`,n=3500){let r=document.getElementById(`toast-container`);if(!r)return;let i=document.createElement(`div`);i.className=`toast toast-${t}`,i.textContent=e,r.appendChild(i),setTimeout(()=>{i.style.opacity=`0`,i.style.transform=`translateY(10px)`,setTimeout(()=>i.remove(),250)},n)},success(e){this.show(e,`success`)},error(e){this.show(e,`error`,4500)},info(e){this.show(e,`info`)}},o=window.JellyTrackUI.createI18n(t,()=>window.JellyTrackNavigation.render(),(e,t,n)=>h.navigate(e,t,n)),s=window.JellyTrackUI.createTheme(()=>h.renderCurrent()),c=r,l=window.JellyTrackUI.createAPI(t,()=>u.updateUserUI(),e=>h.navigate(e)),u={async checkSession(){try{let e=await fetch(`/api/auth/me`);if(e.ok){t.user=await e.json(),t.user.isAdmin=[`admin`,`super_admin`].includes(String(t.user.role).toLowerCase());try{let e=await fetch(`/api/navigation`);e.ok&&(t.navigation=await e.json())}catch{}return this.updateUserUI(),!0}}catch{}return t.user=null,this.updateUserUI(),!1},updateUserUI(){window.JellyTrackNavigation.render()},async login(e,n,r=!1,i=``){let a=await fetch(`/api/auth/login`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({username:e,password:n,rememberMe:r,serverId:i})}),o=await a.json();if(!a.ok)throw Error(o.error||`Identifiants invalides`);return t.user=o,t.user.isAdmin=[`admin`,`super_admin`].includes(String(t.user.role).toLowerCase()),await this.checkSession(),o},async logout(){try{await l.request(`/api/auth/logout`,{method:`POST`})}catch{}t.user=null,this.updateUserUI(),h.navigate(`/login?logout=1`)}},d={activeCleanup:null,showAction({title:e,bodyHtml:t,confirmText:n=`Confirmer`,cancelText:r=`Annuler`,onConfirm:i}){this.closeAction();let o=document.activeElement,s=document.getElementById(`action-modal`),c=document.getElementById(`action-modal-title`),l=document.getElementById(`action-modal-body`),u=document.getElementById(`action-modal-confirm`),d=document.getElementById(`action-modal-cancel`),f=document.getElementById(`action-modal-close`);c.textContent=e,l.innerHTML=t,u.textContent=n,d.textContent=r;let p=()=>{s.classList.remove(`open`),s.removeEventListener(`click`,m),document.removeEventListener(`keydown`,h),this.activeCleanup=null,u.disabled=!1,u.replaceWith(u.cloneNode(!0)),d.replaceWith(d.cloneNode(!0)),f.replaceWith(f.cloneNode(!0)),o?.isConnected&&o.focus()},m=e=>{e.target===s&&p()},h=e=>{if(e.key===`Escape`&&(e.preventDefault(),e.stopPropagation(),p()),e.key!==`Tab`)return;let t=[...s.querySelectorAll(`button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]`)].filter(e=>e.getClientRects().length),n=t[0],r=t.at(-1);n&&(e.shiftKey&&(document.activeElement===n||!s.contains(document.activeElement))?(e.preventDefault(),r.focus()):!e.shiftKey&&(document.activeElement===r||!s.contains(document.activeElement))&&(e.preventDefault(),n.focus()))};this.activeCleanup=p,document.getElementById(`action-modal-cancel`).onclick=p,document.getElementById(`action-modal-close`).onclick=p,document.getElementById(`action-modal-confirm`).onclick=async()=>{if(!u.disabled){u.disabled=!0;try{if(i&&await i()===!1)return;this.activeCleanup===p&&p()}catch(e){a.error(e.message)}finally{u.isConnected&&(u.disabled=!1)}}},s.classList.add(`open`),s.addEventListener(`click`,m),document.addEventListener(`keydown`,h),(l.querySelector(`input, textarea, select`)||d).focus()},closeAction(){if(this.activeCleanup){this.activeCleanup();return}let e=document.getElementById(`action-modal`);e&&e.classList.remove(`open`)}},f={instances:{},destroy(e){if(this.instances[e]){try{this.instances[e].destroy()}catch{}delete this.instances[e]}let t=document.getElementById(e);if(t){t.style.display=``;let e=t.parentElement;if(e){let t=e.querySelector(`.chart-empty-state`);t&&(t.style.display=`none`)}}},showEmpty(e,t=`Aucune donnée disponible`){this.destroy(e);let n=document.getElementById(e);if(!n)return;let r=n.parentElement;if(!r)return;let i=r.querySelector(`.chart-empty-state`);i||(i=document.createElement(`div`),i.className=`chart-empty-state`,r.appendChild(i)),i.innerHTML=`
        <svg class="chart-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
        </svg>
        <span>${t}</span>
      `,n.style.display=`none`,i.style.display=`flex`},getThemeColors(){let e=document.documentElement.classList.contains(`dark`);return{text:e?`#94A3B8`:`#64748B`,grid:e?`rgba(148, 163, 184, 0.12)`:`rgba(15, 23, 42, 0.08)`,tooltipBg:e?`#0F172A`:`#FFFFFF`,tooltipTitle:e?`#F1F5F9`:`#0F172A`,tooltipText:e?`#94A3B8`:`#64748B`,tooltipBorder:e?`rgba(34, 211, 238, 0.3)`:`rgba(79, 70, 229, 0.25)`,primary:e?`#22D3EE`:`#4F46E5`,primaryGlow:e?`rgba(34, 211, 238, 0.2)`:`rgba(79, 70, 229, 0.15)`,secondary:e?`#A855F7`:`#7C3AED`}},formatCompactHours(e){let t=Number(e);if(!Number.isFinite(t)||t===0)return`0h`;let n=Math.abs(t),r=t<0?`-`:``;return n<1/60?`${r}${Math.max(1,Math.round(n*3600))}s`:n<1?`${r}${Math.round(n*60)}m`:n<10?`${r}${n.toFixed(1).replace(/\.0$/,``)}h`:`${r}${Math.round(n)}h`},renderLine(e,t,n,r=`Lectures`,i=null){this.destroy(e);let a=document.getElementById(e);if(!a||!window.Chart)return;let o=this.getThemeColors(),s=i||o.primary;this.instances[e]=new Chart(a,{type:`line`,data:{labels:t,datasets:[{label:r,data:n,borderColor:s,backgroundColor:s+`22`,fill:!0,tension:.35,borderWidth:2.5,pointRadius:3,pointHoverRadius:6}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1},tooltip:{backgroundColor:o.tooltipBg,titleColor:o.tooltipTitle,bodyColor:o.tooltipText,borderColor:o.tooltipBorder,borderWidth:1,padding:10,displayColors:!1}},scales:{x:{grid:{color:o.grid},ticks:{color:o.text,font:{size:11}}},y:{grid:{color:o.grid},ticks:{color:o.text,font:{size:11},precision:0},beginAtZero:!0}}}})},renderMultiLine(e,t,n,r={}){this.destroy(e);let i=document.getElementById(e);if(!i||!window.Chart)return;let a=this.getThemeColors(),o=n.map(e=>({label:e.label,data:e.data,borderColor:e.color,backgroundColor:e.fill?e.color+`22`:`transparent`,fill:!!e.fill,tension:.35,borderWidth:2.2,pointRadius:2,pointHoverRadius:5,yAxisID:e.yAxisID||`y`}));this.instances[e]=new Chart(i,{type:`line`,data:{labels:t,datasets:o},options:{responsive:!0,maintainAspectRatio:!1,interaction:{mode:`index`,intersect:!1},plugins:{legend:{display:r.showLegend!==!1,position:`top`,align:`end`,labels:{color:a.text,font:{size:11,weight:`500`},boxWidth:12,boxHeight:12,usePointStyle:!0}},tooltip:{backgroundColor:a.tooltipBg,titleColor:a.tooltipTitle,bodyColor:a.tooltipText,borderColor:a.tooltipBorder,borderWidth:1,padding:10,callbacks:r.tooltipCallbacks||(r.isHours?{label:e=>`${e.dataset.label}: ${f.formatCompactHours(e.parsed.y)}`}:{})}},scales:{x:{grid:{color:a.grid},ticks:{color:a.text,font:{size:10},maxRotation:0,autoSkip:!0}},y:{grid:{color:a.grid},ticks:{color:a.text,font:{size:10},callback:r.isHours?e=>f.formatCompactHours(e):e=>e},beginAtZero:!0}}}})},renderBar(e,t,n,r={}){this.destroy(e);let i=document.getElementById(e);if(!i||!window.Chart)return;let a=this.getThemeColors(),o=r.backgroundColors||a.primary;this.instances[e]=new Chart(i,{type:`bar`,data:{labels:t,datasets:[{label:r.label||`Sessions`,data:n,backgroundColor:o,borderRadius:4}]},options:{responsive:!0,maintainAspectRatio:!1,onClick:r.onClick?(e,i)=>{if(i&&i.length>0){let e=i[0].index;r.onClick(e,t[e],n[e])}}:void 0,plugins:{legend:{display:!1},tooltip:{backgroundColor:a.tooltipBg,titleColor:a.tooltipTitle,bodyColor:a.tooltipText,borderColor:a.tooltipBorder,borderWidth:1,padding:8,callbacks:r.tooltipCallbacks||{}}},scales:{x:{grid:{display:!1},ticks:{color:a.text,font:{size:10}}},y:{grid:{color:a.grid},ticks:{color:a.text,font:{size:10},precision:0,callback:r.isHours?e=>`${e}h`:e=>e},beginAtZero:!0}}}})},renderHorizontalBar(e,t,n,r={}){this.destroy(e);let i=document.getElementById(e);if(!i||!window.Chart)return;let a=this.getThemeColors();this.instances[e]=new Chart(i,{type:`bar`,data:{labels:t,datasets:[{label:r.label||`Valeur`,data:n,backgroundColor:r.backgroundColors||a.primary,borderRadius:4}]},options:{indexAxis:`y`,responsive:!0,maintainAspectRatio:!1,onClick:r.onClick?(e,n)=>{if(!n?.length)return;let i=n[0];r.onClick(i.index,t[i.index],i.datasetIndex)}:void 0,plugins:{legend:{display:!1},tooltip:{backgroundColor:a.tooltipBg,titleColor:a.tooltipTitle,bodyColor:a.tooltipText,borderColor:a.tooltipBorder,borderWidth:1,padding:8,callbacks:r.tooltipCallbacks||{}}},scales:{x:{grid:{color:a.grid},ticks:{color:a.text,font:{size:10},precision:0},beginAtZero:!0},y:{grid:{display:!1},ticks:{color:a.text,font:{size:11,weight:`600`}}}}}})},renderDoughnut(e,t,n,r={}){this.destroy(e);let i=document.getElementById(e);if(!i||!window.Chart)return;let a=this.getThemeColors(),o=[`#38BDF8`,`#22C55E`,`#F59E0B`,`#A855F7`,`#EC4899`,`#6366F1`];this.instances[e]=new Chart(i,{type:`doughnut`,data:{labels:t,datasets:[{data:n,backgroundColor:r.colors||o,borderWidth:0}]},options:{responsive:!0,maintainAspectRatio:!1,cutout:r.cutout||`68%`,onClick:r.onClick?(e,i)=>{if(i&&i.length>0){let e=i[0].index;r.onClick(e,t[e],n[e])}}:void 0,plugins:{legend:{display:r.showLegend!==!1,position:r.legendPosition||`bottom`,labels:{color:a.text,font:{size:11,weight:`500`},boxWidth:10,boxHeight:10,usePointStyle:!0}},tooltip:{backgroundColor:a.tooltipBg,titleColor:a.tooltipTitle,bodyColor:a.tooltipText,borderColor:a.tooltipBorder,borderWidth:1,padding:10,callbacks:r.tooltipCallbacks||{label:e=>{let t=e.parsed,n=e.dataset.data.reduce((e,t)=>e+Number(t||0),0),i=n>0?Math.round(t/n*100):0;return` ${e.label}: ${r.isHours?f.formatCompactHours(t):t} (${i}%)`}}}}}})},renderStackedArea(e,t,n,r={}){this.destroy(e);let i=document.getElementById(e);if(!i||!window.Chart)return;let a=this.getThemeColors();this.instances[e]=new Chart(i,{type:`line`,data:{labels:t,datasets:n.map(e=>({label:e.label,data:e.data,borderColor:e.color,backgroundColor:e.color+`44`,fill:!0,tension:.3,borderWidth:2,pointRadius:0,pointHoverRadius:4}))},options:{responsive:!0,maintainAspectRatio:!1,interaction:{mode:`index`,intersect:!1},plugins:{legend:{position:`top`,align:`end`,labels:{color:a.text,font:{size:11},boxWidth:10,usePointStyle:!0}},tooltip:{backgroundColor:a.tooltipBg,titleColor:a.tooltipTitle,bodyColor:a.tooltipText,borderColor:a.tooltipBorder,borderWidth:1,padding:8}},scales:{x:{grid:{color:a.grid},ticks:{color:a.text,font:{size:10}}},y:{stacked:!0,grid:{color:a.grid},ticks:{color:a.text,font:{size:10},precision:0},beginAtZero:!0}}}})},renderArea(e,t,n,r={}){this.destroy(e);let i=document.getElementById(e);if(!i||!window.Chart)return;let a=this.getThemeColors(),o=r.color||a.primary;this.instances[e]=new Chart(i,{type:`line`,data:{labels:t,datasets:[{label:r.label||`Valeur`,data:n,borderColor:o,backgroundColor:o+`33`,fill:!0,tension:.35,borderWidth:2,pointRadius:2,pointHoverRadius:5}]},options:{responsive:!0,maintainAspectRatio:!1,onClick:r.onClick?(e,n)=>{if(!n?.length)return;let i=n[0];r.onClick(i.index,t[i.index],i.datasetIndex)}:void 0,plugins:{legend:{display:!1},tooltip:{backgroundColor:a.tooltipBg,titleColor:a.tooltipTitle,bodyColor:a.tooltipText,borderColor:a.tooltipBorder,borderWidth:1,padding:8,callbacks:r.tooltipCallbacks||(r.isHours?{label:e=>`${e.dataset.label}: ${f.formatCompactHours(e.parsed.y)}`}:{})}},scales:{x:{grid:{color:a.grid},ticks:{color:a.text,font:{size:10}}},y:{grid:{color:a.grid},ticks:{color:a.text,font:{size:10},precision:0,callback:r.isHours?e=>`${e}h`:e=>e},beginAtZero:!0}}}})},renderStackedBar(e,t,n,r={}){this.destroy(e);let i=document.getElementById(e);if(!i||!window.Chart)return;let a=this.getThemeColors();this.instances[e]=new Chart(i,{type:`bar`,data:{labels:t,datasets:n.map(e=>({label:e.label,data:e.data,backgroundColor:e.color,borderRadius:r.borderRadius||2,stack:`stack0`}))},options:{responsive:!0,maintainAspectRatio:!1,onClick:r.onClick?(e,n)=>{if(!n?.length)return;let i=n[0];r.onClick(i.index,t[i.index],i.datasetIndex)}:void 0,interaction:{mode:`index`,intersect:!1},plugins:{legend:{display:r.showLegend!==!1,position:`top`,align:`end`,labels:{color:a.text,font:{size:11},boxWidth:10,usePointStyle:!0}},tooltip:{backgroundColor:a.tooltipBg,titleColor:a.tooltipTitle,bodyColor:a.tooltipText,borderColor:a.tooltipBorder,borderWidth:1,padding:8,callbacks:r.tooltipCallbacks||(r.isHours?{label:e=>`${e.dataset.label}: ${f.formatCompactHours(e.parsed.y)}`}:{})}},scales:{x:{stacked:!0,grid:{display:!1},ticks:{color:a.text,font:{size:10}}},y:{stacked:!0,grid:{color:a.grid},ticks:{color:a.text,font:{size:10},precision:0,callback:r.isHours?e=>`${e}h`:e=>e},beginAtZero:!0}}}})}},p={start(){this.poll(),t.streamPollInterval||=setInterval(()=>this.poll(),5e3)},stop(){t.streamPollInterval&&=(clearInterval(t.streamPollInterval),null)},async poll(){if(t.user)try{let e=(await l.getJSON(`/api/streams`)).streams||[];t.activeStreamsCount=e.length;let r=document.getElementById(`topbar-live-streams-count`);r&&(r.textContent=e.length);let i=document.getElementById(`dashboard-live-streams-list`);i&&(e.length===0?i.innerHTML=`
              <div class="empty-state" style="padding: 1.5rem;">
                <p>${o.t(`dashboard.noLiveStreams`)||`Aucun flux actif pour le moment.`}</p>
              </div>
            `:(i.innerHTML=e.map(e=>`
              <div class="stream-card">
                <div class="stream-poster-thumb">
                  ${e.mediaJellyfinId?`<img src="/api/jellyfin/image?id=${encodeURIComponent(e.mediaJellyfinId)}&serverId=${encodeURIComponent(e.serverId||``)}&type=Primary&maxWidth=140" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;">`:``}
                </div>
                <div class="stream-info">
                  <div class="stream-title">${n.escapeHtml(e.mediaTitle||`Titre inconnu`)}</div>
                  <div class="stream-details">
                    <span>👤 ${n.escapeHtml(e.username||`Utilisateur`)}</span>
                    <span>📱 ${n.escapeHtml(e.clientName||`Lecteur`)}</span>
                    <span class="badge ${e.playMethod===`DirectPlay`?`badge-success`:`badge-warning`}">${n.escapeHtml(e.playMethod||`Stream`)}</span>
                  </div>
                  <div class="stream-progress-bar">
                    <div class="stream-progress-fill" style="width: ${Math.min(100,Math.max(5,Number(e.progressPercent)||25))}%;"></div>
                  </div>
                </div>
                ${t.user.isAdmin?`
                  <button class="btn btn-danger btn-sm btn-kill-stream" data-session-id="${n.escapeHtml(e.sessionId)}">
                    ${o.t(`dashboard.killStream`)||`Arrêter`}
                  </button>
                `:``}
              </div>
            `).join(``),i.querySelectorAll(`.btn-kill-stream`).forEach(e=>{e.addEventListener(`click`,async()=>{let t=e.getAttribute(`data-session-id`);d.showAction({title:o.t(`dashboard.killStream`)||`Arrêter le flux`,bodyHtml:`<p>Voulez-vous forcer l’arrêt de cette lecture en cours ?</p>`,confirmText:`Arrêter le flux`,onConfirm:async()=>{try{await l.postJSON(`/api/jellyfin/kill-stream`,{sessionId:t}),a.success(`Flux arrêté avec succès.`),p.poll()}catch(e){a.error(e.message)}}})})})))}catch{}}},m={async dashboard(){document.body.classList.remove(`is-auth-page`);let e=document.getElementById(`app-main`),r=t.pageController.signal,i,s,c,p,m;t.pageCleanups.push(()=>{clearInterval(i),clearInterval(s),clearInterval(c),p?.close(),delete window.openSendMessageModal,delete window.confirmKillStream,delete window.openAttendanceDrilldown,delete window._setMsgTimeout});let g=new URLSearchParams(window.location.search),_=g.get(`timeRange`)||`7d`;[`1d`,`24h`,`7d`,`30d`,`90d`,`365d`,`all`,`custom`].includes(_)||(_=`7d`),_===`24h`&&(_=`1d`);let v=g.get(`from`)||``,y=g.get(`to`)||``,b=e=>{e.set(`timeRange`,_),_===`custom`&&(e.set(`from`,v),e.set(`to`,y))},x=g.get(`type`)||``,S=g.get(`servers`)||``;if(!g.has(`servers`))try{S=localStorage.getItem(`jellytrack:server-scope`)||``}catch{}let C=(g.get(`excludeTypes`)||``).split(`,`).filter(Boolean),w=g.get(`excludeLibs`)||``,T=e=>{x&&e.set(`type`,x),C.length&&e.set(`excludeTypes`,C.join(`,`)),w&&e.set(`excludeLibs`,w)},E=e=>e===`Audio`?`MusicAlbum`:e,D=()=>document.querySelectorAll(`#dash-media-filter .header-filter-btn`).forEach(e=>{let t=e.dataset.type,n=x?t===x:t?!C.includes(E(t)):C.length===0;e.classList.toggle(`active`,n),e.setAttribute(`aria-pressed`,String(n))}),O=()=>{let e=S.split(`,`).filter(Boolean);document.querySelectorAll(`#dash-server-filter-container .header-filter-btn`).forEach(t=>{let n=t.dataset.serverId?e.length===0||e.includes(t.dataset.serverId):e.length===0;t.classList.toggle(`active`,n),t.setAttribute(`aria-pressed`,String(n))})},k=(e=``)=>{let t=new URLSearchParams(e);return M!==`overview`&&!t.has(`hideZapped`)&&t.set(`hideZapped`,`false`),t.set(`days`,_===`all`||_===`custom`||t.has(`dateFrom`)?`all`:String(parseInt(_,10)||7)),x&&!t.has(`type`)&&t.set(`type`,x),C.length&&t.set(`excludeTypes`,C.join(`,`)),w&&t.set(`excludeLibs`,w),S&&t.set(`servers`,S),_===`custom`&&!t.has(`dateFrom`)&&(t.set(`dateFrom`,v),t.set(`dateTo`,y)),`/logs?`+t.toString()},A=(e,t=!1)=>{let n=new URLSearchParams(e);return t||b(n),T(n),S&&n.set(`servers`,S),t&&R!==`_total`&&n.set(`type`,R),`/api/heatmap-detail?`+n.toString()},j=!1,M=`overview`,N=[],P=0,F=!0,I=!1,L=new Date().getFullYear(),R=`_total`,z=new Date().getFullYear(),B=[0,1,2,3,4,5,6,7,8,9],V=[...B];try{let e=JSON.parse(localStorage.getItem(`JellyTrack-dashboard-order`)||`null`);Array.isArray(e)&&e.length===B.length&&new Set(e).size===B.length&&e.every(e=>B.includes(e))&&(V=e)}catch{}let ee=window.JellyTrackUI.dashboardFrame(e,{t:o.t.bind(o),locale:t.locale});window.openSendMessageModal=(e,t,r,i)=>{let o=10;d.showAction({title:`Envoyer un message à ${t}`,bodyHtml:`
            <div style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:0.75rem;">
              Ce message apparaîtra immédiatement en pop-up sur l'écran du lecteur (${n.escapeHtml(r)}).
            </div>
            <div style="margin-bottom:0.75rem;">
              <span style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); display:block; margin-bottom:0.35rem;">Messages prédéfinis :</span>
              <div class="canned-pills">
                ${[`Redémarrage du serveur dans 5 minutes.`,`Merci de passer en lecture directe ou réduire la qualité.`,`Maintenance technique en cours sur le serveur.`,`Bonne séance cinéma !`].map(e=>`<button type="button" class="canned-btn" data-canned-message="${n.escapeHtml(e)}">${e}</button>`).join(``)}
              </div>
            </div>
            <div style="margin-bottom:0.75rem;">
              <label style="font-size:0.75rem; font-weight:600; display:block; margin-bottom:0.25rem;">Titre du pop-up</label>
              <input type="text" id="send-msg-header" class="form-input w-full" value="Message de l'administrateur" />
            </div>
            <div style="margin-bottom:0.75rem;">
              <label style="font-size:0.75rem; font-weight:600; display:block; margin-bottom:0.25rem;">Texte du message</label>
              <textarea id="send-msg-text" class="form-input w-full" rows="3" placeholder="Écrivez votre message..." style="resize:none;"></textarea>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.75rem; color:var(--muted-foreground);">
              <span>Durée d'affichage :</span>
              <div style="display:flex; gap:0.3rem;">
                <button type="button" class="time-pill-btn" id="btn-sec-5" data-message-timeout="5">5s</button>
                <button type="button" class="time-pill-btn active" id="btn-sec-10" data-message-timeout="10">10s</button>
                <button type="button" class="time-pill-btn" id="btn-sec-30" data-message-timeout="30">30s</button>
              </div>
            </div>
          `,confirmText:`Envoyer à Jellyfin`,cancelText:`Annuler`,onConfirm:async()=>{let t=document.getElementById(`send-msg-header`)?.value||`Message de l'administrateur`,n=document.getElementById(`send-msg-text`)?.value?.trim();if(!n)a.error(`Veuillez saisir un message.`);else try{await l.postJSON(`/api/jellyfin/send-message`,{sessionId:e,serverId:i,header:t,message:n,text:n,timeoutMs:o*1e3}),a.success(`Message transmis avec succès à Jellyfin !`)}catch(e){a.error(e.message||`Erreur lors de l'envoi`)}}}),window._setMsgTimeout=e=>{o=e,[`5`,`10`,`30`].forEach(t=>{let n=document.getElementById(`btn-sec-${t}`);n&&n.classList.toggle(`active`,t===String(e))})}},window.confirmKillStream=(e,t,r)=>{d.showAction({title:o.t(`dashboard.killStream`)||`Arrêter le flux`,bodyHtml:`<p>Voulez-vous forcer l'arrêt de la lecture : <b>${n.escapeHtml(t||`Session`)}</b> ?</p>`,confirmText:`Arrêter la lecture`,cancelText:`Annuler`,onConfirm:async()=>{try{await l.postJSON(`/api/jellyfin/kill-stream`,{sessionId:e,serverId:r}),a.success(`Flux arrêté avec succès.`),G()}catch(e){a.error(e.message||`Erreur lors de l'arrêt du flux`)}}})};let te=async()=>{if(t.navigation.multiServer)try{let e=await l.getJSON(`/api/settings/jellyfin-servers`).catch(()=>null);if(r.aborted)return;let i=e&&e.servers?e.servers:[];if(t.navigation.multiServer&&i.length>1){let e=document.getElementById(`dash-server-filter-container`);e&&(e.style.display=`inline-flex`,e.innerHTML=`
                <button class="header-filter-btn active" data-server-id="">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  <span>${o.t(`common.all`)||`Tout`}</span>
                </button>
                ${i.map(e=>{let t=e.id||e.jellyfinServerId||``,r=e.name||e.url||t;return`
                    <button class="header-filter-btn" data-server-id="${t}">
                      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                      <span>${n.escapeHtml(r)}</span>
                    </button>
                  `}).join(``)}
              `,e.querySelectorAll(`.header-filter-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.serverId,n=S.split(`,`).filter(Boolean);n=t?n.includes(t)?n.filter(e=>e!==t):[...n,t]:[],S=n.join(`,`);try{S?localStorage.setItem(`jellytrack:server-scope`,S):localStorage.removeItem(`jellytrack:server-scope`)}catch{}document.cookie=`jellytrack_server_scope=${encodeURIComponent(S)}; path=/; max-age=${S?31536e3:0}; samesite=lax`,O(),$(),G()})}),O())}}catch{}},H=async e=>{try{let i=e||await l.getJSON(`/api/admin/health`);if(r.aborted)return;let a=document.getElementById(`dash-system-health-container`);a&&window.JellyTrackUI.dashboardHealth(a,{health:i,locale:t.locale,t:o.t.bind(o),icon:window.JellyTrackNavigation.icon,timeAgo:n.timeAgo})}catch{}},U=async e=>{try{let i=e||await l.getJSON(`/api/hardware`);if(r.aborted)return;let a=document.getElementById(`dash-hardware-container`);a&&i?.cpu&&window.JellyTrackUI.dashboardHardware(a,{hardware:i,locale:t.locale,t:o.t.bind(o),icon:window.JellyTrackNavigation.icon,timeAgo:n.timeAgo})}catch{}},W=()=>{p?.close(),m=S,p=new EventSource(`/api/dashboard/live`+(m?`?servers=`+encodeURIComponent(m):``)),p.addEventListener(`dashboard`,e=>{if(!r.aborted)try{let t=JSON.parse(e.data);t.streams&&G(t.streams),t.hardware&&U(t.hardware),t.health&&H(t.health)}catch(e){console.error(`Invalid dashboard event`,e)}}),p.addEventListener(`revoked`,()=>{p.close(),u.checkSession().then(()=>h.renderCurrent())})},G=async e=>{if(p&&m!==S&&W(),!document.hidden)try{let n=e||await l.getJSON(`/api/streams${S?`?servers=${encodeURIComponent(S)}`:``}`);if(r.aborted)return;N=n.streams||[],P=n.totalBandwidthMbps||0,F=n.bandwidthKnown!==!1,t.activeStreamsCount=N.length;let i=document.getElementById(`topbar-live-streams-count`);i&&(i.textContent=N.length),K()}catch{}},K=()=>{let e=document.getElementById(`dash-live-streams-body`);if(!e)return;let n=document.getElementById(`dash-live-header-info`);if(n){let e=N.length&&F&&P>0?` (${P} Mbps)`:``;n.textContent=`${N.length} ${o.t(`dashboard.activeStreams`)||`flux actifs`}${e}`}window.JellyTrackUI.dashboardLive(e,{streams:N,liveBandwidth:P,liveBandwidthKnown:F,forceCardsView:I,multiServer:!!t.navigation.multiServer,isAdmin:!!t.user?.isAdmin,t:o.t.bind(o)})},q=null,ne=0,J=0,Y=0,re=async()=>{try{let e=_===`all`?`all`:parseInt(_,10)||7,t=new URLSearchParams;t.set(`days`,String(e)),b(t),T(t),S&&t.set(`servers`,S);let i=++ne,a=await l.getJSON(`/api/dashboard?${t.toString()}`);if(i!==ne||(q=a,r.aborted))return;ee.setToday(n.formatNumber(q.todayPlays||0),String(q.todayHours??0)+`h`,n.formatNumber(q.todayActiveUsers||0)),X(),oe()}catch(e){r.aborted||a.error(e.message||`Erreur de chargement du tableau de bord`)}},X=()=>{let e=document.getElementById(`dash-draggable-container`);if(!e||!q)return;let r=document.getElementById(`dash-server-comparison`);t.navigation.multiServer&&(r||(r=document.createElement(`section`),r.id=`dash-server-comparison`,r.className=`card`,document.getElementById(`dash-server-filter-container`)?.parentElement.after(r)),r.innerHTML=`<h3>Activité par serveur</h3>${(q.serverActivity||[]).map(e=>`<p>${n.escapeHtml(e.name)} : ${n.escapeHtml(e.plays)} lecture(s), ${n.escapeHtml(Number(e.hours).toFixed(1))} h</p>`).join(``)}`);let i=q,a=i.breakdown||{movieViews:0,movieHours:0,seriesViews:0,seriesHours:0,musicViews:0,musicHours:0,booksViews:0,booksHours:0},s={0:()=>``,1:()=>`
            <div class="stat-grid-4">
              <a href="${k(`type=Movie`)}" data-link class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Films</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/></svg>
                </div>
                <div class="metric-glow-blue" style="font-size:1.6rem; font-weight:800;">${a.movieViews||0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">vues</span></div>
                <div style="font-size:0.75rem; color:#3b82f6; font-weight:600;">${a.movieHours||0}h regardées</div>
              </a>

              <a href="${k(`type=Episode`)}" data-link class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Séries</span>
                  <svg class="nav-icon text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="15" x="2" y="7" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
                </div>
                <div class="metric-glow-emerald" style="font-size:1.6rem; font-weight:800;">${a.seriesViews||0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">lectures</span></div>
                <div style="font-size:0.75rem; color:#10b981; font-weight:600;">${a.seriesHours||0}h regardées</div>
              </a>

              <a href="${k(`type=Audio`)}" data-link class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Musique</span>
                  <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="metric-glow-amber" style="font-size:1.6rem; font-weight:800;">${a.musicViews||0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">titres</span></div>
                <div style="font-size:0.75rem; color:#f59e0b; font-weight:600;">${a.musicHours||0}h écoutées</div>
              </a>

              <a href="${k(`type=AudioBook`)}" data-link class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Livres</span>
                  <svg class="nav-icon text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>
                </div>
                <div class="metric-glow-violet" style="font-size:1.6rem; font-weight:800;">${a.booksViews||0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">ouverts</span></div>
                <div style="font-size:0.75rem; color:#a855f7; font-weight:600;">${a.booksHours||0}h passées</div>
              </a>
            </div>
          `,2:()=>`
            <div class="bento-volumes-grid">
              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">Volume d'écoute & Activité</div>
                    <div class="card-subtitle">Évolution temporelle des heures regardées par type de média</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:350px;">
                  <canvas id="chart-composed-trend"></canvas>
                </div>
              </div>

              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">${o.t(`dashboard.categoryBreakdown`)||`Répartition par catégorie`}</div>
                    <div class="card-subtitle">Volume global d'écoute par catégorie</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:350px;">
                  <canvas id="chart-category-pie"></canvas>
                </div>
              </div>
            </div>
          `,3:()=>`
            <div class="chart-card">
              <div class="card-header">
                <div class="card-title-group">
                  <div class="card-title">${o.t(`dashboard.libraryPlays`)||`Lectures quotidiennes par bibliothèque`}</div>
                  <div class="card-subtitle">Sessions journalières initiées par type de contenu</div>
                </div>
              </div>
              <div class="chart-wrap" style="height:320px;">
                <canvas id="chart-library-plays"></canvas>
              </div>
            </div>
          `,4:()=>`
            <div class="card">
              <div class="card-header">
                <div class="card-title-group" style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:0.5rem;">
                  <div>
                    <div class="card-title">${o.t(`charts.yearlyActivity`)||`📅 Carte thermique d'activité annuelle`}</div>
                    <div class="card-subtitle" id="dash-heatmap-summary">Sessions enregistrées sur l'année</div>
                  </div>
                  <div style="display:flex; align-items:center; gap:0.5rem;">
                    <button class="btn btn-secondary btn-sm" id="btn-heatmap-prev-year">◀</button>
                    <span class="app-chip font-bold" id="heatmap-current-year" style="min-width:60px; text-align:center;">${L}</span>
                    <button class="btn btn-secondary btn-sm" id="btn-heatmap-next-year">▶</button>
                  </div>
                </div>
                <div style="display:flex; gap:0.4rem; margin-top:0.6rem; flex-wrap:wrap;" id="dash-heatmap-lib-filters">
                  ${[`_total`,...i.yearlyHeatmap?.libraryTypes||[]].map(e=>`<button class="time-pill-btn ${R===e?`active`:``}" data-lib="${n.escapeHtml(e)}">${n.escapeHtml(e===`_total`?o.t(`common.all`):o.t(`common.${e}`)||e)}</button>`).join(``)}
                </div>
              </div>
              <div class="yearly-heatmap-wrapper" id="dash-heatmap-grid-container" style="padding:1rem;">
                <div class="skeleton" style="height:140px;"></div>
              </div>
            </div>
          `,5:()=>`
            <div class="dash-grid-2">
              <div class="card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">${o.t(`dashboard.loyalUsers`)||`👥 Utilisateurs les plus fidèles`}</div>
                    <div class="card-subtitle">${o.t(`dashboard.loyalUsersDesc`)||`Classement par heures de visionnage sur la période`}</div>
                  </div>
                </div>
                <div class="ranking-list" id="dash-top-users-list">
                  ${(i.topUsers||[]).length>0?(i.topUsers||[]).slice(0,5).map((e,t)=>`
                    <a href="/users/${encodeURIComponent(e.id||e.jellyfinUserId||``)}" class="ranking-item">
                      <span class="ranking-badge">#${t+1}</span>
                      <div class="ranking-name">
                        <span style="font-weight:700;">${n.escapeHtml(e.username)}</span>
                      </div>
                      <span class="ranking-value">${e.hours||0}h</span>
                    </a>
                  `).join(``):`<div class="text-muted-foreground text-sm" style="padding:1rem;">Aucune activité enregistrée.</div>`}
                </div>
              </div>

              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">${o.t(`dashboard.clientEcosystem`)||`📱 Écosystème des clients`}</div>
                    <div class="card-subtitle">${o.t(`dashboard.clientEcosystemDesc`)||`Applications et appareils utilisés pour la lecture`}</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:280px;">
                  <canvas id="chart-platform-dist"></canvas>
                </div>
              </div>
            </div>
          `,6:()=>`
            <div class="card" id="dash-live-panel">
              <div class="card-header">
                <div class="card-title-group" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                  <div>
                    <div class="card-title" style="display:flex; align-items:center; gap:0.5rem;">
                      ${window.JellyTrackNavigation.icon(`activity`)}
                      ${o.t(`dashboard.liveStreams`)||`Flux en direct`}
                    </div>
                    <div class="card-subtitle" id="dash-live-header-info">Surveillance active des lectures en cours</div>
                  </div>
                </div>
              </div>
              <div id="dash-live-streams-body">
                <div class="empty-state text-muted-foreground" style="padding:1.5rem;">Chargement des flux...</div>
              </div>
            </div>
          `,7:()=>`
            <div class="dash-grid-2">
              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">🕒 Heures de pointe</div>
                    <div class="card-subtitle">Distribution des sessions sur les 24 heures de la journée (UTC)</div>
                  </div>
                </div>
                <div id="chart-hourly-active-banner" style="display:none; padding: 0 1.25rem 0.5rem;"></div>
                <div class="chart-wrap" style="height:260px;">
                  <canvas id="chart-activity-by-hour"></canvas>
                </div>
              </div>

              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">📅 Activité par jour de la semaine</div>
                    <div class="card-subtitle">Comparatif du lundi au dimanche</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:260px;">
                  <canvas id="chart-day-of-week"></canvas>
                </div>
              </div>
            </div>
          `,8:()=>`
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap:1.25rem;">
              <div class="chart-card" style="grid-column:span 1; min-width:0;">
                <div class="card-header">
                  <div class="card-title-group" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <div>
                      <div class="card-title">📈 Visionnage mensuel</div>
                      <div class="card-subtitle">Total d'heures par mois</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.4rem;">
                      <button class="btn btn-secondary btn-sm" id="btn-monthly-prev-year">◀</button>
                      <span class="app-chip font-bold" id="monthly-current-year">${z}</span>
                      <button class="btn btn-secondary btn-sm" id="btn-monthly-next-year">▶</button>
                    </div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:260px;">
                  <canvas id="chart-monthly-watch"></canvas>
                </div>
              </div>

              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">🎯 Taux de complétion</div>
                    <div class="card-subtitle">Terminé (>90%), Partiel, Abandonné (<15%)</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:260px;">
                  <canvas id="chart-completion-ratio"></canvas>
                </div>
              </div>

              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">🖥️ Familles d'appareils</div>
                    <div class="card-subtitle">TV, Web, Mobile, Desktop, Autre</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:260px;">
                  <canvas id="chart-client-category"></canvas>
                </div>
              </div>
            </div>
          `,9:()=>`
            <div class="chart-card">
              <div class="card-header">
                <div class="card-title-group">
                  <div class="card-title">⚡ Charge simultanée du serveur</div>
                  <div class="card-subtitle">Pics de flux simultanés calculés par balayage temporel</div>
                </div>
              </div>
              <div class="chart-wrap" style="height:280px;">
                <canvas id="chart-server-load"></canvas>
              </div>
            </div>
          `};window.JellyTrackUI.disposeDashboardKpis(),e.innerHTML=V.map((e,t)=>`
          <div class="draggable-block-wrapper ${j?`is-editing`:``}" data-block-id="${e}">
            ${j?`
              <div class="draggable-block-controls">
                <button class="draggable-move-btn" data-action="up" data-index="${t}" ${t===0?`disabled`:``} title="Monter">▲</button>
                <button class="draggable-move-btn" data-action="down" data-index="${t}" ${t===V.length-1?`disabled`:``} title="Descendre">▼</button>
              </div>
            `:``}
            ${s[e]?s[e]():``}
          </div>
        `).join(``);let c=e.querySelector(`[data-block-id="0"]`);c&&window.JellyTrackUI.dashboardKpis(c,{data:i,activeStreamsCount:t.activeStreamsCount||0,currentTimeRange:_,locale:t.locale,t:o.t.bind(o),icon:window.JellyTrackNavigation.icon,formatNumber:n.formatNumber,historyURL:k}),Object.entries({"chart-composed-trend":`volumeHistory`,"chart-category-pie":`categoryBreakdown`,"chart-library-plays":`libraryPlays`,"chart-platform-dist":`clientEcosystem`,"chart-activity-by-hour":`hourlyActivity`,"chart-day-of-week":`dayOfWeekActivity`,"chart-monthly-watch":`monthlyTime`,"chart-completion-ratio":`completionRate`,"chart-client-category":`clientFamilies`,"chart-server-load":`serverLoad`}).forEach(([t,n])=>{let r=e.querySelector(`#${t}`)?.closest(`.chart-card`);r&&(r.querySelector(`.card-title`).textContent=o.t(`dashboard.${n}`),r.querySelector(`.card-subtitle`).textContent=o.t(`dashboard.${n}Desc`))}),e.querySelectorAll(`[data-block-id="1"] .breadcrumb-card`).forEach((e,t)=>{let n=[`movies`,`series`,`music`,`books`][t],r=[`moviesWatched`,`seriesWatched`,`musicListened`,`booksSpent`][t];e.children[0].querySelector(`span`).textContent=o.t(`dashboard.${n}Card`),e.children[1].querySelector(`span`).textContent=o.t(`dashboard.${[`moviesViews`,`seriesPlays`,`musicTitles`,`booksOpened`][t]}`),e.children[2].textContent=`${a[`${n===`movies`?`movie`:n}Hours`]||0}h ${o.t(`dashboard.${r}`)}`}),j&&e.querySelectorAll(`.draggable-move-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.getAttribute(`data-action`),n=parseInt(e.getAttribute(`data-index`),10),r=t===`up`?n-1:n+1;if(r>=0&&r<V.length){let e=V[n];V[n]=V[r],V[r]=e,localStorage.setItem(`JellyTrack-dashboard-order`,JSON.stringify(V)),X()}})}),ie(),K(),Q(),ae()},ie=()=>{if(!q)return;let e=q;if(document.getElementById(`chart-composed-trend`)){if(e.trendData&&e.trendData.length>0){let t=e.trendData.map(e=>e.time),n=[{label:o.t(`charts.movies`)+` (h)`,data:e.trendData.map(e=>e.movieVolume||0),color:`#38bdf8`},{label:o.t(`charts.series`)+` (h)`,data:e.trendData.map(e=>e.seriesVolume||0),color:`#22c55e`},{label:o.t(`charts.music`)+` (h)`,data:e.trendData.map(e=>e.musicVolume||0),color:`#f59e0b`},{label:o.t(`charts.books`)+` (h)`,data:e.trendData.map(e=>e.booksVolume||0),color:`#a855f7`}];f.renderMultiLine(`chart-composed-trend`,t,n,{isHours:!0})}else f.showEmpty(`chart-composed-trend`,`Aucune tendance disponible`)}if(document.getElementById(`chart-category-pie`)){if(e.categoryPieData&&e.categoryPieData.some(e=>(e.value||0)>0)){let t={movies:o.t(`media.movies`)||`Films`,series:o.t(`media.series`)||`Séries`,music:o.t(`media.music`)||`Musique`,books:o.t(`media.books`)||`Livres`,Movie:o.t(`media.movies`)||`Films`,Series:o.t(`media.series`)||`Séries`,Audio:o.t(`media.music`)||`Musique`,Book:o.t(`media.books`)||`Livres`},n={movies:`Movie`,series:`Episode`,music:`Audio`,books:`AudioBook`,Movie:`Movie`,Series:`Episode`,Audio:`Audio`,Book:`AudioBook`},r=e.categoryPieData.map(e=>t[e.name]||e.name),i=e.categoryPieData.map(e=>e.value);f.renderDoughnut(`chart-category-pie`,r,i,{isHours:!0,colors:[`#38bdf8`,`#22c55e`,`#f59e0b`,`#a855f7`],onClick:t=>{let r=e.categoryPieData[t],i=r?r.name:``,a=n[i]||`Movie`;h.navigate(k(`type=${a}`))}})}else f.showEmpty(`chart-category-pie`,`Aucune lecture sur la période`)}if(document.getElementById(`chart-library-plays`)){if(e.trendData&&e.trendData.length>0){let t=e.trendData.map(e=>e.time),n=[{label:o.t(`charts.movies`),data:e.trendData.map(e=>e.moviePlays||0),color:`#3b82f6`},{label:o.t(`charts.series`),data:e.trendData.map(e=>e.seriesPlays||0),color:`#22c55e`},{label:o.t(`charts.music`),data:e.trendData.map(e=>e.musicPlays||0),color:`#eab308`},{label:o.t(`charts.books`),data:e.trendData.map(e=>e.booksPlays||0),color:`#a855f7`},{label:`Total lectures`,data:e.trendData.map(e=>e.totalViews||0),color:`#94a3b8`}];f.renderMultiLine(`chart-library-plays`,t,n,{isHours:!1})}else f.showEmpty(`chart-library-plays`,`Aucune lecture enregistrée`)}if(document.getElementById(`chart-platform-dist`)){if(e.platformChartData&&e.platformChartData.some(e=>(e.value||0)>0)){let t=e.platformChartData.map(e=>e.name),n=e.platformChartData.map(e=>e.value);f.renderDoughnut(`chart-platform-dist`,t,n,{isHours:!1,onClick:(e,t)=>h.navigate(k(`client=${encodeURIComponent(t)}`))})}else f.showEmpty(`chart-platform-dist`,`Aucune plateforme détectée`)}if(document.getElementById(`chart-activity-by-hour`)){if(e.hourlyChartData&&e.hourlyChartData.length>0){let t=e.hourlyChartData.map(e=>e.hour),n=e.hourlyChartData.map(e=>Number(e.count||e.value||0)),r=Math.max(...n,0),i=n.filter(e=>Number.isFinite(e)),a=i.length>0?Math.round(i.reduce((e,t)=>e+t,0)/i.length):0,s=n.map(e=>e===r&&r>0?`#f97316`:`#38bdf8`),c=document.getElementById(`chart-hourly-active-banner`);f.renderBar(`chart-activity-by-hour`,t,n,{backgroundColors:s,label:`Sessions`,onClick:(e,t,r)=>{let i=r===void 0?n[e]:r,s=i-a,l=s>=0?`+`:``,u=t.split(`:`)[0];c?(c.style.display=`block`,c.innerHTML=`
                  <div class="active-hour-banner">
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                      <span style="font-weight:700; color:#22d3ee;">${t}</span>
                      <span>${i} ${o.t(`charts.sessions`)||`sessions`}</span>
                      <span style="color:var(--muted-foreground); font-size:0.75rem;">(${l}${s} vs moy. ${a})</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-left:auto;">
                      <a href="${k(`hour=${u}`)}" data-link class="btn btn-secondary btn-sm" style="padding:0.2rem 0.6rem; font-size:0.75rem; text-decoration:none;">
                        Voir les logs ↗
                      </a>
                      <button type="button" class="btn btn-secondary btn-sm" style="padding:0.15rem 0.45rem; font-size:0.75rem;" data-dismiss="chart-hourly-active-banner">×</button>
                    </div>
                  </div>
                `):h.navigate(k(`hour=${u}`))}})}else f.showEmpty(`chart-activity-by-hour`,`Aucune activité horaire`)}if(document.getElementById(`chart-day-of-week`)){let t=[`Lun`,`Mar`,`Mer`,`Jeu`,`Ven`,`Sam`,`Dim`],n=new Map;e.dayOfWeekChartData&&e.dayOfWeekChartData.length>0&&e.dayOfWeekChartData.forEach(e=>{let t=(e.day||``).trim(),r=t.substring(0,3);n.set(r,Number(e.count||0)),n.set(t,Number(e.count||0))});let r=t.map(e=>n.get(e)||0),i=Math.max(...r,0),a=r.map(e=>e===i&&i>0?`#ea580c`:`#059669`);f.renderBar(`chart-day-of-week`,t,r,{backgroundColors:a,label:`Sessions`})}if(Z(),document.getElementById(`chart-completion-ratio`)){if(e.completionData&&e.completionData.some(e=>(e.value||0)>0)){let t={completed:o.t(`dashboard.completed`)||`Terminé`,partial:o.t(`dashboard.partial`)||`Partiel`,abandoned:o.t(`dashboard.abandoned`)||`Abandonné`},n={completed:`#22c55e`,partial:`#f59e0b`,abandoned:`#ef4444`},r=e.completionData.map(e=>t[e.name]||e.name),i=e.completionData.map(e=>e.value),a=e.completionData.map(e=>n[e.name]||`#94a3b8`);f.renderDoughnut(`chart-completion-ratio`,r,i,{colors:a,isHours:!1})}else f.showEmpty(`chart-completion-ratio`,`Aucune donnée de complétion`)}if(document.getElementById(`chart-client-category`)){if(e.clientCategoryData&&e.clientCategoryData.some(e=>(e.count||0)>0)){let t=e.clientCategoryData.map(e=>e.category),n=e.clientCategoryData.map(e=>e.count),r={TV:`#6366f1`,Web:`#3b82f6`,Mobile:`#22c55e`,Desktop:`#f59e0b`,Autre:`#71717a`},i=t.map(e=>r[e]||`#71717a`);f.renderHorizontalBar(`chart-client-category`,t,n,{backgroundColors:i,label:`Sessions`})}else f.showEmpty(`chart-client-category`,`Aucun type d'appareil`)}if(document.getElementById(`chart-server-load`)){if(e.serverLoadData&&e.serverLoadData.length>0){let t=e.serverLoadData.map(e=>e.time),n=[{label:`Flux simultanés max`,data:e.serverLoadData.map(e=>e.peakStreams||0),color:`#ec4899`,fill:!0}];f.renderMultiLine(`chart-server-load`,t,n,{isHours:!1})}else f.showEmpty(`chart-server-load`,`Aucun pic simultané`)}},Z=()=>{if(!document.getElementById(`chart-monthly-watch`))return;let e=[`Jan`,`Fév`,`Mar`,`Avr`,`Mai`,`Juin`,`Juil`,`Aoû`,`Sep`,`Oct`,`Nov`,`Déc`],t=new Map;q&&q.monthlyWatchData&&q.monthlyWatchData.forEach(e=>t.set(e.month,e.hours));let n=[];for(let e=0;e<12;e++)n.push(t.get(`${z}_${e}`)||0);let r=Math.max(...n,0),i=n.map(e=>e===r&&r>0?`#f97316`:`#38bdf8`);f.renderBar(`chart-monthly-watch`,e,n,{backgroundColors:i,isHours:!0,onClick:e=>{let t=String(e+1).padStart(2,`0`),n=new Date(Date.UTC(z,e+1,0)).toISOString().slice(0,10);h.navigate(k(`dateFrom=${z}-${t}-01&dateTo=${n}`))}})},Q=()=>{let e=document.getElementById(`dash-heatmap-grid-container`);if(!e||!q||!q.yearlyHeatmap)return;let t=q.yearlyHeatmap,r=t.dataByType||t.heatmapDataByType||{},i=r[R]||r._total||[],a=new Map,s=0;i.forEach(e=>{a.set(e.date,e.count),e.date.startsWith(String(L))&&(s+=e.count)});let c=document.getElementById(`dash-heatmap-summary`);c&&(c.textContent=`${s} sessions enregistrées en ${L}`);let u=Array.from(a.values()).filter(e=>e>0),f=u.length>0?u.reduce((e,t)=>e+t,0)/u.length:0,p=u.length>0?Math.max(...u):0,m=e=>!e||e<=0?0:f<=0?1:e<=f?e/f<.5?1:2:p<=f||(e-f)/(p-f)<.45?3:4,g=new Date(Date.UTC(L,0,1)),_=new Date(g),v=(_.getUTCDay()+6)%7;_.setUTCDate(_.getUTCDate()-v);let y=(Date.UTC(L+1,0,1)-Date.UTC(L,0,1))/864e5,b=Math.ceil((y+v)/7),x=[`Jan`,`Fév`,`Mar`,`Avr`,`Mai`,`Juin`,`Juil`,`Aoû`,`Sep`,`Oct`,`Nov`,`Déc`],S=-1,C=[];for(let e=0;e<b;e++){let t=new Date(_);t.setUTCDate(t.getUTCDate()+e*7);let n=t.getUTCMonth();t.getUTCFullYear()===L&&n!==S&&(C.push({col:e,name:x[n]}),S=n)}let w=`<table class="activity-calendar-table"><thead><tr><th style="width:18px;"></th>`,T=0;for(let e=0;e<b;e++)if(T<C.length&&C[T].col===e){let t=(T+1<C.length?C[T+1].col:b)-e;w+=`<th colspan="${t}" style="font-size:0.65rem; color:var(--muted-foreground); text-align:left; font-weight:600; padding-bottom:3px;">${C[T].name}</th>`,e+=t-1,T++}else w+=`<th></th>`;w+=`</tr></thead><tbody>`;let E=[`L`,`M`,`M`,`J`,`V`,`S`,`D`];for(let e=0;e<7;e++){w+=`<tr>`,w+=`<td style="font-size:0.68rem; color:var(--muted-foreground); padding-right:6px; font-weight:600;">${E[e]}</td>`;let t=new Date(_);t.setUTCDate(t.getUTCDate()+e);for(let e=0;e<b;e++){let e=t.toISOString().split(`T`)[0],n=t.getUTCFullYear()===L,r=n&&a.get(e)||0,i=n?m(r):0;w+=`
              <td>
                <div class="activity-calendar-cell cal-lvl-${i}" role="button" tabindex="0"
                     title="${e}: ${r} sessions"
                     data-date="${e}"
                     data-count="${r}"
                     style="${n?``:`opacity:0.2;`}">
                </div>
              </td>
            `,t.setUTCDate(t.getUTCDate()+7)}w+=`</tr>`}w+=`</tbody></table>`,w+=`
          <div class="heatmap-legend">
            <span>${o.t(`charts.less`)||`Moins`}</span>
            <span class="activity-calendar-cell cal-lvl-0" style="display:inline-block;"></span>
            <span class="activity-calendar-cell cal-lvl-1" style="display:inline-block;"></span>
            <span class="activity-calendar-cell cal-lvl-2" style="display:inline-block;"></span>
            <span class="activity-calendar-cell cal-lvl-3" style="display:inline-block;"></span>
            <span class="activity-calendar-cell cal-lvl-4" style="display:inline-block;"></span>
            <span>${o.t(`charts.more`)||`Plus`}</span>
          </div>
        `,e.innerHTML=w,e.querySelectorAll(`.activity-calendar-cell`).forEach(e=>{e.addEventListener(`keydown`,t=>{(t.key===`Enter`||t.key===` `)&&(t.preventDefault(),e.click())}),e.addEventListener(`click`,async()=>{let t=e.getAttribute(`data-date`),r=parseInt(e.getAttribute(`data-count`),10)||0;if(r!==0)try{let e=(await l.getJSON(A(`date=${t}`,!0))).sessions||[];d.showAction({title:`Sessions du ${t} (${r} lectures)`,bodyHtml:e.length>0?`
                  <div class="ranking-list" style="max-height:360px; overflow-y:auto;">
                    ${e.map(e=>`
                      <div class="ranking-item">
                        <span class="ranking-badge">▶</span>
                        <div class="ranking-name">
                          <b>${n.escapeHtml(e.username)}</b> — ${n.escapeHtml(e.mediaTitle)}
                          <div class="text-xs text-muted-foreground">${e.durationMin||0} min • ${n.escapeHtml(e.clientName||`Client`)}</div>
                        </div>
                      </div>
                    `).join(``)}
                  </div>
                `:`<p class="text-muted-foreground">Aucun détail disponible pour cette date.</p>`,cancelText:`Fermer`,confirmText:`Voir les logs complets`,onConfirm:()=>h.navigate(k(`dateFrom=${t}&dateTo=${t}`))})}catch{}})})},ae=()=>{let e=document.getElementById(`btn-toggle-draggable-edit`),t=document.getElementById(`draggable-edit-label`);e&&(e.onclick=()=>{j=!j,t&&(t.textContent=j?o.t(`draggable.finishEdit`)||`Terminer`:o.t(`draggable.editOrder`)||`Modifier l'ordre`),e.classList.toggle(`btn-primary`,j),e.classList.toggle(`btn-secondary`,!j),X()});let n=document.getElementById(`btn-toggle-live-view`);n&&(n.onclick=()=>{I=!I,K()});let r=document.getElementById(`btn-heatmap-prev-year`),i=document.getElementById(`btn-heatmap-next-year`),a=document.getElementById(`heatmap-current-year`);r&&(r.onclick=()=>{L--,a&&(a.textContent=L),Q()}),i&&(i.onclick=()=>{L++,a&&(a.textContent=L),Q()}),document.querySelectorAll(`#dash-heatmap-lib-filters .time-pill-btn`).forEach(e=>{e.onclick=()=>{document.querySelectorAll(`#dash-heatmap-lib-filters .time-pill-btn`).forEach(e=>e.classList.remove(`active`)),e.classList.add(`active`),R=e.getAttribute(`data-lib`)||`_total`,Q()}});let s=document.getElementById(`btn-monthly-prev-year`),c=document.getElementById(`btn-monthly-next-year`),l=document.getElementById(`monthly-current-year`);s&&(s.onclick=()=>{z--,l&&(l.textContent=z),Z()}),c&&(c.onclick=()=>{z++,l&&(l.textContent=z),Z()})},oe=async()=>{let e=document.getElementById(`dash-predictions-container`);if(e)try{let t=await l.getJSON(`/api/predictions`);if(r.aborted)return;let i=t.trendingMedia||[],a=(t.peakPredictions||[]).slice(0,10),s=[`Dim`,`Lun`,`Mar`,`Mer`,`Jeu`,`Ven`,`Sam`];if(i.length===0&&a.length===0){e.innerHTML=``;return}if(e.innerHTML=`
            <div class="dash-grid-2">
              ${i.length>0?`
                <div class="card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title" style="display:flex; align-items:center; gap:0.4rem;">
                        <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                        Tendances émergentes
                      </div>
                      <div class="card-subtitle">${o.t(`dashboard.trendingMediaDesc`)||`Titres en forte accélération de visionnage`}</div>
                    </div>
                  </div>
                  <div class="ranking-list">
                    ${i.slice(0,8).map((e,t)=>`
                      <a href="/media/${encodeURIComponent(e.id||e.mediaId||e.jellyfinMediaId||``)}?serverId=${encodeURIComponent(e.serverId||``)}" class="ranking-item">
                        <span class="ranking-badge">#${t+1}</span>
                        <div class="ranking-name">
                          <span style="font-weight:700;">${n.escapeHtml(e.title)}</span>
                          <div style="font-size:0.72rem; color:var(--muted-foreground);">${e.currentWeekPlays||0} lectures cette semaine</div>
                        </div>
                        <span class="badge ${e.growthPercent>0?`badge-success`:`badge-info`}" style="font-size:0.72rem;">
                          ${e.growthPercent>0?`+${Math.round(e.growthPercent*10)/10}%`:`Nouveau`}
                        </span>
                      </a>
                    `).join(``)}
                  </div>
                </div>
              `:``}

              ${a.length>0?`
                <div class="card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title" style="display:flex; align-items:center; gap:0.4rem;">
                        <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        Prévisions des pics d'affluence
                      </div>
                      <div class="card-subtitle">${o.t(`dashboard.peakPredictionsDesc`)||`Créneaux horaires de pointe anticipés par analyse EMA`}</div>
                    </div>
                  </div>
                  <div style="display:flex; flex-direction:column; gap:0.6rem; padding:0.5rem 0;">
                    ${a.map(e=>{let t=a[0]?.predictedSessions||1,n=Math.round(e.predictedSessions/t*100),r=e.confidence>=70;return`
                        <div style="display:flex; align-items:center; gap:0.6rem; font-size:0.75rem;">
                          <span style="width:40px; font-weight:700; color:var(--muted-foreground);">${s[e.dayOfWeek]||`?`}</span>
                          <span style="width:35px; color:var(--muted-foreground);">${String(e.hour).padStart(2,`0`)}h</span>
                          <div style="flex:1; height:18px; border-radius:999px; background:rgba(148, 163, 184, 0.15); overflow:hidden; position:relative;">
                            <div style="height:100%; width:${n}%; border-radius:999px; background:${r?`#f59e0b`:`rgba(245, 158, 11, 0.5)`}; transition:width 0.4s ease;"></div>
                            <span style="position:absolute; right:8px; top:1px; font-size:0.68rem; font-weight:700;">~${Math.round(e.predictedSessions)} flux</span>
                          </div>
                          <span class="badge ${r?`badge-success`:`badge-info`}" style="font-size:0.68rem; width:45px; text-align:center;">${e.confidence}%</span>
                        </div>
                      `}).join(``)}
                  </div>
                </div>
              `:``}
            </div>
          `,a.length){let t=document.createElement(`p`);t.className=`text-xs text-muted-foreground`,t.textContent=o.t(`dashboard.predictionBasis`),e.querySelectorAll(`.card`).item(e.querySelectorAll(`.card`).length-1)?.appendChild(t)}}catch{}},se=async()=>{let e=++J;try{let i=new URLSearchParams;b(i),T(i),S&&i.set(`servers`,S);let[s,c]=await Promise.all([l.getJSON(`/api/stats/granular?${i.toString()}`),l.getJSON(`/api/stats/deep?${i.toString()}`)]);if(r.aborted||e!==J)return;let u=document.getElementById(`dash-granular-container`);if(u){let e=s.heatmapData||[],r=0;e.forEach(e=>{let t=Number(e.views||e.value||e.Views||e.Value||0);t>r&&(r=t)});let i=new Map;e.forEach(e=>{let t=e.DayOfWeek==null?e.day==null?e.Day:e.day:e.DayOfWeek,n=e.Hour==null?e.hour:e.Hour,r=Number(e.views||e.value||e.Views||e.Value||0);i.set(`${t}-${n}`,r)});let p=[1,2,3,4,5,6,0].map(e=>({dow:e,name:new Intl.DateTimeFormat(t.locale,{weekday:`short`,timeZone:`UTC`}).format(new Date(Date.UTC(2023,0,1+e)))})),m=e=>{if(!e||e<=0)return`rgba(148, 163, 184, 0.1)`;let t=r>0?e/r:0;return t<=.25?`#0e4429`:t<=.5?`#006d32`:t<=.75?`#26a641`:`#39d353`},g=s.dropSegments||[],_={skipped:{label:`Zappé (<10%)`,color:`#ef4444`,val:0},abandoned:{label:`Abandonné (10-50%)`,color:`#f97316`,val:0},almost:{label:`Presque vu (50-80%)`,color:`#eab308`,val:0},finished:{label:`Terminé (≥80%)`,color:`#22c55e`,val:0}};g.forEach(e=>{_[e.name]&&(_[e.name].val=Number(e.value||0))});let v=Object.values(_).reduce((e,t)=>e+t.val,0);window.openAttendanceDrilldown=async(e,t,r,i)=>{if(i!==0)try{let a=(await l.getJSON(A(`day=${e}&hour=${t}`))).sessions||[];d.showAction({title:`${r} — ${t}h00 UTC (${i} ${i>1?`sessions`:`session`})`,bodyHtml:a.length>0?`
                    <div class="ranking-list" style="max-height:360px; overflow-y:auto;">
                      ${a.map(e=>`
                        <div class="ranking-item" style="padding:0.6rem 0.75rem; border-radius:var(--radius-sm); background:var(--surface-nested); margin-bottom:0.4rem;">
                          <div style="width:28px; height:28px; border-radius:999px; background:rgba(99, 102, 241, 0.15); color:#6366f1; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.75rem; flex-shrink:0;">
                            ${(e.username||`?`).charAt(0).toUpperCase()}
                          </div>
                          <div class="ranking-name" style="flex:1; min-width:0;">
                            <div style="display:flex; align-items:center; gap:0.4rem;">
                              <span style="font-weight:700;">${n.escapeHtml(e.username||`Utilisateur`)}</span>
                              <span class="badge ${e.playMethod===`DirectPlay`?`badge-success`:`badge-warning`}" style="font-size:0.65rem;">${n.escapeHtml(e.playMethod||`Stream`)}</span>
                            </div>
                            <div style="font-size:0.8rem; color:var(--foreground); margin-top:0.15rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                              ${n.escapeHtml(e.mediaTitle||`Média`)}
                            </div>
                            <div style="font-size:0.7rem; color:var(--muted-foreground); margin-top:0.1rem;">
                              ${e.durationMin||0} min • ${n.escapeHtml(e.clientName||`Client`)} • ${e.startedAt?new Date(e.startedAt).toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`}):``}
                            </div>
                          </div>
                        </div>
                      `).join(``)}
                    </div>
                  `:`<p class="text-muted-foreground text-sm">Aucune session trouvée pour ce créneau.</p>`,confirmText:`Voir les logs`,cancelText:`Fermer`,onConfirm:()=>h.navigate(k(`hour=${t}`))})}catch{a.error(`Erreur lors du chargement des détails`)}},u.innerHTML=`
              <!-- Row 1: Daily Plays & Plays by Library -->
              <div class="dash-grid-2">
                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Lectures par jour</div>
                      <div class="card-subtitle">Volume quotidien total de démarrages de lecture</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:280px;">
                    <canvas id="chart-plays-per-day"></canvas>
                  </div>
                </div>

                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Lectures par bibliothèque</div>
                      <div class="card-subtitle">Répartition quotidienne cumulée par catégorie de média</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:280px;">
                    <canvas id="chart-plays-by-lib"></canvas>
                  </div>
                </div>
              </div>

              <!-- Row 2: Daily Duration & Duration by Library -->
              <div class="dash-grid-2">
                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Durée de visionnage par jour</div>
                      <div class="card-subtitle">Temps total cumulé consommé par jour (heures)</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:280px;">
                    <canvas id="chart-duration-per-day"></canvas>
                  </div>
                </div>

                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Durée par bibliothèque</div>
                      <div class="card-subtitle">Temps cumulé par bibliothèque au fil des jours</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:280px;">
                    <canvas id="chart-duration-by-lib"></canvas>
                  </div>
                </div>
              </div>

              <!-- Row 3: Hourly Averages -->
              <div class="dash-grid-2">
                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Lectures par heure</div>
                      <div class="card-subtitle">Nombre de lectures démarrées par heure (UTC)</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:280px;">
                    <canvas id="chart-plays-hourly-avg"></canvas>
                  </div>
                </div>

                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Durée par heure</div>
                      <div class="card-subtitle">Temps total visionné par heure (UTC)</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:280px;">
                    <canvas id="chart-duration-hourly-avg"></canvas>
                  </div>
                </div>
              </div>

              <!-- Row 4: Attendance Heatmap 7x24 -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">Matrice d'affluence horaire (7j × 24h, UTC)</div>
                    <div class="card-subtitle">Fréquentation selon le jour et l'heure (UTC) (cliquez pour filtrer)</div>
                  </div>
                </div>
                <div class="attendance-heatmap-container" style="padding:1rem;">
                  <table class="attendance-table">
                    <thead>
                      <tr>
                        <th class="attendance-row-lbl" style="width:70px;"></th>
                        ${Array.from({length:24},(e,t)=>`<th class="attendance-th">${t}h</th>`).join(``)}
                      </tr>
                    </thead>
                    <tbody>
                      ${p.map(e=>`
                        <tr>
                          <td class="attendance-row-lbl">${e.name}</td>
                          ${Array.from({length:24},(t,r)=>{let a=i.get(`${e.dow}-${r}`)||0;return`<td class="attendance-cell" style="background:${m(a)};" title="${e.name} à ${r}h : ${a} session(s)" tabindex="0" role="button" data-attendance-day="${e.dow}" data-attendance-hour="${r}" data-attendance-name="${n.escapeHtml(e.name)}" data-attendance-count="${a}"></td>`}).join(``)}
                        </tr>
                      `).join(``)}
                    </tbody>
                  </table>
                  <div class="heatmap-legend" style="padding-top:0.5rem;">
                    <span>Moins</span>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:rgba(148, 163, 184, 0.1);"></span>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:#0e4429;"></span>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:#006d32;"></span>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:#26a641;"></span>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:#39d353;"></span>
                    <span>Plus</span>
                  </div>
                </div>
              </div>

              <!-- Row 5: Completion & Abandon Segments -->
              <div class="dash-grid-2">
                <div class="card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Segments d'abandon</div>
                      <div class="card-subtitle">Répartition des sessions par tranche de complétion</div>
                    </div>
                  </div>
                  <div style="padding:1.25rem; display:flex; flex-direction:column; gap:0.9rem;">
                    ${Object.values(_).map(e=>{let t=v>0?Math.round(e.val/v*100):0;return`
                        <div>
                          <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.3rem;">
                            <span style="font-weight:600;">${e.label}</span>
                            <span style="color:var(--muted-foreground); font-family:monospace;">${e.val} (${t}%)</span>
                          </div>
                          <div style="height:8px; background:var(--surface-nested, rgba(148,163,184,0.2)); border-radius:999px; overflow:hidden;">
                            <div style="height:100%; border-radius:999px; width:${t}%; background:${e.color}; transition:width 0.4s ease;"></div>
                          </div>
                        </div>
                      `}).join(``)}
                  </div>
                </div>

                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Taux de complétion par bibliothèque</div>
                      <div class="card-subtitle">Pourcentage moyen du contenu visionné avant arrêt</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:260px;">
                    <canvas id="chart-avg-completion-lib"></canvas>
                  </div>
                </div>
              </div>

              <!-- Row 6: Worst Completion & Audio & Subtitles -->
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap:1.25rem;">
                <div class="card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Titres les plus abandonnés</div>
                      <div class="card-subtitle">Contenus arrêtés prématurément par les spectateurs</div>
                    </div>
                  </div>
                  <div class="ranking-list" style="padding:0.5rem 1rem 1rem;">
                    ${(s.topAbandoned||[]).map((e,t)=>`
                      <a href="${e.mediaId?`/media/${e.mediaId}`:`#`}" class="ranking-item">
                        <span class="ranking-badge" style="background:rgba(239, 68, 68, 0.15); color:#ef4444;">#${t+1}</span>
                        <div class="ranking-name">
                          <span style="font-weight:700;" title="${n.escapeHtml(e.fullTitle||e.title)}">${n.escapeHtml(e.title)}</span>
                          <div style="font-size:0.72rem; color:var(--muted-foreground);">${e.count||0} abandons · ${e.completion||0}% vu</div>
                        </div>
                        <span class="badge badge-danger" style="font-size:0.72rem;">${e.completion||0}%</span>
                      </a>
                    `).join(``)||`<div class="text-muted-foreground text-sm" style="padding:1rem;">Aucun abandon prématuré recensé.</div>`}
                  </div>
                </div>

                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Pistes audio les plus écoutées</div>
                      <div class="card-subtitle">Codecs et langues des flux audio</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:260px;">
                    <canvas id="chart-audio-breakdown"></canvas>
                  </div>
                </div>

                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Sous-titres utilisés</div>
                      <div class="card-subtitle">Langues et formats de sous-titrage</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:260px;">
                    <canvas id="chart-subtitles-breakdown"></canvas>
                  </div>
                </div>
              </div>
            `;let y=e=>u.querySelector(`#${e}`)?.closest(`.chart-card, .card`),b=Array.from(u.querySelectorAll(`.chart-card, .card`)),x=u.querySelector(`.attendance-heatmap-container`)?.closest(`.card`);x?.classList.add(`attendance-card`);let S=b.find(e=>e.textContent.includes(`Segments d'abandon`)),C=u.querySelector(`.ranking-list`)?.closest(`.card`);S.querySelector(`div[style*="padding:1.25rem"]`).innerHTML=`<div class="chart-wrap" style="height:300px"><canvas id="chart-abandon-segments"></canvas></div>`;for(let[e,t]of Array.from(C.querySelectorAll(`a`)).entries()){let n=(s.topAbandoned||[])[e];if(!n)continue;t.href=n.mediaId?`/media/${encodeURIComponent(n.mediaId)}`:`/media?q=${encodeURIComponent(n.fullTitle||n.title)}`,t.setAttribute(`data-link`,``);let r=document.createElement(`div`);r.className=`historical-completion-track`,r.innerHTML=`<span style="width:${Math.max(0,Math.min(100,n.completion||0))}%"></span>`,t.appendChild(r)}let w=[[y(`chart-plays-per-day`),y(`chart-duration-per-day`)],[y(`chart-plays-by-lib`),y(`chart-duration-by-lib`)],[y(`chart-plays-hourly-avg`),y(`chart-duration-hourly-avg`)],[x,y(`chart-avg-completion-lib`)],[S,C],[y(`chart-audio-breakdown`),y(`chart-subtitles-breakdown`)]],T=document.createDocumentFragment();w.forEach(e=>{let t=document.createElement(`div`);t.className=`dash-grid-2`,e.filter(Boolean).forEach(e=>t.appendChild(e)),T.appendChild(t)}),u.replaceChildren(T);let E=Object.entries(_).map(([e,t])=>({...t,name:e}));v>0?f.renderDoughnut(`chart-abandon-segments`,E.map(e=>o.t(`granular.${e.name}`)||e.label),E.map(e=>e.val),{colors:E.map(e=>e.color),onClick:e=>h.navigate(k(`completion=${encodeURIComponent(E[e].name)}`))}):f.showEmpty(`chart-abandon-segments`,o.t(`common.noData`));let D={"chart-plays-per-day":[`playsPerDay`,`playsPerDayDesc`],"chart-duration-per-day":[`durationPerDay`,`durationPerDayDesc`],"chart-plays-by-lib":[`playsByLibTitle`,`playsByLibDesc`],"chart-duration-by-lib":[`durationByLibTitle`,`durationByLibDesc`],"chart-plays-hourly-avg":[`playsHourlyAvg`,`playsHourlyAvgDesc`],"chart-duration-hourly-avg":[`durationHourlyAvg`,`durationHourlyAvgDesc`],"chart-avg-completion-lib":[`avgCompletionByLib`,`avgCompletionByLibDesc`],"chart-audio-breakdown":[`audioBreakdown`,`audioBreakdownDesc`],"chart-subtitles-breakdown":[`subtitles`,`subtitlesDesc`],"chart-abandon-segments":[`abandonSegments`,`abandonSegmentsDesc`]},O=(e,t,n)=>{e&&n.forEach((n,r)=>{let i=e.querySelector(r?`.card-subtitle`:`.card-title`);i&&(i.textContent=o.t(`${t}.${n}`)||i.textContent)})};Object.entries(D).forEach(([e,t])=>O(y(e),`granular`,t)),O(x,`granular`,[`attendanceHeatmap`,`attendanceHeatmapDesc`]),O(C,`granular`,[`worstCompletion`,`worstCompletionDesc`]);let j=[`#38bdf8`,`#22c55e`,`#f59e0b`,`#a855f7`,`#ec4899`,`#6366f1`,`#14b8a6`,`#f43f5e`],M=e=>e===`Unknown`?o.t(`granular.unassignedLibrary`)||`Bibliothèque non renseignée`:e,N=s.dailyData||[];if(N.length>0){let e=N.map(e=>e.time),t=N.map(e=>Number(e.totalPlays||0));f.renderBar(`chart-plays-per-day`,e,t,{label:o.t(`granular.playsPerDay`),backgroundColors:`#38bdf8`,onClick:e=>h.navigate(k(`dateFrom=${encodeURIComponent(N[e].time)}&dateTo=${encodeURIComponent(N[e].time)}`))})}else f.showEmpty(`chart-plays-per-day`,`Aucune lecture quotidienne`);if(N.length>0&&s.collections&&s.collections.length>0){let e=N.map(e=>e.time),t=s.collections.map((e,t)=>({label:M(e),data:N.map(t=>Number(t[`${e}_plays`]||0)),color:j[t%j.length]}));f.renderStackedBar(`chart-plays-by-lib`,e,t,{onClick:(e,t,n)=>h.navigate(k(`library=${encodeURIComponent(s.collections[n])}&dateFrom=${encodeURIComponent(N[e].time)}&dateTo=${encodeURIComponent(N[e].time)}`))})}else f.showEmpty(`chart-plays-by-lib`,`Aucune donnée par bibliothèque`);if(N.length>0){let e=N.map(e=>e.time),t=N.map(e=>Number(e.totalDuration||0));f.renderArea(`chart-duration-per-day`,e,t,{label:o.t(`granular.durationPerDay`),color:`#a855f7`,isHours:!0,onClick:e=>h.navigate(k(`dateFrom=${encodeURIComponent(N[e].time)}&dateTo=${encodeURIComponent(N[e].time)}`))})}else f.showEmpty(`chart-duration-per-day`,`Aucune durée enregistrée`);if(N.length>0&&s.collections&&s.collections.length>0){let e=N.map(e=>e.time),t=s.collections.map((e,t)=>({label:M(e),data:N.map(t=>Number(t[`${e}_duration`]||0)),color:j[t%j.length]}));f.renderStackedBar(`chart-duration-by-lib`,e,t,{isHours:!0,onClick:(e,t,n)=>h.navigate(k(`library=${encodeURIComponent(s.collections[n])}&dateFrom=${encodeURIComponent(N[e].time)}&dateTo=${encodeURIComponent(N[e].time)}`))})}else f.showEmpty(`chart-duration-by-lib`,`Aucune donnée par bibliothèque`);let P=s.hourlyData||[];if(P.length>0){let e=P.map(e=>e.time),t=P.map(e=>Number(e.plays||0));f.renderBar(`chart-plays-hourly-avg`,e,t,{label:`Lectures`,backgroundColors:`#eab308`})}else f.showEmpty(`chart-plays-hourly-avg`,`Aucune donnée horaire`);if(P.length>0){let e=P.map(e=>e.time),t=P.map(e=>Number(e.duration||0));f.renderArea(`chart-duration-hourly-avg`,e,t,{label:`Durée totale (h)`,color:`#22c55e`,isHours:!0})}else f.showEmpty(`chart-duration-hourly-avg`,`Aucune donnée horaire`);let F=s.dropOffData||[];if(F.length>0){let e=F.map(e=>M(e.time)||`Bibliothèque`),t=F.map(e=>Number(e.completion||0));f.renderHorizontalBar(`chart-avg-completion-lib`,e,t,{backgroundColors:`#8b5cf6`,label:o.t(`granular.completionPct`),onClick:e=>h.navigate(k(`library=${encodeURIComponent(F[e].time)}`))})}else f.showEmpty(`chart-avg-completion-lib`,`Aucune donnée de complétion`);let I=s.audioData||c.audioChartData||[];if(I.length>0&&I.some(e=>(e.value||0)>0)){let e=I.map(e=>e.name||`Inconnu`),t=I.map(e=>Number(e.value||0));f.renderDoughnut(`chart-audio-breakdown`,e,t,{isHours:!1,onClick:e=>h.navigate(k(`audio=${encodeURIComponent(I[e].name)}`))})}else f.showEmpty(`chart-audio-breakdown`,`Aucune piste audio enregistrée`);let L=s.subtitleData||c.subtitleChartData||[];if(L.length>0&&L.some(e=>(e.value||0)>0)){let e=L.map(e=>e.name||`Désactivé`),t=L.map(e=>Number(e.value||0));f.renderDoughnut(`chart-subtitles-breakdown`,e,t,{isHours:!1,onClick:e=>h.navigate(k(`subtitle=${encodeURIComponent(L[e].name)}`))})}else f.showEmpty(`chart-subtitles-breakdown`,`Aucun sous-titre utilisé`)}let p=document.getElementById(`dash-deep-insights-container`);if(p){let e=c.categorized||{},t=e.movie||[],r=e.series||[],i=e.album||[],a=e.book||[],s=(e,t,r)=>`
              <div class="card">
                <div class="card-header" style="padding-bottom:0.5rem;">
                  <div class="card-title" style="font-size:0.95rem;">${e}</div>
                </div>
                <div style="padding:0.5rem 0.75rem 0.75rem; display:flex; flex-direction:column; gap:0.4rem;">
                  ${t.length===0?`<div class="text-muted-foreground text-xs" style="padding:0.5rem;">${r}</div>`:``}
                  ${t.map((e,t)=>`
                    <a class="category-media-item" href="/media?q=${encodeURIComponent(e.title)}" data-link>
                      <div style="display:flex; align-items:center; gap:0.4rem; overflow:hidden;">
                        <span style="font-size:0.75rem; color:var(--muted-foreground); width:16px;">${t+1}.</span>
                        <span style="font-size:0.82rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${n.escapeHtml(e.title)}">${n.escapeHtml(e.title)}</span>
                      </div>
                      <span class="badge badge-secondary" style="font-size:0.7rem; font-family:monospace; shrink-0;">${e.plays} ${o.t(`deepInsights.views`)} · ${e.duration}h</span>
                    </a>
                  `).join(``)}
                </div>
              </div>
            `;p.innerHTML=`
              <!-- Categorized Top Media Cards (4 cards) -->
              <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:1rem; margin-bottom:1.25rem;">
                ${s(o.t(`deepInsights.topMovies`),t,o.t(`deepInsights.noMovies`))}
                ${s(o.t(`deepInsights.topSeries`),r,o.t(`deepInsights.noSeries`))}
                ${s(o.t(`deepInsights.topAlbums`),i,o.t(`deepInsights.noAlbums`))}
                ${s(o.t(`deepInsights.topBooks`),a,o.t(`deepInsights.noBooks`))}
              </div>

              <!-- Top Genres -->
              ${(c.topGenres||[]).length>0?`
                <div class="card" style="margin-bottom:1.25rem;">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">${o.t(`deepInsights.topGenres`)||`Top Genres`}</div>
                      <div class="card-subtitle">${o.t(`deepInsights.genresDesc`)||`Styles et catégories les plus visionnés`}</div>
                    </div>
                  </div>
                  <div style="padding:1rem;">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:1rem;">
                      ${c.topGenres.map((e,t)=>{let r=c.topGenres[0]?.plays||1,i=Math.round(e.plays/r*100),a=[`#38bdf8`,`#22c55e`,`#a855f7`,`#f59e0b`,`#ec4899`,`#06b6d4`,`#eab308`,`#ef4444`,`#6366f1`,`#14b8a6`],o=a[t%a.length];return`
                          <a href="/media/all?genre=${encodeURIComponent(e.name)}" data-link style="display:flex; align-items:center; gap:0.6rem; font-size:0.8rem;">
                            <span style="width:20px; text-align:right; color:var(--muted-foreground);">${t+1}.</span>
                            <div style="flex:1; min-width:0;">
                              <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
                                <span style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${n.escapeHtml(e.name)}</span>
                                <span style="font-size:0.75rem; color:var(--muted-foreground); margin-left:0.5rem; font-family:monospace;">${e.plays} v. · ${e.duration}h</span>
                              </div>
                              <div style="height:6px; background:var(--surface-nested, rgba(148,163,184,0.2)); border-radius:999px; overflow:hidden;">
                                <div style="height:100%; border-radius:999px; width:${i}%; background:${o}; transition:width 0.4s ease;"></div>
                              </div>
                            </div>
                          </a>
                        `}).join(``)}
                    </div>
                  </div>
                </div>
              `:``}

              <!-- Top Clients & Stream Methods -->
              <div class="dash-grid-2" style="margin-bottom:1.25rem;">
                <div class="card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">${o.t(`deepInsights.topClients`)||`Top Clients`}</div>
                      <div class="card-subtitle">${o.t(`deepInsights.topClientsDesc`)||`Applications de lecture les plus sollicitées`}</div>
                    </div>
                  </div>
                  <div class="ranking-list" style="padding:0.75rem 1rem 1rem;">
                    ${(c.topClients||[]).map((e,t)=>`
                      <a href="${k(`client=${encodeURIComponent(e.clientName||``)}`)}" data-link class="ranking-item">
                        <span class="ranking-badge">#${t+1}</span>
                        <span class="ranking-name">${n.escapeHtml(e.clientName||`?`)}</span>
                        <span class="ranking-value font-mono">${e.count} ${o.t(`charts.sessions`)}</span>
                      </a>
                    `).join(``)||`<div class="text-muted-foreground text-sm" style="padding:1rem;">Aucun client enregistré</div>`}
                  </div>
                </div>

                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Méthodes de lecture</div>
                      <div class="card-subtitle">DirectPlay vs DirectStream vs Transcode</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:260px;">
                    <canvas id="chart-stream-methods"></canvas>
                  </div>
                </div>
              </div>

              <!-- Pro Telemetry: Resolution & Devices -->
              <div class="dash-grid-2" style="margin-bottom:1.25rem;">
                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Matrice de résolutions</div>
                      <div class="card-subtitle">Qualités vidéo diffusées (4K, 1080p, 720p...)</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:260px;">
                    <canvas id="chart-resolution-matrix"></canvas>
                  </div>
                </div>

                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Écosystème d'appareils</div>
                      <div class="card-subtitle">Modèles d'équipements récepteurs</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:260px;">
                    <canvas id="chart-device-ecosystem"></canvas>
                  </div>
                </div>
              </div>

              <!-- Key Figures (Acteurs, Réalisateurs, Studios) -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">Acteurs, réalisateurs et studios phares</div>
                    <div class="card-subtitle">Figures clés les plus regardées sur votre serveur</div>
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:1rem; padding:1rem;">
                  <div class="app-surface-soft p-4 rounded-lg">
                    <h4 style="font-weight:700; font-size:0.85rem; margin-bottom:0.75rem;">${o.t(`deepInsights.topActors`)||`Top Acteurs`}</h4>
                    <div class="ranking-list">
                      ${(c.topActors||[]).slice(0,5).map((e,t)=>`
                        <div class="ranking-item">
                          <span class="ranking-badge">#${t+1}</span>
                          <span class="ranking-name">${n.escapeHtml(e.name)}</span>
                          <span class="ranking-value">${e.count} films</span>
                        </div>
                      `).join(``)||`<div class="text-muted-foreground text-sm">Aucune donnée</div>`}
                    </div>
                  </div>
                  <div class="app-surface-soft p-4 rounded-lg">
                    <h4 style="font-weight:700; font-size:0.85rem; margin-bottom:0.75rem;">${o.t(`deepInsights.topDirectors`)||`Top Réalisateurs`}</h4>
                    <div class="ranking-list">
                      ${(c.topDirectors||[]).slice(0,5).map((e,t)=>`
                        <div class="ranking-item">
                          <span class="ranking-badge">#${t+1}</span>
                          <span class="ranking-name">${n.escapeHtml(e.name)}</span>
                          <span class="ranking-value">${e.count} films</span>
                        </div>
                      `).join(``)||`<div class="text-muted-foreground text-sm">Aucune donnée</div>`}
                    </div>
                  </div>
                  <div class="app-surface-soft p-4 rounded-lg">
                    <h4 style="font-weight:700; font-size:0.85rem; margin-bottom:0.75rem;">${o.t(`deepInsights.topStudios`)||`Top Studios`}</h4>
                    <div class="ranking-list">
                      ${(c.topStudios||[]).slice(0,5).map((e,t)=>`
                        <div class="ranking-item">
                          <span class="ranking-badge">#${t+1}</span>
                          <span class="ranking-name">${n.escapeHtml(e.name)}</span>
                          <span class="ranking-value">${e.count} titres</span>
                        </div>
                      `).join(``)||`<div class="text-muted-foreground text-sm">Aucune donnée</div>`}
                    </div>
                  </div>
                </div>
              </div>
            `;let l=Array.from(p.children).at(-1),u=document.createElement(`div`);u.className=`dash-grid-2`,u.style.marginBottom=`1.25rem`,u.innerHTML=[`audio`,`subtitle`].map(e=>`<div class="chart-card"><div class="card-header"><div class="card-title-group"><div class="card-title">${o.t(e===`audio`?`granular.audioBreakdown`:`granular.subtitles`)}</div><div class="card-subtitle">${o.t(e===`audio`?`granular.audioBreakdownDesc`:`granular.subtitlesDesc`)}</div></div></div><div class="chart-wrap" style="height:300px"><canvas id="chart-deep-${e}"></canvas></div></div>`).join(``),p.insertBefore(u,l),[`audio`,`subtitle`].forEach(e=>{let t=c[e===`audio`?`audioChartData`:`subtitleChartData`]||[];t.some(e=>e.value>0)?f.renderDoughnut(`chart-deep-${e}`,t.map(e=>e.name===`None`?o.t(`common.none`):e.name),t.map(e=>e.value),{onClick:n=>h.navigate(k(`hideZapped=true&${e}=${encodeURIComponent(t[n].name)}`))}):f.showEmpty(`chart-deep-${e}`,o.t(e===`audio`?`deepInsights.noAudioData`:`deepInsights.noSubtitleData`))}),Object.entries({"chart-stream-methods":[`streamMethods`,`streamMethodsDesc`],"chart-resolution-matrix":[`resolutionMatrix`,`resolutionMatrixDesc`],"chart-device-ecosystem":[`deviceEcosystem`,`deviceEcosystemDesc`]}).forEach(([e,t])=>{let n=p.querySelector(`#${e}`)?.closest(`.chart-card`);t.forEach((e,t)=>{let r=n?.querySelector(t?`.card-subtitle`:`.card-title`);r&&(r.textContent=o.t(`deepInsights.${e}`)||r.textContent)})});let d=c.streamMethodsChartData||[];if(d.length>0&&d.some(e=>(e.value||0)>0)){let e=d.map(e=>e.name||`?`),t=d.map(e=>Number(e.value||0));f.renderDoughnut(`chart-stream-methods`,e,t,{colors:[`#10b981`,`#f59e0b`,`#3b82f6`,`#a855f7`],isHours:!1})}else f.showEmpty(`chart-stream-methods`,`Aucune méthode de flux`);let m=c.resolutionChartData||[];if(m.length>0&&m.some(e=>(e.value||0)>0)){let e=m.map(e=>e.name===`Unknown`?o.t(`deepInsights.missingResolution`)||`Résolution non renseignée`:e.name||`?`),t=m.map(e=>Number(e.value||0));f.renderDoughnut(`chart-resolution-matrix`,e,t,{isHours:!1,onClick:e=>h.navigate(k(`hideZapped=true&resolution=${encodeURIComponent(m[e].name)}`))})}else f.showEmpty(`chart-resolution-matrix`,`Aucune résolution enregistrée`);let g=c.applicationChartData||(c.topClients||[]).map(e=>({name:e.clientName,value:e.count,client:e.clientName}));if(g.length>0&&g.some(e=>(e.value||0)>0)){let e=g.map(e=>e.name||`?`),t=g.map(e=>Number(e.value||0));f.renderDoughnut(`chart-device-ecosystem`,e,t,{isHours:!1,onClick:e=>h.navigate(k(`hideZapped=true&client=${encodeURIComponent(g[e].client)}${g[e].device?`&device=`+encodeURIComponent(g[e].device):``}`))})}else f.showEmpty(`chart-device-ecosystem`,`Aucun appareil enregistré`)}}catch(t){!r.aborted&&e===J&&(document.getElementById(`dash-granular-container`).innerHTML=`<div class="empty-state">${n.escapeHtml(t.message)}</div>`,a.error(t.message))}},ce=async()=>{let e=++Y;try{let t=new URLSearchParams;b(t),T(t),S&&t.set(`servers`,S);let[i,a]=await Promise.all([l.getJSON(`/api/stats/network?${t.toString()}`),l.getJSON(`/api/geo-stats`).catch(e=>({locations:[],error:e.message}))]);if(r.aborted||e!==Y)return;let s=document.getElementById(`dash-network-container`);if(!s)return;let c=i.stats||{totalSessions:0,directPlaySessions:0,transcodeSessions:0,directStreamSessions:0,transcodePercent:0,totalTranscodeDuration:0},u=i.coupableTable||[];s.innerHTML=`
            <!-- 4 Network KPI Cards -->
            <div class="stat-grid-4">
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${o.t(`network.totalSessions`)||`Sessions totales`}</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                </div>
                <div class="stat-num metric-glow-cyan">${c.totalSessions}</div>
                <div class="stat-desc text-emerald" style="font-weight:600;">${c.directPlaySessions} DirectPlay</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${o.t(`network.transcodeRate`)||`Taux de transcodage`}</span>
                  <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                </div>
                <div class="stat-num metric-glow-amber">${c.transcodePercent}%</div>
                <div class="stat-desc">${c.transcodeSessions} lectures transcodées</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">DirectStream (Remux)</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="15" x="2" y="3" rx="2"/></svg>
                </div>
                <div class="stat-num metric-glow-blue">${c.directStreamSessions}</div>
                <div class="stat-desc">${o.t(`network.remuxed`)||`Conteneur modifié sans ré-encodage vidéo`}</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${o.t(`network.transcodeDuration`)||`Durée de transcodage`}</span>
                  <svg class="nav-icon text-rose" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div class="stat-num metric-glow-rose">${Math.round((c.totalTranscodeDuration||0)/3600)}h</div>
                <div class="stat-desc">${o.t(`network.transcodeDurationDesc`)||`Temps machine cumulé`}</div>
              </div>
            </div>

            <!-- 2 Network Charts -->
            <div class="dash-grid-2">
              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">${o.t(`network.directVsTranscodeByHour`)||`DirectPlay vs Transcode par heure`}</div>
                    <div class="card-subtitle">${o.t(`network.directVsTranscodeByHourDesc`)||`Répartition temporelle des méthodes de flux (UTC)`}</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:280px;">
                  <canvas id="chart-net-transcode-hourly"></canvas>
                </div>
              </div>

              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">${o.t(`network.transcodeByClient`)||`Transcodage par client`}</div>
                    <div class="card-subtitle">${o.t(`network.transcodeByClientDesc`)||`Pourcentage de sessions transcodées par application`}</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:280px;">
                  <canvas id="chart-net-client-transcode"></canvas>
                </div>
              </div>
            </div>

            <!-- Tableau des Coupables -->
            <div class="card">
              <div class="card-header">
                <div class="card-title-group">
                  <div class="card-title">${o.t(`network.mostTranscoded`)||`🚨 Tableau des Coupables (Titres les plus transcodés)`}</div>
                  <div class="card-subtitle">${o.t(`network.mostTranscodedDesc`)||`Fichiers consommant le plus de ressources CPU/GPU avec motif identifié`}</div>
                </div>
              </div>
              <div style="padding:1rem; overflow-x:auto;">
                ${u.length>0?`
                  <table class="table-modern">
                    <thead>
                      <tr>
                        <th>${o.t(`network.colMedia`)||`Média`}</th>
                        <th>${o.t(`network.colResolution`)||`Résolution`}</th>
                        <th style="text-align:center;">${o.t(`network.colSessions`)||`Sessions`}</th>
                        <th style="text-align:center;">${o.t(`network.colDuration`)||`Durée`}</th>
                        <th>${o.t(`network.colCause`)||`Cause principale`}</th>
                        <th>${o.t(`network.colClient`)||`Client principal`}</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${u.map((e,t)=>`
                        <tr>
                          <td>
                            <div style="display:flex; align-items:center; gap:0.5rem;">
                              <span style="font-size:0.75rem; color:var(--muted-foreground);">${t+1}.</span>
                              <span style="font-weight:600;" title="${n.escapeHtml(e.fullTitle||e.title)}">${n.escapeHtml(e.title)}</span>
                            </div>
                          </td>
                          <td>
                            <span class="badge ${e.resolution===`4K`?`badge-warning`:`badge-info`}" style="font-size:0.7rem;">${n.escapeHtml(e.resolution||o.t(`common.unknown`))}</span>
                          </td>
                          <td style="text-align:center; font-weight:700;" class="metric-glow-amber">${e.count}</td>
                          <td style="text-align:center; font-size:0.8rem;">${e.durationMin} min</td>
                          <td>
                            <span class="badge badge-danger" style="font-size:0.72rem;">${n.escapeHtml(e.mainReason||`Transcode`)}</span>
                          </td>
                          <td>
                            <span style="font-size:0.8rem; color:var(--muted-foreground);">${n.escapeHtml(e.topClient||`Inconnu`)}</span>
                          </td>
                        </tr>
                      `).join(``)}
                    </tbody>
                  </table>
                `:`<div class="text-muted-foreground text-sm" style="padding:1.5rem; text-align:center;">Aucune session transcodée enregistrée sur cette période. Bravo pour votre bande passante !</div>`}
              </div>
            </div>

            <!-- Geographic Distribution -->
            <div class="card">
              <div class="card-header">
                <div class="card-title-group">
                  <div class="card-title">🌍 Origine géographique des connexions</div>
                  <div class="card-subtitle">Localisation des adresses IP clientes enregistrées, toutes périodes et tous serveurs</div>
                </div>
              </div>
              <div style="padding:1rem;">
                <div class="ranking-list">
                  ${a.error?`<p role="status">${n.escapeHtml(a.error)}</p>`:``}
                  ${a.message?`<p role="status">${n.escapeHtml(a.message)}</p>`:``}
                  ${(a.locations||[]).slice(0,10).map((e,t)=>`
                    <div class="ranking-item">
                      <span class="ranking-badge">🌍</span>
                      <span class="ranking-name">${n.escapeHtml(e.kind===`local`?`Réseau local`:e.kind===`missing`?`Localisation non renseignée`:[e.city,e.country].filter(Boolean).join(`, `))}</span>
                      <span class="ranking-value">${e.sessions||0} sessions</span>
                    </div>
                  `).join(``)||`<div class="text-muted-foreground text-sm">Aucune donnée géographique enregistrée.</div>`}
                </div>
              </div>
            </div>
          `;let d=i.hourlyData||[];if(d.length>0){let e=d.map(e=>e.hour||e.time||e.Hour||e.Time),t=[{label:`DirectPlay`,data:d.map(e=>e.DirectPlay==null?e.directPlay||0:e.DirectPlay),color:`#10b981`},{label:`Transcode`,data:d.map(e=>e.Transcode==null?e.transcode||0:e.Transcode),color:`#f59e0b`},{label:`DirectStream`,data:d.map(e=>e.DirectStream==null?e.directStream||0:e.DirectStream),color:`#3b82f6`}];f.renderStackedArea(`chart-net-transcode-hourly`,e,t)}else f.showEmpty(`chart-net-transcode-hourly`,`Aucune donnée horaire réseau`);if(i.clientTranscodeData&&i.clientTranscodeData.length>0){let e=i.clientTranscodeData.map(e=>e.name),t=i.clientTranscodeData.map(e=>e.transcodePercent||0);f.renderHorizontalBar(`chart-net-client-transcode`,e,t,{backgroundColors:`#f97316`,label:`% Transcodé`})}else f.showEmpty(`chart-net-client-transcode`,`Aucun transcodage client`)}catch(t){if(!r.aborted&&e===Y){let e=document.getElementById(`dash-network-container`);e&&(e.innerHTML=`<div class="empty-state">${n.escapeHtml(t.message)}</div>`),a.error(t.message)}}};document.querySelectorAll(`#dashboard-tablist .dash-tab-btn`).forEach(e=>{e.addEventListener(`click`,()=>{document.querySelectorAll(`#dashboard-tablist .dash-tab-btn`).forEach(e=>e.classList.remove(`active`)),e.classList.add(`active`),M=e.getAttribute(`data-tab`),document.getElementById(`tab-content-overview`)?.classList.toggle(`hidden`,M!==`overview`),document.getElementById(`tab-content-analytics`)?.classList.toggle(`hidden`,M!==`analytics`),document.getElementById(`tab-content-network`)?.classList.toggle(`hidden`,M!==`network`),M===`overview`?ie():M===`analytics`?se():M===`network`&&ce()})});let $=async()=>{document.getElementById(`dash-time-select`).value=_;let e=new URLSearchParams;b(e),T(e),S&&e.set(`servers`,S),await window.JellyTrackUI.history(window.location.pathname+`?`+e.toString(),!0),re(),M===`analytics`&&se(),M===`network`&&ce()};document.getElementById(`dash-time-select`).addEventListener(`change`,e=>{let t=e.target.value;e.target.value=_,document.querySelector(`#dash-time-range [data-range="${t}"]`)?.click()}),document.querySelectorAll(`#dash-time-range .time-pill-btn`).forEach(e=>{e.addEventListener(`click`,()=>{e.dataset.range===`custom`?d.showAction({title:o.t(`timeRange.custom`)||`Dates personnalisées`,bodyHtml:`<div class="form-group"><label for="dash-custom-from">${o.t(`common.from`)||`Du`}</label><input id="dash-custom-from" class="form-input" type="date" value="${n.escapeHtml(v)}"></div><div class="form-group"><label for="dash-custom-to">${o.t(`common.to`)||`Au`}</label><input id="dash-custom-to" class="form-input" type="date" value="${n.escapeHtml(y)}"></div>`,confirmText:o.t(`common.apply`)||`Appliquer`,onConfirm:()=>{let t=document.getElementById(`dash-custom-from`).value,n=document.getElementById(`dash-custom-to`).value;if(!t||!n||t>n)return a.error(`Choisissez une date de début et une date de fin dans l’ordre.`),!1;v=t,y=n,_=`custom`,document.querySelectorAll(`#dash-time-range .time-pill-btn`).forEach(t=>t.classList.toggle(`active`,t===e)),$()}}):(document.querySelectorAll(`#dash-time-range .time-pill-btn`).forEach(e=>e.classList.remove(`active`)),e.classList.add(`active`),_=e.getAttribute(`data-range`)||`7d`,$())})}),document.querySelectorAll(`#dash-media-filter .header-filter-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=E(e.dataset.type),n=[`Movie`,`Series`,`MusicAlbum`,`Book`];C=t?x||C.length===0?n.filter(e=>e!==t):C.includes(t)?C.filter(e=>e!==t):[...C,t]:[],C.length>=n.length&&(C=[]),x=``,D(),$()})});let le=document.getElementById(`btn-refresh-dashboard`);le&&le.addEventListener(`click`,()=>{H(),U(),G(),$(),a.info(`Données rafraîchies`)}),document.querySelectorAll(`#dash-time-range .time-pill-btn`).forEach(e=>e.classList.toggle(`active`,e.dataset.range===_)),document.getElementById(`dash-time-select`).value=_,D(),O(),await Promise.all([te(),H(),U(),G(),re()]),!r.aborted&&W()},async login(){window.JellyTrackUI.login(document.getElementById(`app-main`),{API:l,Auth:u,I18n:o,Theme:s,State:t,Toast:a,Router:h,StreamsPoller:p,icon:e=>window.JellyTrackNavigation.icon(e)})},async setup(){let e=document.getElementById(`app-main`);e.innerHTML=`
        <div class="setup-container">
          <div class="setup-card">
            <div class="setup-card-header">
              <div class="setup-icon-box">🔌</div>
              <div>
                <h1 style="font-size: 1.4rem; font-weight: 800; margin: 0;">Configuration Initiale</h1>
                <p style="font-size: 0.84rem; color: var(--muted-foreground); margin: 0.3rem 0 0;">Connectez votre serveur Jellyfin pour démarrer.</p>
              </div>
            </div>

            <div class="setup-card-body">
              <div id="setup-error" style="display:none; padding: 0.65rem 0.85rem; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 0.5rem; font-size: 0.82rem; color: #f87171;"></div>

              <form id="form-setup" style="display: flex; flex-direction: column; gap: 1rem;">
                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Nom du serveur</label>
                  <input type="text" class="form-input" id="setup-name" required value="Serveur Principal">
                </div>

                <div class="form-group" style="margin: 0;">
                  <label class="form-label">URL Jellyfin</label>
                  <input type="url" class="form-input" id="setup-url" required placeholder="http://192.168.1.50:8096">
                  <div style="font-size: 0.74rem; color: var(--muted-foreground); margin-top: 0.3rem;">URL complète avec le port (ex: 8096)</div>
                </div>

                <div class="form-group" style="margin: 0;">
                  <label class="form-label">Clé API Jellyfin</label>
                  <input type="text" class="form-input" id="setup-api-key" required placeholder="Jellyfin > Tableau de bord > Clés API">
                  <div style="font-size: 0.74rem; color: var(--muted-foreground); margin-top: 0.3rem;">Génération : <b>Tableau de bord Jellyfin → Avancé → Clés API</b></div>
                </div>
              </form>
            </div>

            <div class="setup-card-footer">
              <button type="button" class="btn btn-primary" id="btn-setup-submit" style="display: flex; align-items: center; gap: 0.4rem;">
                <span id="setup-btn-text">Enregistrer et Synchroniser</span>
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        </div>
      `,document.getElementById(`btn-setup-submit`).addEventListener(`click`,async()=>{let e=document.getElementById(`setup-name`).value.trim(),t=document.getElementById(`setup-url`).value.trim(),n=document.getElementById(`setup-api-key`).value.trim(),r=document.getElementById(`setup-error`),i=document.getElementById(`btn-setup-submit`),o=document.getElementById(`setup-btn-text`);if(!e||!t||!n)r.textContent=`Tous les champs sont obligatoires.`,r.style.display=`block`;else{i.disabled=!0,o&&(o.textContent=`Connexion en cours…`),r.style.display=`none`;try{await l.postJSON(`/api/settings/jellyfin-servers`,{name:e,url:t,apiKey:n,isActive:!0}),a.success(`Serveur Jellyfin configuré avec succès !`),await l.postJSON(`/api/sync`,{recentOnly:!1}),h.navigate(`/`)}catch(e){r.textContent=e.message,r.style.display=`block`,i.disabled=!1,o&&(o.textContent=`Enregistrer et Synchroniser`)}}})},async about(){window.JellyTrackAbout.render(document.getElementById(`app-main`),{i18n:o,escape:n.escapeHtml,locale:t.locale,version:t.navigation.appVersion})},async newsletter(){let e=document.getElementById(`app-main`),r=t.pageController.signal,i=(e,n)=>t.locale.startsWith(`fr`)?e:n,a=(e,t)=>o.t(`newsletter.${e}`)||t,s=n.escapeHtml,c=e=>window.JellyTrackNavigation.icon(e===`play`?`playCircle`:e);e.innerHTML=`<div class="newsletter-recovery">${m.mediaNav(``)}<div class="newsletter-loading skeleton" style="height:500px"></div></div>`;try{let u=await l.getJSON(`/api/newsletter`);if(r.aborted)return;let f=u.topMedia||[],p=u.topUsers||[],h=p[0],g=Math.round(Number(u.totalHours)||0),_=e=>new Date(e).toLocaleDateString(t.locale,{day:`2-digit`,month:`short`,year:`numeric`}),v=u.startDate&&u.endDate?`${_(u.startDate)} – ${_(u.endDate)}`:u.dateRange||``,y=e=>{let t=new URLSearchParams({itemId:e.jellyfinMediaId||e.jellyfinId||``,type:`Primary`,maxWidth:`160`,fallback:`none`});return e.serverId&&t.set(`serverId`,e.serverId),e.jellyfinMediaId||e.jellyfinId?`<img src="/api/jellyfin/image?${s(t.toString())}" alt="${s(e.title)}" loading="lazy" data-hide-on-error>`:``};e.innerHTML=`
          <div class="newsletter-recovery">
            ${m.mediaNav(``)}
            <article class="rewind-card">
              <header class="rewind-hero"><span class="rewind-sparkles" aria-hidden="true">${c(`sparkles`)}</span><h1>JellyTrack Rewind</h1><p>${a(`monthlyRecap`,i(`Votre récapitulatif des 30 derniers jours`,`Your recap of the last 30 days`))}</p><time>${s(v)}</time></header>
              <div class="rewind-content">
                <div class="rewind-metrics">
                  <div class="rewind-metric"><span aria-hidden="true">${c(`clock`)}</span><strong class="metric-glow-emerald">${n.formatNumber(g)}h</strong><p>${a(`hoursWatched`,i(`Visionné`,`Watched`))}</p></div>
                  <div class="rewind-metric"><span aria-hidden="true">${c(`play`)}</span><strong class="metric-glow-blue">${n.formatNumber(u.totalPlays||0)}</strong><p>${a(`totalPlays`,i(`Lectures totales`,`Total plays`))}</p></div>
                </div>
                <section class="rewind-podium"><h2>${c(`trophy`)} ${a(`videoPodium`,i(`Le Podium Vidéo`,`The Video Podium`))}</h2>
                  ${f.slice(0,3).map((e,t)=>`<div class="rewind-podium-item"><strong class="rewind-rank">${t+1}</strong><div class="rewind-poster">${y(e)}</div><div class="rewind-media-title"><h3>${s(e.title)}</h3><p>${s(o.t(`common.${e.type}`)||e.type)}</p></div><strong class="metric-glow-emerald">${Number(e.hours||0).toFixed(1)}h</strong></div>`).join(``)||`<p class="text-muted-foreground">${o.t(`common.noData`)}</p>`}
                </section>
                ${h?`<section class="rewind-viewer"><span class="rewind-viewer-icon" aria-hidden="true">${c(`users`)}</span><div><p>${a(`bestViewer`,i(`Meilleur spectateur`,`Best viewer`))}</p><h2>${s(h.username)}</h2></div><div class="rewind-viewer-hours"><strong class="metric-glow-violet">${Math.round(h.hours||0)}h</strong><p>${a(`hoursWatched`,i(`Visionné`,`Watched`))}</p></div></section>`:``}
              </div>
            </article>
            <div class="rewind-actions"><button class="btn btn-primary" id="btn-download-rewind">${c(`download`)} ${i(`Télécharger l'infographie (PNG)`,`Download infographic (PNG)`)}</button><button class="btn btn-secondary" id="btn-post-discord">${c(`send`)} ${i(`Diffuser sur Discord`,`Post to Discord`)}</button></div>
            <p id="rewind-result" role="status" aria-live="polite"></p>
            ${f.length>3||p.length>1?`<details class="rewind-complements"><summary>${i(`Classements complémentaires`,`Additional rankings`)}</summary><div class="dash-grid-2"><section><h3>${i(`Autres médias du mois`,`More media this month`)}</h3>${f.slice(3).map(e=>`<div class="newsletter-top-item"><span>${s(e.title)}</span><span>${Number(e.hours||0).toFixed(1)}h · ${e.plays||0} ${o.t(`dashboard.readings`)}</span></div>`).join(``)||`<p>${o.t(`common.noData`)}</p>`}</section><section><h3>${i(`Autres spectateurs`,`More viewers`)}</h3>${p.slice(1).map(e=>`<div class="newsletter-top-item"><span>${s(e.username)}</span><span>${Number(e.hours||0).toFixed(1)}h</span></div>`).join(``)||`<p>${o.t(`common.noData`)}</p>`}</section></div></details>`:``}
          </div>`;let b=(e,t=!1)=>{let n=document.getElementById(`rewind-result`);n&&(n.textContent=e,n.className=t?`text-danger`:`text-emerald`)};document.getElementById(`btn-download-rewind`).addEventListener(`click`,()=>{let e=document.getElementById(`btn-download-rewind`);e.disabled=!0;try{let e=document.createElement(`canvas`);e.width=1080,e.height=1350;let t=e.getContext(`2d`);if(!t)throw Error(i(`Impossible de générer l'infographie.`,`Cannot generate the infographic.`));let n=t.createLinearGradient(0,0,1080,1350);n.addColorStop(0,`#0f172a`),n.addColorStop(.4,`#1e1b4b`),n.addColorStop(1,`#090d16`),t.fillStyle=n,t.fillRect(0,0,1080,1350);let r=t.createRadialGradient(540,200,10,540,200,450);r.addColorStop(0,`rgba(170,92,195,.4)`),r.addColorStop(1,`transparent`),t.fillStyle=r,t.fillRect(0,0,1080,600);let o=(e,n,r,i,a,o=`left`,s=!1,c)=>{t.fillStyle=a,t.font=`${s?`bold `:``}${i}px system-ui, sans-serif`,t.textAlign=o;let l=String(e);c?t.fillText(l,n,r,c):t.fillText(l,n,r)},s=(e,n,r,i,a=`rgba(30,41,59,.75)`)=>{t.fillStyle=a,t.strokeStyle=`rgba(148,163,184,.2)`,t.lineWidth=2,t.beginPath(),t.roundRect(e,n,r,i,20),t.fill(),t.stroke()};o(`JellyTrack Rewind`,540,150,56,`#fff`,`center`,!0),o(a(`monthlyRecap`,i(`Récapitulatif des 30 derniers jours`,`Last 30 days recap`)),540,200,28,`#cbd5e1`,`center`,!1,960),o(v,540,240,20,`#94a3b8`,`center`),s(80,310,440,160),s(560,310,440,160),o(`${g}h`,300,390,52,`#34d399`,`center`,!0),o(a(`hoursWatched`,`Watched`),300,435,22,`#94a3b8`,`center`),o(u.totalPlays||0,780,390,52,`#60a5fa`,`center`,!0),o(a(`totalPlays`,`Total plays`),780,435,22,`#94a3b8`,`center`),o(a(`videoPodium`,`Media Podium`),80,540,36,`#fff`,`left`,!0),f.slice(0,3).forEach((e,t)=>{let n=580+t*120;s(80,n,920,100),o(t+1,130,n+65,42,[`#facc15`,`#cbd5e1`,`#d97706`][t],`center`,!0),o(e.title,190,n+47,26,`#f8fafc`,`left`,!0,650),o(e.type,190,n+80,20,`#94a3b8`),o(`${Number(e.hours||0).toFixed(1)}h`,960,n+60,28,`#34d399`,`right`,!0)}),h&&(s(80,980,920,140,`rgba(79,70,229,.3)`),o(a(`bestViewer`,`Best viewer`),120,1030,22,`#a5b4fc`),o(h.username,120,1075,36,`#fff`,`left`,!0,650),o(`${Math.round(h.hours||0)}h`,960,1055,44,`#c084fc`,`right`,!0)),o(i(`Généré avec JellyTrack pour Jellyfin`,`Generated with JellyTrack for Jellyfin`),540,1260,18,`#64748b`,`center`);let c=document.createElement(`a`);c.download=`jellytrack_rewind_${new Date().toISOString().slice(0,10)}.png`,c.href=e.toDataURL(`image/png`),c.click(),b(i(`Infographie téléchargée.`,`Infographic downloaded.`))}catch(e){b(e.message,!0)}finally{e.disabled=!1}}),document.getElementById(`btn-post-discord`).addEventListener(`click`,()=>{d.showAction({title:i(`Diffuser sur Discord`,`Post to Discord`),bodyHtml:`<p>${i(`Envoyer ce récapitulatif sur le canal Discord configuré ?`,`Send this recap to the configured Discord channel?`)}</p>`,confirmText:i(`Diffuser`,`Post`),onConfirm:async()=>{let e=document.getElementById(`btn-post-discord`);if(e?.disabled)return!1;e&&(e.disabled=!0);try{let e=await l.postJSON(`/api/newsletter/discord-post`,{});b(e.message||i(`Bilan diffusé sur Discord !`,`Recap posted to Discord!`))}catch(e){return b(e.message,!0),!1}finally{e&&!r.aborted&&(e.disabled=!1)}}})})}catch(t){r.aborted||(e.innerHTML=`<div class="empty-state" role="alert">${s(t.message)}</div>`)}},async users(){await window.UsersUI.render(document.getElementById(`app-main`),{API:l,State:t,Utils:n,I18n:o,Router:h,Toast:a})},async userDetail(e){await window.ProfileUI.render(document.getElementById(`app-main`),e,{API:l,State:t,Utils:n,I18n:o,Router:h,Toast:a,Modal:d})},async wrapped(e){let r=document.getElementById(`app-main`),i=t.pageController.signal,s=n.escapeHtml,c=(e,n)=>t.locale.startsWith(`fr`)?e:n,u=(e,t={})=>o.t(`wrapped.${e}`,t)||e,d=new URLSearchParams(window.location.search),f=Number(d.get(`year`))||new Date().getFullYear(),p=[`Movies`,`TV`,`Music`,`Books`].includes(d.get(`type`))?d.get(`type`):`general`,m=0,g=!1,_,v=()=>{clearTimeout(_),document.body.classList.remove(`wrapped-active`)};t.pageCleanups.push(v),r.innerHTML=`<div class="skeleton" style="height:400px;max-width:680px;margin:2rem auto"></div>`;try{let v=new URLSearchParams({year:String(f)});p!==`general`&&v.set(`type`,p);let y=e===`me`&&d.get(`combined`)===`1`?`/api/me/wrapped`:`/api/wrapped/${encodeURIComponent(e)}`,b=await l.getJSON(`${y}?${v}`);if(i.aborted)return;document.body.classList.add(`wrapped-active`);let x=Number(b.totalSeconds)||0,S=Math.round(x/3600),C=`<p class="wrapped-no-data">${u(`noData`)}</p>`,w=u([`sunday`,`monday`,`tuesday`,`wednesday`,`thursday`,`friday`,`saturday`][b.peakDay??0]),T=b.totalPlays>0?`${b.peakHour??0}h`:`N/A`,E=b.topGenres||[],D=E[0]?.name||u(`unknown`),O=e=>{let t=Number(e)||0;return t>=3600?`${Math.floor(t/3600)}h ${Math.round(t%3600/60)}m`:`${Math.round(t/60)}m`},k=e=>e?.length?`<ol class="wrapped-ranked">${e.slice(0,5).map((t,n)=>`<li><i class="wrapped-rank-bar" aria-hidden="true" style="width:${Math.round(Number(t.seconds??Number(t.hours||0)*3600)/Math.max(1,Number(e[0].seconds??Number(e[0].hours||0)*3600))*100)}%"></i><b>${n+1}</b><span>${s(t.title)}${b.multiServer&&t.serverId?` — ${s((b.accounts||[]).find(e=>e.serverId===t.serverId)?.serverName||t.serverId)}`:``}</span><small>${O(t.seconds??Number(t.hours||0)*3600)}</small></li>`).join(``)}</ol>`:C,A=[],j=(e,t,n,r,i)=>A.push({title:e,subtitle:t,icon:n,content:r,theme:i});j(`JellyTrack Wrapped ${b.year||f}`,u(`introSubtitle`,{username:b.username}),`play`,`<p>${u(`introContent`)}</p><button class="btn btn-secondary wrapped-customize" data-wrapped-config>${window.JellyTrackNavigation.icon(`filter`)} ${u(`customize`)}</button>`,`purple`),j(u(`totalTimeTitle`),u(`totalTimeSubtitle`),`clock`,`<strong class="wrapped-number">${n.formatNumber(S)}</strong><p>${u(`hours`)} ${u(`streaming`)}</p><p>${u(`acrossSessions`,{count:b.totalPlays||0})}</p>`,`emerald`),S>=24&&j(u(`totalTimeDays`,{days:Math.floor(S/24),hours:S%24}),u(`totalTimeDaysDesc`),`date`,`<div class="wrapped-days-clock" aria-hidden="true"><i></i><span>${window.JellyTrackNavigation.icon(`clock`)}</span></div>`,`cyan`);let M=b.monthlyHours||[],N=Math.max(0,...M.map(e=>Number(e.hours)||0));j(u(`monthlyTitle`),u(`monthlySubtitle`),`chart`,M.length?`<div class="wrapped-months">${M.map(e=>`<div><span style="height:${N>0?Math.max(0,Number(e.hours)/N*100):0}%"><small>${Number(e.hours||0).toFixed(1)}h</small></span><b>${u(e.name)}</b></div>`).join(``)}</div>${N>0?`<p>${u(`bestMonth`,{name:u(M.find(e=>Number(e.hours)===N)?.name||`jan`),hours:N.toFixed(1)})}</p>`:C}`:C,`fuchsia`),j(u(`peakTitle`),u(`peakSubtitle`),`trending`,`<strong class="wrapped-number">${T}</strong><p>${b.totalPlays>0?s(u(`peakContent`,{bold:``,hour:T,count:b.peakHourSessions??b.hourCounts?.[b.peakHour]??0})):u(`noData`)}</p>`,`orange`),b.topDevice&&b.topDevice!==`N/A`&&j(u(`topDevice`),u(`topDeviceDesc`,{device:b.topDevice}),`headphones`,`<strong class="wrapped-device wrapped-device-card">${s(b.topDevice)}</strong>`,`amber`),j(u(`genresTitle`),u(`genresSubtitle`),`star`,E.length?`<p>${u(`genreFirst`)}</p><strong class="wrapped-device">${s(D)}</strong><ol class="wrapped-genres">${E.map(e=>`<li><span>${s(e.name)}</span><div class="wrapped-genre-track"><i style="width:${Math.round(Number(e.count||0)/Math.max(1,Number(E[0].count||0))*100)}%"></i></div><small>${e.count||0}</small></li>`).join(``)}</ol>`:C,`rose`),j(u(`dayTitle`),u(`daySubtitle`),`date`,b.totalPlays>0?`<strong class="wrapped-device">${w}</strong><p>${u(`dayContent`)}</p>`:C,`amber`),j(u(`pantheonTitle`),u(`pantheonSubtitle`),`star`,k(b.topMedia||b.topMovies),`indigo`),b.topSeries?.length&&j(u(`bingeTitle`),u(`bingeSubtitle`),`tv`,k(b.topSeries),`blue`),(b.topTracks?.length||b.topMusic?.length)&&j(u(`tracksTitle`),u(`tracksSubtitle`),`music`,k(b.topTracks||b.topMusic),`emerald`),b.topArtists?.length&&j(u(`artistsTitle`),u(`artistsSubtitle`),`headphones`,k(b.topArtists),`violet`),b.topAlbums?.length&&j(u(`albumsTitle`),u(`albumsSubtitle`),`star`,k(b.topAlbums),`rose`),[[`movies`,`moviesTitle`,`moviesSubtitle`,`moviesLabel`,`film`,`red`],[`series`,`episodesTitle`,`episodesSubtitle`,`episodesLabel`,`tv`,`blue`],[`music`,`musicTitle`,`musicSubtitle`,`musicLabel`,`music`,`green`],[`books`,`booksTitle`,`booksSubtitle`,`booksLabel`,`book`,`yellow`]].forEach(([e,t,n,r,i,a])=>{let o=b.categories?.[e];o?.totalSeconds>0&&j(u(t),u(n),i,`<strong class="wrapped-number">${Math.round(o.totalSeconds/3600)}</strong><p>${u(`hours`)} ${u(`ofLabel`,{label:u(r)})}</p>${k(o.topMedia)}`,a)});let P=[[`movies`,`🎬`],[`series`,`📺`],[`music`,`🎵`],[`books`,`📚`]].map(([e,t])=>({glyph:t,hours:Math.round(Number(b.categories?.[e]?.totalSeconds||0)/3600)})).filter(e=>e.hours>0);j(u(`shareTitle`),u(`shareSubtitle`),`share`,`<div class="wrapped-share-card"><p class="wrapped-share-year">${s(u(`introTitle`,{year:b.year||f}))}</p><h3>${s(b.username)}</h3><p class="wrapped-share-hours">${S}h ${s(u(`streaming`))}</p><p>${s(u(`genreLabel`,{genre:D}))}</p><p>${s(u(`peakLabel`,{hour:T}))}</p><p>${s(u(`favDayLabel`,{day:w}))}</p>${P.length?`<div class="wrapped-share-categories">${P.map(e=>`<span>${e.glyph} ${e.hours}h</span>`).join(``)}</div>`:``}</div><p class="wrapped-capture-hint">${s(u(`captureScreen`))}</p><button class="btn btn-primary" id="btn-share-wrapped">${c(`Copier le résumé`,`Copy summary`)}</button>`,`share`);let F=e=>{let t=Math.max(0,Math.min(A.length-1,m+e));t!==m&&(m=t,R())},I=()=>{clearTimeout(_),!i.aborted&&!g&&!document.hidden&&m<A.length-1&&(_=setTimeout(()=>F(1),8e3))},L=()=>{g=!0,clearTimeout(_);let e=document.createElement(`div`);e.className=`wrapped-config`,e.setAttribute(`role`,`dialog`),e.setAttribute(`aria-modal`,`true`),e.setAttribute(`aria-label`,u(`customize`));let t=b.availableYears?.length?b.availableYears:[b.year||f];e.innerHTML=`<button class="btn btn-secondary wrapped-config-close" id="wrapped-config-close" aria-label="${o.t(`common.close`)||c(`Fermer`,`Close`)}">${window.JellyTrackNavigation.icon(`close`)}</button><div><h2>${u(`customize`)}</h2><label for="wrapped-year">${u(`year`)}</label><select class="form-input" id="wrapped-year">${t.map(e=>`<option value="${e}" ${e===(b.year||f)?`selected`:``}>${e}</option>`).join(``)}</select><fieldset><legend>${u(`type`)}</legend><div class="wrapped-type-buttons">${[[`general`,`all`],[`Movies`,`moviesLabel`],[`Music`,`musicLabel`],[`TV`,`tv`],[`Books`,`booksLabel`]].map(([e,t])=>`<button class="btn ${p===e?`btn-primary`:`btn-secondary`}" data-wrapped-type="${e}" aria-pressed="${p===e}">${u(t)}</button>`).join(``)}</div></fieldset></div>`,r.querySelector(`.wrapped-recovery`).appendChild(e);let n=()=>{g=!1,e.remove(),r.querySelector(`[data-wrapped-config]`)?.focus(),I()};e.querySelector(`#wrapped-config-close`).addEventListener(`click`,n);let i=e=>{let t=new URLSearchParams(window.location.search);for(let[n,r]of Object.entries(e))r===`general`?t.delete(n):t.set(n,r);h.navigate(`${window.location.pathname}?${t}`)};e.querySelector(`#wrapped-year`).addEventListener(`change`,e=>i({year:e.target.value})),e.querySelectorAll(`[data-wrapped-type]`).forEach(e=>e.addEventListener(`click`,()=>i({type:e.dataset.wrappedType}))),e.addEventListener(`keydown`,t=>{if(t.key===`Escape`&&(t.stopPropagation(),n()),t.key===`Tab`){let n=Array.from(e.querySelectorAll(`button, select`)),r=n[0],i=n.at(-1);t.shiftKey&&document.activeElement===r?(t.preventDefault(),i.focus()):!t.shiftKey&&document.activeElement===i&&(t.preventDefault(),r.focus())}}),e.querySelector(`#wrapped-config-close`).focus()},R=()=>{let e=A[m];r.innerHTML=`<section class="wrapped-recovery wrapped-theme-${e.theme}" aria-label="JellyTrack Wrapped ${b.year||f}">
            <div class="wrapped-progress" aria-label="${m+1} / ${A.length}">${A.map((e,t)=>`<span><i class="${t<m?`complete`:t===m?`playing`:``}"></i></span>`).join(``)}</div>
            <div class="wrapped-touch-zones"><button data-wrap-zone="-1" aria-label="${u(`back`)}"></button><button data-wrap-zone="1" aria-label="${u(`next`)}"></button></div>
            <article class="wrapped-slide" aria-live="polite"><span class="wrapped-icon" aria-hidden="true">${window.JellyTrackNavigation.icon(e.icon)}</span><h2>${s(e.subtitle)}</h2><h1>${s(e.title)}</h1><div class="wrapped-slide-content">${e.content}</div></article>
            <nav class="wrapped-controls"><button id="btn-wrap-prev" ${m===0?`disabled`:``}>${window.JellyTrackNavigation.icon(`chevronLeft`)} ${u(`back`)}</button><div><span>${b.year||f} • ${s(p.toUpperCase())}</span><small>${m+1} / ${A.length}</small><button id="wrapped-config-nav">${u(`customize`)}</button></div><button id="btn-wrap-next" ${m===A.length-1?`disabled`:``}>${u(`next`)} ${window.JellyTrackNavigation.icon(`chevronRight`)}</button></nav>
          </section>`,document.getElementById(`btn-wrap-prev`).addEventListener(`click`,()=>F(-1)),document.getElementById(`btn-wrap-next`).addEventListener(`click`,()=>F(1)),r.querySelectorAll(`[data-wrap-zone]`).forEach(e=>e.addEventListener(`click`,()=>F(Number(e.dataset.wrapZone)))),r.querySelectorAll(`[data-wrapped-config], #wrapped-config-nav`).forEach(e=>e.addEventListener(`click`,L)),document.getElementById(`btn-share-wrapped`)?.addEventListener(`click`,async()=>{let e=`JellyTrack Wrapped ${b.year||f} — ${b.username}\n${S} ${u(`hours`)} • ${b.totalPlays||0} ${o.t(`dashboard.readings`)}\n${D} • ${w}`;try{await navigator.clipboard.writeText(e),a.success(c(`Résumé copié !`,`Summary copied!`))}catch{a.error(c(`Impossible de copier le résumé.`,`Cannot copy the summary.`))}}),I()},z=t=>{g||t.target.closest(`input, select, textarea, button`)||(t.key===`ArrowRight`?(t.preventDefault(),F(1)):t.key===`ArrowLeft`?(t.preventDefault(),F(-1)):t.key===`Escape`&&h.navigate(`/users/${encodeURIComponent(e)}`))},B=()=>{r.querySelector(`.wrapped-recovery`)?.classList.toggle(`wrapped-paused`,document.hidden),I()};document.addEventListener(`keydown`,z),document.addEventListener(`visibilitychange`,B),t.pageCleanups.push(()=>{document.removeEventListener(`keydown`,z),document.removeEventListener(`visibilitychange`,B)}),R()}catch(e){v(),i.aborted||(r.innerHTML=`<div class="empty-state" role="alert">${s(e.message)}</div>`)}},mediaNav(e){return window.JellyTrackNavigation.mediaTabs(e)},async mediaPage(e=window.location.pathname){return window.MediaUI.render(document.getElementById(`app-main`),e,{API:l,State:t,Utils:n,I18n:o,Router:h,Toast:a,ChartHelper:f,Modal:d,mediaNav:e=>m.mediaNav(e)})},async settings(e=`overview`){let t=document.getElementById(`app-main`);e.startsWith(`scheduler`)||e.startsWith(`plugin/security`),t.innerHTML=`
        ${window.JellyTrackNavigation.settingsTabs(window.location.pathname)}
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              ${o.t(`nav.settings`)||`Paramètres`}
            </h1>
            <p class="page-subtitle">Administration, serveurs, médias, sauvegardes et planificateur.</p>
          </div>
        </div>

        <div id="settings-content" style="margin-top: 1.5rem;">
          <div class="skeleton" style="height: 250px;"></div>
        </div>
      `;let r=document.getElementById(`settings-content`);if(e===`overview`)try{let[e,t]=await Promise.all([l.getJSON(`/api/settings`),l.getJSON(`/api/settings/jellyfin-servers`).catch(()=>[])]);r.innerHTML=`
            <div class="card" style="padding: 1.75rem;">
              <div class="card-header" style="padding:0 0 1.25rem 0; border-bottom: 1px solid var(--border-subtle);">
                <div class="card-title-group">
                  <div class="card-title" style="display:flex;align-items:center;gap:0.5rem;">
                    <span>⚙️</span>
                    Configuration Globale JellyTrack
                  </div>
                  <div class="card-subtitle">État général du système et des fonctionnalités activées</div>
                </div>
              </div>
              <div class="stat-grid" style="margin-top: 1.5rem;">
                <div class="stat-card">
                  <div class="stat-card-header">
                    <span class="stat-card-label">Langue par défaut</span>
                    <div class="stat-icon stat-icon-indigo">🌍</div>
                  </div>
                  <div class="stat-card-value">${n.escapeHtml(e.defaultLocale||`fr`).toUpperCase()}</div>
                  <div class="stat-card-footer">Interface utilisateur</div>
                </div>
                <div class="stat-card">
                  <div class="stat-card-header">
                    <span class="stat-card-label">Serveurs connectés</span>
                    <div class="stat-icon stat-icon-cyan">🖥️</div>
                  </div>
                  <div class="stat-card-value">${(t.servers||[]).length}</div>
                  <div class="stat-card-footer"><a href="/settings/jellyfin" data-link>Gérer les instances →</a></div>
                </div>
                <div class="stat-card">
                  <div class="stat-card-header">
                    <span class="stat-card-label">Wrapped activé</span>
                    <div class="stat-icon stat-icon-purple">🎉</div>
                  </div>
                  <div class="stat-card-value" style="color: ${e.wrappedVisible===!1?`var(--muted-foreground)`:`var(--accent)`};">
                    ${e.wrappedVisible===!1?`Non`:`Oui`}
                  </div>
                  <div class="stat-card-footer">Rétrospective annuelle</div>
                </div>
                <div class="stat-card">
                  <div class="stat-card-header">
                    <span class="stat-card-label">Alertes Discord</span>
                    <div class="stat-icon stat-icon-amber">🔔</div>
                  </div>
                  <div class="stat-card-value" style="color: ${e.discordAlertsEnabled?`var(--accent)`:`var(--muted-foreground)`};">
                    ${e.discordAlertsEnabled?`Actives`:`Inactives`}
                  </div>
                  <div class="stat-card-footer"><a href="/settings/notifications" data-link>Webhooks Discord →</a></div>
                </div>
              </div>
            </div>
          `}catch(e){a.error(e.message)}else if(e===`network`)try{let e=await l.getJSON(`/api/settings/jellyfin-servers`).catch(()=>[]);if(!Array.isArray(e))throw Error(`(servers || []).map is not a function`);r.innerHTML=`
            <div class="card" style="margin-bottom: 1.5rem;">
              <div class="card-header">
                <div class="card-title">🌐 Connectivité Réseau & Points d’Accès</div>
              </div>
              <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
                État des points de terminaison réseau utilisés par JellyTrack pour contacter les serveurs Jellyfin.
              </p>
              <div style="display:flex; flex-direction:column; gap:0.75rem;">
                ${(e||[]).length===0?`<p class="empty-state">Aucun serveur configuré.</p>`:``}
                ${(e||[]).map(e=>`
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; background:var(--surface-soft); border-radius:var(--radius-md); flex-wrap:wrap; gap:0.5rem;">
                    <div>
                      <div style="font-weight:700;">${n.escapeHtml(e.name)}</div>
                      <div style="font-size:0.82rem; color:var(--muted-foreground); font-family:monospace;">${n.escapeHtml(e.url)}</div>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                      <span class="badge ${e.isActive?`badge-success`:`badge-secondary`}">${e.isActive?`Connecté`:`Inactif`}</span>
                      <a href="/settings/jellyfin" data-link class="btn btn-secondary btn-sm">Gérer</a>
                    </div>
                  </div>
                `).join(``)}
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <div class="card-title">🛡️ Détection des En-têtes Proxy Inverse</div>
              </div>
              <p style="font-size:0.85rem; color:var(--muted-foreground);">
                JellyTrack prend automatiquement en compte les en-têtes <code>X-Forwarded-For</code> et <code>X-Real-IP</code> provenant de Nginx, Caddy ou Traefik pour identifier l'emplacement géographique des flux.
              </p>
            </div>
          `}catch(e){a.error(e.message)}},adminNav(e){return`
        <nav class="admin-tabs-nav">
          <a href="/admin/health" data-link class="admin-tab-link ${e===`health`?`active`:``}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 11l6.92 3-3.96 4"/></svg>
            <span>${o.t(`nav.health`)||`Santé Système`}</span>
          </a>
          <a href="/admin/cleanup" data-link class="admin-tab-link ${e===`cleanup`?`active`:``}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span>${o.t(`nav.cleanup`)||`Nettoyage & Stockage`}</span>
          </a>
          <a href="/admin/log-diagnostics" data-link class="admin-tab-link ${e===`log-health`?`active`:``}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span>${o.t(`nav.logHealth`)||`Santé Logs & Moteur`}</span>
          </a>
          <a href="/admin/plugin-diagnostics" data-link class="admin-tab-link ${e===`plugin-health`?`active`:``}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>
            <span>${o.t(`nav.pluginHealth`)||`Santé Plugin`}</span>
          </a>
          <a href="/admin/server-compare" data-link class="admin-tab-link ${e===`server-compare`?`active`:``}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            <span>${o.t(`nav.serverCompare`)||`Comparaison Serveurs`}</span>
          </a>
        </nav>
      `},async health(e=`system`){let t=e===`plugin`?`plugin-health`:e===`logs`?`log-health`:`health`,r=document.getElementById(`app-main`);r.innerHTML=`
        ${m.adminNav(t)}
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              ${o.t(`nav.health`)||`Santé Système & Diagnostics`}
            </h1>
            <p class="page-subtitle">Surveillance de la base de données, des processus, du plugin et des alertes de sécurité.</p>
          </div>
        </div>

        <div id="health-content" style="margin-top: 1.5rem;">
          <div class="skeleton" style="height: 250px;"></div>
        </div>
      `;let i=document.getElementById(`health-content`);if(e===`system`)try{let[e,t]=await Promise.all([l.getJSON(`/api/admin/health`),l.getJSON(`/api/hardware`).catch(()=>({}))]);i.innerHTML=`
            <div class="stat-grid" style="margin-bottom: 1.5rem;">
              <div class="stat-card">
                <div class="stat-card-header">
                  <span class="stat-card-label">Base de données</span>
                  <div class="stat-icon stat-icon-green">🗄️</div>
                </div>
                <div class="stat-card-value" style="font-size:1.6rem; color: ${e.database===`healthy`?`var(--accent)`:`var(--destructive)`};">
                  ${n.escapeHtml(e.database===`healthy`?`Opérationnelle`:e.database||`OK`)}
                </div>
                <div class="stat-card-footer">Moteur : <b>${n.escapeHtml(e.driver||`SQLite`)}</b></div>
              </div>

              <div class="stat-card">
                <div class="stat-card-header">
                  <span class="stat-card-label">Sessions Orphelines</span>
                  <div class="stat-icon stat-icon-amber">🧹</div>
                </div>
                <div class="stat-card-value">${e.counts&&e.counts.openPlaybackOrphans||0}</div>
                <div class="stat-card-footer">Lectures sans fermeture propre</div>
              </div>

              <div class="stat-card">
                <div class="stat-card-header">
                  <span class="stat-card-label">Mémoire allouée</span>
                  <div class="stat-icon stat-icon-cyan">🧠</div>
                </div>
                <div class="stat-card-value">${t.memory?t.memory.allocMb.toFixed(1)+` MB`:`-`}</div>
                <div class="stat-card-footer">Cœurs CPU : <b>${t.cpu?t.cpu.cores:`-`}</b></div>
              </div>

              <div class="stat-card">
                <div class="stat-card-header">
                  <span class="stat-card-label">Goroutines actives</span>
                  <div class="stat-icon stat-icon-indigo">⚙️</div>
                </div>
                <div class="stat-card-value">${t.runtime&&t.runtime.goroutines||`-`}</div>
                <div class="stat-card-footer">Processus Go léger</div>
              </div>
            </div>

            <div class="card" style="padding: 1.75rem;">
              <div class="card-header" style="padding: 0 0 1rem 0; border-bottom: 1px solid var(--border-subtle);">
                <div class="card-title-group">
                  <div class="card-title">🧹 Maintenance Rapide de la Base</div>
                  <div class="card-subtitle">Purge immédiate des sessions en suspens sans événement d’arrêt</div>
                </div>
              </div>
              <p style="font-size:0.88rem; color:var(--muted-foreground); margin: 1rem 0 1.25rem 0; line-height: 1.5;">
                Si des coupures réseau empêchent la réception des événements "playback stopped", vous pouvez purger les sessions orphelines pour recalculer les statistiques proprement.
              </p>
              <button class="btn btn-secondary btn-sm" id="btn-fix-orphans" style="display:flex;align-items:center;gap:0.4rem;">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                Clôturer les sessions orphelines maintenant
              </button>
            </div>
          `,document.getElementById(`btn-fix-orphans`)?.addEventListener(`click`,async()=>{try{await l.postJSON(`/api/admin/integrity-cleanup`,{}),a.success(`Nettoyage des sessions orphelines terminé !`),window.location.pathname===`/admin/health`?window.JellyTrackNavigation.healthPage(e=>m.health(e),`logs`):m.health(`system`)}catch(e){a.error(e.message)}})}catch(e){a.error(e.message)}else if(e===`plugin`)try{let[e,t]=await Promise.all([l.getJSON(`/api/admin/security/overview`).catch(()=>({plugin:{}})),l.getJSON(`/api/admin/plugin/health`).catch(()=>({status:`ok`}))]),r=e.plugin||{};i.innerHTML=`
            <div style="display:flex; flex-direction:column; gap:1.5rem; max-width:820px;">
              <div class="card">
                <div class="card-header">
                  <div class="card-title">🔌 Sondes & Connectivité du Plugin Jellyfin</div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
                  <div>
                    <div style="font-size:1.15rem; font-weight:700;">${n.escapeHtml(r.serverName||`Serveur Jellyfin`)}</div>
                    <div style="font-size:0.85rem; color:var(--muted-foreground);">Dernier signal : ${r.lastSeen?n.formatDateTime(r.lastSeen):`Inconnu`}</div>
                  </div>
                  <span class="badge ${r.connected?`badge-success`:`badge-danger`}" style="font-size:0.9rem; padding:0.4rem 0.85rem;">
                    ${r.connected?`● Plugin En Ligne`:`○ Déconnecté`}
                  </span>
                </div>

                <div class="table-wrapper">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Sonde</th>
                        <th>Cible</th>
                        <th>État</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><b>Point d'ingestion des événements</b></td>
                        <td><code>POST /api/plugin/events</code></td>
                        <td><span class="badge badge-success">Actif</span></td>
                      </tr>
                      <tr>
                        <td><b>Webhook de diagnostic</b></td>
                        <td><code>GET /api/webhook/jellyfin</code></td>
                        <td><span class="badge badge-success">Prêt</span></td>
                      </tr>
                      <tr>
                        <td><b>Authentification par clé API</b></td>
                        <td>En-tête <code>X-Plugin-Key</code></td>
                        <td><span class="badge badge-primary">Activée</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style="display:flex; gap:0.75rem; margin-top:1.25rem;">
                  <button class="btn btn-secondary btn-sm" id="btn-refresh-plugin-health">🔄 Tester la sonde maintenant</button>
                  <a href="/settings/plugin" data-link class="btn btn-outline btn-sm">Gérer la clé API du plugin</a>
                </div>
              </div>
            </div>
          `,document.getElementById(`btn-refresh-plugin-health`)?.addEventListener(`click`,async()=>{try{await l.postJSON(`/api/admin/plugin/health`,{}),a.success(`Diagnostic plugin exécuté avec succès.`),m.health(`plugin`)}catch(e){a.error(e.message)}})}catch(e){a.error(e.message)}else if(e===`logs`)try{let[e,t]=await Promise.all([l.getJSON(`/api/admin/security/audit`).catch(()=>({anomalies:[]})),l.getJSON(`/api/logs/system`).catch(()=>({logs:[]}))]),r=t.logs||[],a=r.filter(e=>e.level===`ERROR`).length,o=r.filter(e=>e.level===`WARN`).length,s=e.anomalies||[];i.innerHTML=`
            <div style="display:flex; flex-direction:column; gap:1.5rem;">
              <div class="metric-grid">
                <div class="metric-card">
                  <div class="metric-header">
                    <span class="metric-label">Erreurs Système</span>
                    <div class="metric-icon-box">⚠️</div>
                  </div>
                  <div class="metric-value" style="color:${a>0?`var(--destructive)`:`var(--accent)`};">${a}</div>
                  <div class="metric-trend">Sur les derniers logs</div>
                </div>

                <div class="metric-card">
                  <div class="metric-header">
                    <span class="metric-label">Avertissements</span>
                    <div class="metric-icon-box">⚡</div>
                  </div>
                  <div class="metric-value">${o}</div>
                  <div class="metric-trend">Avertissements de synchronisation</div>
                </div>

                <div class="metric-card">
                  <div class="metric-header">
                    <span class="metric-label">Anomalies de Sécurité</span>
                    <div class="metric-icon-box">🛡️</div>
                  </div>
                  <div class="metric-value" style="color:${s.length>0?`var(--destructive)`:`var(--accent)`};">
                    ${s.length}
                  </div>
                  <div class="metric-trend">${s.length===0?`Aucun comportement suspect`:`Comportements détectés`}</div>
                </div>
              </div>

              <div class="card">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                  <div class="card-title">Derniers Événements d'Erreur & Alertes</div>
                  <a href="/logs" data-link class="btn btn-secondary btn-sm">Consulter tous les logs →</a>
                </div>

                <div class="table-wrapper" style="border:none;">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Niveau</th>
                        <th>Message</th>
                        <th>Horodatage</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${r.filter(e=>e.level===`ERROR`||e.level===`WARN`).slice(0,8).map(e=>`
                        <tr>
                          <td><span class="badge ${e.level===`ERROR`?`badge-danger`:`badge-warning`}">${n.escapeHtml(e.level)}</span></td>
                          <td style="font-family:monospace; font-size:0.82rem;">${n.escapeHtml(e.message||e.msg||``)}</td>
                          <td style="white-space:nowrap; font-size:0.78rem; color:var(--muted-foreground);">${n.formatDateTime(e.time||e.timestamp)}</td>
                        </tr>
                      `).join(``)||`<tr><td colspan="3" class="empty-state">Aucune erreur récente enregistrée. Système sain.</td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `}catch(e){a.error(e.message)}},async serverCompare(){let e=document.getElementById(`app-main`);e.innerHTML=`
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
              ${o.t(`nav.serverCompare`)||`Comparateur de Serveurs`}
            </h1>
            <p class="page-subtitle">Analyse comparative et statistiques croisées entre vos serveurs Jellyfin connectés.</p>
          </div>
        </div>

        <div class="card" style="padding: 0; margin-top: 1.5rem;">
          <div class="table-wrapper" style="border: none;">
            <table class="table">
              <thead>
                <tr>
                  <th>Serveur</th>
                  <th>Statut</th>
                  <th>Médias</th>
                  <th>Utilisateurs</th>
                  <th>Lectures</th>
                  <th>Flux Actifs</th>
                </tr>
              </thead>
              <tbody id="compare-table-body">
                <tr><td colspan="6" class="skeleton" style="height: 80px;"></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `;try{let e=await l.getJSON(`/api/admin/server-compare`),t=document.getElementById(`compare-table-body`);if(!e.servers||e.servers.length===0){t.innerHTML=`
            <tr>
              <td colspan="6">
                <div class="empty-state">
                  <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                  <span class="empty-state-title">Aucun serveur configuré</span>
                  <span>Ajoutez au moins deux serveurs pour comparer leurs données.</span>
                </div>
              </td>
            </tr>`;return}t.innerHTML=e.servers.map(e=>`
          <tr>
            <td>
              <div style="font-weight: 700; font-size: 0.95rem;">${n.escapeHtml(e.name)}</div>
              <div style="font-size: 0.76rem; color: var(--muted-foreground);">${n.escapeHtml(e.url)}</div>
            </td>
            <td><span class="badge ${e.isActive?`badge-success`:`badge-secondary`}">${e.isActive?`● En ligne`:`○ Inactif`}</span></td>
            <td><b>${n.formatNumber(e.mediaCount)}</b></td>
            <td><b>${n.formatNumber(e.userCount)}</b></td>
            <td><b>${n.formatNumber(e.playsCount)}</b></td>
            <td><span class="badge ${e.activeStreams>0?`badge-primary`:`badge-secondary`}">${e.activeStreams}</span></td>
          </tr>
        `).join(``)}catch(e){a.error(e.message)}},async cleanup(){let e=document.getElementById(`app-main`);e.innerHTML=`
        ${m.adminNav(`cleanup`)}
        <div style="max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
          <div class="page-header">
            <div>
              <h1 class="page-title">
                <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                ${o.t(`nav.cleanup`)||`Outils de Nettoyage & Hygiène`}
              </h1>
              <p class="page-subtitle">Maintenez une base de données saine, compacte et exempte d'enregistrements obsolètes.</p>
            </div>
          </div>

          <div class="card" style="padding: 1.75rem;">
            <div class="card-header" style="padding: 0 0 1rem 0; border-bottom: 1px solid var(--border-subtle);">
              <div class="card-title-group">
                <div class="card-title" style="display:flex;align-items:center;gap:0.5rem;">
                  <span>🗑️</span>
                  Supprimer les films orphelins & obsolètes
                </div>
                <div class="card-subtitle">Purge des métadonnées de fichiers supprimés du disque</div>
              </div>
            </div>
            <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
              Supprime les entrées de films qui ne figurent plus sur vos serveurs Jellyfin après des suppressions de fichiers.
            </p>
            <button class="btn btn-danger btn-sm" id="btn-del-stale">Supprimer les films obsolètes</button>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">👥 Synchroniser les utilisateurs supprimés</div>
            </div>
            <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
              Désactive les utilisateurs qui ont été supprimés sur vos instances Jellyfin.
            </p>
            <button class="btn btn-secondary btn-sm" id="btn-sync-deleted-users">Synchroniser les suppressions</button>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">👥 Détection & Fusion des Utilisateurs en Double</div>
            </div>
            <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
              Recherche les utilisateurs ayant des pseudonymes identiques sur différents serveurs Jellyfin.
            </p>
            <div id="cleanup-duplicates-list" style="margin-bottom:0.75rem;">
              <button class="btn btn-secondary btn-sm" id="btn-check-duplicates">Rechercher les doublons</button>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">⏱️ Consolidation de l’Historique</div>
            </div>
            <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
              Fusionne les sessions de visionnage découpées en plusieurs fragments consécutifs pour le même titre.
            </p>
            <button class="btn btn-secondary btn-sm" id="btn-run-consolidate">Consolider l'historique (30 min)</button>
          </div>
        </div>
      `,document.getElementById(`btn-del-stale`)?.addEventListener(`click`,()=>{d.showAction({title:`Supprimer les films obsolètes`,bodyHtml:`<p>Voulez-vous lancer le nettoyage des médias orphelins ?</p>`,confirmText:`Nettoyer`,onConfirm:async()=>{try{await l.postJSON(`/api/admin/cleanup/delete-stale-movies`,{}),a.success(`Nettoyage effectué.`)}catch(e){a.error(e.message)}}})}),document.getElementById(`btn-sync-deleted-users`)?.addEventListener(`click`,async()=>{try{await l.postJSON(`/api/admin/users/sync-deleted`,{}),a.success(`Utilisateurs synchronisés.`)}catch(e){a.error(e.message)}}),document.getElementById(`btn-check-duplicates`)?.addEventListener(`click`,async()=>{let e=document.getElementById(`cleanup-duplicates-list`);e.innerHTML=`<div class="skeleton" style="height:60px;"></div>`;try{let t=(await l.getJSON(`/api/admin/users/duplicates`)).duplicates||[];if(t.length===0){e.innerHTML=`<p style="color:var(--accent); font-size:0.85rem; font-weight:600;">✓ Aucun utilisateur en double détecté.</p>`;return}e.innerHTML=t.map(e=>`
            <div style="padding:0.6rem; background:var(--surface-soft); border-radius:var(--radius-sm); margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;">
              <span><b>${n.escapeHtml(e.username)}</b> (${e.count} comptes)</span>
              <button class="btn btn-secondary btn-sm btn-merge-users" data-username="${n.escapeHtml(e.username)}">Fusionner</button>
            </div>
          `).join(``),e.querySelectorAll(`.btn-merge-users`).forEach(e=>{e.addEventListener(`click`,async()=>{let t=e.getAttribute(`data-username`);try{await l.postJSON(`/api/admin/users/merge`,{username:t}),a.success(`Utilisateurs "${t}" fusionnés avec succès.`),m.cleanup()}catch(e){a.error(e.message)}})})}catch(t){e.innerHTML=`<p style="color:var(--destructive); font-size:0.85rem;">Erreur : ${n.escapeHtml(t.message)}</p>`}}),document.getElementById(`btn-run-consolidate`)?.addEventListener(`click`,async()=>{try{await l.postJSON(`/api/admin/consolidate-history`,{mergeWindowMinutes:30}),a.success(`Consolidation de l’historique effectuée avec succès.`)}catch(e){a.error(e.message)}})}},h={init(){document.body.addEventListener(`click`,e=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;let t=e.target.closest(`a[data-link]`);if(t&&t.href&&t.target!==`_blank`&&!t.hasAttribute(`download`)){let n=new URL(t.href);n.origin===window.location.origin&&(e.preventDefault(),this.navigate(n.pathname+n.search))}}),document.body.addEventListener(`click`,e=>{let n=e.target.closest(`[data-stream-action], [data-canned-message], [data-message-timeout], [data-dismiss], [data-attendance-day]`);if(!n)return;let r=n.dataset;if(r.streamAction&&t.user?.isAdmin&&(r.streamAction===`message`&&window.openSendMessageModal?.(r.sessionId,r.userName,r.mediaTitle,r.serverId),r.streamAction===`kill`&&window.confirmKillStream?.(r.sessionId,r.mediaTitle,r.serverId)),r.cannedMessage!==void 0){let e=document.getElementById(`send-msg-text`);e&&(e.value=r.cannedMessage)}if(r.messageTimeout&&window._setMsgTimeout?.(Number(r.messageTimeout)),r.dismiss){let e=document.getElementById(r.dismiss);e&&(e.style.display=`none`)}r.attendanceDay!==void 0&&window.openAttendanceDrilldown?.(Number(r.attendanceDay),Number(r.attendanceHour),r.attendanceName,Number(r.attendanceCount))}),document.body.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&e.target.matches(`[data-attendance-day]`)&&(e.preventDefault(),e.target.click())}),document.body.addEventListener(`error`,e=>{e.target.matches?.(`img[data-hide-on-error]`)&&(e.target.style.display=`none`)},!0),this.renderCurrent()},async navigate(e,t=!1,n=!1){(n||window.location.pathname+window.location.search!==e)&&await window.JellyTrackUI.history(e,t,!1)},async renderCurrent(){window.JellyTrackUI.disposePage(),t.pageController?.abort(),t.pageCleanups.splice(0).forEach(e=>e()),p.stop(),Object.keys(f.instances).forEach(e=>f.destroy(e)),d.closeAction(),t.pageController=new AbortController;let e=document.getElementById(`app-main`);e&&e.replaceWith(e.cloneNode(!1));let r=window.location.pathname||`/`,i=t.currentPath!==r;if(t.currentPath=r,r===`/settings/analytics`){this.navigate(`/media/analysis`,!0);return}if(r===`/settings`){this.navigate(`/settings/jellyfin`+window.location.search,!0);return}if(r===`/wrapped`){let e=t.user?.jellyfinUserId||t.user?.id;if(e){this.navigate(`/wrapped/`+e,!0);return}}if(window.JellyTrackNavigation.updateRoute(),i&&window.JellyTrackNavigation.closeMobile(),window.JellyTrackNavigation.closeSearch(!1),window.scrollTo(0,0),i&&document.querySelector(`.main-wrapper`).scrollTo(0,0),!t.user&&r!==`/login`&&r!==`/setup/go`){this.navigate(`/login?callbackUrl=`+encodeURIComponent(r+window.location.search),!0);return}if(r!==`/login`&&document.body.classList.remove(`is-auth-page`),t.user&&!t.user.isAdmin&&(r===`/`||r===`/users`||r===`/dashboard`||r===`/logs`||r.startsWith(`/admin/`)||r.startsWith(`/settings`)||r===`/media/analysis`||r===`/newsletter`)){t.user.jellyfinUserId||t.user.id?this.navigate(`/users/me`,!0):document.getElementById(`app-main`).innerHTML=`<div class="empty-state">Accès réservé à l’administration.</div>`;return}let s=t.pageController.signal;if(r!==`/login`&&r!==`/setup/go`){let e=r===`/accounts`?`accounts`:r.startsWith(`/users/`)?`profile`:r===`/users`?`users`:r.startsWith(`/settings`)?`settings`:r.startsWith(`/admin`)?`admin`:r.startsWith(`/media`)||r===`/recent`?`media-recovery`:r===`/logs`?`history`:r===`/about`?`about-recovery`:null;try{let t=r===`/`||r===`/dashboard`||r.startsWith(`/users/`)||r.startsWith(`/admin`)||r.startsWith(`/media`);await Promise.all([...t?[c(`chart.min`)]:[],...e?[c(e)]:[]])}catch(e){s.aborted||(document.getElementById(`app-main`).textContent=e.message);return}if(s.aborted)return}if(r===`/accounts`)window.AccountsUI.render(document.getElementById(`app-main`),{API:l,State:t,Utils:n,Router:h});else if(r===`/`)m.dashboard();else if(r===`/login`)m.login();else if(r===`/setup`)this.navigate(`/`,!0);else if(r===`/setup/go`)m.setup();else if(r===`/about`)m.about();else if(r===`/recent`)m.mediaPage(r);else if(r===`/newsletter`)m.newsletter();else if(r===`/users`)m.users();else if(r.startsWith(`/users/`)){let e=r.split(`/`)[2];m.userDetail(e)}else if(r.startsWith(`/wrapped/`)){let e=r.split(`/`)[2];m.wrapped(e)}else if(r===`/media`||r.startsWith(`/media/`))m.mediaPage(r);else if(r===`/logs`)window.JellyTrackHistory.mount({main:document.getElementById(`app-main`),api:l,utils:n,i18n:o,signal:t.pageController.signal,user:t.user,navigation:t.navigation});else if(r.startsWith(`/settings`)){let e=r.slice(9).replace(/^\//,``)||`overview`;window.JellyTrackSettings.mount({main:document.getElementById(`app-main`),api:l,utils:n,i18n:o,signal:t.pageController.signal,user:t.user,toast:a,navigate:(e,t=!1)=>h.navigate(e,t),legacy:e=>m.settings(e),cleanup:e=>t.pageCleanups.push(e)},e)}else r.startsWith(`/admin/`)?window.JellyTrackAdmin.mount({main:document.getElementById(`app-main`),api:l,utils:n,i18n:o,signal:t.pageController.signal,user:t.user,toast:a,navigate:(e,t=!1)=>h.navigate(e,t),legacy:{health:e=>m.health(e),cleanup:()=>m.cleanup(),compare:()=>m.serverCompare()},cleanup:e=>t.pageCleanups.push(e)},r.slice(7)):m.dashboard()}};(e=>{document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,e,{once:!0}):e()})(async()=>{window.JellyTrackNavigation.init({user:()=>t.user,context:()=>t.navigation,locale:()=>t.locale,t:(e,t)=>o.t(e,t),escape:n.escapeHtml,getJSON:(e,t)=>l.getJSON(e,t),postJSON:(e,t)=>l.postJSON(e,t),navigate:e=>h.navigate(e),refreshContext:async()=>{t.navigation=await l.getJSON(`/api/navigation`)},changeLocale:e=>o.changeLocale(e)}),s.init(),new MutationObserver(()=>window.JellyTrackNavigation.updateTheme()).observe(document.documentElement,{attributes:!0,attributeFilter:[`class`]}),await Promise.all([o.init(),u.checkSession()]);let e=document.getElementById(`select-language`);e&&(e.value=t.locale,e.addEventListener(`change`,e=>{o.changeLocale(e.target.value)}));let r=document.getElementById(`app-sidebar`),c=document.getElementById(`sidebar-collapse-btn`);if(r){try{localStorage.getItem(`jellytrack_sidebar_collapsed`)===`true`&&r.classList.add(`collapsed`)}catch{}c&&c.addEventListener(`click`,()=>{r.classList.toggle(`collapsed`);let e=r.classList.contains(`collapsed`);window.JellyTrackNavigation.closeSearch(!1),window.JellyTrackNavigation.updateRoute();try{localStorage.setItem(`jellytrack_sidebar_collapsed`,e?`true`:`false`)}catch{}})}let d=document.getElementById(`mobile-menu-btn`),f=document.getElementById(`sidebar-backdrop`);d&&r&&d.addEventListener(`click`,()=>{r.classList.contains(`mobile-open`)?window.JellyTrackNavigation.closeMobile():window.JellyTrackNavigation.openMobile()}),f&&r&&f.addEventListener(`click`,()=>{window.JellyTrackNavigation.closeMobile()});let p=document.getElementById(`btn-logout`);p&&p.addEventListener(`click`,()=>u.logout());let m=document.getElementById(`btn-quick-sync`);m&&m.addEventListener(`click`,async()=>{let e=document.getElementById(`sync-icon`);e&&(e.style.animation=`spin 1s linear infinite`);try{await l.postJSON(`/api/sync`,{recentOnly:!0}),a.success(`Synchronisation Jellyfin déclenchée !`),h.renderCurrent()}catch(e){a.error(e.message)}finally{e&&(e.style.animation=``)}}),document.getElementById(`topbar-live-streams-pill`)?.addEventListener(`click`,()=>{h.navigate(`/`)}),window.JellyTrackNavigation.render(),i=()=>h.renderCurrent(),h.init()})}export{a as renderCurrentRoute,o as startApplication};