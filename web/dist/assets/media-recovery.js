/* Historical media pages. Framework-free, using the current Go API and SPA services. */
(() => {
  'use strict';
  const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${paths}</svg>`;
  const icons = {
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    eye: svg('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
    timer: svg('<circle cx="12" cy="14" r="8"/><path d="M9 2h6M12 6v8l3-3M19 5l2 2"/>'),
    award: svg('<circle cx="12" cy="8" r="6"/><path d="m8.2 13-1.2 9 5-3 5 3-1.2-9"/>'),
    Movie: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M17 8h4M3 16h4M17 16h4"/>'),
    Series: svg('<rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 2 4 4 4-4"/>'),
    MusicAlbum: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/>'),
    music: svg('<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>'),
    person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'),
    play: svg('<path d="m6 3 15 9-15 9V3Z"/>'),
    directors: svg('<path d="m4 5 16-3 1 5-18 3-1-5ZM5 10v10h16V7M7 4l4 4M14 3l4 4"/>'),
    actors: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>'),
    server: svg('<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>'),
    studios: svg('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>'),
    database: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>'),
    drive: svg('<path d="M5 4h14l3 11H2L5 4Z"/><rect x="2" y="15" width="20" height="6" rx="2"/><path d="M17 18h.01M13 18h.01"/>'),
    Book: svg('<path d="M4 3h13a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V3Zm0 14h15"/>'),
    all: svg('<path d="M4 3h16l-6 9v7l-4 2v-9L4 3Z"/>'),
    search: svg('<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>'),
    recent: svg('<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>'),
  };
  const messages = {
    loading: ['Chargement…', 'Loading…'], retry: ['Réessayer', 'Retry'], error: ['Impossible de charger cette page', 'Unable to load this page'],
    servers: ['Serveurs', 'Servers'], allServers: ['Tous les serveurs', 'All servers'], previous: ['Précédent', 'Previous'], next: ['Suivant', 'Next'],
    page: ['Page {page} sur {pages}', 'Page {page} of {pages}'], clear: ['Effacer la recherche', 'Clear search'], search: ['Rechercher un média…', 'Search media…'],
    quality: ['Qualité', 'Quality'], title: ['Titre', 'Title'], added: ["Date d'ajout", 'Date added'], played: ['Dernière lecture', 'Last played'],
    allTypes: ['Tous les types', 'All types'], parents: ['Films, séries et albums', 'Movies, series and albums'], extras: ['Autres contenus', 'Other content'],
    noResults: ['Aucun résultat pour ces filtres.', 'No results for these filters.'], unknown: ['Non renseigné', 'Not recorded'], books: ['Livres', 'Books'],
    movies: ['Films', 'Movies'], series: ['Séries', 'Series'], music: ['Musique', 'Music'], directors: ['Réalisateurs', 'Directors'], actors: ['Acteurs', 'Actors'], studios: ['Studios', 'Studios'],
    albums: ['Albums', 'Albums'], tracks: ['Pistes', 'Tracks'], artist: ['Artiste', 'Artist'], listened: ['Temps écouté', 'Listening time'],
    popularTitle: ['Top Contenus', 'Top Content'], popularMusicTitle: ['Top Titres Musicaux', 'Top Music Tracks'], popularMusicDesc: ['Les musiques les plus écoutées.', 'The most played music tracks.'], popularMoviesDesc: ['Les films les plus visionnés.', 'The most watched films.'], popularSeriesDesc: ['Les séries les plus suivies.', 'The most watched series.'], popularDirectorsDesc: ['Les réalisateurs les plus visionnés.', 'The most watched directors.'], popularActorsDesc: ['Les acteurs les plus visionnés.', 'The most watched actors.'], popularStudiosDesc: ['Les studios les plus populaires.', 'The most popular studios.'], heuristic: ['Score indicatif', 'Heuristic score'],
    popularSubtitle: ['Les films, séries et musiques les plus populaires de votre serveur.', 'The most popular movies, series and music on your server.'],
    playSingular: ['lecture', 'play'], playsPlural: ['lectures', 'plays'],
    viewAll: ['Voir tous les résultats', 'View all results'], close: ['Fermer', 'Close'], tracksPerPage: ['Pistes par page', 'Tracks per page'],
    sourceLimit: ['Portraits, rôles et éditions non disponibles dans les métadonnées enregistrées.', 'Portraits, roles and editions are unavailable in recorded metadata.'],
    telemetryLimit: ['{shown} événements affichés sur {total}. Filtrez une session pour affiner.', '{shown} of {total} events shown. Select a session to narrow the results.'],
    collectionChildren: ['Épisodes et pistes', 'Episodes and tracks'], acquisition: ["Suggestions d'acquisition", 'Acquisition suggestions'], trends: ['Tendances sur 30 jours', '30-day trends'],
    binge: ['Binge-watching', 'Binge watching'], bingeDesc: ['Au moins 3 épisodes de la même série, séparés de 45 minutes maximum.', 'At least 3 episodes of the same series, with gaps of at most 45 minutes.'],
    bingeRuns: ['Sessions sur 30 jours', 'Sessions in 30 days'], bingeAverage: ['Épisodes par session', 'Episodes per session'], bingeRecord: ['Record', 'Record'], bingeLeader: ['Spectateur leader', 'Leading viewer'],
    acquireGenre: ['Enrichir la collection {name}', 'Expand the {name} collection'], acquireArtist: ['Compléter la collection de {name}', 'Complete the {name} collection'],
    demand: ['Demande mesurée', 'Measured demand'], demandReason: ['{hours} h sur {plays} lectures', '{hours} h across {plays} plays'],
    telemetryEvents: ['Événements positionnels', 'Positional events'], allSessions: ['Toutes les sessions', 'All sessions'], session: ['Session', 'Session'],
    noImage: ['Image indisponible', 'Image unavailable'], album: ['Album', 'Album'], duration: ['Durée du média', 'Media runtime'],
    languageSegments: ['Périodes de langue', 'Language periods'], from: ['De', 'From'], to: ['À', 'To'], metadataUnavailable: ['Métadonnées Jellyfin indisponibles', 'Jellyfin metadata unavailable'],
  };
  const activeCharts = new Set();
  let generation = 0;
  let closeSearch = null;

  function services(ctx) {
    const e = (v) => ctx.Utils.escapeHtml(String(v ?? ''));
    const t = (key, params = {}, fallback = '') => {
      const pair = messages[key];
      const text = ctx.I18n.t(key, params, fallback || (pair ? pair[ctx.State.locale === 'en' ? 1 : 0] : ''));
      return String((typeof text === 'string' ? text : (fallback || (pair ? pair[ctx.State.locale === 'en' ? 1 : 0] : key))) || fallback || key).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
    };
    const ms = (v) => ctx.Utils.formatMs(Number(v) || 0);
    const hours = (v) => `${parseFloat((Number(v || 0) / 3600000).toFixed(1))}h`;
    const minutes = (v) => `${Math.round(Number(v || 0) / 60000)} min`;
    const count = (v) => Number(v || 0).toLocaleString(ctx.State.locale);
    const date = (v) => v && !Number.isNaN(Date.parse(v)) ? new Date(v).toLocaleString(ctx.State.locale, { dateStyle: 'medium', timeStyle: 'short' }) : t('unknown');
    const relative = (v) => {
      const stamp = Date.parse(v); if (!v || Number.isNaN(stamp)) return t('unknown');
      const days = Math.round((stamp - Date.now()) / 86400000);
      return new Intl.RelativeTimeFormat(ctx.State.locale, { numeric: 'auto' }).format(days, 'day');
    };
    const bytes = (value) => {
      let n = Number(value || 0); const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']; let unit = 0;
      while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit++; }
      return `${n.toLocaleString(ctx.State.locale, { maximumFractionDigits: 1 })} ${units[unit]}`;
    };
    const type = (kind) => t(({ Movie: 'common.movie', Series: 'common.seriesSingular', Season: 'common.season', Episode: 'common.episode', MusicAlbum: 'common.album', Audio: 'common.track', Track: 'common.track', Book: 'common.book', AudioBook: 'common.audiobook' })[kind] || 'mediaProfile.colType', {}, kind);
    const query = () => new URLSearchParams(window.location.search);
    const link = (path, updates = {}, keepAll = false) => {
      const p = keepAll ? query() : new URLSearchParams();
      if (!keepAll && query().has('servers')) p.set('servers', query().get('servers'));
      Object.entries(updates).forEach(([k, v]) => v === '' || v == null ? p.delete(k) : p.set(k, String(v)));
      return `${path}${p.size ? `?${p}` : ''}`;
    };
    const image = (m, imageType = 'Primary', width = 360) => `/api/jellyfin/image?${new URLSearchParams({ id: m.jellyfinMediaId || m.id || '', serverId: m.serverId || '', type: imageType, maxWidth: width, fallback: 'none' })}`;
    const empty = (key = 'common.noData') => `<div class="mr-empty">${e(t(key, {}, t('noResults')))}</div>`;
    const section = (key, body, desc = '', attrs = '') => `<section class="card mr-section" ${attrs}><div class="mr-section-heading"><h2>${e(t(key))}</h2>${desc ? `<p>${e(desc)}</p>` : ''}</div>${body}</section>`;
    const stat = (label, value, sub = '', icon = '') => `<div class="card mr-stat"><span>${e(t(label))}${icon ? `<i class="mr-stat-icon">${icons[icon] || ''}</i>` : ''}</span><strong>${e(value)}</strong>${sub ? `<small>${e(sub)}</small>` : ''}</div>`;
    const mediaLink = (m) => link(`/media/${encodeURIComponent(m.id)}`, { servers: m.serverId || query().get('servers') });
    const profileLink = (u) => u.userId ? link(`/users/${encodeURIComponent(u.userId)}`) : link('/logs');
    return { e, t, ms, hours, minutes, count, date, relative, bytes, type, query, link, image, empty, section, stat, mediaLink, profileLink, ctx };
  }

  function nav(s, active) {
    if (typeof s.ctx.mediaNav === 'function') return s.ctx.mediaNav(active);
    return window.JellyTrackNavigation?.mediaTabs?.(active) || '';
  }
  function header(s, title, total = null, icon = '') {
    return `<div class="page-header mr-header"><h1 class="page-title">${icon}${s.e(s.t(title))}</h1>${total != null ? `<span class="badge mr-header-count" id="mr-total">${s.count(total)} ${s.e(s.t('recent.mediaCount'))}</span>` : ''}</div><div id="mr-server-filter"></div>`;
  }
  function pager(s, page, pages, key = 'page') {
    return `<nav class="pager mr-pager" aria-label="${s.e(s.t('page', { page, pages }))}"><button class="btn btn-secondary btn-sm" data-mr-page="${page - 1}" data-key="${key}" ${page <= 1 ? 'disabled' : ''}>← ${s.e(s.t('previous'))}</button><span>${s.e(s.t('page', { page, pages }))}</span><button class="btn btn-secondary btn-sm" data-mr-page="${page + 1}" data-key="${key}" ${page >= pages ? 'disabled' : ''}>${s.e(s.t('next'))} →</button></nav>`;
  }
  function bindPager(s, main) {
    main.querySelectorAll('[data-mr-page]').forEach((button) => button.addEventListener('click', () => s.ctx.Router.navigate(s.link(window.location.pathname, { [button.dataset.key]: button.dataset.mrPage }, true))));
  }
  function wireImages(s, main) {
    main.querySelectorAll('img[data-mr-image]').forEach((img) => img.addEventListener('error', () => {
      img.hidden = true;
      if (img.closest('.mr-ranking')) return;
      const unavailable = document.createElement('span'); unavailable.className = 'mr-image-unavailable'; unavailable.setAttribute('role', 'img'); unavailable.setAttribute('aria-label', img.alt || s.t('noImage'));
      const fallback = img.dataset.mrFallback || (img.closest('.mr-square,.mr-music-hero') ? 'music' : img.closest('.mr-cast-person,.mr-artist-image') ? 'person' : 'Movie');
      unavailable.innerHTML = icons[fallback] || icons.Movie;
      if (!img.closest('.mr-poster-image,.mr-hero-poster,.mr-artist-image,.mr-cast-person')) { unavailable.classList.add('mr-image-inline'); unavailable.style.width = `${img.width || 40}px`; unavailable.style.height = `${img.height || 60}px`; }
      img.parentNode.insertBefore(unavailable, img);
    }, { once: true }));
  }
  async function serverFilter(s, main, currentGeneration) {
    if (!s.ctx.State.navigation?.multiServer) return;
    try {
      const data = await s.ctx.API.getJSON('/api/media/server-options');
      if (currentGeneration !== generation) return;
      const options = data.servers || []; if (options.length < 2) return;
      const requested = s.query().get('servers');
      const valid = new Set(options.map((server) => server.id));
      const selected = (requested === 'all' ? [] : requested ? requested.split(',') : data.selectedServers || []).filter((id) => valid.has(id));
      const allSelected = selected.length === 0;
      const holder = main.querySelector('#mr-server-filter'); if (!holder) return;
      holder.innerHTML = `<div class="mr-server-options" role="group" aria-label="${s.e(s.t('servers'))}"><div class="mr-server-buttons"><button type="button" class="mr-server-button ${allSelected ? 'active' : ''}" data-mr-server="all" aria-pressed="${allSelected}">${icons.all}${s.e(s.t('common.all'))}</button>${options.map((server) => `<button type="button" class="mr-server-button ${allSelected || selected.includes(server.id) ? 'active' : ''}" data-mr-server="${s.e(server.id)}" aria-pressed="${allSelected || selected.includes(server.id)}">${icons.server}${s.e(server.name)}</button>`).join('')}</div></div>`;
      holder.querySelectorAll('[data-mr-server]').forEach((button) => button.addEventListener('click', () => {
        const id = button.dataset.mrServer;
        const ids = id === 'all' ? [] : allSelected ? [id] : selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
        s.ctx.Router.navigate(s.link(window.location.pathname, { servers: ids.length ? ids.join(',') : 'all', page: '', tracksPage: '', historyPage: '' }, true));
      }));
    } catch (err) { if (err.name !== 'AbortError' && currentGeneration === generation) main.querySelector('#mr-server-filter')?.remove(); }
  }
  function poster(s, m, recent = false, badges = true) {
    const kind = ['MusicAlbum', 'Audio', 'Track'].includes(m.type) ? 'square' : m.type === 'Episode' ? 'wide' : 'portrait';
    const freshStamp = Date.parse(m.dateAdded || m.createdAt); const fresh = recent && freshStamp && Date.now() - freshStamp >= 0 && Date.now() - freshStamp < 7 * 86400000;
    const subtitle = m.artist || m.parentTitle || '';
    const resolution = m.displayResolution || m.resolution || '';
    const res = m.type === 'MusicAlbum' ? m.bitrateKbps > 0 ? `${Math.round(m.bitrateKbps)} KBPS` : '' : resolution && resolution !== 'Unknown' ? resolution === '4K' ? '4K UHD' : resolution : m.type === 'Series' && m.plays > 0 ? `DP ${Math.round(m.directPlayPercent || 0)}%` : '';
    const dateAdded = m.dateAdded || m.createdAt;
    const addedDate = dateAdded && !Number.isNaN(Date.parse(dateAdded)) ? new Date(dateAdded).toLocaleDateString(s.ctx.State.locale, { day: 'numeric', month: 'short' }) : s.t('unknown');
    const quality = m.type === 'MusicAlbum' ? 'music' : resolution === '4K' ? 'uhd' : resolution === '1080p' ? 'hd' : res.startsWith('DP') ? m.directPlayPercent >= 80 ? 'good' : m.directPlayPercent >= 50 ? 'medium' : 'poor' : 'other';
    return `<a data-link class="mr-poster" href="${s.e(s.mediaLink(m))}"><div class="mr-poster-image mr-${kind}"><img data-mr-image src="${s.e(s.image(m))}" loading="lazy" alt="${s.e(m.title)}">${fresh ? `<span class="mr-new badge">${s.e(s.t('recent.newBadge'))}</span>` : ''}${recent ? `<span class="mr-kind mr-kind-${s.e(m.type)} badge">${icons[m.type] || icons.Movie}${s.e(s.type(m.type))}</span>` : ''}${!recent && badges && res ? `<span class="mr-quality mr-quality-${quality} badge">${s.e(res)}</span>` : ''}${recent ? `<div class="mr-poster-overlay"><strong>${s.e(m.title)}</strong>${subtitle ? `<span>${s.e(subtitle)}</span>` : ''}<span>${icons.clock}${s.e(s.date(dateAdded))}</span>${m.plays > 0 ? `<span>${s.count(m.plays)} ${s.e(s.t('recent.viewsCount'))}</span>` : ''}<span>${s.e((m.genres || []).slice(0, 3).join(' · '))}</span>${resolution ? `<span class="mr-quality badge">${s.e(resolution)}</span>` : ''}</div>` : ''}</div><strong class="mr-poster-title">${s.e(m.title)}</strong>${recent && subtitle ? `<span class="mr-poster-sub">${s.e(subtitle)}</span>` : ''}<small class="mr-poster-meta">${recent ? `${icons.clock}<span>${s.e(addedDate)}${m.plays > 0 ? ` · ${s.count(m.plays)} ${s.e(s.t('recent.viewsCount'))}` : ''}</span>` : `<span>${s.count(m.plays)} ${s.e(s.t('recent.viewsCount'))}</span>${m.watchTimeMs > 0 ? `<span>${s.e(s.hours(m.watchTimeMs))}</span>` : ''}`}</small></a>`;
  }
  function bar(s, id, rows, label, value = 'count', onclick = null) {
    if (!rows.length || !rows.some((row) => Number(row[value]) > 0)) { s.ctx.ChartHelper.showEmpty(id, s.t('common.noData', {}, s.t('noResults'))); return; }
    activeCharts.add(id);
    s.ctx.ChartHelper.renderBar(id, rows.map((row) => row.name ?? row.percent), rows.map((row) => Number(row[value] || 0)), { label: s.t(label), onClick: onclick });
  }

  async function catalogue(s, main, path, version) {
    const recent = path === '/recent'; const params = s.query();
    main.innerHTML = `${recent ? '' : nav(s, 'media')}${header(s, recent ? 'recent.title' : 'media.allMedia', recent ? 0 : null, recent ? icons.recent : '')}<div id="mr-catalogue-controls"></div><div id="mr-list" class="mr-grid ${recent ? 'mr-recent-grid' : ''}"><div class="skeleton mr-grid-loading" aria-label="${s.e(s.t('loading'))}"></div></div><div id="mr-pagination"></div>`;
    const excluded = (params.get('excludeTypes') || '').split(',').filter(Boolean);
    const categories = [['all', 'common.all'], ['Movie', 'common.movies'], ['Series', 'common.series'], ['MusicAlbum', 'common.music']];
    const extras = params.get('types') === 'all' || params.get('type');
    main.querySelector('#mr-catalogue-controls').innerHTML = `${!recent ? `<div class="mr-control-row"><div class="segmented-control mr-categories">${categories.map(([id, key]) => `<button type="button" data-category="${id}" class="segment-btn ${id === 'all' ? !excluded.length && !extras ? 'active' : '' : !extras && !excluded.includes(id) ? 'active' : ''}" aria-pressed="${id === 'all' ? !excluded.length && !extras : !extras && !excluded.includes(id)}" title="${s.e(s.t(key))}">${icons[id === 'MusicAlbum' ? 'music' : id]}<span>${s.e(s.t(key))}</span></button>`).join('')}</div><div class="mr-search">${icons.search}<input type="search" id="mr-search" value="${s.e(params.get('q') || '')}" placeholder="${s.e(s.t('search'))}" aria-label="${s.e(s.t('search'))}"><button type="button" id="mr-search-clear" aria-label="${s.e(s.t('clear'))}" ${params.get('q') ? '' : 'hidden'}>✕</button></div></div>` : ''}<div class="mr-secondary-controls">${!recent ? `<label>${s.e(s.t('media.sortBy'))} <select id="mr-sort" class="form-select">${[['plays', 'media.sortPopularity'], ['watchTime', 'media.sortWatchTime'], ['quality', 'quality'], ['title', 'title'], ['added', 'added'], ['recent', 'played'], ['duration', 'media.sortWatchTime'], ['runtime', 'duration'], ['resolution', 'quality']].map(([v, key]) => `<option value="${v}" ${v === (params.get('sortBy') || params.get('sort') || 'plays') ? 'selected' : ''}>${s.e(s.t(key))}</option>`).join('')}</select></label>` : ''}<details class="mr-extra-filters" ${extras ? 'open' : ''}><summary>${s.e(s.t('extras'))}</summary><select class="form-select" id="mr-extra-types" aria-label="${s.e(s.t('extras'))}"><option value="" ${!extras ? 'selected' : ''}>${s.e(s.t('parents'))}</option><option value="all" ${params.get('types') === 'all' ? 'selected' : ''}>${s.e(s.t('allTypes'))}</option>${['Book', 'AudioBook', 'Episode', 'Audio', 'Season'].map((kind) => `<option value="${kind}" ${params.get('type') === kind ? 'selected' : ''}>${s.e(s.type(kind))}</option>`).join('')}</select></details>${['genre', 'resolution', 'library', 'artist'].filter((key) => params.get(key)).map((key) => `<button class="badge mr-filter-chip" type="button" data-remove-filter="${key}">${s.e(params.get(key))} ✕</button>`).join('')}</div>`;
    const navigate = (updates) => s.ctx.Router.navigate(s.link(path, { ...updates, page: '' }, true));
    main.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.category; let next = excluded.slice();
      if (id === 'all') next = []; else if (!excluded.length) next = categories.filter(([key]) => key !== 'all' && key !== id).map(([key]) => key); else if (next.includes(id)) next = next.filter((key) => key !== id); else next.push(id);
      if (next.length >= 3) next = [];
      navigate({ excludeTypes: next.join(','), type: '', types: '' });
    }));
    // Keep the historical controls row intact. Additional Go controls remain
    // reachable in the expandable panel, including all existing sort modes.
    const extraPanel = main.querySelector('.mr-extra-filters');
    const sortControl = main.querySelector('#mr-sort')?.closest('label');
    if (sortControl) extraPanel.append(sortControl);
    let timer;
    const search = main.querySelector('#mr-search');
    search?.addEventListener('input', () => {
      main.querySelector('#mr-search-clear').hidden = !search.value; clearTimeout(timer);
      timer = setTimeout(() => { if (version !== generation) return; const q = search.value.trim(); navigate({ q: q.length >= 2 ? q : '' }); }, 400);
    });
    main.querySelector('#mr-search-clear')?.addEventListener('click', () => { clearTimeout(timer); navigate({ q: '' }); });
    main.querySelector('#mr-sort')?.addEventListener('change', (event) => navigate({ sortBy: event.target.value, sort: '' }));
    main.querySelector('#mr-extra-types').addEventListener('change', (event) => navigate({ types: event.target.value === 'all' ? 'all' : '', type: event.target.value === 'all' ? '' : event.target.value, excludeTypes: '' }));
    main.querySelectorAll('[data-remove-filter]').forEach((button) => button.addEventListener('click', () => navigate({ [button.dataset.removeFilter]: '' })));
    const api = new URLSearchParams(params); api.set('limit', recent ? 40 : 50); api.set('parents', extras ? 'false' : 'true'); api.set('sortBy', recent ? 'added' : params.get('sortBy') || params.get('sort') || 'plays');
    const result = await s.ctx.API.getJSON(`/api/media?${api}`); if (version !== generation) return;
    if (main.querySelector('#mr-total')) main.querySelector('#mr-total').textContent = `${s.count(result.total)} ${s.t('recent.mediaCount')}`;
    main.querySelector('#mr-list').innerHTML = result.items.length ? result.items.map((m) => poster(s, m, recent, result.showLibraryMediaBadges)).join('') : `<div class="mr-grid-empty"><h2>${s.e(s.t('recent.noMedia'))}</h2><p>${s.e(s.t(recent ? 'recent.noMediaDesc' : 'noResults'))}</p></div>`;
    const current = Math.floor(result.offset / result.limit) + 1; const pages = Math.max(1, Math.ceil(result.total / result.limit));
    main.querySelector('#mr-pagination').innerHTML = pages > 1 ? pager(s, current, pages) : ''; bindPager(s, main); wireImages(s, main);
    serverFilter(s, main, version);
  }

  async function collections(s, main, version) {
    main.innerHTML = `${nav(s, 'collections')}${header(s, 'media.libraryCollections')}<div class="skeleton mr-loading" aria-label="${s.e(s.t('loading'))}"></div>`;
    const result = await s.ctx.API.getJSON(`/api/media/collections?${s.query()}`); if (version !== generation) return;
    const data = result.collections || []; const totals = result.totals || {};
    const librarySize = (value) => { const n = Number(value || 0); return n >= 1024 ** 4 ? `${(n / 1024 ** 4).toFixed(2)} To` : `${(n / 1024 ** 3).toFixed(1)} Go`; };
    const libraryDuration = (value) => `${Math.floor(Number(value || 0) / 86400000)}${s.ctx.State.locale === 'en' ? 'd' : 'j'} ${Math.floor(Number(value || 0) % 86400000 / 3600000)}h`;

    const content = ['Movie', 'Series', 'MusicAlbum', 'Book'].map((kind) => ({ kind, count: data.reduce((sum, item) => sum + (item.types || []).filter((row) => row.type === kind || kind === 'Book' && row.type === 'AudioBook').reduce((n, row) => n + Number(row.count || 0), 0), 0) })).filter((row) => row.count > 0);
    const contentLabel = content.map((row) => `<span class="mr-content-${row.kind}">${s.count(row.count)} ${s.e(s.t(({ Movie: 'movies', Series: 'series', MusicAlbum: 'music', Book: 'books', AudioBook: 'books' })[row.kind]).toLocaleLowerCase(s.ctx.State.locale))}</span>`).join('<span>, </span>');
    const days = Math.floor(Number(totals.durationMs || 0) / 86400000); const hours = Math.floor(Number(totals.durationMs || 0) % 86400000 / 3600000);
    main.querySelector('.mr-loading').outerHTML = `<div class="mr-stats mr-collections-stats">${s.stat('media.statsVolume', librarySize(totals.sizeBytes), s.t('media.statsVolumeDesc'), 'drive')}${s.stat('media.statsContent', '', s.t('media.statsContentDesc'), 'database').replace('<strong></strong>', `<strong class="mr-content-total">${contentLabel || s.count(totals.items)}</strong>`)}${s.stat('media.statsTime', `${days}${s.ctx.State.locale === 'en' ? 'd' : 'j'} ${hours}h`, s.t('media.statsTimeDesc'), 'clock')}</div><div class="mr-library-heading"><div><h2>${icons.database}${s.e(s.t('media.libraryDetailsTitle'))}</h2><p>${s.count(data.length)} ${s.e(s.t('media.libraries'))} total</p></div><div class="mr-library-search">${icons.search}<input id="mr-library-search" class="form-input" type="search" placeholder="${s.e(s.t('media.searchLibrary'))}" aria-label="${s.e(s.t('media.searchLibrary'))}"></div></div><div id="mr-collections" class="mr-collection-grid"></div>`;
    const libraryName = (item) => {
      const normalized = String(item.collectionType || item.key || item.name).toLowerCase(); const keys = { movies: 'common.movies', tvshows: 'common.series', music: 'common.music', books: 'books', filmsuhd: 'common.filmsuhd', seriesuhd: 'common.seriesuhd' };
      const localized = keys[normalized] ? s.t(keys[normalized], {}, '') : '';
      return localized && !localized.includes('.') ? localized : String(item.name || s.t('unknown')).replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\b\w/g, (letter) => letter.toUpperCase());
    };
    const render = (search = '') => {
      const filtered = data.filter((item) => `${libraryName(item)} ${item.name} ${(item.scopes || []).map((scope) => `${scope.name} ${scope.server}`).join(' ')} ${(item.types || []).map((row) => `${row.count} ${s.type(row.type)}`).join(' ')}`.toLocaleLowerCase(s.ctx.State.locale).includes(search.toLocaleLowerCase(s.ctx.State.locale))).sort((a, b) => libraryName(a).localeCompare(libraryName(b), s.ctx.State.locale));
      main.querySelector('#mr-collections').innerHTML = filtered.map((item) => {
        const name = libraryName(item); const icon = (item.types || []).find((type) => icons[type.type])?.type || 'Movie';
        const countsLabel = (item.types || []).filter((row) => ['Movie', 'Series', 'MusicAlbum', 'Book', 'AudioBook'].includes(row.type)).map((row) => `${s.count(row.count)} ${s.t(({ Movie: 'movies', Series: 'series', MusicAlbum: 'music', Book: 'books', AudioBook: 'books' })[row.type]).toLocaleLowerCase(s.ctx.State.locale)}`).join(', ');

        const preview = (key, title) => `<div class="mr-library-preview">${item[key] ? `<a data-link href="${s.e(s.mediaLink(item[key]))}"><img data-mr-image src="${s.e(s.image(item[key], 'Primary', 120))}" alt="${s.e(item[key].title)}" loading="lazy"><div><h3>${s.e(s.t(title))}</h3><strong>${s.e(item[key].title)}</strong><small>${key === 'topItem' ? `${s.count(item[key].plays)} ${s.e(s.t('recent.viewsCount'))}` : s.e(item[key].dateAdded ? new Date(item[key].dateAdded).toLocaleDateString(s.ctx.State.locale) : '—')}</small></div></a>` : `<h3>${s.e(s.t(title))}</h3><p>${s.e(s.t(key === 'topItem' ? 'media.noPlays' : 'media.noContentAdded'))}</p>`}</div>`;
        const scopes = (item.scopes || []).map(({ serverId, name: rawName }) => ({ serverId, name: rawName }));
        const servers = [...new Set(scopes.map((scope) => scope.serverId))].join(',');
        return `<article class="card mr-library-card mr-library-${icon}"><div class="mr-library-title">${icons[icon]}<div><h3><a data-link href="${s.e(s.link('/media/all', { libraryScopes: JSON.stringify(scopes), servers }))}">${s.e(name)}</a></h3>${name !== item.name ? `<small class="badge">${s.e(item.name)}</small>` : ''}</div><span class="badge">${s.e(librarySize(item.sizeBytes))}</span></div><div class="mr-library-counts"><span>${s.e(countsLabel)}</span><span>${icons.clock}${s.e(libraryDuration(item.durationMs))}</span></div>${item.ignoredCounts?.length ? `<div class="mr-library-child-counts">${['Episode', 'Audio', 'Track'].map((kind) => ({ kind, count: item.ignoredCounts.filter((row) => row.type === kind || kind === 'Book' && row.type === 'AudioBook').reduce((n, row) => n + Number(row.count || 0), 0) })).filter((row) => row.count).map((row) => `<span>${s.count(row.count)} ${s.e(s.type(row.kind))}</span>`).join(' · ')}</div>` : ''}<div class="mr-library-previews">${preview('topItem', 'media.topContent')}${preview('lastAdded', 'media.lastAdded')}</div></article>`;
      }).join('') || s.empty(); wireImages(s, main);
    };
    render(); main.querySelector('#mr-library-search').addEventListener('input', (event) => render(event.target.value.trim())); serverFilter(s, main, version);
  }

  function ranking(s, key, rows, person = false, description = '') {
    const headingIcon = person ? key.replace(/^.*\.top/, '').toLowerCase() : key.includes('Movies') ? 'Movie' : key.includes('Series') ? 'Series' : 'music';
    return s.section(key, rows.length ? `<ol class="mr-ranking">${rows.map((m, i) => `<li><span class="mr-rank">#${i + 1}</span>${person ? '' : `<img data-mr-image src="${s.e(s.image(m, 'Primary', 100))}" loading="lazy" alt="${s.e(m.title)}">`}<a data-link href="${s.e(person ? s.link('/media/all', { q: m.name }) : s.mediaLink(m))}">${s.e(m.title || m.name)}</a><span><strong>${icons.play}${s.count(m.plays)} ${s.e(s.t(m.plays === 1 ? 'playSingular' : 'playsPlural'))}</strong><small>${icons.clock}${s.e(s.hours(m.watchTimeMs))}</small></span></li>`).join('')}</ol>` : s.empty('media.noPlays'), description).replace('class="card mr-section"', `class="card mr-section mr-ranking-card mr-ranking-${person ? key.replace(/^.*\.top/, '').toLowerCase() : key.includes('Movies') ? 'movies' : key.includes('Series') ? 'series' : 'music'}"`).replace('<h2>', `<h2>${icons[headingIcon] || ''}`).replace('</h2>', `</h2><span class="mr-ranking-award">${icons.award}</span>`);
  }
  async function popular(s, main, version) {
    main.innerHTML = `${nav(s, 'popular')}${header(s, 'popularTitle', null, window.JellyTrackNavigation.icon('trophy'))}<p class="mr-popular-subtitle">${s.e(s.t('popularSubtitle'))}</p><div class="skeleton mr-loading"></div>`;
    const result = await s.ctx.API.getJSON(`/api/media/popular?${s.query()}`); if (version !== generation) return;
    main.querySelector('.mr-loading').outerHTML = `<div class="mr-ranking-grid">${[['movies', 'deepInsights.topMovies', 'popularMoviesDesc'], ['series', 'deepInsights.topSeries', 'popularSeriesDesc'], ['music', 'popularMusicTitle', 'popularMusicDesc']].map(([key, title, description]) => ranking(s, title, result[key] || [], false, s.t(description))).join('')}</div><div class="mr-ranking-grid">${['directors', 'actors', 'studios'].map((key) => ranking(s, 'deepInsights.top'+key[0].toUpperCase()+key.slice(1), result[key] || [], true, s.t('popular'+key[0].toUpperCase()+key.slice(1)+'Desc'))).join('')}</div>`;
    wireImages(s, main); serverFilter(s, main, version);
  }

  async function personSearch(s, name) {
    closeSearch?.(); const previous = document.activeElement;
    s.ctx.Modal.showAction({ title: name, bodyHtml: `<div id="mr-person-results" aria-live="polite">${s.e(s.t('loading'))}</div>`, confirmText: s.t('viewAll'), cancelText: s.t('close'), onConfirm: () => { s.ctx.Router.navigate(s.link('/media/all', { q: name })); } });
    const holder = document.getElementById('mr-person-results'); const modal = document.getElementById('action-modal');
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeSearch?.(); return; }
      if (event.key !== 'Tab') return;
      const focus = Array.from(modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')).filter((el) => !el.hidden); const first = focus[0]; const last = focus[focus.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    modal.addEventListener('keydown', keydown); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    const cleanup = () => { modal.removeEventListener('keydown', keydown); s.ctx.Modal.closeAction(); closeSearch = null; previous?.isConnected && previous.focus(); };
    closeSearch = cleanup; document.getElementById('action-modal-cancel').addEventListener('click', cleanup); document.getElementById('action-modal-close').addEventListener('click', cleanup);
    document.getElementById('action-modal-close').focus();
    try {
      const result = await s.ctx.API.getJSON(`/api/media?${new URLSearchParams({ q: name, limit: 10, servers: s.query().get('servers') || 'all' })}`);
      if (!holder.isConnected || !modal.classList.contains('open')) return;
      holder.innerHTML = result.items.length ? `<div class="mr-search-results">${result.items.map((item) => `<a data-link href="${s.e(s.mediaLink(item))}"><img data-mr-image src="${s.e(s.image(item, 'Primary', 100))}" alt="${s.e(item.title)}"><span>${s.e(item.title)}<small>${s.e(s.type(item.type))}</small></span></a>`).join('')}</div>` : s.empty(); wireImages(s, holder);
    } catch (error) { if (holder.isConnected && error.name !== 'AbortError') holder.textContent = `${s.t('error')}: ${error.message}`; }
  }

  async function analysis(s, main, version) {
    main.innerHTML = `${nav(s, 'analysis')}${header(s, 'media.deepAnalysisTitle')}<div class="skeleton mr-loading"></div>`;
    const result = await s.ctx.API.getJSON(`/api/media/analysis?${s.query()}`); if (version !== generation) return;
    const quality = ['4K', '1440p', '1080p', '720p', 'SD'].map((name) => ({ name, count: (result.quality || []).find((item) => item.name === name)?.count || 0 }));
    const binge = result.binge?.allBingedSeries || []; const leader = binge[0]; const taste = result.taste || {};
    main.querySelector('.mr-loading').outerHTML = `<div class="mr-analysis-overview"><section class="card mr-section mr-analysis-content"><div class="mr-section-heading"><h2>${s.e(s.t('media.statsContent'))}</h2><p>${s.e(s.t('media.statsContentDesc'))}</p></div><div class="mr-analysis-subcards">${[['media.totalMedia', s.count(result.totalMedia), 'media.totalMediaDesc'], ['media.uniqueGenres', s.count(result.uniqueGenres), ''], ['media.avgDuration', s.ms(Math.round(result.averageDurationMs / 60000) * 60000), 'media.avgDurationDesc']].map(([label, value, desc]) => `<div class="mr-analysis-subcard"><span>${s.e(s.t(label))}</span><strong>${s.e(value)}</strong>${desc ? `<small>${s.e(s.t(desc))}</small>` : ''}</div>`).join('')}</div></section>${s.section('media.videoQuality', `<div class="mr-quality-list">${quality.map((row) => `<a data-link href="${s.e(s.link('/media/all', { resolution: row.name }))}"><span class="mr-quality-${row.name}">${s.e(({'4K': s.t('media.4kLabel', {}, '4K UHD'), '1440p': '1440p QHD', '1080p': '1080p FHD', '720p': '720p HD', 'SD': s.t('media.standardOther')})[row.name] || row.name)}</span><strong>${s.count(row.count)}</strong></a>`).join('')}</div>`, s.t('media.videoQualityDesc'))}${s.section('media.libraryCollections', (result.libraries || []).slice(0, 6).map((row) => `<a data-link class="mr-list-row" href="${s.e(s.link('/media/all', { library: row.name }))}"><span>${s.e(row.name)}</span><strong>${s.count(row.count)}</strong></a>`).join('') || s.empty())}</div>${s.section('media.genreDiversity', '<div class="mr-chart mr-genre-chart"><canvas id="mr-catalogue-genres"></canvas></div>', s.t('media.genreDiversityDesc'))}${s.section('binge', `<p>${s.e(s.t('bingeDesc'))}</p><div class="mr-stats mr-stats-four">${s.stat('bingeRuns', s.count(result.binge?.totalBingeSessionsMonth))}${s.stat('bingeAverage', leader ? Number(leader.avgEpisodesPerSession).toLocaleString(s.ctx.State.locale, { maximumFractionDigits: 1 }) : '0')}${s.stat('bingeRecord', s.count(leader?.maxEpisodesInSingleRun))}${s.stat('bingeLeader', leader?.topBingerUsername || s.t('media.noPlays'))}</div>${binge.length ? `<ol class="mr-binge-list">${binge.slice(0, 4).map((row) => `<li><a data-link href="${s.e(s.link(`/media/${encodeURIComponent(row.seriesId)}`))}">${s.e(row.seriesTitle)}</a><span>${s.count(row.totalBingeSessions)} ${s.e(s.t('session'))} · ${s.e(s.ms(row.totalHoursBunged * 3600000))}</span></li>`).join('')}</ol>` : s.empty('media.noPlays')}`)}<div class="mr-analysis-trends">${s.section('acquisition', (taste.acquisitionSuggestions || []).map((row) => `<article class="mr-suggestion"><span class="badge">${s.e(row.badge || s.t('demand'))}${row.scorePercent != null ? ` · ${Math.round(row.scorePercent)}% · ${s.e(s.t('heuristic'))}` : ''}</span><h3><a data-link href="${s.e(s.link('/media/all', row.kind === 'genre' ? { genre: row.name } : { artist: row.name }))}">${s.e(row.title || s.t(row.kind === 'genre' ? 'acquireGenre' : 'acquireArtist', { name: row.name }))}</a></h3><p>${s.e(row.reason || s.t('demandReason', { hours: Number(row.hours).toLocaleString(s.ctx.State.locale, { maximumFractionDigits: 1 }), plays: s.count(row.plays) }))}</p></article>`).join('') || s.empty('media.noPlays'))}${s.section('trends', (taste.topGenres || []).slice(0, 4).map((row) => `<a data-link class="mr-list-row" href="${s.e(s.link('/media/all', { genre: row.name }))}"><span>${s.e(row.name)}</span><strong>${s.e(s.ms(row.hours * 3600000))} · ${Math.round(row.percentage)}%</strong></a>`).join('') || s.empty('media.noPlays'))}</div>${s.section('media.deepStatsOverview', `<div id="mr-deep-stats" aria-live="polite">${s.e(s.t('loading'))}</div>`, s.t('media.deepStatsOverviewDesc'))}`;
    bar(s, 'mr-catalogue-genres', (result.genres || []).slice(0, 10), 'media.totalMedia', 'count', (_index, label) => s.ctx.Router.navigate(s.link('/media/all', { genre: label })));
    serverFilter(s, main, version);
    try {
      const deep = await s.ctx.API.getJSON(`/api/stats/deep?${s.query()}`); if (version !== generation) return;
      const data = deep.deep || deep.insights || deep;
      main.querySelector('#mr-deep-stats').innerHTML = `<div class="mr-ranking-grid">${['topDirectors', 'topActors', 'topStudios'].map((key) => s.section(key === 'topDirectors' ? 'media.topDirectors' : key === 'topActors' ? 'actors' : 'studios', (data[key] || []).map((row) => `<button type="button" class="mr-person-button mr-list-row" data-person="${s.e(row.name)}"><span>${s.e(row.name)}</span><strong>${s.count(row.count) + ' ' + s.e(s.t('recent.viewsCount'))}</strong></button>`).join('') || s.empty())).join('')}</div>`;
      main.querySelectorAll('[data-person]').forEach((button) => button.addEventListener('click', () => personSearch(s, button.dataset.person)));
    } catch (error) { if (error.name !== 'AbortError' && version === generation) main.querySelector('#mr-deep-stats').textContent = `${s.t('error')}: ${error.message}`; }
  }

  function table(s, columns, rows, rowFn, className = '') {
    return rows.length ? `<div class="mr-table-scroll"><table class="table mr-table ${className}"><thead><tr>${columns.map((column) => `<th class="${column[1] || ''}">${s.e(s.t(column[0]))}</th>`).join('')}</tr></thead><tbody>${rows.map(rowFn).join('')}</tbody></table></div>` : s.empty('mediaProfile.noSession');
  }
  function completionSection(s, item) {
    if (!(Number(item.durationMs) > 0)) return '';
    const markers = (item.markers || []).filter((marker) => Number(marker.positionMs) <= Number(item.durationMs));
    return s.section('mediaProfile.completionDist', `<div class="mr-chart mr-dropoff-chart"><canvas id="mr-completion"></canvas></div>${markers.length ? `<div class="mr-completion-markers">${markers.map((marker) => `<span title="${s.e(s.ms(marker.positionMs))}">${s.e(s.t(`mediaProfile.${marker.key}`))} · ${(Number(marker.positionMs) / Number(item.durationMs) * 100).toLocaleString(s.ctx.State.locale, { maximumFractionDigits: 1 })}%</span>`).join('')}</div>` : ''}`, s.t('mediaProfile.completionDistDesc'));
  }
  async function artist(s, main, name, version) {
    main.innerHTML = `${nav(s, '')}<div class="skeleton mr-loading"></div>`;
    const result = await s.ctx.API.getJSON(`/api/media/artist/${encodeURIComponent(name)}?${s.query()}`); if (version !== generation) return;
    const leading = result.albums?.[0]; const stats = result.stats || {};
    main.querySelector('.mr-loading').outerHTML = `<nav class="mr-breadcrumb"><a data-link href="${s.e(s.link('/media/all'))}">${s.e(s.t('media.allMedia'))}</a><span>›</span><span>${s.e(result.name)}</span></nav><section class="card mr-artist-hero">${leading ? `<div class="mr-artist-image"><img data-mr-image src="${s.e(s.image(leading))}" alt="${s.e(result.name)}"></div>` : ''}<div><span class="badge">${s.e(s.t('artist'))}</span><h1>${s.e(result.name)}</h1><p class="mr-artist-summary">${s.count(result.albums?.length)} ${s.e(s.t('albums'))} · ${s.count(stats.tracks)} ${s.e(s.t('tracks'))}</p></div></section><div class="mr-stats mr-stats-four">${s.stat('albums', s.count(result.albums?.length))}${s.stat('tracks', s.count(stats.tracks))}${s.stat('mediaProfile.viewsTitle', s.count(stats.plays))}${s.stat('listened', s.hours(stats.watchTimeMs))}</div>${s.section('albums', result.albums.length ? `<div class="mr-grid">${result.albums.map((item) => poster(s, item)).join('')}</div>` : s.empty())}${s.section('tracks', `<div class="mr-track-controls"><label>${s.e(s.t('tracksPerPage'))} <select class="form-select" id="mr-tracks-limit"><option value="25" ${result.tracksLimit === 25 ? 'selected' : ''}>25</option><option value="50" ${result.tracksLimit === 50 ? 'selected' : ''}>50</option></select></label></div>${table(s, [['mediaProfile.colTitle'], ['album'], ['duration'], ['mediaProfile.colSessions'], ['mediaProfile.colTotalTime']], result.tracks, (item) => `<tr><td><a data-link href="${s.e(s.mediaLink(item))}">${s.e(item.title)}</a></td><td>${item.parentId ? `<a data-link href="${s.e(s.mediaLink({ id: item.parentId, serverId: item.serverId }))}">${s.e(item.parentTitle || s.t('unknown'))}</a>` : s.e(s.t('unknown'))}</td><td>${s.e(s.ms(item.durationMs))}</td><td>${s.count(item.plays)}</td><td>${s.e(s.ms(item.watchTimeMs))}</td></tr>`)}${pager(s, result.tracksPage, result.tracksPages, 'tracksPage')}`)}`;
    bindPager(s, main); main.querySelector('#mr-tracks-limit').addEventListener('change', (event) => s.ctx.Router.navigate(s.link(window.location.pathname, { tracksLimit: event.target.value, tracksPage: '' }, true))); wireImages(s, main);
  }

  function behaviors(s, events, aggregated) {
    if (aggregated) {
      const rows = (items, kind = false) => (items || []).map((row) => `<div class="mr-list-row"><span>${kind ? `${s.e(s.t(`mediaProfile.timeline.label.${row.kind}`, {}, row.kind))} · ` : ''}${s.e(row.label)}${row.sessions ? `<small> · ${s.e(s.t('mediaProfile.rangeSessions', { count: row.sessions }))}</small>` : ''}</span><strong>${s.count(row.count)}</strong></div>`).join('') || s.empty('mediaProfile.noBehaviorSignals');
      return `<div class="mr-behavior-grid"><div><h3>${s.e(s.t('mediaProfile.skippedRewatchedTitle'))}</h3>${rows(aggregated.ranges, true)}</div><div><h3>${s.e(s.t('mediaProfile.speedDistribution'))}</h3>${rows(aggregated.speeds)}</div><div><h3>${s.e(s.t('mediaProfile.audioSubtitleSwitches'))}</h3>${rows(aggregated.switches)}</div><div><h3>${s.e(s.t('mediaProfile.languageSegments'))}</h3>${rows(aggregated.languageSegments)}</div></div>`;
    }
    const ranges = new Map(); const speeds = new Map(); const languages = new Map();
    events.forEach((event) => {
      let m; try { m = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata; } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (['seek', 'replay'].includes(event.eventType) && Number.isFinite(Number(m.fromMs)) && Number.isFinite(Number(m.toMs))) {
        const label = `${s.ms(m.fromMs)} → ${s.ms(m.toMs)}`; const key = `${event.eventType}:${label}`;
        const row = ranges.get(key) || { label, type: event.eventType, count: 0, sessions: new Set() }; row.count++; row.sessions.add(event.playbackId); ranges.set(key, row);
      }
      if (event.eventType === 'speed_change') {
        const rate = Number(m.playbackRate ?? m.rate ?? m.speed ?? m.newRate);
        if (Number.isFinite(rate) && rate > 0) speeds.set(`${rate}×`, (speeds.get(`${rate}×`) || 0) + 1);
      }
      if (['audio_change', 'subtitle_change'].includes(event.eventType)) {
        const value = m.language ?? m.name ?? m.label; if (typeof value !== 'string' || !value) return;
        const label = `${s.t(`mediaProfile.timeline.label.${event.eventType}`)} · ${value}${m.codec ? ` (${m.codec})` : ''}`;
        languages.set(label, (languages.get(label) || 0) + 1);
      }
    });
    const rows = (items) => items.map((row) => `<div class="mr-list-row"><span>${s.e(row.label)}</span><strong>${s.count(row.count)}</strong></div>`).join('') || s.empty('mediaProfile.noBehaviorSignals');
    return `<div class="mr-behavior-grid"><div><h3>${s.e(s.t('mediaProfile.skippedRewatchedTitle'))}</h3>${rows(Array.from(ranges.values()).sort((a, b) => b.count - a.count).slice(0, 12).map((row) => ({ label: `${s.t(`mediaProfile.timeline.label.${row.type}`)} · ${row.label} · ${s.t('mediaProfile.rangeSessions', { count: row.sessions.size })}`, count: row.count })))}</div><div><h3>${s.e(s.t('mediaProfile.speedDistribution'))}</h3>${rows(Array.from(speeds, ([label, count]) => ({ label, count })))}</div><div><h3>${s.e(s.t('mediaProfile.audioSubtitleSwitches'))}</h3>${rows(Array.from(languages, ([label, count]) => ({ label, count })))}</div></div>`;
  }
  function timeline(s, item) {
    const events = item.telemetry || []; const positions = events.map((row) => Number(row.positionMs) || 0);
    const duration = Number(item.durationMs) || Math.max(1, ...positions);
    const groups = new Map(); events.forEach((event) => { const lane = groups.get(event.playbackId) || { username: event.username, events: [] }; lane.events.push(event); groups.set(event.playbackId, lane); });
    const marks = (lane) => {
      const clusters = [];
      lane.events.slice().sort((a, b) => Number(a.positionMs) - Number(b.positionMs)).forEach((event) => {
        const percent = Math.max(0, Math.min(100, Number(event.positionMs) / duration * 100)); const last = clusters[clusters.length - 1];
        if (last && percent - last.percent < 6) last.events.push(event); else clusters.push({ percent, events: [event] });
      });
      return clusters.map((cluster) => {
        const event = cluster.events[0]; const label = cluster.events.map((row) => `${s.t(`mediaProfile.timeline.label.${row.eventType}`, {}, row.eventType)} · ${s.ms(row.positionMs)}`).join(' / ');
        return `<button type="button" class="mr-event mr-event-${s.e(event.eventType)}" style="left:${cluster.percent}%" data-event-id="${s.e(event.id)}" data-event-ids="${s.e(JSON.stringify(cluster.events.map((row) => row.id)))}" title="${s.e(label)}" aria-label="${s.e(label)}">${cluster.events.length > 1 ? cluster.events.length : ''}</button>`;
      }).join('');
    };
    return groups.size ? `<div class="mr-lanes">${Array.from(groups, ([id, lane]) => `<div class="mr-lane"><button type="button" class="mr-lane-name" data-session-detail="${s.e(id)}">${s.e(lane.username || s.t('unknown'))}<small>${s.e(id.slice(0, 12))}</small></button><div class="mr-lane-track">${marks(lane)}</div></div>`).join('')}<div class="mr-timeline-scale"><span>0</span><span>${s.e(s.ms(duration / 2))}</span><span>${s.e(s.ms(duration))}</span></div></div>` : s.empty('mediaProfile.noBehaviorSignals');
  }
  async function detail(s, main, id, version) {
    main.innerHTML = `${nav(s, '')}<div class="mr-detail-layout"><div class="skeleton mr-loading"></div></div>`;
    const params = s.query(); params.set('metadata', 'true');
    const item = await s.ctx.API.getJSON(`/api/media/${encodeURIComponent(id)}?${params}`); if (version !== generation) return;
    const music = ['MusicAlbum', 'Audio', 'Track'].includes(item.type); const hierarchy = item.hierarchy || []; const kids = (item.children || []).slice().sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title, s.ctx.State.locale, { numeric: true })); const events = item.telemetry || [];
    const childrenTitle = item.type === 'Series' ? 'mediaProfile.seasons' : item.type === 'Season' ? 'mediaProfile.episodes' : 'mediaProfile.tracks';
    const distribution = (key) => (item[key] || []).map((row) => `<div class="mr-list-row"><span>${s.e(row.language || s.t(key === 'subtitleDistribution' ? 'mediaProfile.none' : 'unknown'))}${row.codec ? ` (${s.e(row.codec)})` : ''}</span><strong>${s.count(row.count)}</strong></div>`).join('') || s.empty();
    const telemetryFields = [['pauseCount', 'mediaProfile.pauses'], ['seekCount', 'mediaProfile.colJumps'], ['rewatchCount', 'mediaProfile.colReplays'], ['speedChangeCount', 'mediaProfile.speedChanges'], ...(music ? [] : [['audioChanges', 'mediaProfile.audioChanges'], ['subtitleChanges', 'mediaProfile.subtitleChanges']])];
    main.querySelector('.mr-loading').outerHTML = `<nav class="mr-breadcrumb"><a data-link href="${s.e(s.link('/media/all', { library: item.library }))}">${s.e(item.library || s.t('mediaProfile.library'))}</a>${item.artist ? `<span>›</span><a data-link href="${s.e(s.link(`/media/artist/${encodeURIComponent(item.artist)}`, { servers: item.serverId }))}">${s.e(item.artist)}</a>` : ''}${hierarchy.map((parent) => `<span>›</span><a data-link href="${s.e(s.mediaLink(parent))}">${s.e(parent.title)}</a>`).join('')}<span>›</span><span>${s.e(item.title)}</span></nav><div class="mr-quick-nav">${hierarchy.map((parent) => `<a data-link class="btn btn-secondary btn-sm" href="${s.e(s.mediaLink(parent))}">${s.e(s.type(parent.type))}: ${s.e(parent.title)}</a>`).join('')}${item.artist ? `<a data-link class="btn btn-secondary btn-sm" href="${s.e(s.link(`/media/artist/${encodeURIComponent(item.artist)}`, { servers: item.serverId }))}">${s.e(s.t('artist'))}: ${s.e(item.artist)}</a>` : ''}</div><section class="card mr-media-hero ${music ? 'mr-music-hero' : item.type === 'Episode' ? 'mr-episode-hero' : ''}">${item.hasBackdrop ? `<img class="mr-backdrop" src="${s.e(s.image(item, 'Backdrop', 1440))}" alt="">` : ''}<div class="mr-hero-poster"><img data-mr-image src="${s.e(s.image(item, 'Primary', 480))}" alt="${s.e(item.title)}">${s.ctx.State.user?.isAdmin ? `<button id="mr-rotate" class="btn btn-secondary btn-sm" type="button" title="${s.e(s.t('mediaProfile.posterRotate'))}" aria-label="${s.e(s.t('mediaProfile.posterRotate'))}">${svg('<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3"/>')}</button>` : ''}</div><div class="mr-hero-copy">${item.hasLogo ? `<img class="mr-logo" src="${s.e(s.image(item, 'Logo', 500))}" alt="${s.e(item.title)}">` : `<h1>${s.e(item.title)}</h1>`}<div class="mr-hero-badges"><span class="badge">${s.e(s.type(item.type))}</span>${item.episodeCode ? `<span class="badge">${s.e(item.episodeCode)}</span>` : ''}${item.displayResolution || item.resolution ? `<span class="badge">${s.e(item.displayResolution || item.resolution)}</span>` : ''}${item.versions?.length > 1 ? `<span class="badge">${item.versions.length} ${s.e(s.t('mediaProfile.multiVersionsTitle', { count: item.versions.length }))}</span>` : ''}${item.year ? `<span class="badge">${s.e(item.year)}</span>` : ''}</div>${item.artist ? `<p><a data-link href="${s.e(s.link(`/media/artist/${encodeURIComponent(item.artist)}`, { servers: item.serverId }))}">${s.e(item.artist)}</a></p>` : ''}${item.parentTitle ? `<p>${s.e(item.parentTitle)}</p>` : ''}<div class="mr-genre-links">${(item.genres || []).map((genre) => `<a data-link class="badge" href="${s.e(s.link('/media/all', { genre }))}">${s.e(genre)}</a>`).join('')}</div>${item.overview ? `<p>${s.e(item.overview)}</p>` : ''}<p>${s.e(item.server || '')}${item.durationMs ? ` · ${s.e(s.ms(item.durationMs))}` : ''}${item.sizeBytes ? ` · ${s.e(s.bytes(item.sizeBytes))}` : ''}</p>${(item.directors || []).length ? `<p>${s.e(s.t('directors'))}: ${(item.directors || []).map((name) => `<button type="button" class="mr-person-inline" data-person="${s.e(name)}">${s.e(name)}</button>`).join(', ')}</p>` : ''}${!item.metadataAvailable?.peopleRoles && (item.actors || []).length ? `<p>${s.e(s.t('actors'))}: ${(item.actors || []).map((name) => `<button type="button" class="mr-person-inline" data-person="${s.e(name)}">${s.e(name)}</button>`).join(', ')}</p>` : ''}</div></section>${item.metadataAvailable?.peopleRoles && item.people?.length ? s.section('mediaProfile.cast', `<div class="mr-cast">${(item.people?.length ? item.people : (item.actors || []).map((name) => ({ name }))).map((person) => `<button type="button" class="mr-cast-person" data-person="${s.e(person.name)}">${person.id && person.hasImage ? `<img data-mr-image src="${s.e(s.image({ id: person.id, serverId: item.serverId }, 'Primary', 200))}" loading="lazy" alt="${s.e(person.name)}">` : ''}<strong>${s.e(person.name)}</strong>${person.role ? `<small>${s.e(person.role)}</small>` : ''}</button>`).join('')}</div>`, item.metadataAvailable?.peopleRoles ? s.t('mediaProfile.castDesc') : s.t('sourceLimit')) : ''}${item.versions?.length > 1 ? s.section('mediaProfile.multiVersionsTitle', table(s, [['mediaProfile.colTitle'], ['mediaProfile.colType'], ['media.statsVolume'], ['mediaProfile.colAudio'], ['mediaProfile.colResolution']], item.versions, (row) => `<tr><td>${s.e(row.name)}</td><td>${s.e(row.container)}</td><td>${s.e(s.bytes(row.size))}</td><td>${s.e(row.audio)}</td><td>${s.e(row.video)}</td></tr>`)) : ''}${kids.length ? s.section(childrenTitle, table(s, [['#'], ['mediaProfile.colTitle'], ['mediaProfile.colType'], ['mediaProfile.colResolution'], ['mediaProfile.colSessions'], ['mediaProfile.colTotalTime']], kids, (child, index) => `<tr><td>${index + 1}</td><td><a data-link href="${s.e(s.mediaLink(child))}">${s.e(child.title)}</a></td><td>${s.e(s.type(child.type))}</td><td>${s.e(child.displayResolution || child.resolution || s.t('unknown'))}</td><td>${s.count(child.plays)}</td><td>${s.e(s.ms(child.watchTimeMs))}</td></tr>`)) .replace(/\{count\}/g, String(kids.length)) : ''}<div class="mr-stats ${music ? 'mr-stats-four' : 'mr-stats-three'}">${s.stat('mediaProfile.totalTime', s.hours(item.totalDurationMs), s.t('mediaProfile.cumulated'), 'clock')}${s.stat('mediaProfile.viewsTitle', s.count(item.totalPlays), s.t('mediaProfile.uniqueSessions'), 'eye')}${s.stat('mediaProfile.avgDuration', s.minutes(item.totalPlays ? item.totalDurationMs / item.totalPlays : 0), s.t('mediaProfile.perSession'), 'timer')}${music ? s.stat('mediaProfile.pauses', s.count(item.pauseCount)) : ''}</div>${!music ? s.section('mediaProfile.telemetrySummary', `<div class="mr-telemetry-summary">${telemetryFields.map(([field, title]) => `<div><span>${s.e(s.t(title))}</span><strong>${s.count(item[field])}</strong><meter min="0" max="${Math.max(1, ...telemetryFields.map(([name]) => Number(item[name]) || 0))}" value="${Number(item[field]) || 0}"></meter></div>`).join('')}</div>`, s.t('mediaProfile.telemetryDesc')) : ''}${s.section('mediaProfile.behaviorTitle', behaviors(s, events, item.behavior), s.t('mediaProfile.behaviorDesc'))}<div class="mr-viewer-language-grid">${s.section('mediaProfile.viewers', (item.viewers || []).length ? `<div class="mr-viewers">${item.viewers.map((user) => `<a data-link href="${s.e(s.profileLink(user))}"><strong>${s.e(user.username || s.t('unknown'))}</strong><span>${s.count(user.plays)} ${s.e(s.t('mediaProfile.colSessions'))} · ${s.e(s.ms(user.watchTimeMs))}</span></a>`).join('')}</div>` : s.empty('mediaProfile.noViewers')).replace(/\{count\}/g, String(item.viewers?.length || 0))}${s.section('mediaProfile.audioLanguages', distribution('audioDistribution'))}${!music ? s.section('mediaProfile.subtitlesTitle', distribution('subtitleDistribution')) : ''}</div>${completionSection(s, item)}${s.section('mediaProfile.timelineTitle', `<div class="mr-timeline-controls"><label>${s.e(s.t('mediaProfile.colUser'))}<select id="mr-timeline-user" class="form-select"><option value="">${s.e(s.t('mediaProfile.allUsers'))}</option>${(item.viewers || []).map((user) => `<option value="${s.e(user.userId)}" ${s.query().get('user') === user.userId ? 'selected' : ''}>${s.e(user.username || s.t('unknown'))}</option>`).join('')}</select></label><label>${s.e(s.t('session'))}<select id="mr-timeline-session" class="form-select"><option value="">${s.e(s.t('allSessions'))}</option>${Array.from(new Map([...(item.history || []), ...events.map((event) => ({ id: event.playbackId, username: event.username }))].map((row) => [row.id, row])).values()).map((session) => `<option value="${s.e(session.id)}" ${s.query().get('session') === session.id ? 'selected' : ''}>${s.e(session.username || s.t('unknown'))} · ${s.e(session.startedAt ? s.date(session.startedAt) : session.id.slice(0, 12))}</option>`).join('')}</select></label></div>${Number(item.telemetryTotal) > events.length ? `<p class="mr-notice">${s.e(s.t('telemetryLimit', { shown: events.length, total: item.telemetryTotal }))}</p>` : ''}${timeline(s, item)}`)}${(item.counterTimeline || []).length ? s.section('mediaProfile.telemetryTimeline', '<div class="mr-chart"><canvas id="mr-counters"></canvas></div>', s.t(music ? 'mediaProfile.telemetryTimelineMusicDesc' : 'mediaProfile.telemetryTimelineVideoDesc')) : ''}${s.section('mediaProfile.detailedHistory', table(s, [['mediaProfile.colUser'], ['mediaProfile.colDate'], ['mediaProfile.colMethod', 'mr-md'], ['mediaProfile.colAudio'], ...(!music ? [['mediaProfile.colSubtitles', 'mr-lg']] : []), ['mediaProfile.colPauses', 'mr-md'], ['mediaProfile.colJumps', 'mr-lg'], ['mediaProfile.colReplays', 'mr-xl'], ['mediaProfile.colMaxSpeed', 'mr-xl'], ['mediaProfile.colDuration']], item.history || [], (session) => `<tr><td><a data-link href="${s.e(s.profileLink(session))}">${s.e(session.username || s.t('unknown'))}</a></td><td><button type="button" class="mr-person-inline" data-session-detail="${s.e(session.id)}">${s.e(s.date(session.startedAt))}</button></td><td class="mr-md">${s.e(session.playMethod)}</td><td>${s.e(session.audioLanguage || s.t('unknown'))}${session.audioCodec ? ` (${s.e(session.audioCodec)})` : ''}</td>${!music ? `<td class="mr-lg">${s.e(session.subtitleLanguage || s.t('mediaProfile.none'))}</td>` : ''}<td class="mr-md">${s.count(session.pauseCount)}</td><td class="mr-lg">${s.count(session.seekCount)}</td><td class="mr-xl">${s.count(session.rewatchCount)}</td><td class="mr-xl">${session.maxPlaybackRate ? `${s.e(session.maxPlaybackRate)}×` : '—'}</td><td>${s.e(s.ms(session.durationMs))}</td></tr>`)+pager(s, item.historyPage, item.historyPages, 'historyPage'))}`;
    bar(s, 'mr-completion', Array.from({ length: 10 }, (_, index) => ({ name: `${index * 10}–${index * 10 + 10}%`, count: (item.completion || []).find((row) => Number(row.percent) === index * 10)?.count || 0 })), 'mediaProfile.colSessions');
    if (item.counterTimeline?.length && window.Chart) {
      const cid = 'mr-counters'; activeCharts.add(cid); const colors = ['#22d3ee', '#f59e0b', '#34d399', '#a78bfa', '#f472b6', '#fb923c'];
      s.ctx.ChartHelper.destroy(cid); s.ctx.ChartHelper.instances[cid] = new window.Chart(document.getElementById(cid), { type: 'line', data: { labels: item.counterTimeline.map((row) => s.date(row.startedAt)), datasets: telemetryFields.filter(([field]) => item.counterTimeline.some((row) => row[field] > 0)).map(([field, title], index) => ({ label: s.t(title), data: item.counterTimeline.map((row) => Number(row[field] || 0)), borderColor: colors[index], tension: 0.15, pointRadius: 3 })) }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    }
    main.querySelectorAll('[data-person]').forEach((button) => button.addEventListener('click', () => personSearch(s, button.dataset.person)));
    main.querySelectorAll('[data-event-id]').forEach((button) => button.addEventListener('click', () => {
      const ids = JSON.parse(button.dataset.eventIds || JSON.stringify([button.dataset.eventId])); const selected = events.filter((row) => ids.includes(row.id));
      s.ctx.Modal.showAction({ title: s.t('mediaProfile.eventsCount', { count: selected.length }), bodyHtml: selected.map((event) => { let metadata = {}; try { metadata = JSON.parse(event.metadata || '{}'); } catch {} return `<article class="mr-event-detail"><h3>${s.e(s.t(`mediaProfile.timeline.label.${event.eventType}`, {}, event.eventType))}</h3><p>${s.e(event.username)} · ${s.e(s.ms(event.positionMs))}</p><p>${s.e(s.date(event.createdAt))}</p>${metadata.fromMs != null && metadata.toMs != null ? `<p>${s.e(s.ms(metadata.fromMs))} → ${s.e(s.ms(metadata.toMs))}</p>` : ''}${metadata.toRate ? `<p>${s.e(metadata.toRate)}×</p>` : ''}</article>`; }).join(''), confirmText: s.t('close'), cancelText: s.t('close') });
    }));
    main.querySelectorAll('[data-session-detail]').forEach((button) => button.addEventListener('click', () => {
      const sid = button.dataset.sessionDetail; const session = (item.history || []).find((row) => row.id === sid); const sessionEvents = events.filter((row) => row.playbackId === sid);
      s.ctx.Modal.showAction({ title: s.t('mediaProfile.sessionDetail'), bodyHtml: `<p>${s.e(session?.username || sessionEvents[0]?.username || s.t('unknown'))}${session ? ` · ${s.e(s.date(session.startedAt))} · ${s.e(s.ms(session.durationMs))}` : ''}</p>${session ? `<div class="mr-telemetry-summary">${telemetryFields.map(([field, title]) => `<div><span>${s.e(s.t(title))}</span><strong>${s.count(session[field])}</strong></div>`).join('')}</div>` : ''}${timeline(s, { ...item, telemetry: sessionEvents })}`, confirmText: s.t('session'), cancelText: s.t('close'), onConfirm: () => s.ctx.Router.navigate(s.link(window.location.pathname, { session: sid }, true)) });
      document.getElementById('action-modal-body').querySelectorAll('[data-event-id]').forEach((mark) => mark.addEventListener('click', () => { const event = sessionEvents.find((row) => row.id === mark.dataset.eventId); mark.title = `${s.t(`mediaProfile.timeline.label.${event.eventType}`, {}, event.eventType)} · ${s.ms(event.positionMs)}`; }));
    }));
    main.querySelector('#mr-timeline-user').addEventListener('change', (event) => s.ctx.Router.navigate(s.link(window.location.pathname, { user: event.target.value, session: '' }, true)));
    main.querySelector('#mr-timeline-session').addEventListener('change', (event) => s.ctx.Router.navigate(s.link(window.location.pathname, { session: event.target.value }, true)));
    main.querySelector('#mr-rotate')?.addEventListener('click', async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try { await s.ctx.API.postJSON(`/api/media/${encodeURIComponent(item.id)}/poster-rotator/rotate`, {}); const img = main.querySelector('.mr-hero-poster img'); img.src = `${s.image(item, 'Primary', 480)}&t=${Date.now()}`; s.ctx.Toast.success(s.t('mediaProfile.posterRotateSuccess')); } catch (error) { s.ctx.Toast.error(error.message); } finally { button.disabled = false; }
    });
    bindPager(s, main); wireImages(s, main);
  }

  window.MediaUI = {
    destroy(ctx) { generation++; closeSearch?.(); ctx.Modal.closeAction(); activeCharts.forEach((id) => ctx.ChartHelper.destroy(id)); activeCharts.clear(); },
    async render(main, path, ctx) {
      if (!/^\/(?:recent|media(?:\/.*)?)$/.test(path)) return false;
      this.destroy(ctx); const version = generation; const s = services(ctx);
      if (path === '/media') { ctx.Router.navigate(`/media/all${window.location.search}`); return true; }
      try {
        if (path === '/recent' || path === '/media/all') await catalogue(s, main, path, version);
        else if (path === '/media/collections') await collections(s, main, version);
        else if (path === '/media/popular') await popular(s, main, version);
        else if (path === '/media/analysis') await analysis(s, main, version);
        else if (path.startsWith('/media/artist/')) await artist(s, main, decodeURIComponent(path.slice(14)), version);
        else await detail(s, main, decodeURIComponent(path.slice(7)), version);
      } catch (error) {
        if (error.name === 'AbortError' || version !== generation) return true;
        main.innerHTML = `${nav(s, '')}<div class="mr-error" role="alert"><h1>${s.e(s.t('error'))}</h1><p>${s.e(error.message)}</p><button type="button" id="mr-retry" class="btn btn-secondary">${s.e(s.t('retry'))}</button></div>`;
        main.querySelector('#mr-retry').addEventListener('click', () => this.render(main, path, ctx));
      }
      return true;
    },
  };
})();
