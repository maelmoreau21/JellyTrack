/* Historical main navigation, rendered without a framework. */
(function () {
  'use strict';
  // SVG paths from the Lucide icons used by main. License: lucide-LICENSE.txt.
  const paths = {
    playCircle: '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
    filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    terminal: '<path d="m4 17 6-5-6-5M12 19h8"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    date: '<path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
    star: '<polygon points="12 3 14.8 8.7 21 9.6 16.5 14 17.6 20.2 12 17.3 6.4 20.2 7.5 14 3 9.6 9.2 8.7 12 3"/>',
    trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    headphones: '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="13" width="4" height="8" rx="2"/><rect x="17" y="13" width="4" height="8" rx="2"/>',
    book: '<path d="M12 7v14M3 3h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6v18h-6a3 3 0 0 0-3 0 3 3 0 0 0-3 0H3z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    arrowRight: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
    arrowLeft: '<path d="M19 12H5m7 7-7-7 7-7"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    dashboard: "<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/>",
    film: "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M7 3v18\"/><path d=\"M3 7.5h4\"/><path d=\"M3 12h18\"/><path d=\"M3 16.5h4\"/><path d=\"M17 3v18\"/><path d=\"M17 7.5h4\"/><path d=\"M17 16.5h4\"/>",
    user: "<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/><path d=\"M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662\"/>",
    users: "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>",
    sparkles: "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/><path d=\"M20 2v4\"/><path d=\"M22 4h-4\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/>",
    health: "<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\"/><path d=\"M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27\"/>",
    logs: "<path d=\"M15 12h-5\"/><path d=\"M15 8h-5\"/><path d=\"M19 17V5a2 2 0 0 0-2-2H4\"/><path d=\"M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3\"/>",
    settings: "<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
    compare: "<circle cx=\"5\" cy=\"6\" r=\"3\"/><path d=\"M12 6h5a2 2 0 0 1 2 2v7\"/><path d=\"m15 9-3-3 3-3\"/><circle cx=\"19\" cy=\"18\" r=\"3\"/><path d=\"M12 18H7a2 2 0 0 1-2-2V9\"/><path d=\"m9 15 3 3-3 3\"/>",
    gift: "<path d=\"M12 7v14\"/><path d=\"M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8\"/><path d=\"M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5\"/><rect x=\"3\" y=\"7\" width=\"18\" height=\"4\" rx=\"1\"/>",
    search: "<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>",
    searchUser: "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>",
    tv: "<path d=\"m17 2-5 5-5-5\"/><rect width=\"20\" height=\"15\" x=\"2\" y=\"7\" rx=\"2\"/>",
    music: "<path d=\"M9 18V5l12-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"16\" r=\"3\"/>",
    globe: "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/>",
    sun: "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2\"/><path d=\"M12 20v2\"/><path d=\"m4.93 4.93 1.41 1.41\"/><path d=\"m17.66 17.66 1.41 1.41\"/><path d=\"M2 12h2\"/><path d=\"M20 12h2\"/><path d=\"m6.34 17.66-1.41 1.41\"/><path d=\"m19.07 4.93-1.41 1.41\"/>",
    moon: "<path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\"/>",
    logout: "<path d=\"m16 17 5-5-5-5\"/><path d=\"M21 12H9\"/><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/>",
    server: "<rect width=\"20\" height=\"8\" x=\"2\" y=\"2\" rx=\"2\" ry=\"2\"/><rect width=\"20\" height=\"8\" x=\"2\" y=\"14\" rx=\"2\" ry=\"2\"/><line x1=\"6\" x2=\"6.01\" y1=\"6\" y2=\"6\"/><line x1=\"6\" x2=\"6.01\" y1=\"18\" y2=\"18\"/>",
    key: "<path d=\"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z\"/><circle cx=\"16.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>",
    shield: "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/>",
    media: "<path d=\"m12.296 3.464 3.02 3.956\"/><path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z\"/><path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><path d=\"m6.18 5.276 3.1 3.899\"/>",
    calendar: "<path d=\"M16 14v2.2l1.6 1\"/><path d=\"M16 2v3\"/><path d=\"M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338\"/><path d=\"M3 9h5.859\"/><path d=\"M8 2v3\"/><circle cx=\"16\" cy=\"16\" r=\"6\"/>",
    database: "<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"/><path d=\"M3 5V19A9 3 0 0 0 21 19V5\"/><path d=\"M3 12A9 3 0 0 0 21 12\"/>",
    bell: "<path d=\"M10.268 21a2 2 0 0 0 3.464 0\"/><path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\"/>",
    trophy: "<path d=\"M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2\"/><path d=\"M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2\"/><path d=\"M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3\"/><path d=\"M4 22h16\"/><path d=\"M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z\"/><path d=\"M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3\"/>",
    layers: "<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"/><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"/><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"/>",
    chart: "<path d=\"M5 21v-6\"/><path d=\"M12 21V3\"/><path d=\"M19 21V9\"/>",
    warning: "<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>",
    close: "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>",
    down: "<path d=\"m6 9 6 6 6-6\"/>",
    eraser: "<path d=\"M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21\"/><path d=\"m5.082 11.09 8.828 8.828\"/>",
    shieldAlert: "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"M12 8v4\"/><path d=\"M12 16h.01\"/>",
    activity: "<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\"/>",
    ghost: "<path d=\"M15 10v1\"/><path d=\"M7.528 20.472a1.6 1.6 0 012.277 0l1.057 1.056a1.6 1.6 0 002.276 0l1.057-1.056a1.6 1.6 0 012.277 0l1.114 1.114a1.4 1.4 0 002.414-1V10a8 8 0 00-16 0v10.586a1.4 1.4 0 002.414 1z\"/><path d=\"M9 10v1\"/>",
    heartCrack: "<path d=\"M12.409 5.824c-.702.792-1.15 1.496-1.415 2.166l2.153 2.156a.5.5 0 0 1 0 .707l-2.293 2.293a.5.5 0 0 0 0 .707L12 15\"/><path d=\"M13.508 20.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.677.6.6 0 0 0 .818.001A5.5 5.5 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5z\"/>",
    copy: "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>",
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.film}</svg>`;
  const logo = '<svg viewBox="18 23 64 69" aria-hidden="true"><defs><linearGradient id="nav-jelly-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#AA5CC3"/><stop offset="100%" stop-color="#00A4DC"/></linearGradient><mask id="nav-jelly-mask"><rect width="100" height="100" fill="white"/><circle cx="50" cy="39" r="10" fill="black"/></mask></defs><path d="M20 55A30 30 0 0 1 80 55Z" fill="url(#nav-jelly-gradient)" mask="url(#nav-jelly-mask)"/><polygon points="46,32 46,46 58,39" fill="#00A4DC"/><g fill="url(#nav-jelly-gradient)"><rect x="30" y="60" width="8" height="20" rx="4"/><rect x="46" y="60" width="8" height="30" rx="4"/><rect x="62" y="60" width="8" height="15" rx="4"/></g></svg>';
  const locales = [['fr','Français','🇫🇷'],['en','English','🇬🇧'],['de','Deutsch','🇩🇪'],['es','Español','🇪🇸'],['it','Italiano','🇮🇹'],['nl','Nederlands','🇳🇱'],['pl','Polski','🇵🇱'],['pt-BR','Português (BR)','🇧🇷'],['ru','Русский','🇷🇺'],['zh','中文','🇨🇳']];
  let config;
  let searchGeneration = 0;
  let healthGeneration = 0;
  const healthCounts = { cleanup: 0, security: 0 };
  const nav = window.JellyTrackNavigation = {
    icon,
    controller: null,
    init(options) {
      config = options;
      this.controller = window.JellyTrackUI.sidebar(document.getElementById('app-sidebar'), config, icon, logo);
    },
    render() { this.controller.render(); },
    updateTheme() { this.controller.updateTheme(); },
    updateRoute() { this.controller.updateRoute(); },
    openMobile() { this.controller.openMobile(); },
    closeMobile() { this.controller.closeMobile(); },
    openSearch() { this.controller.openSearch(); },
    closeSearch(clear) { this.controller.closeSearch(clear); },
    search() { return this.controller.search(); },
    settingsTabs(path) {
      const tabs=[['jellyfin','jellyfinTitle','server'],['plugin/security','authSecurity','shield'],['media','mediaSettings','media'],['scheduler','taskScheduler','calendar'],['dataBackups','dataBackups','database'],['notifications','notifications','bell']];
      return '<nav class="historical-settings-tabs" aria-label="'+config.escape(config.t('nav.settings'))+'">'+tabs.map(([route,key,img])=>{
        const href='/settings/'+route;
        const active=route==='jellyfin'?['/settings','/settings/jellyfin','/settings/plugin'].includes(path):path.startsWith(href);
        return `<a data-link href="${href}" class="${active?'active':''}" ${active?'aria-current="page"':''}>${icon(img)}<span>${config.escape(config.t('settings.'+key))}</span></a>`;
      }).join('')+'</nav>';
    },
    mediaTabs(active) {
      const tabs=[['all','allMedia','film','media'],['popular','popularTab','trophy','popular']];
      if (config.user()?.isAdmin) tabs.push(['analysis','deepAnalysisTitle','chart','analysis']);
      tabs.push(['collections','libraries','layers','collections']);
      return '<nav class="historical-settings-tabs" aria-label="'+config.escape(config.t('nav.library'))+'">'+tabs.map(([route,key,img,value])=>`<a data-link href="/media/${route}" class="${active===value?'active':''}" ${active===value?'aria-current="page"':''}>${icon(img)}<span>${config.escape(config.t('media.'+key))}</span></a>`).join('')+'</nav>';
    },
    schedulerWrapped(container, settings) {
      const e=config.escape,t=config.t;
      const form=document.createElement('form');
      form.className='card historical-wrapped-settings';
      form.innerHTML=`<h2 class="card-title">${icon('sparkles')}${e(t('settings.wrappedPeriod'))}</h2><p>${e(t('settings.wrappedPeriodDesc'))}</p>
      <label><input type="checkbox" name="wrappedPeriodEnabled" ${settings.wrappedPeriodEnabled!==false?'checked':''}> ${e(t('settings.autoAvailability'))}</label>
      <div class="wrapped-period-fields">${['Start','End'].map((position)=>`<fieldset><legend>${e(t('settings.wrapped'+position))}</legend><label>${e(t('settings.month'))}<input class="form-input" type="number" name="wrapped${position}Month" min="1" max="12" value="${Number(settings['wrapped'+position+'Month'])||(position==='Start'?12:1)}" required></label><label>${e(t('settings.day'))}<input class="form-input" type="number" name="wrapped${position}Day" min="1" max="31" value="${Number(settings['wrapped'+position+'Day'])||(position==='Start'?1:31)}" required></label></fieldset>`).join('')}</div>
      <label><input type="checkbox" name="wrappedVisible" ${settings.wrappedVisible!==false?'checked':''}> ${e(t('settings.wrappedVisibilityLabel'))}</label>
      <button type="submit" class="btn btn-primary">${e(t('common.save'))}</button><p role="status"></p>`;
      const visibility=form.elements.namedItem('wrappedPeriodEnabled');
      const period=form.querySelector('.wrapped-period-fields');
      const refresh=()=>{period.hidden=!visibility.checked;}; refresh(); visibility.addEventListener('change',refresh);
      form.addEventListener('submit',async event=>{
        event.preventDefault(); const button=form.querySelector('[type=submit]'); button.disabled=true;
        const body={};
        ['wrappedVisible','wrappedPeriodEnabled'].forEach(key=>{body[key]=form.elements.namedItem(key).checked;});
        ['wrappedStartMonth','wrappedStartDay','wrappedEndMonth','wrappedEndDay'].forEach(key=>{body[key]=Number(form.elements.namedItem(key).value);});
        try { await config.postJSON('/api/settings',body); await config.refreshContext(); this.render(); form.querySelector('[role=status]').textContent=t('settings.savedSuccess'); }
        catch(error) { form.querySelector('[role=status]').textContent=error.message; }
        finally {button.disabled=false;}
      });
      container.firstElementChild.appendChild(form);
    },
    async healthPage(renderHealth, tab='cleanup') {
      const generation=++healthGeneration;
      const e=config.escape,t=config.t,fr=config.locale().startsWith('fr');
      const main=document.getElementById('app-main');
      const panels=[['cleanup',fr?'Nettoyage & Stockage':'Media Cleanup','eraser'],['security',fr?'Sécurité & Anomalies':'Security & Alerts','shieldAlert'],['logs',fr?'Moteur & Logs':'Logs & Engine','activity']];
      if(tab!=='cleanup') {
        await renderHealth(tab==='security'?'logs':'system');
        if(!main.isConnected||generation!==healthGeneration)return;
        main.querySelector('.admin-tabs-nav')?.remove();
      } else {
        main.innerHTML=`<div class="page-header"><h1 class="page-title">${icon('health')}${e(t('nav.logHealth'))}</h1></div><section class="historical-cleanup"><h2>${e(fr?'Nettoyage Intelligent & Optimisation':'Smart Media Cleanup & Hygiene')}</h2><div id="cleanup-navigation-content"></div></section>`;
      }
      const tabs=document.createElement('div');
      tabs.className='segmented-control historical-health-tabs'; tabs.setAttribute('role','tablist');
      tabs.innerHTML=panels.map(([value,label,img])=>`<button type="button" role="tab" tabindex="${value===tab?'0':'-1'}" class="segment-btn ${value===tab?'active':''}" aria-selected="${value===tab}" data-health-panel="${value}">${icon(img)}${e(label)}${value!=='logs'?`<span class="badge health-count health-count-${value}" ${healthCounts[value]?'':'hidden'}>${healthCounts[value]}</span>`:''}</button>`).join('');
      main.querySelector('.page-header').after(tabs);
      tabs.addEventListener('click',event=>{const button=event.target.closest('[data-health-panel]');if(button)this.healthPage(renderHealth,button.dataset.healthPanel);});
      const nextTab=(event,buttons)=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();const index=buttons.indexOf(event.target);
        return buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length];
      };
      tabs.addEventListener('keydown',async event=>{const next=nextTab(event,Array.from(tabs.querySelectorAll('[data-health-panel]')));if(next){const panel=next.dataset.healthPanel;await this.healthPage(renderHealth,panel);main.querySelector(`[data-health-panel="${panel}"]`)?.focus();}});
      const updateCount=(panel,count)=>{healthCounts[panel]=count;const badge=tabs.querySelector('.health-count-'+panel);badge.textContent=count;badge.hidden=count===0;};
      config.getJSON('/api/admin/security/audit').then(data=>{if(tabs.isConnected&&generation===healthGeneration)updateCount('security',(data.anomalies||[]).length);}).catch(()=>{});
      if(tab!=='cleanup')return;
      const container=main.querySelector('#cleanup-navigation-content');
      try {
        const data=await config.getJSON('/api/admin/cleanup');
        if(!main.isConnected||!container.isConnected)return;
        updateCount('cleanup',(data.ghostMedia||[]).length);
        const categories=[['ghosts','ghostMedia',t('cleanup.ghostMedia')],['abandoned','abandonedMedia',t('cleanup.abandonedMedia')],['duplicates','duplicateMedia','Doublons']];
        container.innerHTML=`<div class="segmented-control historical-cleanup-tabs" role="tablist">${categories.map(([value,key,label],i)=>`<button class="segment-btn ${i===0?'active':''}" type="button" role="tab" aria-selected="${i===0}" data-cleanup-panel="${value}">${icon(['ghost','heartCrack','copy'][i])}${e(label)} <span class="badge">${(data[key]||[]).length}</span></button>`).join('')}</div>`+categories.map(([value,key,label],i)=>`<div class="card table-wrapper" role="tabpanel" data-cleanup-content="${value}" ${i?'hidden':''}><table class="table"><thead><tr><th>${e(t('cleanup.colTitle'))}</th><th>${e(t('wrapped.type'))}</th><th>${e(t(value==='abandoned'?'cleanup.colMaxCompletion':'media.libraries'))}</th></tr></thead><tbody>${(data[key]||[]).map(item=>`<tr><td><a data-link href="/media/${encodeURIComponent(item.id)}">${e(item.title)}</a></td><td>${e(item.type)}</td><td>${value==='abandoned'?Math.round(item.maxCompletion)+'%':e(item.libraryName)}</td></tr>`).join('')||`<tr><td colspan="3">${e(t('common.noData'))}</td></tr>`}</tbody></table></div>`).join('');
        container.addEventListener('click',event=>{
          const button=event.target.closest('[data-cleanup-panel]');if(!button)return;
          container.querySelectorAll('[data-cleanup-panel]').forEach(el=>{const active=el===button;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;});
          container.querySelectorAll('[data-cleanup-content]').forEach(el=>{el.hidden=el.dataset.cleanupContent!==button.dataset.cleanupPanel;});
        });
        container.querySelectorAll('[data-cleanup-panel]').forEach((el,i)=>{el.tabIndex=i===0?0:-1;});
        container.querySelector('[role=tablist]').addEventListener('keydown',event=>{const next=nextTab(event,Array.from(container.querySelectorAll('[data-cleanup-panel]')));if(next){next.focus();next.click();}});
      } catch(error) { if(container.isConnected)container.textContent=error.message; }
    },
  };
})();

export {};
