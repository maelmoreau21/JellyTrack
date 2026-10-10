/* Historical media pages. Framework-free, using the current Go API and SPA services. */
(() => {
  'use strict';
  const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${paths}</svg>`;
  const icons = {
    Movie: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M17 8h4M3 16h4M17 16h4"/>'),
    Series: svg('<rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 2 4 4 4-4"/>'),
    MusicAlbum: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/>'),
    Book: svg('<path d="M4 3h13a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V3Zm0 14h15"/>'),
    all: svg('<path d="M3 5h18M6 12h12M9 19h6"/>'),
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
      return String(text || fallback || key).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
    };
    const ms = (v) => ctx.Utils.formatMs(Number(v) || 0);
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
    const image = (m, imageType = 'Primary', width = 360) => `/api/jellyfin/image?${new URLSearchParams({ id: m.jellyfinMediaId || m.id || '', serverId: m.serverId || '', type: imageType, maxWidth: width })}`;
    const empty = (key = 'common.noData') => `<div class="mr-empty">${e(t(key, {}, t('noResults')))}</div>`;
    const section = (key, body, desc = '', attrs = '') => `<section class="card mr-section" ${attrs}><div class="mr-section-heading"><h2>${e(t(key))}</h2>${desc ? `<p>${e(desc)}</p>` : ''}</div>${body}</section>`;
    const stat = (label, value, sub = '') => `<div class="card mr-stat"><span>${e(t(label))}</span><strong>${e(value)}</strong>${sub ? `<small>${e(sub)}</small>` : ''}</div>`;
    const mediaLink = (m) => link(`/media/${encodeURIComponent(m.id)}`, { servers: m.serverId || query().get('servers') });
    const profileLink = (u) => u.userId ? link(`/users/${encodeURIComponent(u.userId)}`) : link('/logs');
    return { e, t, ms, count, date, relative, bytes, type, query, link, image, empty, section, stat, mediaLink, profileLink, ctx };
  }

  function nav(s, active) {
    if (typeof s.ctx.mediaNav === 'function') return s.ctx.mediaNav(active);
    return window.JellyTrackNavigation?.mediaTabs?.(active) || '';
  }
  function header(s, title, total = null, icon = icons.Movie) {
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
      const unavailable = document.createElement('span'); unavailable.className = 'mr-image-unavailable'; unavailable.textContent = s.t('noImage');
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
      const selected = requested === 'all' ? [] : requested ? requested.split(',') : data.selectedServers || [];
      const holder = main.querySelector('#mr-server-filter'); if (!holder) return;
      holder.innerHTML = `<fieldset class="mr-server-options"><legend>${s.e(s.t('servers'))}</legend>${options.map((server) => `<label><input type="checkbox" value="${s.e(server.id)}" ${!selected[0] || selected.includes(server.id) ? 'checked' : ''}>${s.e(server.name)}</label>`).join('')}</fieldset>`;
      holder.addEventListener('change', () => {
        const ids = Array.from(holder.querySelectorAll('input:checked'), (el) => el.value);
        s.ctx.Router.navigate(s.link(window.location.pathname, { servers: ids.length === options.length || !ids.length ? 'all' : ids.join(','), page: '', tracksPage: '', historyPage: '' }, true));
      });
    } catch (err) { if (err.name !== 'AbortError' && currentGeneration === generation) main.querySelector('#mr-server-filter')?.remove(); }
  }
  function poster(s, m, recent = false, badges = true) {
    const kind = ['MusicAlbum', 'Audio', 'Track'].includes(m.type) ? 'square' : m.type === 'Episode' ? 'wide' : 'portrait';
    const fresh = recent && m.dateAdded && Date.now() - Date.parse(m.dateAdded) >= 0 && Date.now() - Date.parse(m.dateAdded) < 7 * 86400000;
    const subtitle = m.artist || m.parentTitle || '';
    const res = m.displayResolution || m.resolution || (m.type === 'MusicAlbum' && m.bitrateKbps > 0 ? `${Math.round(m.bitrateKbps)} kbps` : m.type === 'Series' && m.directPlayPercent != null ? `${Math.round(m.directPlayPercent)}% DirectPlay` : '');
    return `<a data-link class="mr-poster" href="${s.e(s.mediaLink(m))}"><div class="mr-poster-image mr-${kind}"><img data-mr-image src="${s.e(s.image(m))}" loading="lazy" alt="${s.e(m.title)}">${fresh ? `<span class="mr-new badge">${s.e(s.t('recent.newBadge'))}</span>` : ''}<span class="mr-kind badge">${icons[m.type] || icons.Movie}${s.e(s.type(m.type))}</span>${badges && res ? `<span class="mr-quality badge">${s.e(res)}</span>` : ''}<div class="mr-poster-overlay"><strong>${s.e(m.title)}</strong>${subtitle ? `<span>${s.e(subtitle)}</span>` : ''}<span>${s.count(m.plays)} ${s.e(s.t('recent.viewsCount'))} · ${s.e(s.ms(m.watchTimeMs))}</span>${recent ? `<span>${s.e(s.relative(m.dateAdded))}</span>` : ''}<span>${s.e((m.genres || []).slice(0, 3).join(' · '))}</span></div></div><strong class="mr-poster-title">${s.e(m.title)}</strong>${recent && subtitle ? `<span class="mr-poster-sub">${s.e(subtitle)}</span>` : ''}<small>${recent ? `${s.e(s.relative(m.dateAdded))} · ` : ''}${s.count(m.plays)} ${s.e(s.t('recent.viewsCount'))}${!recent ? ` · ${s.e(s.ms(m.watchTimeMs))}` : ''}</small></a>`;
  }
  function bar(s, id, rows, label, value = 'count', onclick = null) {
    if (!rows.length || !rows.some((row) => Number(row[value]) > 0)) { s.ctx.ChartHelper.showEmpty(id, s.t('common.noData', {}, s.t('noResults'))); return; }
    activeCharts.add(id);
    s.ctx.ChartHelper.renderBar(id, rows.map((row) => row.name ?? row.percent), rows.map((row) => Number(row[value] || 0)), { label: s.t(label), onClick: onclick });
  }

  async function catalogue(s, main, path, version) {
    const recent = path === '/recent'; const params = s.query();
    main.innerHTML = `${recent ? '' : nav(s, 'media')}${header(s, recent ? 'recent.title' : 'media.allMedia', 0, recent ? icons.recent : icons.Movie)}<div id="mr-catalogue-controls"></div><div id="mr-list" class="mr-grid ${recent ? 'mr-recent-grid' : ''}"><div class="skeleton mr-grid-loading" aria-label="${s.e(s.t('loading'))}"></div></div><div id="mr-pagination"></div>`;
    const excluded = (params.get('excludeTypes') || '').split(',').filter(Boolean);
    const categories = [['all', 'common.all'], ['Movie', 'common.movies'], ['Series', 'common.series'], ['MusicAlbum', 'common.music']];
    const extras = params.get('types') === 'all' || params.get('type');
    main.querySelector('#mr-catalogue-controls').innerHTML = `${!recent ? `<div class="mr-control-row"><div class="segmented-control mr-categories">${categories.map(([id, key]) => `<button type="button" data-category="${id}" class="segment-btn ${id === 'all' ? !excluded.length && !extras ? 'active' : '' : !extras && !excluded.includes(id) ? 'active' : ''}" aria-pressed="${id === 'all' ? !excluded.length && !extras : !extras && !excluded.includes(id)}" title="${s.e(s.t(key))}">${icons[id]}<span>${s.e(s.t(key))}</span></button>`).join('')}</div><div class="mr-search">${icons.search}<input type="search" id="mr-search" value="${s.e(params.get('q') || '')}" placeholder="${s.e(s.t('search'))}" aria-label="${s.e(s.t('search'))}"><button type="button" id="mr-search-clear" aria-label="${s.e(s.t('clear'))}" ${params.get('q') ? '' : 'hidden'}>✕</button></div></div>` : ''}<div class="mr-secondary-controls">${!recent ? `<label>${s.e(s.t('media.sortBy'))} <select id="mr-sort" class="form-select">${[['plays', 'media.sortPopularity'], ['watchTime', 'media.sortWatchTime'], ['quality', 'quality'], ['title', 'title'], ['added', 'added'], ['recent', 'played'], ['duration', 'duration']].map(([v, key]) => `<option value="${v}" ${v === (params.get('sortBy') || params.get('sort') || 'plays') ? 'selected' : ''}>${s.e(s.t(key))}</option>`).join('')}</select></label>` : ''}<details class="mr-extra-filters" ${extras ? 'open' : ''}><summary>${s.e(s.t('extras'))}</summary><select class="form-select" id="mr-extra-types" aria-label="${s.e(s.t('extras'))}"><option value="" ${!extras ? 'selected' : ''}>${s.e(s.t('parents'))}</option><option value="all" ${params.get('types') === 'all' ? 'selected' : ''}>${s.e(s.t('allTypes'))}</option>${['Book', 'AudioBook', 'Episode', 'Audio', 'Season'].map((kind) => `<option value="${kind}" ${params.get('type') === kind ? 'selected' : ''}>${s.e(s.type(kind))}</option>`).join('')}</select></details>${['genre', 'resolution', 'library', 'artist'].filter((key) => params.get(key)).map((key) => `<button class="badge mr-filter-chip" type="button" data-remove-filter="${key}">${s.e(params.get(key))} ✕</button>`).join('')}</div>`;
    const navigate = (updates) => s.ctx.Router.navigate(s.link(path, { ...updates, page: '' }, true));
    main.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.category; let next = excluded.slice();
      if (id === 'all') next = []; else if (!excluded.length) next = categories.filter(([key]) => key !== 'all' && key !== id).map(([key]) => key); else if (next.includes(id)) next = next.filter((key) => key !== id); else next.push(id);
      if (next.length >= 3) next = [];
      navigate({ excludeTypes: next.join(','), type: '', types: '' });
    }));
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
    main.querySelector('#mr-total').textContent = `${s.count(result.total)} ${s.t('recent.mediaCount')}`;
    main.querySelector('#mr-list').innerHTML = result.items.length ? result.items.map((m) => poster(s, m, recent, result.showLibraryMediaBadges)).join('') : `<div class="mr-grid-empty"><h2>${s.e(s.t('recent.noMedia'))}</h2><p>${s.e(s.t(recent ? 'recent.noMediaDesc' : 'noResults'))}</p></div>`;
    const current = Math.floor(result.offset / result.limit) + 1; const pages = Math.max(1, Math.ceil(result.total / result.limit));
    main.querySelector('#mr-pagination').innerHTML = pager(s, current, pages); bindPager(s, main); wireImages(s, main);
    serverFilter(s, main, version);
  }

  async function collections(s, main, version) {
    main.innerHTML = `${nav(s, 'collections')}${header(s, 'media.libraryCollections')}<div class="skeleton mr-loading" aria-label="${s.e(s.t('loading'))}"></div>`;
    const result = await s.ctx.API.getJSON(`/api/media/collections?${s.query()}`); if (version !== generation) return;
    const data = result.collections || []; const totals = result.totals || {};
    main.querySelector('.mr-loading').outerHTML = `<div class="mr-stats mr-stats-three">${s.stat('media.statsVolume', s.bytes(totals.sizeBytes), s.t('media.statsVolumeDesc'))}${s.stat('media.statsContent', s.count(totals.items), s.t('media.statsContentDesc'))}${s.stat('media.statsTime', s.ms(totals.durationMs), s.t('media.statsTimeDesc'))}</div><div class="mr-library-heading"><h2>${s.e(s.t('media.libraryDetailsTitle'))} <span class="badge">${data.length}</span></h2><input id="mr-library-search" class="form-input" type="search" placeholder="${s.e(s.t('media.searchLibrary'))}" aria-label="${s.e(s.t('media.searchLibrary'))}"></div><div id="mr-collections" class="mr-collection-grid"></div>`;
    const libraryName = (item) => {
      const normalized = String(item.collectionType || item.name).toLowerCase(); const keys = { movies: 'common.movies', tvshows: 'common.series', music: 'common.music', books: 'books', audiobooks: 'common.audiobook' };
      return keys[normalized] ? s.t(keys[normalized]) : item.name || s.t('unknown');
    };
    const render = (search = '') => {
      const filtered = data.filter((item) => `${libraryName(item)} ${item.name} ${item.server}`.toLocaleLowerCase(s.ctx.State.locale).includes(search.toLocaleLowerCase(s.ctx.State.locale))).sort((a, b) => libraryName(a).localeCompare(libraryName(b), s.ctx.State.locale));
      main.querySelector('#mr-collections').innerHTML = filtered.map((item) => {
        const name = libraryName(item); const icon = (item.types || []).find((type) => icons[type.type])?.type || 'Movie';
        const preview = (key, title) => `<div class="mr-library-preview"><h3>${s.e(s.t(title))}</h3>${item[key] ? `<a data-link href="${s.e(s.mediaLink(item[key]))}"><img data-mr-image src="${s.e(s.image(item[key], 'Primary', 120))}" alt="${s.e(item[key].title)}" loading="lazy"><div><strong>${s.e(item[key].title)}</strong><small>${key === 'topItem' ? `${s.count(item[key].plays)} ${s.e(s.t('recent.viewsCount'))}` : s.e(s.relative(item[key].dateAdded))}</small></div></a>` : `<p>${s.e(s.t(key === 'topItem' ? 'media.noPlays' : 'media.noContentAdded'))}</p>`}</div>`;
        return `<article class="card mr-library-card mr-library-${icon}"><div class="mr-library-title">${icons[icon]}<div><h3><a data-link href="${s.e(s.link('/media/all', { library: item.name, servers: item.serverId }))}">${s.e(name)}</a></h3>${name !== item.name ? `<small>${s.e(item.name)}</small>` : ''}<small>${s.e(item.server)}</small></div><span class="badge">${s.e(s.bytes(item.sizeBytes))}</span></div><div class="mr-library-counts">${(item.types || []).filter((row) => !['Episode', 'Season', 'Audio', 'Track'].includes(row.type)).map((row) => `<span>${s.count(row.count)} ${s.e(s.type(row.type))}</span>`).join('')}<span>${s.e(s.ms(item.durationMs))}</span></div><div class="mr-library-previews">${preview('topItem', 'media.topContent')}${preview('lastAdded', 'media.lastAdded')}</div>${item.ignoredCounts?.length ? `<details class="mr-library-extra"><summary>${s.e(s.t('collectionChildren'))}</summary>${item.ignoredCounts.map((row) => `<span>${s.count(row.count)} ${s.e(s.type(row.type))}</span>`).join(' · ')}</details>` : ''}</article>`;
      }).join('') || s.empty(); wireImages(s, main);
    };
    render(); main.querySelector('#mr-library-search').addEventListener('input', (event) => render(event.target.value.trim())); serverFilter(s, main, version);
  }

  function ranking(s, key, rows, person = false) {
    return s.section(key, rows.length ? `<ol class="mr-ranking">${rows.map((m, i) => `<li><span class="mr-rank">${i + 1}</span>${person ? '' : `<img data-mr-image src="${s.e(s.image(m, 'Primary', 100))}" loading="lazy" alt="${s.e(m.title)}">`}<a data-link href="${s.e(person ? s.link('/media/all', { q: m.name }) : s.mediaLink(m))}">${s.e(m.title || m.name)}</a><span><strong>${s.count(m.plays)} ${s.e(s.t('recent.viewsCount'))}</strong><small>${s.e(s.ms(m.watchTimeMs))}</small></span></li>`).join('')}</ol>` : s.empty('media.noPlays'));
  }
  async function popular(s, main, version) {
    main.innerHTML = `${nav(s, 'popular')}${header(s, 'media.popularTab')}<div class="skeleton mr-loading"></div>`;
    const result = await s.ctx.API.getJSON(`/api/media/popular?${s.query()}`); if (version !== generation) return;
    main.querySelector('.mr-loading').outerHTML = `<div class="mr-ranking-grid">${[['movies', 'movies'], ['series', 'series'], ['music', 'music']].map(([key, title]) => ranking(s, title, result[key] || [])).join('')}</div><div class="mr-ranking-grid">${['directors', 'actors', 'studios'].map((key) => ranking(s, key, result[key] || [], true)).join('')}</div>`;
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
    main.querySelector('.mr-loading').outerHTML = `<div class="mr-analysis-overview"><section class="card mr-section"><h2>${s.e(s.t('media.totalMedia'))}</h2><strong class="mr-big-count">${s.count(result.totalMedia)}</strong><p>${s.count(result.uniqueGenres)} ${s.e(s.t('media.uniqueGenres'))}</p><p>${s.e(s.t('media.avgDuration'))}: ${s.e(s.ms(result.averageDurationMs))}</p></section>${s.section('media.videoQuality', `<div class="mr-quality-list">${quality.map((row) => `<a data-link href="${s.e(s.link('/media/all', { resolution: row.name }))}"><span>${row.name}</span><strong>${s.count(row.count)}</strong></a>`).join('')}</div>`)}${s.section('media.libraryCollections', (result.libraries || []).slice(0, 6).map((row) => `<a data-link class="mr-list-row" href="${s.e(s.link('/media/all', { library: row.name }))}"><span>${s.e(row.name)}</span><strong>${s.count(row.count)}</strong></a>`).join('') || s.empty())}</div>${s.section('media.genreDiversity', '<div class="mr-chart mr-genre-chart"><canvas id="mr-catalogue-genres"></canvas></div>', s.t('media.genreDiversityDesc'))}${s.section('binge', `<p>${s.e(s.t('bingeDesc'))}</p><div class="mr-stats mr-stats-four">${s.stat('bingeRuns', s.count(result.binge?.totalBingeSessionsMonth))}${s.stat('bingeAverage', leader ? Number(leader.avgEpisodesPerSession).toLocaleString(s.ctx.State.locale, { maximumFractionDigits: 1 }) : '0')}${s.stat('bingeRecord', s.count(leader?.maxEpisodesInSingleRun))}${s.stat('bingeLeader', leader?.topBingerUsername || s.t('media.noPlays'))}</div>${binge.length ? `<ol class="mr-binge-list">${binge.slice(0, 4).map((row) => `<li><a data-link href="${s.e(s.link(`/media/${encodeURIComponent(row.seriesId)}`))}">${s.e(row.seriesTitle)}</a><span>${s.count(row.totalBingeSessions)} ${s.e(s.t('session'))} · ${s.e(s.ms(row.totalHoursBunged * 3600000))}</span></li>`).join('')}</ol>` : s.empty('media.noPlays')}`)}<div class="mr-analysis-trends">${s.section('acquisition', (taste.acquisitionSuggestions || []).map((row) => `<article class="mr-suggestion"><span class="badge">${s.e(s.t('demand'))}${row.percentage != null ? ` · ${Math.round(row.percentage)}%` : ''}</span><h3><a data-link href="${s.e(s.link('/media/all', row.kind === 'genre' ? { genre: row.name } : { artist: row.name }))}">${s.e(s.t(row.kind === 'genre' ? 'acquireGenre' : 'acquireArtist', { name: row.name }))}</a></h3><p>${s.e(s.t('demandReason', { hours: Number(row.hours).toLocaleString(s.ctx.State.locale, { maximumFractionDigits: 1 }), plays: s.count(row.plays) }))}</p></article>`).join('') || s.empty('media.noPlays'))}${s.section('trends', (taste.topGenres || []).slice(0, 4).map((row) => `<a data-link class="mr-list-row" href="${s.e(s.link('/media/all', { genre: row.name }))}"><span>${s.e(row.name)}</span><strong>${s.e(s.ms(row.hours * 3600000))} · ${Math.round(row.percentage)}%</strong></a>`).join('') || s.empty('media.noPlays'))}</div>${s.section('media.deepStatsOverview', `<div id="mr-deep-stats" aria-live="polite">${s.e(s.t('loading'))}</div>`, s.t('media.deepStatsOverviewDesc'))}`;
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
    main.querySelector('.mr-loading').outerHTML = `<nav class="mr-breadcrumb"><a data-link href="${s.e(s.link('/media/all'))}">${s.e(s.t('media.allMedia'))}</a><span>›</span><span>${s.e(result.name)}</span></nav><section class="card mr-artist-hero">${leading ? `<div class="mr-artist-image"><img data-mr-image src="${s.e(s.image(leading))}" alt="${s.e(result.name)}"></div>` : ''}<div><span class="badge">${s.e(s.t('artist'))}</span><h1>${s.e(result.name)}</h1></div></section><div class="mr-stats mr-stats-four">${s.stat('albums', s.count(result.albums?.length))}${s.stat('tracks', s.count(stats.tracks))}${s.stat('mediaProfile.viewsTitle', s.count(stats.plays))}${s.stat('listened', s.ms(stats.watchTimeMs))}</div>${s.section('albums', result.albums.length ? `<div class="mr-grid">${result.albums.map((item) => poster(s, item)).join('')}</div>` : s.empty())}${s.section('tracks', `<div class="mr-track-controls"><label>${s.e(s.t('tracksPerPage'))} <select class="form-select" id="mr-tracks-limit"><option value="25" ${result.tracksLimit === 25 ? 'selected' : ''}>25</option><option value="50" ${result.tracksLimit === 50 ? 'selected' : ''}>50</option></select></label></div>${table(s, [['mediaProfile.colTitle'], ['album'], ['duration'], ['mediaProfile.colSessions'], ['mediaProfile.colTotalTime']], result.tracks, (item) => `<tr><td><a data-link href="${s.e(s.mediaLink(item))}">${s.e(item.title)}</a></td><td>${item.parentId ? `<a data-link href="${s.e(s.mediaLink({ id: item.parentId, serverId: item.serverId }))}">${s.e(item.parentTitle || s.t('unknown'))}</a>` : s.e(s.t('unknown'))}</td><td>${s.e(s.ms(item.durationMs))}</td><td>${s.count(item.plays)}</td><td>${s.e(s.ms(item.watchTimeMs))}</td></tr>`)}${pager(s, result.tracksPage, result.tracksPages, 'tracksPage')}`)}`;
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
    main.querySelector('.mr-loading').outerHTML = `<nav class="mr-breadcrumb"><a data-link href="${s.e(s.link('/media/all', { library: item.library }))}">${s.e(item.library || s.t('mediaProfile.library'))}</a>${item.artist ? `<span>›</span><a data-link href="${s.e(s.link(`/media/artist/${encodeURIComponent(item.artist)}`, { servers: item.serverId }))}">${s.e(item.artist)}</a>` : ''}${hierarchy.map((parent) => `<span>›</span><a data-link href="${s.e(s.mediaLink(parent))}">${s.e(parent.title)}</a>`).join('')}<span>›</span><span>${s.e(item.title)}</span></nav><div class="mr-quick-nav">${hierarchy.map((parent) => `<a data-link class="btn btn-secondary btn-sm" href="${s.e(s.mediaLink(parent))}">${s.e(s.type(parent.type))}: ${s.e(parent.title)}</a>`).join('')}${item.artist ? `<a data-link class="btn btn-secondary btn-sm" href="${s.e(s.link(`/media/artist/${encodeURIComponent(item.artist)}`, { servers: item.serverId }))}">${s.e(s.t('artist'))}: ${s.e(item.artist)}</a>` : ''}</div><section class="card mr-media-hero ${music ? 'mr-music-hero' : ''}">${item.hasBackdrop ? `<img class="mr-backdrop" src="${s.e(s.image(item, 'Backdrop', 1440))}" alt="">` : ''}<div class="mr-hero-poster"><img data-mr-image src="${s.e(s.image(item, 'Primary', 480))}" alt="${s.e(item.title)}">${s.ctx.State.user?.isAdmin ? `<button id="mr-rotate" class="btn btn-secondary btn-sm" type="button" title="${s.e(s.t('mediaProfile.posterRotate'))}" aria-label="${s.e(s.t('mediaProfile.posterRotate'))}">${svg('<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3"/>')}</button>` : ''}</div><div class="mr-hero-copy">${item.hasLogo ? `<img class="mr-logo" src="${s.e(s.image(item, 'Logo', 500))}" alt="${s.e(item.title)}">` : `<h1>${s.e(item.title)}</h1>`}<div class="mr-hero-badges"><span class="badge">${s.e(s.type(item.type))}</span>${item.episodeCode ? `<span class="badge">${s.e(item.episodeCode)}</span>` : ''}${item.displayResolution || item.resolution ? `<span class="badge">${s.e(item.displayResolution || item.resolution)}</span>` : ''}${item.versions?.length > 1 ? `<span class="badge">${item.versions.length} ${s.e(s.t('mediaProfile.multiVersionsTitle', { count: item.versions.length }))}</span>` : ''}${item.year ? `<span class="badge">${s.e(item.year)}</span>` : ''}</div>${item.artist ? `<p><a data-link href="${s.e(s.link(`/media/artist/${encodeURIComponent(item.artist)}`, { servers: item.serverId }))}">${s.e(item.artist)}</a></p>` : ''}${item.parentTitle ? `<p>${s.e(item.parentTitle)}</p>` : ''}<div class="mr-genre-links">${(item.genres || []).map((genre) => `<a data-link class="badge" href="${s.e(s.link('/media/all', { genre }))}">${s.e(genre)}</a>`).join('')}</div>${item.overview ? `<p>${s.e(item.overview)}</p>` : ''}<p>${s.e(item.server || '')}${item.durationMs ? ` · ${s.e(s.ms(item.durationMs))}` : ''}${item.sizeBytes ? ` · ${s.e(s.bytes(item.sizeBytes))}` : ''}</p>${(item.directors || []).length ? `<p>${s.e(s.t('directors'))}: ${(item.directors || []).map((name) => `<button type="button" class="mr-person-inline" data-person="${s.e(name)}">${s.e(name)}</button>`).join(', ')}</p>` : ''}${!item.metadataAvailable?.peopleRoles && (item.actors || []).length ? `<p>${s.e(s.t('actors'))}: ${(item.actors || []).map((name) => `<button type="button" class="mr-person-inline" data-person="${s.e(name)}">${s.e(name)}</button>`).join(', ')}</p>` : ''}</div></section>${item.metadataAvailable?.peopleRoles && item.people?.length ? s.section('mediaProfile.cast', `<div class="mr-cast">${(item.people?.length ? item.people : (item.actors || []).map((name) => ({ name }))).map((person) => `<button type="button" class="mr-cast-person" data-person="${s.e(person.name)}">${person.id && person.hasImage ? `<img data-mr-image src="${s.e(s.image({ id: person.id, serverId: item.serverId }, 'Primary', 200))}" loading="lazy" alt="${s.e(person.name)}">` : ''}<strong>${s.e(person.name)}</strong>${person.role ? `<small>${s.e(person.role)}</small>` : ''}</button>`).join('')}</div>`, item.metadataAvailable?.peopleRoles ? s.t('mediaProfile.castDesc') : s.t('sourceLimit')) : ''}${item.versions?.length > 1 ? s.section('mediaProfile.multiVersionsTitle', table(s, [['mediaProfile.colTitle'], ['mediaProfile.colType'], ['media.statsVolume'], ['mediaProfile.colAudio'], ['mediaProfile.colResolution']], item.versions, (row) => `<tr><td>${s.e(row.name)}</td><td>${s.e(row.container)}</td><td>${s.e(s.bytes(row.size))}</td><td>${s.e(row.audio)}</td><td>${s.e(row.video)}</td></tr>`)) : ''}${kids.length ? s.section(childrenTitle, table(s, [['#'], ['mediaProfile.colTitle'], ['mediaProfile.colType'], ['mediaProfile.colResolution'], ['mediaProfile.colSessions'], ['mediaProfile.colTotalTime']], kids, (child, index) => `<tr><td>${index + 1}</td><td><a data-link href="${s.e(s.mediaLink(child))}">${s.e(child.title)}</a></td><td>${s.e(s.type(child.type))}</td><td>${s.e(child.displayResolution || child.resolution || s.t('unknown'))}</td><td>${s.count(child.plays)}</td><td>${s.e(s.ms(child.watchTimeMs))}</td></tr>`)) .replace(/\{count\}/g, String(kids.length)) : ''}<div class="mr-stats ${music ? 'mr-stats-four' : 'mr-stats-three'}">${s.stat('mediaProfile.totalTime', s.ms(item.totalDurationMs))}${s.stat('mediaProfile.viewsTitle', s.count(item.totalPlays))}${s.stat('mediaProfile.avgDuration', s.ms(item.totalPlays ? item.totalDurationMs / item.totalPlays : 0))}${music ? s.stat('mediaProfile.pauses', s.count(item.pauseCount)) : ''}</div>${!music ? s.section('mediaProfile.telemetrySummary', `<div class="mr-telemetry-summary">${telemetryFields.map(([field, title]) => `<div><span>${s.e(s.t(title))}</span><strong>${s.count(item[field])}</strong><meter min="0" max="${Math.max(1, ...telemetryFields.map(([name]) => Number(item[name]) || 0))}" value="${Number(item[field]) || 0}"></meter></div>`).join('')}</div>`, s.t('mediaProfile.telemetryDesc')) : ''}${s.section('mediaProfile.behaviorTitle', behaviors(s, events, item.behavior), s.t('mediaProfile.behaviorDesc'))}<div class="mr-viewer-language-grid">${s.section('mediaProfile.viewers', (item.viewers || []).length ? `<div class="mr-viewers">${item.viewers.map((user) => `<a data-link href="${s.e(s.profileLink(user))}"><strong>${s.e(user.username || s.t('unknown'))}</strong><span>${s.count(user.plays)} ${s.e(s.t('mediaProfile.colSessions'))} · ${s.e(s.ms(user.watchTimeMs))}</span></a>`).join('')}</div>` : s.empty('mediaProfile.noViewers')).replace(/\{count\}/g, String(item.viewers?.length || 0))}${s.section('mediaProfile.audioLanguages', distribution('audioDistribution'))}${!music ? s.section('mediaProfile.subtitlesTitle', distribution('subtitleDistribution')) : ''}</div>${completionSection(s, item)}${s.section('mediaProfile.timelineTitle', `<div class="mr-timeline-controls"><label>${s.e(s.t('mediaProfile.colUser'))}<select id="mr-timeline-user" class="form-select"><option value="">${s.e(s.t('mediaProfile.allUsers'))}</option>${(item.viewers || []).map((user) => `<option value="${s.e(user.userId)}" ${s.query().get('user') === user.userId ? 'selected' : ''}>${s.e(user.username || s.t('unknown'))}</option>`).join('')}</select></label><label>${s.e(s.t('session'))}<select id="mr-timeline-session" class="form-select"><option value="">${s.e(s.t('allSessions'))}</option>${Array.from(new Map([...(item.history || []), ...events.map((event) => ({ id: event.playbackId, username: event.username }))].map((row) => [row.id, row])).values()).map((session) => `<option value="${s.e(session.id)}" ${s.query().get('session') === session.id ? 'selected' : ''}>${s.e(session.username || s.t('unknown'))} · ${s.e(session.startedAt ? s.date(session.startedAt) : session.id.slice(0, 12))}</option>`).join('')}</select></label></div>${Number(item.telemetryTotal) > events.length ? `<p class="mr-notice">${s.e(s.t('telemetryLimit', { shown: events.length, total: item.telemetryTotal }))}</p>` : ''}${timeline(s, item)}`)}${(item.counterTimeline || []).length ? s.section('mediaProfile.telemetryTimeline', '<div class="mr-chart"><canvas id="mr-counters"></canvas></div>', s.t(music ? 'mediaProfile.telemetryTimelineMusicDesc' : 'mediaProfile.telemetryTimelineVideoDesc')) : ''}${s.section('mediaProfile.detailedHistory', table(s, [['mediaProfile.colUser'], ['mediaProfile.colDate'], ['mediaProfile.colMethod', 'mr-md'], ['mediaProfile.colAudio'], ...(!music ? [['mediaProfile.colSubtitles', 'mr-lg']] : []), ['mediaProfile.colPauses', 'mr-md'], ['mediaProfile.colJumps', 'mr-lg'], ['mediaProfile.colReplays', 'mr-xl'], ['mediaProfile.colMaxSpeed', 'mr-xl'], ['mediaProfile.colDuration']], item.history || [], (session) => `<tr><td><a data-link href="${s.e(s.profileLink(session))}">${s.e(session.username || s.t('unknown'))}</a></td><td><button type="button" class="mr-person-inline" data-session-detail="${s.e(session.id)}">${s.e(s.date(session.startedAt))}</button></td><td class="mr-md">${s.e(session.playMethod)}</td><td>${s.e(session.audioLanguage || s.t('unknown'))}${session.audioCodec ? ` (${s.e(session.audioCodec)})` : ''}</td>${!music ? `<td class="mr-lg">${s.e(session.subtitleLanguage || s.t('mediaProfile.none'))}</td>` : ''}<td class="mr-md">${s.count(session.pauseCount)}</td><td class="mr-lg">${s.count(session.seekCount)}</td><td class="mr-xl">${s.count(session.rewatchCount)}</td><td class="mr-xl">${session.maxPlaybackRate ? `${s.e(session.maxPlaybackRate)}×` : '—'}</td><td>${s.e(s.ms(session.durationMs))}</td></tr>`)+pager(s, item.historyPage, item.historyPages, 'historyPage'))}`;
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
