/* About: historical main structure and copy, with the installed Go stack. */
(function () {
  'use strict';
  const paths = {
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
    palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 22a10 10 0 1 1 10-10 4 4 0 0 1-4 4h-1.8a1.8 1.8 0 0 0-1.3 3.1A1.8 1.8 0 0 1 13.6 22Z"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0"/>',
    chart: '<path d="M3 3v18h18M9 17V9M14 17V5M19 17v-3"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    branch: '<path d="M6 3v12M18 6a6 6 0 0 1-6 6H6"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="3" r="3"/>',
    play: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4Z"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>'
  };
  const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]}</svg>`;
  window.JellyTrackAbout = {
    render(main, { i18n, escape, version, locale }) {
      const text = (key, params = {}) => escape(i18n.t('about.' + key, params));
      const copy = (fr, en) => escape(locale.startsWith('fr') ? fr : en);
      const features = i18n.t('about.featuresList');
      // Categories match main; names/versions describe the actual implementation.
      // Go/go-oidc versions are dependency versions, Chart is the bundled asset.
      const stack = [
        ['server', 'Go', '1.26', copy('Serveur HTTP natif et binaire autonome', 'Native HTTP server and standalone binary')],
        ['palette', 'HTML / JavaScript', '', copy('Interface embarquée, sans framework au runtime', 'Embedded interface without a runtime framework')],
        ['database', 'SQLite / PostgreSQL', '', copy('Stockage persistant et migrations SQL', 'Persistent storage and SQL migrations')],
        ['chart', 'Chart.js', window.Chart?.version || '4.5.1', copy('Bibliothèque de graphiques interactifs', 'Interactive chart library')],
        ['shield', 'Go OIDC / Sessions', '3.21.0', copy('Authentification Jellyfin et OpenID Connect', 'Jellyfin and OpenID Connect authentication')],
        ['clock', 'Go Scheduler', '', text('techCron')]
      ];
      const card = (key, name, content, tone = '') => `<section class="about-historical-card"><header><h2 class="${tone}">${icon(key)}<span>${name}</span></h2></header><div class="about-historical-content">${content}</div></section>`;
      main.innerHTML = `<div class="about-historical">
        <header class="about-historical-heading"><div class="about-historical-brand"><img src="/assets/logo.svg" alt="Logo" width="48" height="48"><h1>JellyTrack</h1></div><p>${text('description')}</p><div class="about-historical-version">${text('version', { version: version || '2.1.1' })}</div></header>
        ${card('heart', text('features'), `<ul class="about-historical-features">${(Array.isArray(features) ? features : []).map(feature => `<li><span aria-hidden="true">•</span>${escape(feature)}</li>`).join('')}</ul>`, 'about-heart')}
        ${card('server', text('technologies'), `<div class="about-historical-stack">${stack.map(([glyph, name, installed, description]) => `<article>${icon(glyph)}<div><div class="about-historical-tech-name"><strong>${escape(name)}</strong>${installed ? `<small>v${escape(installed)}</small>` : ''}</div><p>${description}</p></div></article>`).join('')}</div>`, 'about-server')}
        ${card('branch', text('linksCredits'), `<div class="about-historical-links"><a href="https://github.com/maelmoreau21/JellyTrack" target="_blank" rel="noopener noreferrer">${icon('branch')}${text('githubSource')}${icon('external')}</a><a href="https://jellyfin.org" target="_blank" rel="noopener noreferrer">${icon('play')}${text('jellyfinLink')}${icon('external')}</a></div><p class="about-historical-credit">${text('openSourceNote')}</p>`)}
        <details class="about-historical-extras"><summary>${escape(i18n.t('nav.goExtras'))}</summary><ul><li>${copy('Exécution autonome : aucun service Node.js ni gestionnaire npm requis au runtime.', 'Standalone execution: no Node.js service or npm manager required at runtime.')}</li><li>${copy('Choix du stockage SQLite ou PostgreSQL, avec migrations automatiques.', 'SQLite or PostgreSQL storage with automatic migrations.')}</li><li>${copy('Sessions sécurisées, protections CSRF et SSRF, et OpenID Connect.', 'Secure sessions, CSRF and SSRF protections, and OpenID Connect.')}</li><li>${copy('Dix langues disponibles : FR, EN, DE, ES, IT, NL, PL, PT-BR, RU et ZH.', 'Ten available languages: FR, EN, DE, ES, IT, NL, PL, PT-BR, RU and ZH.')}</li></ul></details>
      </div>`;
    }
  };
}());
