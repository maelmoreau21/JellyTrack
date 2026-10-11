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
    library: svg('<path d="M4 6v14M8 6v14M12 6v14m4-16 5 14"/>'),
    info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
    package: svg('<path d="m7 4 10 6M3 7l9 5 9-5M12 12v10"/><path d="m3 7 9-5 9 5v10l-9 5-9-5V7Z"/>'),
    calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    fileVideo: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6"/><path d="m10 12 5 3-5 3v-6Z"/>'),
    database: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>'),
    drive: svg('<path d="M5 4h14l3 11H2L5 4Z"/><rect x="2" y="15" width="20" height="6" rx="2"/><path d="M17 18h.01M13 18h.01"/>'),
    Book: svg('<path d="M4 3h13a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V3Zm0 14h15"/>'),
    all: svg('<path d="M4 3h16l-6 9v7l-4 2v-9L4 3Z"/>'),
    search: svg('<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>'),
    recent: svg('<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>'),
    video: svg('<path d="m16 8 6-4v16l-6-4"/><rect x="2" y="6" width="14" height="12" rx="2"/>'),
    trendingUp: svg('<path d="m22 7-8.5 8.5-5-5L2 17M16 7h6v6"/>'),
    chevron: svg('<path d="m9 18 6-6-6-6"/>'),
    arrowLeft: svg('<path d="m12 19-7-7 7-7M5 12h14"/>'),
    activity: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    headphones: svg('<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="13" width="4" height="8" rx="2"/><rect x="17" y="13" width="4" height="8" rx="2"/>'),
    languages: svg('<path d="m5 8 6 6m-7 0 6-6 2-5M2 5h12M7 2h1m6 20 4-10 4 10m-6-4h4"/>'),
    fastForward: svg('<path d="m13 19 9-7-9-7v14ZM2 19l9-7-9-7v14Z"/>'),
    gauge: svg('<path d="M12 14l4-4M20.3 18a9 9 0 1 0-16.6 0Z"/>'),
    rotateCcw: svg('<path d="M3 11a9 9 0 1 1 2.7 6.7M3 3v8h8"/>'),
    pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
    flame: svg('<path d="M8.5 14.5A6 6 0 0 1 12 3c0 5 6 5 6 11a6 6 0 0 1-12 0c0-2 1-3 2-4 0 2 .5 3 2.5 4.5Z"/>'),
    lightbulb: svg('<path d="M9 18h6M9 22h6M9 14a6 6 0 1 1 6 0v4H9v-4Z"/>'),
    layers: svg('<path d="m12 3 10 6-10 6L2 9l10-6Zm-10 12 10 6 10-6M2 12l10 6 10-6"/>'),
    listMusic: svg('<path d="M4 6h12M4 11h12M4 16h5M19 10v10M19 10l3-1"/><circle cx="16" cy="20" r="3"/>'),
  };
  const sectionIcons = { 'mediaProfile.telemetrySummary': 'activity', 'mediaProfile.behaviorTitle': 'activity', 'mediaProfile.audioLanguages': 'headphones', 'mediaProfile.subtitlesTitle': 'languages', 'mediaProfile.timelineTitle': 'activity', 'mediaProfile.seasons': 'Movie', 'mediaProfile.episodes': 'play', 'mediaProfile.tracks': 'listMusic', 'mediaProfile.multiVersionsTitle': 'layers', 'mediaProfile.cast': 'person' };
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
    languageSegments: ['Périodes de langue', 'Language periods'], from: ['De', 'From'], to: ['À', 'To'], metadataUnavailable: ['Métadonnées Jellyfin indisponibles', 'Jellyfin metadata unavailable'], eventPositionsByUser: ['Positions des événements par utilisateur', 'Event positions by user'], exploreEvents: ['Explorer les événements (détails et filtres avancés)', 'Explore events (details and advanced filters)'],
    bingeTracker: ['Binge-Watching Tracker (Marathons de Séries)', 'Binge-Watching Tracker (Series Marathons)'], bingeTrackerDesc: ['Détection automatique des séries dévorées d’une traite (sessions de 3 épisodes consécutifs ou plus).', 'Automatic detection of series watched in one sitting (3 or more consecutive episodes).'],
    last30Days: ['30 derniers jours', 'Last 30 days'], bingeTop: ['Série N°1 des marathons', 'Top marathon series'], bingeRecorded: ['{count} marathons enregistrés', '{count} recorded marathons'], bingeIntensity: ['Intensité moyenne', 'Average intensity'], bingeEpisodes: ['épisodes / session', 'episodes / session'], bingeStreak: ['Record : {count} épisodes d’affilée', 'Record: {count} episodes in a row'], bingeGlobal: ['Marathons globaux (30j)', 'Global marathons (30 days)'], bingeSessions: ['sessions', 'sessions'], bingeTopViewer: ['Top binger : {name}', 'Top binger: {name}'],
    bingeEmpty: ['Aucun marathon détecté sur les 30 derniers jours (minimum 3 épisodes consécutifs).', 'No marathon detected in the last 30 days (minimum 3 consecutive episodes).'], bingeRanking: ['Classement des séries les plus marathonées', 'Most marathoned series'], bingeRow: ['Moy. {average} épisodes • Max {max}', 'Avg. {average} episodes • Max {max}'],
    smartTitle: ['Suggestions d’Acquisitions & Tendances (Smart Insights)', 'Acquisition Suggestions & Trends (Smart Insights)'], smartDesc: ['Recommandations basées sur les genres, réalisateurs et acteurs les plus consommés pour optimiser vos ajouts dans la bibliothèque.', 'Recommendations based on the most consumed genres, directors and actors to guide library additions.'], smartBadge: ['IA JellyTrack', 'JellyTrack AI'], interest: ['Indice d’intérêt', 'Interest index'], dominantGenres: ['Genres dominants en temps de visionnage', 'Dominant genres by viewing time'],
  };
  const activeCharts = new Set();
  const chartObservers = new Set();
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
    const section = (key, body, desc = '', attrs = '') => `<section class="card mr-section" ${attrs}><div class="mr-section-heading"><h2>${icons[sectionIcons[key]] || ''}${e(t(key))}</h2>${desc ? `<p>${e(desc)}</p>` : ''}</div>${body}</section>`;
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
      if (!img.closest('.mr-poster-image,.mr-hero-poster,.mr-artist-image,.mr-cast-person,.mr-child-image,.mr-library-preview-image')) { unavailable.classList.add('mr-image-inline'); unavailable.style.width = `${img.width || 40}px`; unavailable.style.height = `${img.height || 60}px`; }
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
  function catalogueGenres(s, rows) {
    const id = 'mr-catalogue-genres';
    if (!rows.length) { s.ctx.ChartHelper.showEmpty(id, s.t('charts.noGenreData', {}, s.t('common.noData'))); return; }
    const canvas = document.getElementById(id); if (!canvas || !window.Chart) return;
    activeCharts.add(id); s.ctx.ChartHelper.destroy(id);
    const colors = () => document.documentElement.classList.contains('dark') ? ['#22D3EE', '#A78BFA', '#F472B6', '#34D399', '#60A5FA', '#FBBF24', '#FB7185', '#38BDF8'] : ['#0891B2', '#7C3AED', '#DB2777', '#059669', '#2563EB', '#D97706', '#E11D48', '#0284C7'];
    const theme = s.ctx.ChartHelper.getThemeColors();
    const chart = new window.Chart(canvas, { type: 'bar', data: { labels: rows.map(row => row.name), datasets: [{ label: s.t('media.totalMedia'), data: rows.map(row => Number(row.count || 0)), backgroundColor: rows.map((_, index) => colors()[index % 8]), barThickness: 20, borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: 'start' }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { top: 0, right: 30, left: 40, bottom: 0 } }, plugins: { legend: { display: false }, tooltip: { backgroundColor: theme.tooltipBg, titleColor: theme.tooltipTitle, bodyColor: theme.tooltipText, borderColor: theme.tooltipBorder, borderWidth: 1, padding: 10, displayColors: false } }, scales: { x: { beginAtZero: true, border: { display: false, dash: [3, 3] }, grid: { color: theme.grid, drawTicks: false }, ticks: { color: theme.text, font: { size: 10 }, precision: 0 } }, y: { border: { display: false }, grid: { display: false, drawTicks: false }, ticks: { color: theme.text, font: { size: 10 } } } }, onClick: (_event, elements) => { if (elements.length) s.ctx.Router.navigate(s.link('/media/all', { genre: rows[elements[0].index].name })); } } });
    s.ctx.ChartHelper.instances[id] = chart;
    const observer = new MutationObserver(() => { if (s.ctx.ChartHelper.instances[id] !== chart) return; const tc = s.ctx.ChartHelper.getThemeColors(); chart.data.datasets[0].backgroundColor = rows.map((_, index) => colors()[index % 8]); chart.options.scales.x.ticks.color = tc.text; chart.options.scales.y.ticks.color = tc.text; chart.options.scales.x.grid.color = tc.grid; chart.options.plugins.tooltip.backgroundColor = tc.tooltipBg; chart.options.plugins.tooltip.titleColor = tc.tooltipTitle; chart.options.plugins.tooltip.bodyColor = tc.tooltipText; chart.options.plugins.tooltip.borderColor = tc.tooltipBorder; chart.update('none'); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); chartObservers.add(observer);
  }

  async function catalogue(s, main, path, version) {
    const recent = path === '/recent'; const params = s.query();
    main.innerHTML = `${recent ? '' : nav(s, 'media')}${header(s, recent ? 'recent.title' : 'media.allMedia', recent ? 0 : null, recent ? icons.recent : '')}<div id="mr-catalogue-controls"></div><div id="mr-list" class="mr-grid ${recent ? 'mr-recent-grid' : ''}"><div class="skeleton mr-grid-loading" aria-label="${s.e(s.t('loading'))}"></div></div><div id="mr-pagination"></div>`;
    const excluded = (params.get('excludeTypes') || '').split(',').filter(Boolean);
    const categories = [['all', 'common.all'], ['Movie', 'common.movies'], ['Series', 'common.series'], ['MusicAlbum', 'common.music'], ...(recent ? [['Book', 'books']] : [])];
    const categoryTypes = recent ? { Movie: ['Movie'], Series: ['Series', 'Season', 'Episode'], MusicAlbum: ['MusicAlbum', 'Audio', 'Track', 'MusicTrack'], Book: ['Book', 'AudioBook'] } : { Movie: ['Movie'], Series: ['Series'], MusicAlbum: ['MusicAlbum'] };
    const excludedCategories = categories.filter(([id]) => id !== 'all' && categoryTypes[id].every(type => excluded.includes(type))).map(([id]) => id);
    const selectedCategory = params.get('type') ? Object.keys(categoryTypes).find(id => categoryTypes[id].includes(params.get('type')) || id === 'MusicAlbum' && params.get('type') === 'music' || id === 'Book' && params.get('type').toLowerCase() === 'book') : '';
    const categoryActive = id => recent ? id === 'all' ? !excluded.length && !params.get('type') : selectedCategory ? selectedCategory === id : !excludedCategories.includes(id) : id === 'all' ? !excluded.length && !extras : !extras && !excluded.includes(id);
    const extras = params.get('types') === 'all' || params.get('type');
    main.querySelector('#mr-catalogue-controls').innerHTML = `<div class="mr-control-row"><div class="segmented-control mr-categories ${recent ? 'mr-recent-categories' : ''}">${categories.map(([id, key]) => `<button type="button" data-category="${id}" class="segment-btn ${categoryActive(id) ? 'active' : ''}" aria-pressed="${categoryActive(id)}" title="${s.e(s.t(key))}">${icons[id === 'MusicAlbum' ? 'music' : id]}<span>${s.e(s.t(key))}</span></button>`).join('')}</div>${!recent ? `<div class="mr-search">${icons.search}<input type="search" id="mr-search" value="${s.e(params.get('q') || '')}" placeholder="${s.e(s.t('search'))}" aria-label="${s.e(s.t('search'))}"><button type="button" id="mr-search-clear" aria-label="${s.e(s.t('clear'))}" ${params.get('q') ? '' : 'hidden'}>✕</button></div>` : ''}</div><div class="mr-secondary-controls">${!recent ? `<label>${s.e(s.t('media.sortBy'))} <select id="mr-sort" class="form-select">${[['plays', 'media.sortPopularity'], ['watchTime', 'media.sortWatchTime'], ['quality', 'quality'], ['title', 'title'], ['added', 'added'], ['recent', 'played'], ['duration', 'media.sortWatchTime'], ['runtime', 'duration'], ['resolution', 'quality']].map(([v, key]) => `<option value="${v}" ${v === (params.get('sortBy') || params.get('sort') || 'plays') ? 'selected' : ''}>${s.e(s.t(key))}</option>`).join('')}</select></label>` : ''}${!recent ? `<details class="mr-extra-filters" ${extras ? 'open' : ''}><summary>${s.e(s.t('extras'))}</summary><select class="form-select" id="mr-extra-types" aria-label="${s.e(s.t('extras'))}"><option value="" ${!extras ? 'selected' : ''}>${s.e(s.t('parents'))}</option><option value="all" ${params.get('types') === 'all' ? 'selected' : ''}>${s.e(s.t('allTypes'))}</option>${['Book', 'AudioBook', 'Episode', 'Audio', 'Season'].map((kind) => `<option value="${kind}" ${params.get('type') === kind ? 'selected' : ''}>${s.e(s.type(kind))}</option>`).join('')}</select></details>` : ''}${['genre', 'resolution', 'library', 'artist'].filter((key) => params.get(key)).map((key) => `<button class="badge mr-filter-chip" type="button" data-remove-filter="${key}">${s.e(params.get(key))} ✕</button>`).join('')}</div>`;
    const navigate = (updates) => s.ctx.Router.navigate(s.link(path, { ...updates, page: '' }, true));
    main.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.category; let next = (recent ? excludedCategories : excluded).slice();
      if (id === 'all') next = [];
      else if (!next.length || selectedCategory) next = categories.filter(([key]) => key !== 'all' && key !== id).map(([key]) => key);
      else if (next.includes(id)) next = next.filter(key => key !== id);
      else next.push(id);
      if (next.length >= categories.length - 1) next = [];
      navigate({ excludeTypes: (recent ? next.flatMap(key => categoryTypes[key]) : next).join(','), type: '', types: '' });
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
    main.querySelector('#mr-extra-types')?.addEventListener('change', (event) => navigate({ types: event.target.value === 'all' ? 'all' : '', type: event.target.value === 'all' ? '' : event.target.value, excludeTypes: '' }));
    main.querySelectorAll('[data-remove-filter]').forEach((button) => button.addEventListener('click', () => navigate({ [button.dataset.removeFilter]: '' })));
    const api = new URLSearchParams(params); api.set('limit', recent ? 40 : 50); api.set('parents', recent || extras ? 'false' : 'true'); api.set('sortBy', recent ? 'added' : params.get('sortBy') || params.get('sort') || 'plays');
    const result = await s.ctx.API.getJSON(`/api/media?${api}`); if (version !== generation) return;
    if (main.querySelector('#mr-total')) main.querySelector('#mr-total').textContent = `${s.count(result.total)} ${s.t('recent.mediaCount')}`;
    main.querySelector('#mr-list').innerHTML = result.items.length ? result.items.map((m) => poster(s, m, recent, result.showLibraryMediaBadges)).join('') : `<div class="mr-grid-empty"><h2>${s.e(s.t('recent.noMedia'))}</h2><p>${s.e(s.t(recent ? 'recent.noMediaDesc' : 'noResults'))}</p></div>`;
    const current = Math.floor(result.offset / result.limit) + 1; const pages = Math.max(1, Math.ceil(result.total / result.limit));
    main.querySelector('#mr-pagination').innerHTML = pages > 1 ? pager(s, current, pages) : ''; bindPager(s, main); wireImages(s, main);
    serverFilter(s, main, version);
  }

  async function collections(s, main, version) {
    main.innerHTML = `${nav(s, 'collections')}<div class="mr-collections-page">${header(s, 'media.libraryCollections')}<div class="skeleton mr-loading" aria-label="${s.e(s.t('loading'))}"></div></div>`;
    const result = await s.ctx.API.getJSON(`/api/media/collections?${s.query()}`); if (version !== generation) return;
    const data = result.collections || []; const totals = result.totals || {};
    const librarySize = (value) => { const n = Number(value || 0); return n >= 1024 ** 4 ? `${(n / 1024 ** 4).toFixed(2)} To` : `${(n / 1024 ** 3).toFixed(1)} Go`; };
    const libraryDuration = (value) => `${Math.floor(Number(value || 0) / 86400000)}${s.ctx.State.locale === 'en' ? 'd' : 'j'} ${Math.floor(Number(value || 0) % 86400000 / 3600000)}h`;

    const content = ['Movie', 'Series', 'MusicAlbum', 'Book'].map((kind) => ({ kind, count: data.reduce((sum, item) => sum + (item.types || []).filter((row) => row.type === kind || kind === 'Book' && row.type === 'AudioBook').reduce((n, row) => n + Number(row.count || 0), 0), 0) })).filter((row) => row.count > 0);
    const contentLabel = content.map((row) => `<span class="mr-content-${row.kind}">${s.count(row.count)} ${s.e(s.t(({ Movie: 'movies', Series: 'series', MusicAlbum: 'music', Book: 'books', AudioBook: 'books' })[row.kind]).toLocaleLowerCase(s.ctx.State.locale))}</span>`).join('<span>, </span>');
    const days = Math.floor(Number(totals.durationMs || 0) / 86400000); const hours = Math.floor(Number(totals.durationMs || 0) % 86400000 / 3600000);
    const collectionStat = (label, value, description, icon, content = false) => `<div class="card mr-stat"><header><span>${icons[icon]}${s.e(s.t(label))}</span></header><div class="mr-collection-stat-content"><strong${content ? ' class="mr-content-total"' : ''}>${value}</strong><p>${icons.info}${s.e(s.t(description))}</p></div></div>`;
    main.querySelector('.mr-loading').outerHTML = `<div class="mr-stats mr-collections-stats">${collectionStat('media.statsVolume', s.e(librarySize(totals.sizeBytes)), 'media.statsVolumeDesc', 'drive')}${collectionStat('media.statsContent', contentLabel || s.count(totals.items), 'media.statsContentDesc', 'library', true)}${collectionStat('media.statsTime', `${days}${s.ctx.State.locale === 'en' ? 'd' : 'j'} ${hours}h`, 'media.statsTimeDesc', 'clock')}</div><div class="mr-library-heading"><div><h2>${icons.database}${s.e(s.t('media.libraryDetailsTitle'))}</h2><p>${s.count(data.length)} ${s.e(s.t('media.libraries'))} total</p></div><div class="mr-library-search">${icons.search}<input id="mr-library-search" class="form-input" type="search" placeholder="${s.e(s.t('media.searchLibrary'))}" aria-label="${s.e(s.t('media.searchLibrary'))}"></div></div><div id="mr-collections" class="mr-collection-grid"></div>`;
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

        const preview = (key, title) => {
          const media = item[key], glyph = key === 'topItem' ? icons.trendingUp : icons.recent;
          return `<div class="mr-library-preview ${media ? '' : 'mr-library-preview-empty'}">${media ? `<a data-link href="${s.e(s.mediaLink(media))}"><span class="mr-library-preview-image ${key === 'topItem' && media.type === 'Episode' ? 'mr-preview-wide' : ''}"><img data-mr-image data-mr-fallback="${['Audio','Track','MusicAlbum'].includes(media.type) ? 'music' : 'Movie'}" src="${s.e(s.image(media, 'Primary', 120))}" alt="${s.e(media.title)}" loading="lazy"></span><div><h3>${glyph}${s.e(s.t(title))}</h3><strong>${s.e(media.title)}</strong><small>${key === 'topItem' ? `${s.count(media.plays)} ${s.e(s.t('recent.viewsCount'))}` : `${icons.calendar}${s.e(media.dateAdded ? new Date(media.dateAdded).toLocaleDateString(s.ctx.State.locale) : '—')}`}</small></div></a>` : `<span class="mr-library-preview-image">${glyph}</span><p>${s.e(s.t(key === 'topItem' ? 'media.noPlays' : 'media.noContentAdded'))}</p>`}</div>`;
        };
        const scopes = (item.scopes || []).map(({ serverId, name: rawName }) => ({ serverId, name: rawName }));
        const servers = [...new Set(scopes.map((scope) => scope.serverId))].join(',');
        return `<article class="card mr-library-card mr-library-${icon}"><div class="mr-library-title">${icons[({Movie:'fileVideo',MusicAlbum:'music'})[icon] || icon] || icons.library}<div><h3><a data-link href="${s.e(s.link('/media/all', { libraryScopes: JSON.stringify(scopes), servers }))}">${s.e(name)}</a></h3>${name !== item.name ? `<small class="badge">${s.e(item.name)}</small>` : ''}</div><span class="badge">${s.e(librarySize(item.sizeBytes))}</span></div><div class="mr-library-card-content"><div class="mr-library-counts"><span>${icons.package}${s.e(countsLabel)}</span><span>${icons.clock}${s.e(libraryDuration(item.durationMs))}</span></div>${item.ignoredCounts?.length ? `<div class="mr-library-child-counts">${['Episode', 'Audio', 'Track'].map((kind) => ({ kind, count: item.ignoredCounts.filter((row) => row.type === kind).reduce((n, row) => n + Number(row.count || 0), 0) })).filter((row) => row.count).map((row) => `<span>${row.kind === 'Episode' ? icons.fileVideo : icons.music}${s.count(row.count)} ${s.e(s.type(row.kind).toLocaleLowerCase(s.ctx.State.locale))}</span>`).join('')}</div>` : ''}<div class="mr-library-previews">${preview('topItem', 'media.topContent')}${preview('lastAdded', 'media.lastAdded')}</div></div></article>`;
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
      holder.innerHTML = result.items.length ? `<div class="mr-search-results">${result.items.map((item) => `<a data-link href="${s.e(s.mediaLink(item))}"><img data-mr-image src="${s.e(s.image(item, 'Primary', 100))}" alt="${s.e(item.title)}"><span>${s.e(item.title)}<small>${s.e(item.type)}</small></span></a>`).join('')}</div>` : s.empty(); wireImages(s, holder);
    } catch (error) { if (holder.isConnected && error.name !== 'AbortError') holder.textContent = `${s.t('error')}: ${error.message}`; }
  }

  function analysisHighlights(s, bingeStats, taste) {
    const rows = bingeStats?.allBingedSeries || []; const leader = rows[0];
    const number = (value) => Number(value || 0).toLocaleString(s.ctx.State.locale, { maximumFractionDigits: 1 });
    const card = (kind, title, description, badge, content) => `<section class="card mr-section mr-insight-card mr-insight-${kind}"><header><div><h2>${icons[kind === 'binge' ? 'flame' : 'lightbulb']}${s.e(s.t(title))}</h2><p>${s.e(s.t(description))}</p></div><span class="badge">${s.e(s.t(badge))}</span></header>${content}</section>`;
    const highlights = leader ? `<div class="mr-binge-summary"><div><span>${s.e(s.t('bingeTop'))}</span><strong><a data-link href="${s.e(s.link(`/media/${encodeURIComponent(leader.seriesId)}`))}">${s.e(leader.seriesTitle)}</a></strong><small>${s.e(s.t('bingeRecorded', { count: s.count(leader.totalBingeSessions) }))}</small></div><div><span>${s.e(s.t('bingeIntensity'))}</span><strong>${number(leader.avgEpisodesPerSession)} <em>${s.e(s.t('bingeEpisodes'))}</em></strong><small>${s.e(s.t('bingeStreak', { count: s.count(leader.maxEpisodesInSingleRun) }))}</small></div><div><span>${s.e(s.t('bingeGlobal'))}</span><strong>${s.count(bingeStats.totalBingeSessionsMonth)} <em>${s.e(s.t('bingeSessions'))}</em></strong><small>${s.e(s.t('bingeTopViewer', { name: leader.topBingerUsername || s.t('unknown') }))}</small></div></div>` : `<div class="mr-empty mr-binge-empty">${s.e(s.t('bingeEmpty'))}</div>`;
    const ranking = rows.length ? `<h3 class="mr-insight-subtitle">${s.e(s.t('bingeRanking'))}</h3><div class="mr-binge-ranking">${rows.slice(0, 4).map((row, index) => `<article><span class="mr-binge-rank">#${index + 1}</span><div><a data-link href="${s.e(s.link(`/media/${encodeURIComponent(row.seriesId)}`))}">${s.e(row.seriesTitle)}</a><small>${s.e(s.t('bingeRow', { average: number(row.avgEpisodesPerSession), max: s.count(row.maxEpisodesInSingleRun) }))}</small></div><aside><strong>${number(row.totalHoursBunged)}h</strong><small>${s.count(row.totalBingeSessions)} ${s.e(s.t('bingeSessions'))}</small></aside></article>`).join('')}</div>` : '';
    const recommendations = `<div class="mr-smart-recommendations">${(taste.acquisitionSuggestions || []).map((row) => `<article class="mr-suggestion"><div><span>${s.e(row.category || '')}</span><span class="badge">${s.e(row.badge || s.t('demand'))}</span></div><h3><a data-link href="${s.e(s.link('/media/all', row.kind === 'genre' ? { genre: row.name } : { artist: row.name }))}">${s.e(row.title || s.t(row.kind === 'genre' ? 'acquireGenre' : 'acquireArtist', { name: row.name }))}</a></h3><p>${s.e(row.reason || s.t('demandReason', { hours: number(row.hours), plays: s.count(row.plays) }))}</p><footer><span>${s.e(s.t('interest'))}</span><strong>${row.scorePercent == null ? '—' : `${Math.round(row.scorePercent)}%`}</strong></footer></article>`).join('') || s.empty('media.noPlays')}</div>`;
    const genres = (taste.topGenres || []).length ? `<h3 class="mr-insight-subtitle">${s.e(s.t('dominantGenres'))}</h3><div class="mr-smart-genres">${taste.topGenres.slice(0, 4).map((row) => `<div><a data-link href="${s.e(s.link('/media/all', { genre: row.name }))}">${s.e(row.name)}</a><span>${number(row.hours ?? row.totalHours)}h (${number(row.percentage)}%)</span><div class="mr-smart-genre-track"><i style="width:${Math.min(100, Math.max(4, Number(row.percentage) || 0))}%"></i></div></div>`).join('')}</div>` : '';
    return card('binge', 'bingeTracker', 'bingeTrackerDesc', 'last30Days', highlights + ranking) + card('smart', 'smartTitle', 'smartDesc', 'smartBadge', recommendations + genres);
  }
  async function analysis(s, main, version) {
    main.innerHTML = `${nav(s, 'analysis')}${header(s, 'media.deepAnalysisTitle')}<div class="skeleton mr-loading"></div>`;
    const result = await s.ctx.API.getJSON(`/api/media/analysis?${s.query()}`); if (version !== generation) return;
    const quality = ['4K', '1440p', '1080p', '720p', 'SD'].map((name) => ({ name, count: (result.quality || []).find((item) => item.name === name)?.count || 0 }));
    const taste = result.taste || {};
    main.querySelector('.mr-loading').outerHTML = `<div class="mr-analysis-overview"><section class="card mr-section mr-analysis-content"><div class="mr-section-heading"><h2>${s.e(s.t('media.statsContent'))}</h2><p>${s.e(s.t('media.statsContentDesc'))}</p></div><div class="mr-analysis-subcards">${[['media.totalMedia', s.count(result.totalMedia), 'media.totalMediaDesc'], ['media.uniqueGenres', s.count(result.uniqueGenres), ''], ['media.avgDuration', s.ms(Math.round(result.averageDurationMs / 60000) * 60000), 'media.avgDurationDesc']].map(([label, value, desc]) => `<div class="mr-analysis-subcard"><span>${s.e(s.t(label))}</span><strong>${s.e(value)}</strong>${desc ? `<small>${s.e(s.t(desc))}</small>` : ''}</div>`).join('')}</div></section>${s.section('media.videoQuality', `<div class="mr-quality-list">${quality.map((row) => `<a data-link href="${s.e(s.link('/media/all', { resolution: row.name }))}"><span class="mr-quality-${row.name}">${s.e(({'4K': s.t('media.4kLabel', {}, '4K UHD'), '1440p': '1440p QHD', '1080p': '1080p FHD', '720p': '720p HD', 'SD': s.t('media.standardOther')})[row.name] || row.name)}</span><strong>${s.count(row.count)}</strong></a>`).join('')}</div>`, s.t('media.videoQualityDesc'))}${s.section('media.libraryCollections', (result.libraries || []).slice(0, 6).map((row) => `<a data-link class="mr-list-row" href="${s.e(s.link('/media/all', { library: row.name }))}"><span>${s.e(row.name)}</span><strong>${s.count(row.count)}</strong></a>`).join('') || s.empty(), s.t('media.statsContentDesc'))}</div>${s.section('media.genreDiversity', '<div class="mr-chart mr-genre-chart"><div class="mr-genre-canvas"><canvas id="mr-catalogue-genres"></canvas></div></div>', s.t('media.genreDiversityDesc'))}${analysisHighlights(s, result.binge, taste)}${s.section('media.deepStatsOverview', `<div id="mr-deep-stats" aria-live="polite">${s.e(s.t('loading'))}</div>`, s.t('media.deepStatsOverviewDesc'))}`;
    catalogueGenres(s, (result.genres || []).slice(0, 10));
    serverFilter(s, main, version);
    try {
      const deepParams = s.query(); deepParams.set('catalogue', 'true');
      const deep = await s.ctx.API.getJSON(`/api/stats/deep?${deepParams}`); if (version !== generation) return;
      const data = deep.deep || deep.insights || deep;
      main.querySelector('#mr-deep-stats').innerHTML = `<div class="mr-deep-grid">${[['topDirectors', 'video', 'directors'], ['topActors', 'person', 'actors'], ['topStudios', 'studios', 'studios']].map(([key, icon, kind]) => `<section class="card mr-deep-card mr-deep-${kind}"><header><div><span class="mr-deep-icon">${icons[icon]}</span><h2>${s.e(s.t('deepInsights.' + key))}</h2></div><span class="mr-deep-trending">${icons.trendingUp}</span></header><div>${(data[key] || []).map((row, index) => `<button type="button" class="mr-person-button mr-deep-row" data-person="${s.e(row.name)}"><span class="mr-deep-rank">${index + 1}</span><span class="mr-deep-copy"><strong>${s.e(row.name)}</strong><small><b>${s.count(row.count)}</b> ${s.e(s.t('deepInsights.' + key))}</small></span>${icons.chevron}</button>`).join('') || s.empty()}</div></section>`).join('')}</div>`;
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
      return `<div class="mr-behavior-grid"><div><h3>${icons.fastForward}${s.e(s.t('mediaProfile.skippedRewatchedTitle'))}</h3>${rows(aggregated.ranges, true)}</div><div><h3>${icons.gauge}${s.e(s.t('mediaProfile.speedDistribution'))}</h3>${rows(aggregated.speeds)}</div><div><h3>${icons.rotateCcw}${s.e(s.t('mediaProfile.audioSubtitleSwitches'))}</h3>${rows(aggregated.switches)}</div><div><h3>${s.e(s.t('mediaProfile.languageSegments'))}</h3>${rows(aggregated.languageSegments)}</div></div>`;
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
    return `<div class="mr-behavior-grid"><div><h3>${icons.fastForward}${s.e(s.t('mediaProfile.skippedRewatchedTitle'))}</h3>${rows(Array.from(ranges.values()).sort((a, b) => b.count - a.count).slice(0, 12).map((row) => ({ label: `${s.t(`mediaProfile.timeline.label.${row.type}`)} · ${row.label} · ${s.t('mediaProfile.rangeSessions', { count: row.sessions.size })}`, count: row.count })))}</div><div><h3>${icons.gauge}${s.e(s.t('mediaProfile.speedDistribution'))}</h3>${rows(Array.from(speeds, ([label, count]) => ({ label, count })))}</div><div><h3>${icons.rotateCcw}${s.e(s.t('mediaProfile.audioSubtitleSwitches'))}</h3>${rows(Array.from(languages, ([label, count]) => ({ label, count })))}</div></div>`;
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
  const historicalEventTypes = ['stop', 'download', 'pause', 'seek', 'replay', 'speed_change', 'audio_change', 'subtitle_change'];
  const historicalEventColors = { stop: '#ef4444', pause: '#eab308', seek: '#f97316', replay: '#22c55e', speed_change: '#3b82f6', download: '#8b5cf6', audio_change: '#a855f7', subtitle_change: '#06b6d4' };
  const historicalEventTokens = { stop: 'Stop', download: 'DL', pause: 'Pause', seek: 'Skip', replay: 'Replay', speed_change: 'Vitesse', audio_change: 'Audio', subtitle_change: 'Sous-titres' };
  function timelineClock(value) {
    const seconds = Math.floor(Number(value || 0) / 1000); const hours = Math.floor(seconds / 3600); const minutes = Math.floor(seconds % 3600 / 60); const rest = String(seconds % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  }
  function timelineEventDetail(event) {
    let md; try { md = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata; } catch { return ''; }
    if (!md || typeof md !== 'object' || Array.isArray(md)) return '';
    if (['seek', 'replay'].includes(event.eventType) && Number.isFinite(Number(md.fromMs)) && Number.isFinite(Number(md.toMs))) return `${md.fromLabel || timelineClock(md.fromMs)} -> ${md.toLabel || timelineClock(md.toMs)}`;
    const rate = value => value != null && Number.isFinite(Number(String(value).replace(/^x/i, ''))) ? `x${parseFloat(Number(String(value).replace(/^x/i, '')).toFixed(2))}` : '';
    if (event.eventType === 'speed_change') { const from = md.fromRateLabel || rate(md.fromRate), to = md.toRateLabel || rate(md.toRate); return from && to ? `${from} -> ${to}` : to; }
    const label = side => side && typeof side === 'object' ? `${side.language || (side.index != null ? '#' + side.index : '')}${side.codec ? ' (' + side.codec + ')' : ''}` : String(side || '-');
    return md.from != null && md.to != null ? `${label(md.from)} -> ${label(md.to)}` : '';
  }
  function historicalTimeline(s, item) {
    return `<div class="mr-historical-timeline" aria-label="${s.e(s.t('mediaProfile.timelineTitle'))}"></div>`;
  }
  function bindHistoricalTimeline(s, main, item) {
    const holder = main.querySelector('.mr-historical-timeline'); if (!holder) return;
    const duration = Number(item.durationMs || 0);
    const events = (item.telemetry || []).filter(event => historicalEventTypes.includes(event.eventType) && event.positionMs != null && Number.isFinite(Number(event.positionMs)) && Number(event.positionMs) >= 0);
    if (!(duration > 0) || !events.length) { holder.innerHTML = s.empty('mediaProfile.noDataSmall'); return; }
    const active = new Set(historicalEventTypes); const sessionRows = new Map((item.history || []).map(row => [row.id, row])); const sessions = new Map();
    events.forEach(event => { const session = sessions.get(event.playbackId) || { id: event.playbackId, ...sessionRows.get(event.playbackId), userId: event.userId || sessionRows.get(event.playbackId)?.userId || event.username, username: event.username, events: [] }; session.events.push(event); sessions.set(event.playbackId, session); });
    const users = new Map(Array.from(sessions.values(), row => [row.userId, row.username])); let selectedUser = 'all';
    const eventName = type => historicalEventTokens[type] + ' ' + s.t(`mediaProfile.timeline_${type}`, {}, type);
    const eventTip = event => `${eventName(event.eventType)}${timelineEventDetail(event) ? '\n' + timelineEventDetail(event) : ''}\n@ ${timelineClock(event.positionMs)}`;
    const render = () => {
      const buckets = Array.from({ length: 50 }, () => ({ rows: [], counts: {} }));
      events.filter(event => active.has(event.eventType)).forEach(event => { const bucket = buckets[Math.min(49, Math.floor(Number(event.positionMs) / duration * 50))]; bucket.rows.push(event); bucket.counts[event.eventType] = (bucket.counts[event.eventType] || 0) + Math.max(1, Number(event.count) || 1); });
      const totals = buckets.map(bucket => Object.values(bucket.counts).reduce((sum, count) => sum + count, 0)); const max = Math.max(0, ...totals);
      const rows = Array.from(sessions.values()).filter(row => selectedUser === 'all' || String(row.userId) === selectedUser);
      holder.innerHTML = `<div class="mr-hist-filters"><div>${historicalEventTypes.map(type => `<button type="button" data-hist-type="${type}" aria-pressed="${active.has(type)}"><i style="background:${historicalEventColors[type]}"></i>${s.e(historicalEventTokens[type])}</button>`).join('')}</div>${users.size > 1 ? `<select class="form-select" data-hist-user aria-label="${s.e(s.t('mediaProfile.colUser'))}"><option value="all">${s.e(s.t('mediaProfile.allUsers'))}</option>${Array.from(users, ([id, name]) => `<option value="${s.e(id)}" ${String(id) === selectedUser ? 'selected' : ''}>${s.e(name || s.t('unknown'))}</option>`).join('')}</select>` : ''}</div><div class="mr-hist-chart"><div class="mr-hist-grid"><i></i><i></i><i></i></div><div class="mr-hist-bars">${buckets.map((bucket, index) => { const total = totals[index], tip = `${timelineClock(index / 50 * duration)} - ${timelineClock((index + 1) / 50 * duration)}${historicalEventTypes.filter(type => bucket.counts[type]).map(type => '\n' + eventName(type) + ': ' + bucket.counts[type]).join('')}`; return `<button type="button" class="mr-hist-bucket" data-hist-events="${s.e(JSON.stringify(bucket.rows.map(event => event.id)))}" data-count="${total}" title="${s.e(tip)}" aria-label="${s.e(tip)}"><span class="mr-hist-stack" style="height:${max ? total / max * 100 : 0}%;min-height:${total ? 4 : 0}px">${historicalEventTypes.filter(type => bucket.counts[type]).map(type => `<i data-type="${type}" data-count="${bucket.counts[type]}" style="background:${historicalEventColors[type]};height:${bucket.counts[type] / total * 100}%;min-height:2px"></i>`).join('')}</span></button>`; }).join('')}</div><div class="mr-hist-axis-track"></div><div class="mr-hist-axis">${[0, .25, .5, .75, 1].map(ratio => `<span>${timelineClock(duration * ratio)}</span>`).join('')}</div></div>${rows.length ? `<div class="mr-hist-session-section"><h3><span>${s.e(s.t('mediaProfile.sessionDetail'))} (${rows.length})</span><small>${s.e(s.t('eventPositionsByUser'))}</small></h3><div class="mr-hist-sessions">${rows.slice(0, 30).map(row => `<div class="mr-hist-session" data-user="${s.e(row.userId)}"><button type="button" class="mr-hist-session-name" data-hist-session="${s.e(row.id)}" title="${s.e(row.username || s.t('unknown'))}${row.startedAt ? '\n' + s.e(s.date(row.startedAt)) : ''}${row.durationMs != null ? '\n' + Math.round(row.durationMs / 60000) + ' min' : ''} · ${s.e(s.t('mediaProfile.eventsCount', { count: row.events.length }))}">${s.e(row.username || s.t('unknown'))}</button><div class="mr-hist-session-track">${row.durationMs != null ? `<span class="mr-hist-watched" style="width:${Math.min(100, Number(row.durationMs) / duration * 100)}%"></span>` : ''}${row.events.filter(event => active.has(event.eventType)).map(event => `<button type="button" class="mr-hist-mark" data-type="${event.eventType}" data-hist-events="${s.e(JSON.stringify([event.id]))}" style="left:${Math.min(100, Number(event.positionMs) / duration * 100)}%;background:${historicalEventColors[event.eventType]}" title="${s.e(eventTip(event))}" aria-label="${s.e(eventTip(event))}"></button>`).join('')}</div><span class="mr-hist-watched-time">${row.durationMs != null ? Math.round(row.durationMs / 60000) + 'm' : '—'}</span></div>`).join('')}</div></div>` : ''}<div class="mr-hist-tooltip" role="tooltip" hidden></div>`;
    };
    holder.addEventListener('change', event => { if (event.target.matches('[data-hist-user]')) { selectedUser = event.target.value; render(); } });
    holder.addEventListener('click', event => {
      const type = event.target.closest('[data-hist-type]'); if (type) { const key = type.dataset.histType; active.has(key) ? active.delete(key) : active.add(key); render(); holder.querySelector(`[data-hist-type="${key}"]`).focus(); return; }
      const session = event.target.closest('[data-hist-session]'); if (session) { Array.from(main.querySelectorAll('[data-session-detail]')).find(button => button.dataset.sessionDetail === session.dataset.histSession)?.click(); return; }
      const mark = event.target.closest('[data-hist-events]'); if (!mark) return; const ids = JSON.parse(mark.dataset.histEvents); if (!ids.length) return;
      const selected = events.filter(row => ids.includes(row.id));
      s.ctx.Modal.showAction({ title: s.t('mediaProfile.eventsCount', { count: selected.length }), bodyHtml: selected.map(row => `<article class="mr-event-detail"><h3>${s.e(eventName(row.eventType))}</h3><p>${s.e(row.username || s.t('unknown'))} · ${timelineClock(row.positionMs)}</p>${row.createdAt ? `<p>${s.e(s.date(row.createdAt))}</p>` : ''}${timelineEventDetail(row) ? `<p>${s.e(timelineEventDetail(row))}</p>` : ''}</article>`).join(''), confirmText: s.t('close'), cancelText: s.t('close') });
    });
    const tooltip = event => { const target = event.target.closest('[data-hist-events],[data-hist-session]'); const tip = holder.querySelector('.mr-hist-tooltip'); if (!tip || !target || !target.title) return; const box = target.getBoundingClientRect(); tip.textContent = target.title; tip.hidden = false; tip.style.left = `${Math.max(8, Math.min(window.innerWidth - 250, box.left))}px`; tip.style.top = `${Math.max(8, box.top - tip.offsetHeight - 8)}px`; };
    holder.addEventListener('pointerover', tooltip); holder.addEventListener('focusin', tooltip); const hide = () => { const tip = holder.querySelector('.mr-hist-tooltip'); if (tip) tip.hidden = true; }; holder.addEventListener('pointerout', hide); holder.addEventListener('focusout', hide);
    render();
  }
  async function detail(s, main, id, version) {
    main.innerHTML = `${nav(s, '')}<div class="mr-detail-layout"><div class="skeleton mr-loading"></div></div>`;
    const params = s.query(); params.set('metadata', 'true');
    const item = await s.ctx.API.getJSON(`/api/media/${encodeURIComponent(id)}?${params}`); if (version !== generation) return;
    const music = ['MusicAlbum', 'Audio', 'Track'].includes(item.type); const hierarchy = item.hierarchy || []; const kids = (item.children || []).slice().sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title, s.ctx.State.locale, { numeric: true })); const events = item.telemetry || [];
    const childrenTitle = item.type === 'Series' ? 'mediaProfile.seasons' : item.type === 'Season' ? 'mediaProfile.episodes' : 'mediaProfile.tracks';
    const distribution = (key) => `<div class="mr-language-list mr-language-${key}">${(item[key] || []).map((row) => `<div class="mr-language-row"><span>${s.e(row.language || s.t(key === 'subtitleDistribution' ? 'mediaProfile.none' : 'unknown'))}${row.codec ? ` (${s.e(row.codec)})` : ''}</span><div><span class="mr-language-track"><i style="width:${Math.min(100, Math.round(Number(row.count || 0) / Math.max(1, Number(item.totalPlays || 0)) * 100))}%"></i></span><strong>${s.count(row.count)}</strong></div></div>`).join('') || s.empty(key === 'subtitleDistribution' ? 'mediaProfile.none' : 'mediaProfile.noDataSmall')}</div>`;
    const versionCards = () => `<div class="mr-version-grid">${(item.versions || []).map((row) => `<article><header><strong>${s.e(row.name)}</strong>${row.container ? `<span class="badge">${s.e(row.container)}</span>` : ''}</header><div>${row.size ? `<span>${s.e(s.bytes(row.size))}</span>` : ''}${row.video ? `<span class="badge">${s.e(row.video)}</span>` : ''}${row.audio ? `<span class="badge">${s.e(row.audio)}</span>` : ''}</div></article>`).join('')}</div>`;
    const telemetryFields = [['pauseCount', 'mediaProfile.pausesLabel', 'pause'], ['seekCount', 'mediaProfile.skippedPassages', 'fastForward'], ['rewatchCount', 'mediaProfile.replayedPassages', 'rotateCcw'], ['speedChangeCount', 'mediaProfile.speedChanges', 'gauge'], ...(music ? [] : [['audioChanges', 'mediaProfile.audioChanges', 'headphones'], ['subtitleChanges', 'mediaProfile.subtitleChanges', 'languages']])];
    main.querySelector('.mr-loading').outerHTML = `<nav class="mr-breadcrumb"><a data-link href="${s.e(s.link('/media/collections'))}">${icons.arrowLeft}${s.e(s.t('mediaProfile.library'))}</a>${item.artist ? `${icons.chevron}<a data-link href="${s.e(s.link(`/media/artist/${encodeURIComponent(item.artist)}`, { servers: item.serverId }))}">${s.e(item.artist)}</a>` : ''}${hierarchy.map((parent) => `${icons.chevron}<a data-link href="${s.e(s.mediaLink(parent))}">${s.e(parent.title)}</a>`).join('')}${icons.chevron}<span class="mr-breadcrumb-current">${item.episodeCode ? `<b>${s.e(item.episodeCode)}</b>` : ''}${s.e(item.title)}</span></nav><div class="mr-quick-nav">${item.artist ? `<a data-link class="mr-quick-artist" href="${s.e(s.link(`/media/artist/${encodeURIComponent(item.artist)}`, { servers: item.serverId }))}">${icons.headphones}${s.e(item.artist)}</a>` : ''}${hierarchy.map((parent) => `<a data-link class="mr-quick-${s.e(parent.type)}" href="${s.e(s.mediaLink(parent))}">${parent.type === 'Series' ? icons.Series : parent.type === 'Season' ? icons.MusicAlbum : icons.music}${s.e(parent.type === 'Series' ? s.t('mediaProfile.viewSeries', { name: parent.title }) : parent.type === 'MusicAlbum' ? s.t('mediaProfile.viewAlbum', { name: parent.title }) : parent.title)}</a>`).join('')}</div><section class="card mr-media-hero ${music ? 'mr-music-hero' : item.type === 'Episode' ? 'mr-episode-hero' : ''}">${item.hasBackdrop ? `<img class="mr-backdrop" src="${s.e(s.image(item, 'Backdrop', 1440))}" alt="">` : ''}<div class="mr-hero-poster"><img data-mr-image src="${s.e(s.image(item, 'Primary', 480))}" alt="${s.e(item.title)}">${s.ctx.State.user?.isAdmin ? `<button id="mr-rotate" class="btn btn-secondary btn-sm" type="button" title="${s.e(s.t('mediaProfile.posterRotate'))}" aria-label="${s.e(s.t('mediaProfile.posterRotate'))}">${svg('<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3"/>')}</button>` : ''}</div><div class="mr-hero-copy">${item.hasLogo ? `<img class="mr-logo" src="${s.e(s.image(item, 'Logo', 500))}" alt="${s.e(item.title)}">` : `<h1>${s.e(item.title)}</h1>`}<div class="mr-hero-badges"><span class="badge">${s.e(item.type)}</span>${item.episodeCode ? `<span class="badge">${s.e(item.episodeCode)}</span>` : ''}${item.displayResolution || item.resolution ? `<span class="badge">${s.e(item.displayResolution || item.resolution)}</span>` : ''}${item.versions?.length > 1 ? `<span class="badge">${item.versions.length} ${s.e(s.t('mediaProfile.multiVersionsTitle', { count: item.versions.length }))}</span>` : ''}${item.year ? `<span class="badge">${s.e(item.year)}</span>` : ''}</div>${item.artist ? `<p class="mr-music-credits"><a data-link href="${s.e(s.link(`/media/artist/${encodeURIComponent(item.artist)}`, { servers: item.serverId }))}">${icons.headphones}${s.e(item.artist)}</a>${music && item.parentTitle ? `<span>${icons.MusicAlbum}${s.e(item.parentTitle)}</span>` : ''}</p>` : ''}${item.parentTitle ? `<p>${s.e(item.parentTitle)}</p>` : ''}<div class="mr-genre-links">${(item.genres || []).map((genre) => `<a data-link class="badge" href="${s.e(s.link('/media/all', { genre }))}">${s.e(genre)}</a>`).join('')}</div>${item.overview ? `<p>${s.e(item.overview)}</p>` : ''}<p>${s.e(item.server || '')}${item.durationMs ? ` · ${s.e(s.ms(item.durationMs))}` : ''}${item.sizeBytes ? ` · ${s.e(s.bytes(item.sizeBytes))}` : ''}</p>${(item.directors || []).length ? `<p>${s.e(s.t('directors'))}: ${(item.directors || []).map((name) => `<button type="button" class="mr-person-inline" data-person="${s.e(name)}">${s.e(name)}</button>`).join(', ')}</p>` : ''}${!item.metadataAvailable?.peopleRoles && (item.actors || []).length ? `<p>${s.e(s.t('actors'))}: ${(item.actors || []).map((name) => `<button type="button" class="mr-person-inline" data-person="${s.e(name)}">${s.e(name)}</button>`).join(', ')}</p>` : ''}</div></section>${item.metadataAvailable?.peopleRoles && item.people?.length ? s.section('mediaProfile.cast', `<div class="mr-cast">${(item.people?.length ? item.people : (item.actors || []).map((name) => ({ name }))).slice(0, 24).map((person) => `<button type="button" class="mr-cast-person" data-person="${s.e(person.name)}">${person.id && person.hasImage ? `<img data-mr-image src="${s.e(s.image({ id: person.id, serverId: item.serverId }, 'Primary', 200))}" loading="lazy" alt="${s.e(person.name)}">` :`<span class="mr-image-unavailable" role="img" aria-label="${s.e(person.name)}">${icons.person}</span>`}<strong>${s.e(person.name)}</strong>${(person.role || person.type) ? `<small>${s.e(person.role || person.type)}</small>` : ''}</button>`).join('')}</div>`, item.metadataAvailable?.peopleRoles ? s.t('mediaProfile.castDesc') : s.t('sourceLimit')).replace('class="card mr-section"', 'class="card mr-section mr-cast-section"') : ''}${item.versions?.length > 1 ? s.section('mediaProfile.multiVersionsTitle', versionCards(), s.t('mediaProfile.multiVersionsDesc')).replace(/\{count\}/g, String(item.versions.length)).replace('class="card mr-section"', 'class="card mr-section mr-versions-section"') : ''}${kids.length ? s.section(childrenTitle, table(s, [['#'], ['mediaProfile.colTitle'], ['mediaProfile.colType'], ...(item.type !== 'MusicAlbum' ? [['mediaProfile.colResolution']] : []), ['mediaProfile.colSessions'], ['mediaProfile.colTotalTime']], kids, (child, index) => `<tr><td>${index + 1}</td><td><a data-link class="mr-child-title" href="${s.e(s.mediaLink(child))}"><span class="mr-child-image"><img data-mr-image data-mr-fallback="${['Audio', 'Track'].includes(child.type) ? 'music' : 'Movie'}" src="${s.e(s.image(child, 'Primary', 64))}" alt="${s.e(child.title)}" loading="lazy"></span><span>${s.e(child.title)}</span></a></td><td><span class="badge">${s.e(child.type)}</span></td>${item.type !== 'MusicAlbum' ? `<td>${['Series', 'Season'].includes(child.type) ? '—' : s.e(child.displayResolution || child.resolution || '—')}</td>` : ''}<td>${s.count(child.plays)}</td><td>${s.e(s.ms(child.watchTimeMs))}</td></tr>`), s.t(item.type === 'Series' ? 'mediaProfile.seasonsDesc' : item.type === 'Season' ? 'mediaProfile.episodesDesc' : 'mediaProfile.tracksDesc')) .replace(/\{count\}/g, String(kids.length)) : ''}<div class="mr-stats ${music ? 'mr-stats-four' : 'mr-stats-three'}">${s.stat('mediaProfile.totalTime', s.hours(item.totalDurationMs), s.t('mediaProfile.cumulated'), 'clock')}${s.stat('mediaProfile.viewsTitle', s.count(item.totalPlays), s.t('mediaProfile.uniqueSessions'), 'eye')}${s.stat('mediaProfile.avgDuration', s.minutes(item.totalPlays ? item.totalDurationMs / item.totalPlays : 0), s.t('mediaProfile.perSession'), 'timer')}${music ? s.stat('mediaProfile.pauses', s.count(item.pauseCount)) : ''}</div>${!music ? s.section('mediaProfile.telemetrySummary', `<div class="mr-telemetry-summary">${telemetryFields.map(([field, title, icon]) => `<div><span>${icons[icon]}${s.e(s.t(title))}</span><strong>${s.count(item[field])}</strong><meter min="0" max="${Math.max(1, ...telemetryFields.map(([name]) => Number(item[name]) || 0))}" value="${Number(item[field]) || 0}"></meter></div>`).join('')}</div>`, s.t('mediaProfile.telemetryDesc')) : ''}${s.section('mediaProfile.behaviorTitle', behaviors(s, events, item.behavior), s.t('mediaProfile.behaviorDesc'))}<div class="mr-viewer-language-grid">${s.section('mediaProfile.viewers', (item.viewers || []).length ? `<div class="mr-viewers">${item.viewers.map((user) => `<a data-link href="${s.e(s.profileLink(user))}"><strong>${s.e(user.username || s.t('unknown'))}</strong><span>${s.count(user.plays)} ${s.e(s.t('bingeSessions'))}<b>${s.e((Number(user.watchTimeMs || 0) / 3600000).toFixed(1))}h</b></span></a>`).join('')}</div>` : s.empty('mediaProfile.noViewers'), s.t('mediaProfile.viewersDesc')).replace(/\{count\}/g, String(item.viewers?.length || 0))}${s.section('mediaProfile.audioLanguages', distribution('audioDistribution'))}${!music ? s.section('mediaProfile.subtitlesTitle', distribution('subtitleDistribution')) : ''}</div>${completionSection(s, item)}${s.section('mediaProfile.timelineTitle', `${historicalTimeline(s, item)}<details class="mr-timeline-explorer"><summary>${s.e(s.t('exploreEvents'))}</summary><div class="mr-timeline-controls"><label>${s.e(s.t('mediaProfile.colUser'))}<select id="mr-timeline-user" class="form-select"><option value="">${s.e(s.t('mediaProfile.allUsers'))}</option>${(item.viewers || []).map((user) => `<option value="${s.e(user.userId)}" ${s.query().get('user') === user.userId ? 'selected' : ''}>${s.e(user.username || s.t('unknown'))}</option>`).join('')}</select></label><label>${s.e(s.t('session'))}<select id="mr-timeline-session" class="form-select"><option value="">${s.e(s.t('allSessions'))}</option>${Array.from(new Map([...(item.history || []), ...events.map((event) => ({ id: event.playbackId, username: event.username }))].map((row) => [row.id, row])).values()).map((session) => `<option value="${s.e(session.id)}" ${s.query().get('session') === session.id ? 'selected' : ''}>${s.e(session.username || s.t('unknown'))} · ${s.e(session.startedAt ? s.date(session.startedAt) : session.id.slice(0, 12))}</option>`).join('')}</select></label></div>${Number(item.telemetryTotal) > events.length ? `<p class="mr-notice">${s.e(s.t('telemetryLimit', { shown: events.length, total: item.telemetryTotal }))}</p>` : ''}${timeline(s, item)}</details>`, s.t('mediaProfile.timelineDesc'))}${(item.counterTimeline || []).length ? s.section('mediaProfile.telemetryTimeline', '<div class="mr-chart"><canvas id="mr-counters"></canvas></div>', s.t(music ? 'mediaProfile.telemetryTimelineMusicDesc' : 'mediaProfile.telemetryTimelineVideoDesc')) : ''}${s.section('mediaProfile.detailedHistory', table(s, [['mediaProfile.colUser'], ['mediaProfile.colDate'], ['mediaProfile.colMethod', 'mr-md'], ['mediaProfile.colAudio'], ...(!music ? [['mediaProfile.colSubtitles', 'mr-lg']] : []), ['mediaProfile.colPauses', 'mr-md'], ['mediaProfile.colJumps', 'mr-lg'], ['mediaProfile.colReplays', 'mr-xl'], ['mediaProfile.colMaxSpeed', 'mr-xl'], ['mediaProfile.colDuration']], item.history || [], (session) => `<tr><td><a data-link href="${s.e(s.profileLink(session))}">${s.e(session.username || s.t('unknown'))}</a></td><td><button type="button" class="mr-person-inline" data-session-detail="${s.e(session.id)}">${s.e(s.date(session.startedAt))}</button></td><td class="mr-md">${s.e(session.playMethod)}</td><td>${s.e(session.audioLanguage || s.t('unknown'))}${session.audioCodec ? ` (${s.e(session.audioCodec)})` : ''}</td>${!music ? `<td class="mr-lg">${s.e(session.subtitleLanguage || s.t('mediaProfile.none'))}</td>` : ''}<td class="mr-md">${s.count(session.pauseCount)}</td><td class="mr-lg">${s.count(session.seekCount)}</td><td class="mr-xl">${s.count(session.rewatchCount)}</td><td class="mr-xl">${session.maxPlaybackRate ? `${s.e(session.maxPlaybackRate)}×` : '—'}</td><td>${s.e(s.ms(session.durationMs))}</td></tr>`)+pager(s, item.historyPage, item.historyPages, 'historyPage'), s.t('mediaProfile.sessionsTotal', { count: item.totalPlays }))}`;
    bar(s, 'mr-completion', Array.from({ length: 10 }, (_, index) => ({ name: `${index * 10}–${index * 10 + 10}%`, count: (item.completion || []).find((row) => Number(row.percent) === index * 10)?.count || 0 })), 'mediaProfile.colSessions');
    if (item.counterTimeline?.length && window.Chart) {
      const cid = 'mr-counters'; activeCharts.add(cid); const colors = ['#22d3ee', '#f59e0b', '#34d399', '#a78bfa', '#f472b6', '#fb923c'];
      s.ctx.ChartHelper.destroy(cid); s.ctx.ChartHelper.instances[cid] = new window.Chart(document.getElementById(cid), { type: 'line', data: { labels: item.counterTimeline.map((row) => s.date(row.startedAt)), datasets: telemetryFields.filter(([field]) => item.counterTimeline.some((row) => row[field] > 0)).map(([field, title], index) => ({ label: s.t(title), data: item.counterTimeline.map((row) => Number(row[field] || 0)), borderColor: colors[index], tension: 0.15, pointRadius: 3 })) }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    }
    bindHistoricalTimeline(s, main, item);
    main.querySelectorAll('[data-person]').forEach((button) => button.addEventListener('click', () => personSearch(s, button.dataset.person)));
    main.querySelectorAll('[data-event-id]').forEach((button) => button.addEventListener('click', () => {
      const ids = JSON.parse(button.dataset.eventIds || JSON.stringify([button.dataset.eventId])); const selected = events.filter((row) => ids.includes(row.id));
      s.ctx.Modal.showAction({ title: s.t('mediaProfile.eventsCount', { count: selected.length }), bodyHtml: selected.map((event) => { let metadata = {}; try { metadata = JSON.parse(event.metadata || '{}'); } catch {} return `<article class="mr-event-detail"><h3>${s.e(s.t(`mediaProfile.timeline.label.${event.eventType}`, {}, event.eventType))}</h3><p>${s.e(event.username)} · ${s.e(s.ms(event.positionMs))}</p><p>${s.e(s.date(event.createdAt))}</p>${metadata.fromMs != null && metadata.toMs != null ? `<p>${s.e(s.ms(metadata.fromMs))} → ${s.e(s.ms(metadata.toMs))}</p>` : ''}${metadata.toRate ? `<p>${s.e(metadata.toRate)}×</p>` : ''}</article>`; }).join(''), confirmText: s.t('close'), cancelText: s.t('close') });
    }));
    main.querySelectorAll('[data-session-detail]').forEach((button) => button.addEventListener('click', () => {
      const sid = button.dataset.sessionDetail; const session = (item.history || []).find((row) => row.id === sid); const sessionEvents = events.filter((row) => row.playbackId === sid);
      s.ctx.Modal.showAction({ title: s.t('mediaProfile.sessionDetail'), bodyHtml: `<p>${s.e(session?.username || sessionEvents[0]?.username || s.t('unknown'))}${session ? ` · ${s.e(s.date(session.startedAt))} · ${s.e(s.ms(session.durationMs))}` : ''}</p>${session ? `<div class="mr-telemetry-summary">${telemetryFields.map(([field, title, icon]) => `<div><span>${icons[icon]}${s.e(s.t(title))}</span><strong>${s.count(session[field])}</strong></div>`).join('')}</div>` : ''}${timeline(s, { ...item, telemetry: sessionEvents })}`, confirmText: s.t('session'), cancelText: s.t('close'), onConfirm: () => s.ctx.Router.navigate(s.link(window.location.pathname, { session: sid }, true)) });
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
    destroy(ctx) { generation++; chartObservers.forEach(observer => observer.disconnect()); chartObservers.clear(); closeSearch?.(); ctx.Modal.closeAction(); activeCharts.forEach((id) => ctx.ChartHelper.destroy(id)); activeCharts.clear(); },
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
