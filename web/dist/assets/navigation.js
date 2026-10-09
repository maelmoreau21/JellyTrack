/* Historical main navigation, rendered without a framework. */
(function () {
  'use strict';
  // SVG paths from the Lucide icons used by main. License: lucide-LICENSE.txt.
  // SVG paths from the Lucide icons used by main. License: lucide-LICENSE.txt.
  const paths = {
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
    init(options) {
      config = options;
      const sidebar = document.getElementById('app-sidebar');
      sidebar.innerHTML = `<div class="sidebar-header"><a data-link class="brand-link" href="/"><span class="historical-logo">${logo}</span><span class="brand-title">JellyTrack</span></a><button id="sidebar-collapse-btn" class="sidebar-collapse-btn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button><button id="sidebar-close-btn" type="button" aria-label="Close menu">${icon('close')}</button></div>
      <div class="sidebar-scroll"><div id="nav-search" class="nav-search"><button id="sidebar-search-trigger" type="button" class="compact-search">${icon('search')}</button><div class="nav-search-panel"><div class="nav-search-field">${icon('search')}<input id="nav-search-input" autocomplete="off" type="search"><button id="nav-search-clear" type="button" aria-label="Clear search" hidden>✕</button></div><div id="nav-search-results" hidden></div></div></div>
      <div id="backup-server-banner" class="backup-server-banner" hidden>${icon('warning')}<div class="backup-server-copy"><strong id="backup-server-title"></strong><p id="backup-server-desc"></p></div></div>
      <nav id="historical-nav" class="sidebar-nav" aria-label="Navigation"></nav>
      <details id="go-navigation-extras" class="go-navigation-extras" hidden><summary id="go-extras-label"></summary><div id="go-extras-links"></div><div class="go-extras-actions"><button type="button" class="btn btn-secondary btn-sm" id="btn-quick-sync">${icon('compare')}<span data-i18n="common.sync">Sync</span></button><button type="button" class="btn btn-secondary btn-sm" id="topbar-live-streams-pill"><span class="pulse-dot"></span><span id="topbar-live-streams-count">0</span><span data-i18n="dashboard.streams">flux</span></button></div></details></div>
      <div class="sidebar-footer"><div class="nav-language"><button id="language-trigger" class="nav-footer-control" type="button" aria-label="Language" aria-haspopup="menu" aria-expanded="false"><span class="control-icon language-icon">${icon('globe')}</span><span class="control-copy"><span class="control-heading">Language</span><span id="language-value"></span></span><span class="language-chevron">${icon('down')}</span></button><div id="language-menu" role="menu" hidden></div></div>
      <button id="btn-theme-toggle" type="button" class="nav-footer-control"><span id="theme-control-icon" class="control-icon theme-control-icon"></span><span class="control-copy"><span id="theme-control-heading" class="control-heading"></span><span id="theme-control-value"></span></span></button>
      <button id="btn-logout" type="button" class="nav-footer-control logout-control"><span class="control-icon">${icon('logout')}</span><span id="logout-label" class="control-copy"></span></button><a href="/about" data-link id="nav-version" class="sidebar-version-link"></a></div>`;
      document.getElementById('mobile-brand-logo').innerHTML = logo.replaceAll('nav-jelly-', 'mobile-jelly-');
      const languageButton = document.getElementById('language-trigger');
      const languageMenu = document.getElementById('language-menu');
      languageButton.addEventListener('click', () => {
        languageMenu.hidden = !languageMenu.hidden;
        languageButton.setAttribute('aria-expanded', String(!languageMenu.hidden));
      });
      languageButton.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); languageMenu.hidden = false; languageButton.setAttribute('aria-expanded','true'); languageMenu.querySelector('button')?.focus(); }
      });
      languageMenu.addEventListener('click', async e => {
        const item = e.target.closest('[data-locale]');
        if (!item) return;
        languageMenu.hidden = true;
        languageButton.setAttribute('aria-expanded', 'false');
        document.cookie = `locale=${item.dataset.locale};path=/;max-age=31536000;SameSite=Lax`;
        await config.changeLocale(item.dataset.locale);
        this.render();
      });
      document.addEventListener('mousedown', e => {
        if (!e.target.closest('.nav-language')) { languageMenu.hidden = true; languageButton.setAttribute('aria-expanded','false'); }
        if (!e.target.closest('.nav-search')) this.closeSearch(false);
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { languageMenu.hidden = true; languageButton.setAttribute('aria-expanded','false'); this.closeSearch(false); this.closeMobile(); }
        if (e.key === '/' && !e.target.matches('input,textarea,select,[contenteditable]') && config.user()) {
          e.preventDefault(); this.openSearch();
        }
      });
      document.getElementById('sidebar-close-btn').addEventListener('click', () => this.closeMobile());
      document.getElementById('wrapped-close-btn').addEventListener('click', () => window.history.back());
      window.addEventListener('resize', () => this.updateRoute());
      const tooltip=document.createElement('div'); tooltip.id='navigation-tooltip'; tooltip.hidden=true; tooltip.setAttribute('role','tooltip'); document.body.appendChild(tooltip);
      const showTooltip=event=>{
        const target=event.target.closest('[data-nav-route],#sidebar-search-trigger,#language-trigger,#btn-theme-toggle,#btn-logout,#backup-server-banner');
        if(!target||!document.getElementById('app-sidebar').classList.contains('collapsed'))return;
        const rect=target.getBoundingClientRect();
        tooltip.textContent=target.title||target.getAttribute('aria-label');
        tooltip.style.left=document.getElementById('app-sidebar').getBoundingClientRect().right+10+'px';
        tooltip.style.top=rect.top+rect.height/2+'px'; tooltip.hidden=false;
      };
      document.addEventListener('mouseover',showTooltip); document.addEventListener('focusin',showTooltip);
      document.addEventListener('mouseout',event=>{if(!event.target.contains(event.relatedTarget))tooltip.hidden=true;});
      document.addEventListener('focusout',()=>{tooltip.hidden=true;});
      document.getElementById('sidebar-search-trigger').addEventListener('click', () => {
        document.getElementById('nav-search').classList.toggle('compact-open');
        document.getElementById('nav-search-input').focus();
      });
      document.getElementById('nav-search-clear').addEventListener('click', () => this.closeSearch(true));
      document.getElementById('nav-search-results').addEventListener('click', e => { if (e.target.closest('a')) this.closeSearch(true); });
      let timer;
      const input = document.getElementById('nav-search-input');
      input.addEventListener('input', () => {
        searchGeneration++;
        clearTimeout(timer);
        document.getElementById('nav-search-clear').hidden = !input.value;
        if (input.value.trim().length < 2) { document.getElementById('nav-search-results').hidden = true; return; }
        timer = setTimeout(() => this.search(), 300);
      });
      input.addEventListener('focus', () => { if (input.value.trim().length >= 2) this.search(); });
      this.render();
    },
    closeMobile() {
      document.getElementById('app-sidebar').classList.remove('mobile-open');
      document.getElementById('sidebar-backdrop').classList.remove('active');
      document.getElementById('mobile-menu-btn').setAttribute('aria-expanded','false');
    },
    openSearch() {
      const sidebar = document.getElementById('app-sidebar');
      if (matchMedia('(max-width: 767px)').matches) { sidebar.classList.add('mobile-open'); document.getElementById('sidebar-backdrop').classList.add('active'); document.getElementById('mobile-menu-btn').setAttribute('aria-expanded','true'); }
      document.getElementById('nav-search').classList.add('compact-open');
      document.getElementById('nav-search-input').focus();
    },
    closeSearch(clear) {
      searchGeneration++;
      document.getElementById('nav-search').classList.remove('compact-open');
      document.getElementById('nav-search-results').hidden = true;
      if (clear) { document.getElementById('nav-search-input').value = ''; document.getElementById('nav-search-clear').hidden = true; }
    },
    async search() {
      const generation = ++searchGeneration;
      const query = document.getElementById('nav-search-input').value.trim();
      if (query.length < 2) return;
      const results = document.getElementById('nav-search-results');
      results.innerHTML=`<p>${config.escape(config.t('search.searching'))}</p>`; results.hidden=false;
      try {
        const data = await config.getJSON(`/api/search?q=${encodeURIComponent(query)}`);
        if (generation !== searchGeneration) return;
        const e = config.escape;
        results.innerHTML = ['media','users'].map(group => {
          const items = data[group] || [];
          if (!items.length) return '';
          return `<div class="search-section">${e(config.t(`search.${group === 'media' ? 'mediaSection' : 'usersSection'}`))}</div>` + items.map(item => `<a data-link href="/${group}/${encodeURIComponent(item.id || item.jellyfinMediaId || item.jellyfinUserId)}"><span class="search-type-icon search-type-${group==='users'?'user':item.type==='Movie'?'movie':item.type==='Series'?'series':item.type==='MusicAlbum'?'music':'other'}">${icon(group === 'users' ? 'searchUser' : item.type==='Series'?'tv':item.type==='MusicAlbum'?'music':'film')}</span><span>${e(item.title || item.username)}${item.subtitle ? `<small>${e(item.subtitle)}</small>` : ''}</span></a>`).join('');
        }).join('') || `<p>${e(config.t('search.noResults'))}</p>`;
        results.hidden = false;
      } catch { if (generation === searchGeneration) results.hidden = true; }
    },
    render() {
      if (!config) return;
      const user = config.user(), context = config.context(), e = config.escape, t = config.t;
      const uid = user?.jellyfinUserId && user.jellyfinUserId !== 'local-admin' ? user.jellyfinUserId : '';
      const home = user?.isAdmin ? '/' : (uid ? `/users/${encodeURIComponent(uid)}` : '/media');
      document.querySelectorAll('.brand-link,.mobile-brand-link').forEach(el => { el.href = home; });
      const items = uid ? [['myAccount', `/users/${encodeURIComponent(uid)}`, 'user']] : [];
      if (user?.isAdmin) {
        items.push(['dashboard','/','dashboard'], ['recentlyAdded','/recent','sparkles'], ['library','/media','film'], ['users','/users','users'], ['logHealth','/admin/health','health'], ['logs','/logs','logs'], ['settings','/settings','settings']);
        if (context.multiServer) items.push(['serverCompare','/admin/server-compare','compare']);
      } else if (user) {
        items.push(['library','/media','film'],['recentlyAdded','/recent','sparkles']);
        if (uid && context.wrappedVisible) items.push(['myWrapped',`/wrapped/${encodeURIComponent(uid)}`,'gift']);
      }
      document.getElementById('historical-nav').innerHTML = items.map(([key,href,img]) => `<a href="${e(href)}" data-link data-nav-route="${e(href)}" title="${e(t('nav.'+key))}" aria-label="${e(t('nav.'+key))}">${icon(img)}<span>${e(t('nav.'+key))}</span></a>`).join('');
      const backup = document.getElementById('backup-server-banner');
      backup.hidden = !(user?.authServerIsPrimary === false && user.authServerName);
      document.getElementById('backup-server-title').textContent = t('nav.backupServerActive');
      document.getElementById('backup-server-desc').textContent = t('nav.backupServerDesc',{server:user?.authServerName || ''});
      backup.title = t('nav.backupServerActive')+' — '+t('nav.backupServerDesc',{server:user?.authServerName || ''});
      const extras = document.getElementById('go-navigation-extras');
      extras.hidden = !user?.isAdmin;
      document.getElementById('go-extras-label').textContent = t('nav.goExtras');
      document.getElementById('go-extras-links').innerHTML = [['/settings/overview','nav.goOverview'],['/settings/plugin','nav.goPlugin'],['/settings/network','dashboard.networkTab'],['/admin/system-health','nav.goSystemHealth'],['/admin/cleanup','nav.cleanup'],['/admin/log-health','nav.goLogHealth'],['/admin/plugin-health','nav.pluginHealth'],['/newsletter','nav.goNewsletter']].map(([href,key]) => `<a data-link href="${href}">${e(t(key))}</a>`).join('');
      document.getElementById('nav-search-input').placeholder = t('search.placeholder');
      document.getElementById('sidebar-search-trigger').title = t('search.placeholder');
      document.getElementById('sidebar-search-trigger').setAttribute('aria-label',t('search.placeholder'));
      const loc = locales.find(l => l[0] === config.locale()) || locales[0];
      const country = loc[0] === 'en' ? 'gb' : loc[0] === 'pt-BR' ? 'br' : loc[0] === 'zh' ? 'cn' : loc[0];
      document.getElementById('language-value').innerHTML = `<img class="nav-flag" src="/assets/flags/${country}.png" alt=""> ${e(loc[1])}`;
      document.getElementById('language-trigger').querySelector('.language-icon').innerHTML = document.getElementById('app-sidebar').classList.contains('collapsed') && !matchMedia('(max-width: 767px)').matches ? `<img class="nav-flag" src="/assets/flags/${country}.png" alt="">` : icon('globe');
      document.getElementById('language-trigger').title = loc[1];
      document.getElementById('language-menu').innerHTML = '<div class="language-menu-heading">Interface</div>'+locales.map(([code,label]) => `<button type="button" role="menuitemradio" aria-checked="${code===loc[0]}" data-locale="${code}"><img class="nav-flag" src="/assets/flags/${code==='en'?'gb':code==='pt-BR'?'br':code==='zh'?'cn':code}.png" alt=""><span>${label}</span>${code===loc[0] ? '<small>Active</small>' : ''}</button>`).join('');
      document.getElementById('logout-label').textContent = t('nav.logout');
      document.getElementById('btn-logout').title = t('nav.logout');
      document.getElementById('btn-logout').setAttribute('aria-label', t('nav.logout'));
      document.getElementById('nav-version').textContent = `JellyTrack v${context.appVersion || '2.1.1'}`;
      this.updateTheme();
      this.updateRoute();
    },
    updateTheme() {
      if (!config) return;
      const dark = document.documentElement.classList.contains('dark'), t=config.t;
      document.getElementById('theme-control-icon').innerHTML = icon(dark ? 'sun' : 'moon');
      document.getElementById('theme-control-icon').classList.toggle('theme-mode-light',!dark);
      document.getElementById('theme-control-heading').textContent = t('common.theme');
      document.getElementById('theme-control-value').textContent = t(dark ? 'common.themeDark' : 'common.themeLight');
      const button = document.getElementById('btn-theme-toggle');
      button.title = t(dark ? 'common.switchToLight' : 'common.switchToDark');
      button.setAttribute('aria-label',button.title);
    },
    updateRoute() {
      if (!config) return;
      const path=location.pathname;
      document.body.classList.toggle('navigation-fullscreen',path==='/login'||path.startsWith('/wrapped'));
      document.getElementById('wrapped-close-btn').hidden=!path.startsWith('/wrapped');
      document.querySelectorAll('[data-nav-route]').forEach(link => {
        const href=link.dataset.navRoute, active=path===href||(href!=='/'&&path.startsWith(href));
        link.classList.toggle('active',active);
        if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
      });
      const collapsed=document.getElementById('app-sidebar').classList.contains('collapsed');
      const locale=config.locale();
      const country=locale==='en'?'gb':locale==='pt-BR'?'br':locale==='zh'?'cn':locale;
      document.getElementById('language-trigger').querySelector('.language-icon').innerHTML=collapsed?`<img class="nav-flag" src="/assets/flags/${country}.png" alt="">`:icon('globe');
      const button=document.getElementById('sidebar-collapse-btn');
      button.title=config.t(collapsed?'nav.expandMenu':'nav.collapseMenu');
      button.setAttribute('aria-label',button.title);
      document.getElementById('nav-version').textContent=(collapsed?'v':'JellyTrack v')+(config.context().appVersion||'2.1.1');
    },
    settingsTabs(path) {
      const tabs=[['jellyfin','jellyfinTitle','server'],['sso','ssoTitle','key'],['plugin/security','authSecurity','shield'],['media','mediaSettings','media'],['scheduler','taskScheduler','calendar'],['dataBackups','dataBackups','database'],['notifications','notifications','bell']];
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
