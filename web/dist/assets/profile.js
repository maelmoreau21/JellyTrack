/* Historical users/[id] layout, scoped to the profile page. No build dependency. */
(function () {
  'use strict';
  const DEFAULT_COLUMNS = ['date', 'media', 'client', 'resolution', 'audioBitrate', 'status', 'duration'];
  const ALL_COLUMNS = ['date', 'startedAt', 'endedAt', 'user', 'media', 'client', 'ip', 'country', 'status', 'resolution', 'audioBitrate', 'codecs', 'duration', 'pauseCount', 'audioChanges', 'subtitleChanges'];
  const WIDTHS = { date: 180, startedAt: 140, endedAt: 140, user: 140, media: 480, client: 160, resolution: 80, audioBitrate: 90, ip: 140, country: 120, status: 110, codecs: 120, duration: 90, pauseCount: 70, audioChanges: 70, subtitleChanges: 70 };
  const ICON_PATHS = {
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', hash: '<path d="M4 9h16M3 15h16M10 3l-4 18M18 3l-4 18"/>',
    play: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>', percent: '<path d="m19 5-14 14"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    zap: '<path d="m13 2-10 12h8l-1 8 11-12h-8z"/>', calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    layers: '<path d="m12 3 10 6-10 6L2 9zM2 15l10 6 10-6M2 12l10 6 10-6"/>', film: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0zM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 13v7M8 21h8"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4M8 21h8"/>', phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  };
  const icon = name => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.clock}</svg>`;

  window.ProfileUI = {
    async render(main, userId, { API, State, Utils, I18n, Router, Toast }) {
      const esc = Utils.escapeHtml;
      const tr = (key, fallback, values = {}) => I18n.t(key, values) || fallback;
      const tp = (key, fallback, values) => tr('userProfile.' + key, fallback, values);
      const tl = (key, fallback) => tr('logs.' + key, fallback);
      const signal = State.pageController && State.pageController.signal;
      if (State.user && !State.user.isAdmin && State.user.jellyfinUserId && !['me', '@me', State.user.jellyfinUserId].includes(userId)) {
        Router.navigate('/users/' + encodeURIComponent(State.user.jellyfinUserId));
        return;
      }
      const charts = [];
      const params = new URLSearchParams(location.search);
      if (params.get('q') && !params.get('query')) params.set('query', params.get('q'));
      if (params.get('historyPage') && !params.get('page')) params.set('page', params.get('historyPage'));
      const listen = (element, event, handler) => element && element.addEventListener(event, handler, signal ? { signal } : undefined);
      main.innerHTML = '<section class="jt-profile" aria-busy="true"><header class="profile-header profile-loading-header"><div class="profile-identity"><div class="profile-avatar profile-skeleton"></div><div class="profile-loading-title profile-skeleton"></div></div></header><div class="profile-loading profile-skeleton" data-loading-section="stats" style="height:250px"></div><div class="profile-loading profile-skeleton" data-loading-section="activity" style="height:300px"></div><div class="profile-loading profile-skeleton" data-loading-section="charts" style="height:320px"></div><div class="profile-loading profile-skeleton" data-loading-section="history" style="height:500px"></div></section>';
      let root = main.firstElementChild;
      const alive = () => main.contains(root) && !(signal && signal.aborted);
      let data;
      try { data = await API.getJSON('/api/users/' + encodeURIComponent(userId) + '?' + params); }
      catch (error) {
        if (!alive()) return;
        root.innerHTML = `<div class="profile-empty" role="alert">${esc(error.message)} <button type="button" class="btn btn-secondary" id="profile-retry">${esc(tr('common.retry', 'Réessayer'))}</button></div>`;
        root.removeAttribute('aria-busy');
        listen(root.querySelector('#profile-retry'), 'click', () => Router.renderCurrent());
        return;
      }
      if (!alive()) return;
      const stats = data.stats || {};
      const detail = data.charts || {};
      const dayNames = tp('dayNames', 'Dim,Lun,Mar,Mer,Jeu,Ven,Sam').split(',');
      const number = value => Utils.formatNumber(Number(value) || 0);
      const username = data.username || tr('common.deletedUser', 'Utilisateur supprimé');
      const initials = username.split(/\s+/).slice(0, 2).map(word => word[0] || '').join('').toUpperCase();
      const metric = (name, fallback, value, subtitle, color, symbol, extra = '', wide = false) => `<article class="profile-card profile-metric${wide ? ' profile-metric-wide' : ''}"><div class="profile-metric-heading"><h3>${esc(tp(name, fallback))}</h3><span style="color:${color}">${icon(symbol)}</span></div><div class="profile-metric-value${['topGenres', 'peakActivity', 'uniqueContent', 'mostWatched'].includes(name) ? ' profile-metric-small' : ['favFormat', 'favClient', 'favDevice'].includes(name) ? ' profile-metric-medium' : ''}" title="${esc(value)}">${esc(value)}</div><p class="profile-caption">${esc(subtitle)}</p>${extra}</article>`;
      const card = (title, description, content, cls = '') => `<article class="profile-card ${cls}"><header class="profile-card-heading"><h3>${esc(title)}</h3><p>${esc(description)}</p></header><div class="profile-card-body">${content}</div></article>`;
      const genres = Array.isArray(stats.topGenres) ? stats.topGenres.map(value => typeof value === 'object' ? value.name : value).join(', ') : stats.topGenres;
      root.innerHTML = `<header class="profile-header"><div class="profile-identity"><div class="profile-avatar"><span>${esc(initials)}</span><img alt="${esc(username)}" width="72" height="72" src="/api/jellyfin/user-image?fallback=none&userId=${encodeURIComponent(data.jellyfinUserId || userId)}${data.serverId ? '&serverId=' + encodeURIComponent(data.serverId) : ''}"></div><div><h1>${esc(tp('profile', 'Profil : ' + username, { name: username }))}</h1><p>${esc(tp('jellyfinId', 'ID Jellyfin :'))} ${esc(data.jellyfinUserId || userId)}</p></div></div>${State.user && (State.user.isAdmin || State.navigation.wrappedVisible) ? `<a class="profile-wrapped" href="/wrapped/${encodeURIComponent(data.jellyfinUserId || userId)}" data-link>🎁 ${esc(tp('viewWrapped', 'Voir le JellyTrack Wrapped'))}</a>` : ''}</header>
        <div id="profile-active-stream"></div>
        <section class="profile-metrics" aria-label="${esc(tp('sessions', 'Statistiques'))}">
          ${metric('playTime', 'Temps de lecture', String(stats.totalHours || 0) + 'h', tp('cumulTotal', 'Cumul total'), '#f97316', 'clock', stats.lastActive ? `<p class="profile-last-active">${esc(tr('users.colLastActive', 'Dernière Act.'))}: ${esc(Utils.formatDateTime(stats.lastActive))}</p>` : '')}
          ${metric('sessions', 'Session(s)', number(stats.sessionsCount), tp('avgPerSession', '~' + (stats.avgSessionMinutes || 0) + ' min / session', { min: stats.avgSessionMinutes || 0 }), '#10b981', 'hash')}
          ${metric('topGenres', 'Top Genres', genres || 'N/A', tp('mainPreferences', 'Préférences principales'), '#ec4899', 'play')}
          ${metric('completionRate', 'Taux de complétion', number(stats.averageCompletion) + '%', tp('avgCompletion', 'Complétion moyenne'), '#06b6d4', 'percent')}
          ${metric('peakActivity', "Pic d'Activité", stats.peakDay == null ? 'N/A · 0h' : (dayNames[stats.peakDay] || stats.peakDay) + ' · ' + (stats.peakHour || 0) + 'h', tp('mostActiveTime', 'Heure la plus active'), '#eab308', 'zap')}
          ${metric('bestStreak', 'Meilleure Série', number(stats.bestStreak) + ' ' + tp('days', 'jours'), tp('consecutiveDays', "Jours d'activité consécutifs"), '#ef4444', 'calendar')}
          ${metric('uniqueContent', 'Contenu Unique', number((stats.uniqueMovies || 0) + (stats.uniqueEpisodes || 0) + (stats.uniqueAudio || 0)), '🎬 ' + number(stats.uniqueMovies) + ' · 📺 ' + number(stats.uniqueEpisodes) + ' · 🎵 ' + number(stats.uniqueAudio), '#14b8a6', 'layers')}
          ${metric('favFormat', 'Format favori', stats.favoriteFormat || 'N/A', tp('mainMediaType', 'Type de média principal'), '#6366f1', 'film')}
          ${stats.mostWatched ? metric('mostWatched', 'Le Plus Visionné', stats.mostWatched.title || '—', String(stats.mostWatched.sessionsCount || 0) + ' sessions · ' + String(stats.mostWatched.minutes || 0) + ' min', '#f59e0b', 'trophy', '', true) : ''}
          ${metric('favClient', 'Client favori', stats.favoriteClient || 'N/A', tp('mostUsedApp', 'Application la plus utilisée'), '#3b82f6', 'monitor')}
          ${metric('favDevice', 'Appareil favori', stats.favoriteDevice || 'N/A', tp('mostUsedPlatform', 'Plateforme la plus utilisée'), '#a855f7', 'phone')}
        </section>
        ${card(tp('activity30d', 'Activité sur 30 jours'), tp('activity30dDesc', 'Vue sur le volume quotidien de lecture de cet utilisateur.'), '<div class="profile-chart profile-activity"><canvas id="profile-activity-chart" role="img"></canvas></div>', 'profile-activity-card')}
        ${detail.hasHistory ? `<section class="profile-stats-charts"><div class="profile-chart-row">
          ${card(tr('dashboard.dayOfWeekActivity', 'Activité par jour de la semaine'), tr('dashboard.dayOfWeekActivityDesc', 'Distribution des sessions sur la semaine.'), '<div class="profile-chart profile-day"><canvas id="profile-day-chart" role="img"></canvas></div>')}
          ${card(tr('dashboard.completionRate', 'Taux de complétion'), tr('dashboard.completionRateDesc', 'Répartition des lectures complètes, partielles et abandonnées.'), '<div class="profile-completion-reset" hidden><button type="button">Tout afficher</button></div><div class="profile-chart profile-completion"><canvas id="profile-completion-chart" role="img"></canvas></div><div class="profile-legend" id="profile-completion-legend"></div>')}
          ${card(tr('dashboard.hourlyActivity', 'Activité par heure'), tr('dashboard.hourlyActivityDesc', 'Heures de la journée les plus actives.'), '<div id="profile-hour-selection" hidden></div><div class="profile-chart profile-hour"><canvas id="profile-hour-chart" role="img"></canvas></div>', 'profile-hour-card')}
        </div><div class="profile-secondary-row">
          ${card('Genres préférés', 'Répartition des genres les plus visionnés par cet utilisateur.', '<div class="profile-chart profile-genres"><canvas id="profile-genres-chart" role="img"></canvas></div>')}
          ${card('Fiche Technique', "Indicateurs de lecture et appareils préférés de l'utilisateur.", `<div class="profile-technical"><div class="profile-technical-box"><p>Appareil ou client le plus utilisé</p><strong class="profile-cyan">${esc(detail.favoriteClient || 'Aucun')}</strong></div><div class="profile-technical-row"><div class="profile-technical-box"><p>Direct Play</p><strong class="profile-violet">${number(detail.directPlayRatio)}%</strong></div><div class="profile-technical-box"><p>Débit moyen</p><strong class="profile-emerald">${detail.averageBitrateKbps ? esc((detail.averageBitrateKbps / 1000).toFixed(1)) + ' Mbps' : '—'}</strong></div></div></div>`)}
        </div></section>` : ''}
        ${card(tp('playbackHistory', 'Historique de lecture'), tp('aggregatedDesc', 'Historique complet agrégé des sessions démarrées.') + ' — ' + number(data.history && data.history.total) + ' sessions', '<div id="profile-history"></div>', 'profile-history-card')}`;
      root.removeAttribute('aria-busy');
      const find = selector => root.querySelector(selector);
      listen(find('.profile-avatar img'), 'error', event => event.target.remove());
      let cleaned = false;
      const cleanup = () => { if (cleaned) return; cleaned = true; charts.forEach(chart => chart.destroy()); root.querySelectorAll('dialog').forEach(dialog => dialog.close()); };
      State.pageCleanups.push(cleanup);
      if (signal) signal.addEventListener('abort', cleanup, { once: true });

      // Chart data and sizes match the historical component hierarchy.
      const style = getComputedStyle(document.documentElement);
      const themeColor = name => style.getPropertyValue(name).trim();
      const axis = themeColor('--muted-foreground') || '#94a3b8';
      const colors = document.documentElement.classList.contains('dark') ? ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#fb7185', '#38bdf8'] : ['#0891b2', '#7c3aed', '#db2777', '#059669', '#2563eb', '#d97706', '#e11d48', '#0284c7'];
      const baseOptions = () => ({ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: themeColor('--surface-raised') || '#0f172a', titleColor: themeColor('--foreground'), bodyColor: themeColor('--foreground'), borderColor: themeColor('--border'), borderWidth: 1, cornerRadius: 12 } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: axis, font: { size: 11 } } }, y: { beginAtZero: true, border: { display: false }, grid: { color: themeColor('--border'), borderDash: [3, 3] }, ticks: { color: axis, precision: 0, font: { size: 10 } } } } });
      const chart = (id, labels, values, color, options = {}) => {
        const canvas = find('#' + id);
        if (!canvas) return null;
        canvas.setAttribute('aria-label', labels.map((label, i) => label + ': ' + values[i]).join('; '));
        if (!window.Chart) { canvas.parentElement.innerHTML = `<div class="profile-chart-fallback">${labels.map((label, i) => `<span>${esc(label)}: <b>${esc(values[i])}</b></span>`).join('')}</div>`; return null; }
        const instance = new window.Chart(canvas, { type: 'bar', data: { labels, datasets: [{ label: tr('charts.sessions', 'Sessions'), data: values, backgroundColor: color, borderRadius: 4, maxBarThickness: 48 }] }, options: { ...baseOptions(), ...options } });
        charts.push(instance); return instance;
      };
      const activity = data.activity30d || [];
      const activityOptions = baseOptions();
      const activityMax = Math.max(0.1, ...activity.map(item => Number(item.hours) || 0));
      activityOptions.scales.y.max = activityMax;
      activityOptions.scales.y.ticks = { color: axis, font: { size: 12 }, stepSize: activityMax / 4, callback: value => Number(Number(value).toFixed(2)) + 'h' };
      activityOptions.scales.x.ticks.font.size = 12;
      activityOptions.scales.x.ticks.maxRotation = 0;
      activityOptions.layout = { padding: { left: 16, right: 10, top: 10, bottom: 0 } };
      activityOptions.scales.x.ticks.callback = function (value, index) { return index % 5 === 0 ? this.getLabelForValue(value) : ''; };
      activityOptions.plugins.tooltip.callbacks = { label: context => context.parsed.y + 'h' };
      chart('profile-activity-chart', activity.map(item => item.date), activity.map(item => item.hours), '#0ea5e9', activityOptions);
      if (detail.hasHistory) {
        const days = detail.dayOfWeek || [];
        const maxDay = Math.max(0, ...days.map(item => Number(item.count) || 0));
        const dayOptions = baseOptions();
        const dayStep = Math.max(1, Math.ceil(maxDay / 4));
        dayOptions.scales.y.max = dayStep * 4;
        dayOptions.scales.y.ticks.stepSize = dayStep;
        if (maxDay > 0) chart('profile-day-chart', days.map(item => dayNames[item.day] || item.day), days.map(item => item.count), days.map(item => item.count === maxDay && maxDay > 0 ? '#ea580c' : '#059669'), dayOptions);
        else find('#profile-day-chart').parentElement.innerHTML = `<div class="profile-empty">${esc(tr('common.noData', 'Aucune donnée'))}</div>`;
        const hours = detail.hours || [];
        const maxHour = Math.max(0, ...hours.map(item => Number(item.count) || 0));
        const averageHour = hours.length ? Math.round(hours.reduce((sum, item) => sum + (Number(item.count) || 0), 0) / hours.length) : 0;
        const hourOptions = baseOptions();
        const hourStep = Math.max(1, Math.ceil((maxHour + 1) / 4));
        hourOptions.scales.y.max = hourStep * 4;
        hourOptions.scales.y.ticks.stepSize = hourStep;
        hourOptions.scales.x.ticks.maxRotation = 0;
        hourOptions.scales.x.ticks.callback = function (value, index) { return index % 4 === 0 || index === hours.length - 1 ? this.getLabelForValue(value) : ''; };
        hourOptions.plugins.tooltip.filter = context => context.datasetIndex === 0;
        hourOptions.onClick = (event, entries) => {
          if (!entries.length) return;
          const item = hours[entries[0].index];
          const panel = find('#profile-hour-selection');
          if (!panel.hidden && panel.dataset.hour === String(item.hour)) { panel.hidden = true; return; }
          panel.dataset.hour = String(item.hour);
          panel.hidden = false;
          const difference = Number(item.count) - averageHour;
          panel.innerHTML = `<span>${esc(String(item.hour).padStart(2, '0') + ':00')} · ${number(item.count)} ${esc(tr('charts.sessions', 'sessions'))}</span><span>(${difference > 0 ? '+' : ''}${difference} ${esc(tr('charts.vsAverage', 'vs moyenne'))})</span><a href="/logs?hour=${Number(item.hour)}" data-link>${esc(tr('charts.viewLogs', 'Voir les logs'))} ↗</a><button type="button" aria-label="${esc(tr('common.close', 'Fermer'))}">×</button>`;
          listen(panel.querySelector('button'), 'click', () => { panel.hidden = true; });
        };
        const hourChart = chart('profile-hour-chart', hours.map(item => String(item.hour).padStart(2, '0') + ':00'), hours.map(item => item.count), hours.map(item => item.count === maxHour && maxHour > 0 ? '#ea580c' : '#06b6d4'), hourOptions);
        if (hourChart && averageHour > 0) {
          hourChart.data.datasets.push({ type: 'line', label: tr('charts.average', 'Moyenne'), data: hours.map(() => averageHour), borderColor: axis, borderWidth: 1, borderDash: [3, 4], pointRadius: 0, order: -1 });
          hourChart.update();
        }
        const genreData = detail.genres || [];
        const genreOptions = baseOptions();
        genreOptions.indexAxis = 'y';
        genreOptions.scales.y.grid.display = false;
        genreOptions.scales.x.grid = { color: themeColor('--border') };
        genreOptions.scales.x.ticks.precision = 0;
        genreOptions.onClick = (event, entries) => { if (entries.length) Router.navigate('/media/all?genre=' + encodeURIComponent(genreData[entries[0].index].name)); };
        if (genreData.length) chart('profile-genres-chart', genreData.map(item => item.name), genreData.map(item => item.count), genreData.map((item, index) => colors[index % colors.length]), genreOptions);
        else find('#profile-genres-chart').parentElement.innerHTML = `<div class="profile-empty">${esc(tr('common.noData', 'Aucune donnée'))}</div>`;
        const completion = (detail.completion || []).filter(item => item.value > 0);
        const completionColors = { completed: '#22c55e', partial: '#f59e0b', abandoned: '#ef4444' };
        if (completion.length && window.Chart) {
          const canvas = find('#profile-completion-chart');
          const options = baseOptions();
          delete options.scales;
          options.cutout = '66%';
          options.radius = 90;
          options.cutout = 60;
          options.layout = { padding: 12 };
          options.plugins.tooltip.callbacks = { label: context => {
            const total = context.chart.data.datasets[0].data.reduce((sum, value, i) => sum + (context.chart.getDataVisibility(i) ? Number(value) : 0), 0);
            return `${context.label}: ${context.parsed} sessions (${total ? Math.round(context.parsed / total * 100) : 0}%)`;
          } };
          const instance = new window.Chart(canvas, { type: 'doughnut', data: { labels: completion.map(item => tr('dashboard.' + item.name, item.name)), datasets: [{ data: completion.map(item => item.value), backgroundColor: completion.map(item => completionColors[item.name] || '#71717a'), borderWidth: 0, spacing: completion.length > 1 ? 3 : 0, hoverOffset: 8 }] }, options });
          canvas.setAttribute('aria-label', completion.map(item => tr('dashboard.' + item.name, item.name) + ': ' + item.value).join('; '));
          charts.push(instance);
          find('#profile-completion-legend').innerHTML = completion.map((item, index) => `<button type="button" data-legend="${index}" aria-pressed="true"><span style="background:${completionColors[item.name] || '#71717a'}"></span>${esc(tr('dashboard.' + item.name, item.name))}</button>`).join('');
          listen(find('#profile-completion-legend'), 'click', event => {
            const button = event.target.closest('[data-legend]');
            if (!button) return;
            const index = Number(button.dataset.legend);
            if (instance.getDataVisibility(index) && completion.filter((item, i) => instance.getDataVisibility(i)).length === 1) return;
            instance.toggleDataVisibility(index); instance.update();
            button.setAttribute('aria-pressed', String(instance.getDataVisibility(index)));
            find('.profile-completion-reset').hidden = completion.every((item, i) => instance.getDataVisibility(i));
          });
          listen(find('.profile-completion-reset button'), 'click', () => {
            completion.forEach((item, i) => { if (!instance.getDataVisibility(i)) instance.toggleDataVisibility(i); });
            instance.update(); find('.profile-completion-reset').hidden = true;
            find('#profile-completion-legend').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', 'true'));
          });
        } else find('#profile-completion-chart').parentElement.innerHTML = `<div class="profile-empty">${esc(tr('dashboard.noDurationData', 'Aucune donnée de durée'))}</div>`;
      }

      // The live banner occupies its original position above the statistic grid.
      const renderStream = stream => {
        if (!alive()) return;
        const slot = find('#profile-active-stream');
        if (!stream) { slot.innerHTML = ''; return; }
        const progress = Math.max(0, Math.min(100, Number(stream.progressPercent) || 0));
        slot.innerHTML = `<div class="profile-live${stream.isPaused ? ' profile-live-paused' : ''}"><div class="profile-live-main"><span class="profile-live-dot"></span><div><h3>${stream.isPaused ? 'Lecture en pause' : 'Lecture en cours'}</h3><strong>${stream.itemId ? `<a href="/media/${encodeURIComponent(stream.itemId)}" data-link>${esc(stream.mediaTitle)}</a>` : esc(stream.mediaTitle)}</strong>${stream.mediaSubtitle ? `<p>${esc(stream.mediaSubtitle)}</p>` : ''}<p>Sur ${esc(stream.clientName || 'Inconnu')} (${esc(stream.deviceName || 'Inconnu')}) • ${esc(stream.playMethod === 'Transcode' ? tr('common.transcode', 'Transcodage') : tr('common.directPlay', 'Direct Play'))}</p></div></div><div class="profile-live-progress"><div><span>${stream.isPaused ? 'En pause' : 'En cours de lecture'}</span><b>${progress}%</b></div><progress value="${progress}" max="100">${progress}%</progress></div></div>`;
      };
      let poll;
      let fetchingStream = false;
      const refreshStream = async () => {
        if (document.hidden || !alive() || fetchingStream) return;
        fetchingStream = true;
        try { const result = await API.getJSON('/api/users/' + encodeURIComponent(userId) + '/active-stream'); renderStream(result.activeStream || result.stream); } catch (_) {} finally { fetchingStream = false; }
      };
      const visibility = () => { clearInterval(poll); if (!document.hidden && alive()) { refreshStream(); poll = setInterval(refreshStream, 4000); } };
      listen(document, 'visibilitychange', visibility);
      State.pageCleanups.push(() => clearInterval(poll));
      if (signal) signal.addEventListener('abort', () => clearInterval(poll), { once: true });
      visibility();

      let historyData = data.history || { items: [], total: 0, totalPages: 1, page: 1 };
      let requestID = 0;
      let advancedOpen = false;
      const storageKey = 'jellytrack.logs.columns.v1';
      let savedColumns;
      try { savedColumns = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (_) {}
      let columns = params.get('cols') ? params.get('cols').split(',') : DEFAULT_COLUMNS.slice();
      columns = [...new Set(columns.filter(column => ALL_COLUMNS.includes(column)))];
      if (columns.length < 2) columns = DEFAULT_COLUMNS.slice();
      let widths = {};
      if (Array.isArray(savedColumns)) {
        const savedOrder = savedColumns.map(column => column.key).filter(column => columns.includes(column));
        columns = [...savedOrder, ...columns.filter(column => !savedOrder.includes(column))];
        savedColumns.forEach(column => { if (ALL_COLUMNS.includes(column.key) && Number.isFinite(Number(column.width))) widths[column.key] = Number(column.width); });
      }
      if (params.get('colsState')) params.get('colsState').split(',').forEach(value => { const [key, width] = value.split(':'); if (ALL_COLUMNS.includes(key) && Number.isFinite(Number(width))) widths[key] = Number(width); });
      const columnName = name => tl('col' + name[0].toUpperCase() + name.slice(1), ({ date: 'Date', media: 'Média', client: 'Client', resolution: 'Résolution', audioBitrate: 'Débit audio', status: 'Statut', duration: 'Durée', startedAt: 'Début', endedAt: 'Fin', user: 'Utilisateur', ip: 'IP', country: 'Pays', codecs: 'Codecs', pauseCount: 'Pauses', audioChanges: 'Audio', subtitleChanges: 'Sous-titres' })[name]);
      const writeURL = () => { window.history.replaceState({}, '', window.location.pathname + (params.size ? '?' + params : '')); };
      const filters = ['query', 'sort', 'client', 'audio', 'subtitle', 'dateFrom', 'dateTo', 'resolution', 'playMethod'];
      const navigateFilters = updates => {
        Object.entries(updates).forEach(([key, value]) => { if (value) params.set(key, value); else params.delete(key); });
        params.delete('page'); params.delete('historyPage'); writeURL(); loadHistory();
      };
      const badge = (value, cls = '') => `<span class="profile-badge ${cls}">${esc(value)}</span>`;
      const resolution = value => {
        if (!value || value === 'Unknown') return '—';
        const text = String(value);
        if (/3840|4096|2160|4k/i.test(text)) return '4K';
        if (/1920|1080/i.test(text)) return '1080p';
        if (/1280|720/i.test(text)) return '720p';
        return text;
      };
      const status = item => {
        const transcode = /transcode/i.test(item.playMethod);
        const audioOnly = transcode && (/audio|track/i.test(item.type) || !item.videoCodec || /^(copy|direct)$/i.test(item.videoCodec));
        return `<div class="profile-badges">${badge(audioOnly ? 'Audio Transcodé' : item.playMethod || 'DirectPlay', transcode ? 'profile-warning' : 'profile-success')}${item.isReconnection ? badge('Reconnexion', 'profile-info') : ''}${item.pauseCount >= 2 ? badge('⏸ ' + item.pauseCount, 'profile-warning') : ''}${item.audioChanges > 0 ? badge('🔊 ' + item.audioChanges, 'profile-info') : ''}${item.subtitleChanges > 0 ? badge('CC ' + item.subtitleChanges, 'profile-info') : ''}</div>`;
      };
      const cell = (column, item, index) => {
        switch (column) {
          case 'date': return `<div class="profile-date"><button type="button" data-expand="${index}" aria-expanded="false" aria-label="${esc(tr('common.details', 'Détails'))}">⌄</button><div><b>${esc(item.startedAt ? new Date(item.startedAt).toLocaleDateString(State.locale, { day: 'numeric', month: 'short' }) : '—')}</b><p>${esc(item.startedAt ? new Date(item.startedAt).toLocaleTimeString(State.locale, { hour: '2-digit', minute: '2-digit' }) : '—')}</p></div></div>`;
          case 'startedAt': return esc(item.startedAt ? new Date(item.startedAt).toLocaleTimeString(State.locale) : '—');
          case 'endedAt': return esc(item.endedAt ? Utils.formatDateTime(item.endedAt) : '—');
          case 'media': return `<div class="profile-media"><div class="profile-poster profile-poster-${/episode/i.test(item.type) ? 'episode' : /audio|track/i.test(item.type) ? 'audio' : 'movie'}"><span>${/audio|track/i.test(item.type) ? '♫' : '▶'}</span>${item.jellyfinMediaId ? `<img alt="" loading="lazy" src="/api/jellyfin/image?id=${encodeURIComponent(item.jellyfinMediaId)}&type=Primary&maxWidth=160${item.serverId ? '&serverId=' + encodeURIComponent(item.serverId) : ''}">` : ''}</div><div class="profile-media-title"><a href="/media/${encodeURIComponent(item.jellyfinMediaId || item.mediaId)}" data-link>${esc(item.title || '—')}</a>${item.mediaSubtitle ? `<p>${esc(item.mediaSubtitle)}</p>` : ''}<div class="profile-media-mobile">${badge(resolution(item.resolution))}${status(item)}${badge(item.isActuallyActive ? 'Active' : Utils.formatMs(item.durationMs))}${badge(item.clientName || '—')}</div></div></div>`;
          case 'client': return `<b>${esc(item.clientName || '—')}</b>`;
          case 'user': return `<a href="/users/${encodeURIComponent(data.jellyfinUserId || userId)}" data-link>${esc(username)}</a>`;
          case 'resolution': return /audio|track/i.test(item.type) ? '—' : badge(resolution(item.resolution));
          case 'audioBitrate': return item.bitrate > 0 ? number(item.bitrate) + ' kbps' : '—';
          case 'status': return status(item);
          case 'duration': return item.isActuallyActive ? '<strong class="profile-warning">● Active</strong>' : esc(Utils.formatMs(item.durationMs));
          case 'country': return esc([item.city, item.country].filter(value => value && value !== 'Unknown').join(', ') || '—');
          case 'ip': return `<code>${esc(item.ipAddress || '—')}</code>`;
          case 'codecs': return /transcode/i.test(item.playMethod) ? esc([item.videoCodec && 'V: ' + item.videoCodec, item.audioCodec && 'A: ' + item.audioCodec].filter(Boolean).join(' · ') || '—') : 'source';
          default: return number(item[column]);
        }
      };
      const timestamp = milliseconds => {
        const seconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
        return seconds >= 3600 ? Math.floor(seconds / 3600) + ':' + String(Math.floor(seconds % 3600 / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0') : Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
      };
      const timeline = (item, modal = false) => {
        const runtime = Math.max(0, Number(item.mediaDurationMs) || 0);
        const watched = Math.max(0, Number(item.durationMs) || 0);
        const events = (item.telemetryEvents || []).map(event => {
          let position = Math.max(0, Number(event.positionMs) || 0);
          if (runtime > 0 && position > runtime) position = Math.floor(position / 10000) <= runtime ? Math.floor(position / 10000) : runtime;
          return { ...event, positionMs: position };
        }).sort((a, b) => a.positionMs - b.positionMs);
        const total = runtime || Math.max(watched, ...events.map(event => event.positionMs), 1);
        const groups = new Map();
        events.forEach(event => { const bucket = modal ? Math.floor(event.positionMs / 1500) * 1500 : event.positionMs; if (!groups.has(bucket)) groups.set(bucket, []); groups.get(bucket).push(event); });
        const grouped = [...groups.values()].map(entries => {
          const priority = ['pause', 'audio_change', 'subtitle_change', 'seek', 'replay', 'speed_change', 'stop'];
          const representative = priority.map(type => entries.find(event => event.eventType === type)).find(Boolean) || entries[0];
          return { ...representative, positionMs: Math.min(total, Math.floor(entries.reduce((sum, event) => sum + event.positionMs, 0) / entries.length)), count: entries.length };
        });
        const eventLabel = event => tl('timeline.label.' + event.eventType, event.eventType);
        const eventIcon = event => ({ pause: '⏸', resume: '▶', seek: '⏩', replay: '↶', audio_change: '♫', subtitle_change: 'CC', speed_change: '◴', download: '↓', stop: '■' })[event.eventType] || '●';
        const eventColor = event => ({ pause: '#f59e0b', seek: '#f97316', replay: '#22c55e', audio_change: '#0ea5e9', subtitle_change: '#10b981', speed_change: '#3b82f6', download: '#8b5cf6', stop: '#f43f5e' })[event.eventType] || '#71717a';
        const eventDetail = event => {
          let metadata = event.metadata || {};
          if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch (_) { metadata = {}; } }
          const side = value => value == null ? '—' : typeof value === 'object' ? (value.language || (value.index != null ? '#' + value.index : '—')) + (value.codec ? ' (' + value.codec + ')' : '') : String(value);
          const rate = value => value == null ? null : 'x' + String(Number(String(value).replace(/^x/i, '')));
          const from = metadata.fromLabel || metadata.fromLanguage || metadata.fromCodec || (metadata.fromMs != null ? timestamp(metadata.fromMs) : metadata.fromRateLabel || (metadata.fromRate != null ? rate(metadata.fromRate) : metadata.from != null ? side(metadata.from) : null));
          const to = metadata.toLabel || metadata.toLanguage || metadata.toCodec || (metadata.toMs != null ? timestamp(metadata.toMs) : metadata.toRateLabel || (metadata.toRate != null ? rate(metadata.toRate) : metadata.to != null ? side(metadata.to) : null));
          return from != null || to != null ? ' · ' + esc(from == null ? '—' : from) + ' → ' + esc(to == null ? '—' : to) : '';
        };
        const jumpURL = event => '/media/' + encodeURIComponent(item.jellyfinMediaId || item.mediaId) + '?t=' + Math.floor(event.positionMs / 1000);
        const eventCounts = {};
        events.forEach(event => { eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1; });
        const known = ['pause', 'audio_change', 'subtitle_change', 'seek', 'replay', 'speed_change', 'stop'];
        const otherCount = events.filter(event => !known.includes(event.eventType)).length;
        const badgeItems = [['pauseCount', tl('timeline.legend.pause', 'Pauses'), 'pause'], ['audioChanges', tl('timeline.legend.audio', 'Audio'), 'audio_change'], ['subtitleChanges', tl('timeline.legend.subtitles', 'Sous-titres'), 'subtitle_change'], ['seekCount', tl('timeline.label.seek', 'Sauts'), 'seek'], ['rewatchCount', tl('timeline.label.replay', 'Relectures'), 'replay'], ['speedChangeCount', tl('timeline.label.speed_change', 'Vitesses'), 'speed_change'], ['stopCount', tl('timeline.stop', 'Arrêts'), 'stop']];
        return `<div class="profile-timeline"><div class="profile-badges">${badgeItems.map(([key, label, event]) => badge(label + ': ' + number(eventCounts[event] || item[key]))).join('')}${otherCount ? badge(tl('timeline.label.default', 'Autres') + ': ' + otherCount) : ''}</div><h4>${esc(tl('timeline.title', 'Chronologie de lecture'))} · ${timestamp(total)}</h4><div class="profile-timeline-track"><div></div><div class="profile-watched-track" style="width:${Math.min(100, watched / total * 100)}%"></div>${grouped.map(event => `<a href="${esc(jumpURL(event))}" target="_blank" rel="noopener" style="left:${Math.max(1, Math.min(99, event.positionMs / total * 100))}%;--event-color:${eventColor(event)}" title="${esc(eventLabel(event))} · ${timestamp(event.positionMs)}">${eventIcon(event)}${event.count > 1 ? `<small>${event.count}</small>` : ''}</a>`).join('')}</div><div class="profile-timeline-ticks">${[0, .25, .5, .75, 1].map(part => `<span>${timestamp(total * part)}</span>`).join('')}</div>${grouped.length ? `<div class="profile-event-list">${grouped.map(event => `<div><span class="profile-event-icon" style="color:${eventColor(event)}">${eventIcon(event)}</span><div><b>${esc(eventLabel(event))}${event.count > 1 ? ' · ' + event.count : ''}</b><p>${esc(Utils.formatDateTime(event.createdAt))}</p><p>${timestamp(event.positionMs)} · ${Math.round(event.positionMs / total * 100)}%${eventDetail(event)}</p>${modal ? `<div class="profile-event-actions"><a class="btn btn-secondary" href="${esc(jumpURL(event))}" target="_blank" rel="noopener">${esc(tl('timeline.action.jump', 'Aller à'))}</a><button type="button" class="btn btn-secondary" data-copy-jump="${esc(jumpURL(event))}">${esc(tl('timeline.action.copy', 'Copier le lien'))}</button></div>` : ''}</div></div>`).join('')}</div>` : `<p class="profile-caption">${esc(tl('noTelemetry', 'Aucun événement de télémétrie enregistré.'))}</p>`}</div>`;
      };
      const showDialog = (title, content) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'profile-dialog';
        dialog.innerHTML = `<header><h2>${esc(title)}</h2><button type="button" class="profile-dialog-close" aria-label="${esc(tr('common.close', 'Fermer'))}">×</button></header><div class="profile-dialog-body">${content}</div>`;
        root.appendChild(dialog);
        listen(dialog.querySelector('.profile-dialog-close'), 'click', () => dialog.close());
        listen(dialog, 'click', async event => {
          const button = event.target.closest('[data-copy-jump]');
          if (!button || !navigator.clipboard) return;
          try { await navigator.clipboard.writeText(location.origin + button.dataset.copyJump); } catch (_) {}
        });
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        dialog.showModal();
        return dialog;
      };
      const showPopover = (anchor, content, cls) => {
        root.querySelectorAll('.profile-popover').forEach(popover => popover.close());
        const panel = document.createElement('div');
        panel.className = 'profile-popover ' + cls;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', anchor.textContent);
        panel.innerHTML = content;
        root.appendChild(panel);
        anchor.setAttribute('aria-expanded', 'true');
        const position = () => {
          const currentAnchor = document.getElementById(anchor.id) || anchor;
          const rectangle = currentAnchor.getBoundingClientRect();
          panel.style.left = Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, rectangle.right - panel.offsetWidth)) + 'px';
          panel.style.top = Math.max(8, rectangle.bottom + panel.offsetHeight + 14 > innerHeight ? rectangle.top - panel.offsetHeight - 6 : rectangle.bottom + 6) + 'px';
        };
        const outside = event => { if (!panel.contains(event.target) && !(document.getElementById(anchor.id) || anchor).contains(event.target)) panel.close(); };
        const escape = event => { if (event.key === 'Escape') { panel.close(); (document.getElementById(anchor.id) || anchor).focus(); } };
        panel.close = () => { panel.remove(); anchor.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); document.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); };
        position();
        document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape); document.addEventListener('scroll', position, true); window.addEventListener('resize', position);
        State.pageCleanups.push(panel.close);
        if (signal) signal.addEventListener('abort', panel.close, { once: true });
        return panel;
      };
      const persistColumns = () => { const values = columns.map(key => ({ key, width: Math.max(48, Math.min(1200, Number(widths[key]) || WIDTHS[key])) })); localStorage.setItem(storageKey, JSON.stringify(values)); params.set('colsState', values.map(column => column.key + ':' + column.width).join(',')); };
      const saveColumns = () => { persistColumns(); params.set('cols', columns.join(',')); writeURL(); renderHistory(); };
      const filterInput = (name, label, placeholder = '', type = 'text') => `<label>${esc(label)}<input class="form-input" type="${type}" name="${name}" value="${esc(params.get(name) || '')}" placeholder="${esc(placeholder)}"></label>`;
      const pageURL = page => { const result = new URLSearchParams(params); result.set('page', page); return location.pathname + '?' + result; };
      const renderHistory = () => {
        const items = historyData.items || [];
        const page = Number(historyData.page) || 1;
        const pages = Number(historyData.totalPages) || 1;
        find('.profile-history-card .profile-card-heading p').textContent = tp('aggregatedDesc', 'Historique complet agrégé des sessions démarrées.') + ' — ' + number(historyData.total) + ' session' + (historyData.total > 1 ? 's' : '');
        const previousHistoryRoot = find('#profile-history');
        const historyRoot = previousHistoryRoot.cloneNode(false);
        historyRoot.removeAttribute('aria-busy');
        previousHistoryRoot.replaceWith(historyRoot);
        if (!(detail.hasHistory || items.length || params.size)) {
          find('.profile-history-card .profile-card-heading p').textContent = tp('noHistory', 'Aucun historique de lecture.');
          historyRoot.innerHTML = ''; return;
        }
        historyRoot.innerHTML = `<form id="profile-history-form"><div class="profile-history-toolbar"><div class="profile-history-search"><input class="form-input" type="search" name="query" aria-label="${esc(tr('common.search', 'Rechercher'))}" value="${esc(params.get('query') || '')}" placeholder="${esc(tl('searchPlaceholder', 'Chercher par utilisateur, titre, IP...'))}"></div><div class="profile-history-tools"><button type="button" class="btn btn-secondary btn-sm" id="profile-saved-filters">${esc(tr('common.savedFilters', 'Filtres sauvegardés'))}</button><button type="button" class="btn btn-secondary btn-sm" id="profile-columns">${esc(tr('common.columns', 'Colonnes'))}</button><div class="profile-exports"><button type="button" data-export="csv">↓ CSV</button><button type="button" data-export="json">↓ JSON</button></div></div></div>
          <div class="profile-filter-divider"><div class="profile-filter-controls"><label class="profile-checkbox"><input name="hideZapped" type="checkbox" ${params.get('hideZapped') !== 'false' ? 'checked' : ''}>${esc(tl('hideZapped', 'Masquer Zappés (< 1m)'))}</label><button type="button" class="btn btn-ghost btn-sm" id="profile-filter-toggle" aria-expanded="${advancedOpen}">☷ ${esc(tr('common.filters', 'Filtres'))}</button>${[...params.keys()].some(key => !['cols', 'page'].includes(key)) ? `<button type="button" class="btn btn-ghost btn-sm profile-reset" id="profile-filter-reset">↶ ${esc(tr('common.reset', 'Réinitialiser'))}</button>` : ''}<select name="sort" class="form-select" aria-label="${esc(tl('sortBy', 'Trier'))}">${[['date_desc', 'sortDateDesc', 'Date décroissante'], ['date_asc', 'sortDateAsc', 'Date croissante'], ['duration_desc', 'sortDurationDesc', 'Durée décroissante'], ['duration_asc', 'sortDurationAsc', 'Durée croissante']].map(([value, key, label]) => `<option value="${value}"${(params.get('sort') || 'date_desc') === value ? ' selected' : ''}>${esc(tl(key, label))}</option>`).join('')}</select><button class="btn btn-primary btn-sm" type="submit">${esc(tr('common.search', 'Rechercher'))}</button></div>
          <div class="profile-advanced" ${advancedOpen ? '' : 'hidden'}><div><h4>${esc(tl('quickPresets', 'Raccourcis'))}</h4><div class="profile-filter-chips">${[['all', 'Tout'], ['transcode', '⚡ Transcodages'], ['directPlay', '🚀 Direct Play'], ['4k', '🌟 4K'], ['zapped', 'Zappés']].map(([value, label]) => `<button type="button" data-preset="${value}">${esc(label)}</button>`).join('')}</div></div><div><h4>${esc(tr('common.type', 'Type'))}</h4><div class="profile-filter-chips">${[['', tr('common.all', 'Tout')], ['Movie', tl('moviesFilter', 'Films')], ['Episode', tl('seriesFilter', 'Séries')], ['Audio', tl('musicFilter', 'Musique')], ['AudioBook', tl('booksFilter', 'Livres')]].map(([value, label]) => `<button type="button" data-type="${value}" class="${value ? (params.get('type') || '').split(',').includes(value) ? 'active' : '' : !params.get('type') ? 'active' : ''}">${esc(label)}</button>`).join('')}</div></div><div class="profile-advanced-fields">${filterInput('client', tl('clientFilter', 'Client / App'), 'ex: Jellyfin Web, Android')}${filterInput('audio', tl('audioFilter', 'Audio (Codec / Langue)'), 'ex: aac, fre, eng')}${filterInput('subtitle', tl('subtitleFilter', 'Sous-titres (Codec / Langue)'), 'ex: subrip, eng, fre')}<div class="profile-date-fields">${filterInput('dateFrom', tl('dateFrom', 'Depuis'), '', 'date')}${filterInput('dateTo', tl('dateTo', "Jusqu'au"), '', 'date')}</div></div></div></div></form>
          <div class="profile-history-table"><table><colgroup>${columns.map(column => `<col data-column="${column}" style="width:${Math.max(48, Math.min(1200, Number(widths[column]) || WIDTHS[column]))}px">`).join('')}</colgroup><thead><tr>${columns.map(column => `<th scope="col" draggable="true" data-column="${column}" class="profile-col-${column}">${esc(columnName(column))}<span class="profile-column-resizer" data-resize="${column}"></span></th>`).join('')}</tr></thead><tbody>${items.length ? items.map((item, index) => `<tr data-session="${index}" tabindex="0" aria-label="${esc(tr('common.details', 'Détails') + ': ' + (item.title || '—'))}">${columns.map(column => `<td class="profile-col-${column}">${cell(column, item, index)}</td>`).join('')}</tr><tr class="profile-expanded" data-expanded="${index}" hidden><td colspan="${columns.length}">${timeline(item)}</td></tr>`).join('') : `<tr><td colspan="${columns.length}"><div class="profile-empty">${esc(tl('noResults', 'Aucun log ne correspond à vos critères.'))}</div></td></tr>`}</tbody></table></div>
          ${pages > 1 ? `<nav class="profile-pagination" aria-label="Pagination">${page > 1 ? `<a href="${esc(pageURL(page - 1))}" data-profile-page="${page - 1}" class="btn btn-secondary btn-sm" aria-label="${esc(tr('common.previous', 'Précédent'))}">‹</a>` : ''}${Array.from({ length: pages }, (_, index) => index + 1).filter(value => value === 1 || value === pages || Math.abs(value - page) <= 2).map((value, index, values) => `${index > 0 && value - values[index - 1] > 1 ? '<span>…</span>' : ''}<a href="${esc(pageURL(value))}" data-profile-page="${value}" ${value === page ? 'aria-current="page"' : ''}>${value}</a>`).join('')}${page < pages ? `<a href="${esc(pageURL(page + 1))}" data-profile-page="${page + 1}" class="btn btn-secondary btn-sm" aria-label="${esc(tr('common.next', 'Suivant'))}">›</a>` : ''}<span>Page ${page} / ${pages}</span></nav>` : ''}`;
        const form = find('#profile-history-form');
        const applyForm = () => {
          const values = new FormData(form);
          const from = values.get('dateFrom'); const to = values.get('dateTo');
          const endField = form.elements.namedItem('dateTo');
          if (from && to && from > to) { endField.setCustomValidity(tl('invalidDates', 'La date de fin doit suivre la date de début.')); form.reportValidity(); return; }
          endField.setCustomValidity('');
          const updates = Object.fromEntries(filters.filter(key => key !== 'resolution' && key !== 'playMethod').map(key => [key, String(values.get(key) || '').trim()]));
          updates.hideZapped = values.has('hideZapped') ? 'true' : 'false';
          navigateFilters(updates);
        };
        listen(form, 'submit', event => { event.preventDefault(); applyForm(); });
        listen(form.elements.namedItem('dateTo'), 'input', event => event.target.setCustomValidity(''));
        listen(form.elements.namedItem('dateFrom'), 'input', () => form.elements.namedItem('dateTo').setCustomValidity(''));
        listen(form.elements.namedItem('hideZapped'), 'change', applyForm);
        listen(form.elements.namedItem('sort'), 'change', applyForm);
        listen(find('#profile-filter-toggle'), 'click', event => { advancedOpen = !advancedOpen; event.currentTarget.setAttribute('aria-expanded', String(advancedOpen)); find('.profile-advanced').hidden = !advancedOpen; });
        listen(find('#profile-filter-reset'), 'click', () => { Array.from(params.keys()).forEach(key => { if (key !== 'cols') params.delete(key); }); advancedOpen = false; writeURL(); loadHistory(); });
        listen(historyRoot, 'click', event => {
          const type = event.target.closest('[data-type]');
          if (type) { let types = (params.get('type') || '').split(',').filter(Boolean); const value = type.dataset.type; types = value ? types.includes(value) ? types.filter(item => item !== value) : [...types, value] : []; navigateFilters({ type: types.join(',') }); }
          const preset = event.target.closest('[data-preset]');
          if (preset) {
            const kind = preset.dataset.preset;
            navigateFilters({ playMethod: kind === 'transcode' ? 'Transcode' : kind === 'directPlay' ? 'DirectPlay' : '', resolution: kind === '4k' ? '4K' : '', hideZapped: kind === 'zapped' ? 'false' : 'true' });
          }
          const pageButton = event.target.closest('[data-profile-page]');
          if (pageButton) { event.preventDefault(); event.stopPropagation(); params.set('page', pageButton.dataset.profilePage); writeURL(); loadHistory(); }
          const expand = event.target.closest('[data-expand]');
          if (expand) { const expanded = find('[data-expanded="' + expand.dataset.expand + '"]'); expanded.hidden = !expanded.hidden; expand.setAttribute('aria-expanded', String(!expanded.hidden)); return; }
          const row = event.target.closest('[data-session]');
          if (row && !event.target.closest('a,button')) openSession(items[Number(row.dataset.session)]);
        });
        listen(find('.profile-history-table'), 'keydown', event => { const row = event.target.closest('[data-session]'); if (row && event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openSession(items[Number(row.dataset.session)]); } });
        historyRoot.querySelectorAll('.profile-poster img').forEach(image => listen(image, 'error', () => image.remove()));
        let draggedColumn;
        listen(find('thead'), 'dragstart', event => { const heading = event.target.closest('th'); if (heading) { draggedColumn = heading.dataset.column; event.dataTransfer.setData('text/plain', draggedColumn); } });
        listen(find('thead'), 'dragover', event => event.preventDefault());
        listen(find('thead'), 'drop', event => { event.preventDefault(); const heading = event.target.closest('th'); if (heading && draggedColumn && columns.includes(draggedColumn)) { const position = columns.indexOf(heading.dataset.column); columns.splice(columns.indexOf(draggedColumn), 1); columns.splice(position, 0, draggedColumn); saveColumns(); } });
        historyRoot.querySelectorAll('[data-resize]').forEach(handle => listen(handle, 'pointerdown', event => {
          event.preventDefault(); event.stopPropagation();
          const column = handle.dataset.resize;
          const col = find('col[data-column="' + column + '"]');
          const origin = event.clientX; const width = parseFloat(col.style.width);
          handle.setPointerCapture(event.pointerId);
          const move = moveEvent => { widths[column] = Math.max(48, Math.min(1200, width + moveEvent.clientX - origin)); col.style.width = widths[column] + 'px'; };
          const stop = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', stop); persistColumns(); writeURL(); };
          handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', stop); handle.addEventListener('pointercancel', stop);
        }));
        listen(find('#profile-columns'), 'click', event => {
          const dialog = showPopover(event.currentTarget, `<div class="profile-column-options">${ALL_COLUMNS.map(column => `<label><input type="checkbox" value="${column}" ${columns.includes(column) ? 'checked' : ''}>${esc(columnName(column))}</label>`).join('')}</div><button type="button" class="btn btn-secondary profile-default-columns">${esc(tr('common.reset', 'Réinitialiser'))}</button>`, 'profile-columns-popover');
          listen(dialog.querySelector('.profile-column-options'), 'change', event => { const input = event.target; if (!input.checked && columns.length <= 2) { input.checked = true; return; } columns = input.checked ? [...columns, input.value] : columns.filter(column => column !== input.value); saveColumns(); });
          listen(dialog.querySelector('.profile-default-columns'), 'click', () => { columns = DEFAULT_COLUMNS.slice(); saveColumns(); dialog.close(); });
        });
        listen(find('#profile-saved-filters'), 'click', clickEvent => {
          let saved = [];
          try { saved = JSON.parse(localStorage.getItem('jellytrack-saved-filters') || '[]'); } catch (_) {}
          if (!Array.isArray(saved)) saved = [];
          const renderSaved = dialog => {
            dialog.querySelector('.profile-saved-list').innerHTML = saved.map((filter, index) => `<div><button type="button" data-load-filter="${index}" class="btn btn-secondary">${esc(filter.name)}</button><button type="button" data-remove-filter="${index}" aria-label="${esc(tr('common.delete', 'Supprimer'))}">×</button></div>`).join('') || `<p>${esc(tr('common.noData', 'Aucune donnée'))}</p>`;
          };
          const dialog = showPopover(clickEvent.currentTarget, `<div class="profile-saved-list"></div><button type="button" class="btn btn-ghost profile-save-start" ${saved.length >= 10 ? 'disabled' : ''}>${esc(tr('common.saveCurrentFilter', 'Sauvegarder le filtre actuel'))}</button><form class="profile-save-form" hidden><label><input class="form-input" name="name" aria-label="${esc(tr('common.filterName', 'Nom du filtre'))}" placeholder="${esc(tr('common.filterName', 'Nom du filtre'))}" maxlength="80" required></label><button type="submit" class="btn btn-primary">${esc(tr('common.save', 'Enregistrer'))}</button></form>`, 'profile-saved-popover');
          renderSaved(dialog);
          listen(dialog.querySelector('.profile-save-start'), 'click', event => { event.currentTarget.hidden = true; dialog.querySelector('form').hidden = false; dialog.querySelector('input').focus(); });
          listen(dialog.querySelector('form'), 'submit', event => { event.preventDefault(); const name = new FormData(event.target).get('name').trim(); if (!name) return; saved = [{ name, url: location.pathname + '?' + params, createdAt: new Date().toISOString() }, ...saved].slice(0, 10); localStorage.setItem('jellytrack-saved-filters', JSON.stringify(saved)); renderSaved(dialog); event.target.reset(); event.target.hidden = true; dialog.querySelector('.profile-save-start').hidden = false; dialog.querySelector('.profile-save-start').disabled = saved.length >= 10; });
          listen(dialog.querySelector('.profile-saved-list'), 'click', event => { const remove = event.target.closest('[data-remove-filter]'); const load = event.target.closest('[data-load-filter]'); if (remove) { saved.splice(Number(remove.dataset.removeFilter), 1); localStorage.setItem('jellytrack-saved-filters', JSON.stringify(saved)); renderSaved(dialog); dialog.querySelector('.profile-save-start').disabled = saved.length >= 10; } else if (load) { const entry = saved[Number(load.dataset.loadFilter)]; const url = new URL(entry.url || location.pathname + '?' + (entry.query || ''), location.origin); dialog.close(); if (url.origin !== location.origin) return; Router.navigate(url.pathname + url.search); } });
        });
        historyRoot.querySelectorAll('[data-export]').forEach(button => listen(button, 'click', async () => {
          button.disabled = true;
          try {
            const query = new URLSearchParams(params); query.set('export', 'true');
            const response = await API.getJSON('/api/users/' + encodeURIComponent(userId) + '?' + query);
            if (!alive()) return;
            const rows = response.history && response.history.items || [];
            const isJSON = button.dataset.export === 'json';
            const keys = ['startedAt', 'endedAt', 'title', 'type', 'clientName', 'deviceName', 'resolution', 'bitrate', 'playMethod', 'durationWatched', 'ipAddress', 'audioLanguage', 'audioCodec', 'subtitleLanguage', 'subtitleCodec'];
            const quote = value => '"' + String(value == null ? '' : value).replace(/^[\t\r\n ]*[=+@-]/, match => "'" + match).replace(/"/g, '""') + '"';
            const content = isJSON ? JSON.stringify(rows, null, 2) : '\uFEFF' + [keys, ...rows.map(row => keys.map(key => row[key]))].map(row => row.map(quote).join(',')).join('\r\n');
            const url = URL.createObjectURL(new Blob([content], { type: isJSON ? 'application/json' : 'text/csv;charset=utf-8' }));
            const link = document.createElement('a'); link.href = url; link.download = 'jellytrack-user-history.' + (isJSON ? 'json' : 'csv'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (error) { if (alive()) Toast.error(error.message); } finally { if (button.isConnected) button.disabled = false; }
        }));
      };
      const openSession = item => {
        if (!item) return;
        const dialog = showDialog(item.title || tp('playbackHistory', 'Historique de lecture'), `${item.mediaSubtitle ? `<p class="profile-caption profile-session-subtitle">${esc(item.mediaSubtitle)}</p>` : ''}<p class="profile-session-user">${esc(username)} - ${esc(item.clientName || tl('unknown', 'Inconnu'))}</p>${timeline(item, true)}`);
        dialog.classList.add('profile-session-modal');
      };
      const loadHistory = async () => {
        const sequence = ++requestID;
        const container = find('#profile-history');
        container.setAttribute('aria-busy', 'true');
        container.querySelectorAll('button, input, select').forEach(element => element.disabled = true);
        try {
          const response = await API.getJSON('/api/users/' + encodeURIComponent(userId) + '?' + params);
          if (!alive() || sequence !== requestID) return;
          historyData = response.history || { items: [], total: 0, totalPages: 1, page: 1 };
          renderHistory();
        } catch (error) {
          if (alive() && sequence === requestID) { Toast.error(error.message); container.querySelectorAll('button, input, select').forEach(element => element.disabled = false); }
        } finally { if (alive() && sequence === requestID) container.removeAttribute('aria-busy'); }
      };
      renderHistory();
    },
  };
})();



