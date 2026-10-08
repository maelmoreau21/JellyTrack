/** Playback history uses the existing Go endpoints and owns its page lifetime. */
(function () {
  'use strict';

  window.JellyTrackHistory = {
    async mount({ main, api, utils, i18n, signal, user }) {
      const esc = value => utils.escapeHtml(value == null ? '' : String(value));
      const t = (key, fallback, params = {}) => i18n.t(key, params) || fallback;
      const isAdmin = Boolean(user && (user.isAdmin || String(user.role).toLowerCase() === 'admin'));
      const params = new URLSearchParams(window.location.search);
      if (params.has('query') && !params.has('q')) params.set('q', params.get('query'));
      const requestedOffset = Number(params.get('offset')) || ((Number(params.get('page')) || 1) - 1) * 50;
      let offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
      let requestID = 0;
      let currentItems = [];
      main.innerHTML = `
        <section id="playback-history-page">
          <div class="page-header"><div><h1 class="page-title">${esc(t('nav.logs', 'Journaux'))}</h1>
            <p class="page-subtitle">${esc(t('logs.description', 'Historique complet des lectures et événements de télémétrie.'))}</p></div></div>
          <div class="segmented-control" role="tablist" aria-label="${esc(t('nav.logs', 'Journaux'))}">
            <button type="button" class="segment-btn active" id="history-tab-playback" role="tab" aria-selected="true">${esc(t('logs.tabApplication', 'Lectures'))}</button>
            ${isAdmin ? `<button type="button" class="segment-btn" id="history-tab-system" role="tab" aria-selected="false">${esc(t('logs.tabSystem', 'Système'))}</button>` : ''}
          </div>
          <div id="history-playback-panel" role="tabpanel">
            <form id="history-filters" class="card history-filters">
              <label>${esc(t('common.search', 'Rechercher'))}<input name="q" class="form-input" type="search" value="${esc(params.get('q'))}" placeholder="${esc(t('logs.searchPlaceholder', 'Chercher par utilisateur, titre, IP...'))}"></label>
              <label>${esc(t('common.type', 'Type'))}<select name="type" class="form-select">
                <option value="">${esc(t('common.all', 'Tout'))}</option>
                <option value="Movie">${esc(t('logs.moviesFilter', 'Films'))}</option>
                <option value="Episode">${esc(t('logs.seriesFilter', 'Épisodes'))}</option>
                <option value="Audio">${esc(t('logs.musicFilter', 'Musique'))}</option>
                <option value="Book">${esc(t('logs.booksFilter', 'Livres'))}</option>
              </select></label>
              <label>${esc(t('logs.colClient', 'Application'))}<input name="client" class="form-input" value="${esc(params.get('client'))}"></label>
              <label>${esc(t('logs.colStatus', 'Méthode'))}<select name="playMethod" class="form-select"><option value="">${esc(t('common.all', 'Tout'))}</option><option>DirectPlay</option><option>DirectStream</option><option>Transcode</option><option>Download</option></select></label>
              <label>${esc(t('logs.dateFrom', 'Date (Depuis)'))}<input name="dateFrom" class="form-input" type="date" value="${esc(params.get('dateFrom'))}"></label>
              <label>${esc(t('logs.dateTo', "Date (Jusqu'au)"))}<input name="dateTo" class="form-input" type="date" value="${esc(params.get('dateTo'))}"></label>
              <label>${esc(t('charts.hours', 'Heures'))} (UTC)<select name="hour" class="form-select"><option value="">${esc(t('common.all', 'Tout'))}</option>${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`).join('')}</select></label>
              <label>${esc(t('logs.sortBy', 'Trier'))}<select name="sort" class="form-select"><option value="date_desc">${esc(t('logs.sortDateDesc', 'Date décroissante'))}</option><option value="date_asc">${esc(t('logs.sortDateAsc', 'Date croissante'))}</option><option value="duration_desc">${esc(t('logs.sortDurationDesc', 'Durée décroissante'))}</option><option value="duration_asc">${esc(t('logs.sortDurationAsc', 'Durée croissante'))}</option></select></label>
              <label class="history-checkbox"><input type="checkbox" name="hideZapped" ${params.get('hideZapped') !== 'false' ? 'checked' : ''}>${esc(t('logs.hideZapped', 'Masquer Zappés (< 1m)'))}</label>
              <div class="page-actions"><button class="btn btn-primary" type="submit">${esc(t('common.apply', 'Appliquer'))}</button><button class="btn btn-secondary" id="history-reset" type="button">${esc(t('common.reset', 'Réinitialiser'))}</button></div>
            </form>
            <div class="page-actions history-pagination"><span id="history-summary" aria-live="polite"></span><button class="btn btn-secondary btn-sm" id="history-export" type="button" disabled>${esc(t('logs.exportPage', 'Exporter cette page (CSV)'))}</button></div>
            <div class="card table-wrapper"><table class="table"><thead><tr>
              <th>${esc(t('logs.colMedia', 'Média'))}</th><th>${esc(t('logs.colUser', 'Utilisateur'))}</th><th>${esc(t('logs.colClient', 'Application'))}</th><th>${esc(t('logs.colDuration', 'Durée'))}</th><th>${esc(t('logs.colStatus', 'Méthode'))}</th><th>${esc(t('logs.colDate', 'Date'))}</th><th>${esc(t('common.details', 'Détails'))}</th>
            </tr></thead><tbody id="history-rows"></tbody></table></div>
            <div class="page-actions history-pagination"><button id="history-prev" class="btn btn-secondary" type="button">${esc(t('common.previous', 'Précédent'))}</button><span id="history-page-number"></span><button id="history-next" class="btn btn-secondary" type="button">${esc(t('common.next', 'Suivant'))}</button></div>
          </div>
          <div id="history-system-panel" role="tabpanel" hidden></div>
        </section>`;
      const root = main.querySelector('#playback-history-page');
      const alive = () => !(signal && signal.aborted) && main.contains(root);
      const find = selector => root.querySelector(selector);
      const listen = (element, name, callback) => element && element.addEventListener(name, callback, signal ? { signal } : undefined);
      const get = async url => {
        const response = await api.request(url, signal ? { signal } : {});
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        return response.json();
      };
      const form = find('#history-filters');
      for (const name of ['dateFrom', 'dateTo']) {
        listen(form.elements.namedItem(name), 'input', () => form.elements.namedItem('dateTo').setCustomValidity(''));
      }
      for (const key of ['type', 'playMethod', 'hour', 'sort']) {
        if (params.has(key)) form.elements.namedItem(key).value = params.get(key);
      }
      const writeURL = () => {
        params.delete('page');
        params.delete('query');
        params.set('offset', String(offset));
        window.history.replaceState({}, '', '/logs?' + params.toString());
      };
      const load = async () => {
        const sequence = ++requestID;
        const query = new URLSearchParams(params);
        query.set('days', 'all');
        query.set('limit', '50');
        query.set('offset', String(offset));
        find('#history-rows').innerHTML = `<tr><td colspan="7">${esc(t('common.loading', 'Chargement…'))}</td></tr>`;
        find('#history-next').disabled = true;
        find('#history-prev').disabled = true;
        find('#history-export').disabled = true;
        try {
          const data = await get('/api/history?' + query.toString());
          if (!alive() || sequence !== requestID) return;
          currentItems = Array.isArray(data.items) ? data.items : [];
          const total = Number.isFinite(Number(data.total)) ? Number(data.total) : null;
          find('#history-summary').textContent = total === null ? `${offset + currentItems.length} ${t('charts.sessions', 'sessions')}` : `${total} ${t('charts.sessions', 'sessions')}`;
          find('#history-page-number').textContent = `${Math.floor(offset / 50) + 1}${total !== null ? ' / ' + Math.max(1, Math.ceil(total / 50)) : ''}`;
          find('#history-prev').disabled = offset === 0;
          find('#history-next').disabled = total !== null ? offset + currentItems.length >= total : currentItems.length < 50;
          find('#history-export').disabled = currentItems.length === 0;
          find('#history-rows').innerHTML = currentItems.length ? currentItems.map((item, index) => `
            <tr><td><div class="history-media">
              ${item.jellyfinMediaId ? `<img width="30" height="44" loading="lazy" alt="" src="/api/jellyfin/image?id=${encodeURIComponent(item.jellyfinMediaId)}${item.serverId ? '&serverId=' + encodeURIComponent(item.serverId) : ''}&type=Primary&maxWidth=100">` : ''}
              <div><a href="/media/${encodeURIComponent(item.mediaId)}" data-link>${esc(item.title)}</a><div class="text-muted-foreground text-xs">${esc(item.library)} · ${esc(item.type)}</div></div></div></td>
              <td>${item.userId ? `<a href="/users/${encodeURIComponent(item.userId)}" data-link>${esc(item.username || t('common.deletedUser', 'Utilisateur supprimé'))}</a>` : esc(item.username || t('common.deletedUser', 'Utilisateur supprimé'))}</td>
              <td>${esc(item.clientName || '—')}</td><td>${esc(utils.formatMs(item.durationMs))}</td>
              <td><span class="badge ${item.playMethod === 'DirectPlay' ? 'badge-success' : item.playMethod === 'Transcode' ? 'badge-warning' : 'badge-secondary'}">${esc(item.playMethod || '—')}</span></td>
              <td>${esc(utils.formatDateTime(item.startedAt))}</td><td><button class="btn btn-secondary btn-sm" type="button" data-session-index="${index}">${esc(t('common.details', 'Détails'))}</button></td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state">${esc(t('logs.noResults', 'Aucun log ne correspond à vos critères.'))}</div></td></tr>`;
        } catch (error) {
          if (!alive() || sequence !== requestID) return;
          find('#history-summary').textContent = '';
          find('#history-rows').innerHTML = `<tr><td colspan="7" role="alert">${esc(error.message)} <button type="button" id="history-retry" class="btn btn-secondary btn-sm">${esc(t('common.retry', 'Réessayer'))}</button></td></tr>`;
          listen(find('#history-retry'), 'click', load);
        }
      };
      listen(form, 'submit', event => {
        event.preventDefault();
        const values = new FormData(form);
        const from = values.get('dateFrom');
        const to = values.get('dateTo');
        if (from && to && from > to) {
          form.elements.namedItem('dateTo').setCustomValidity(t('logs.invalidDates', 'La date de fin doit suivre la date de début.'));
          form.reportValidity();
          return;
        }
        form.elements.namedItem('dateTo').setCustomValidity('');
        for (const key of ['q', 'type', 'client', 'playMethod', 'dateFrom', 'dateTo', 'hour', 'sort']) {
          const value = String(values.get(key) || '').trim();
          if (value) params.set(key, value); else params.delete(key);
        }
        params.set('hideZapped', values.has('hideZapped') ? 'true' : 'false');
        offset = 0;
        writeURL();
        load();
      });
      listen(form.elements.namedItem('dateTo'), 'input', () => form.elements.namedItem('dateTo').setCustomValidity(''));
      listen(find('#history-reset'), 'click', () => {
        Array.from(params.keys()).forEach(key => params.delete(key));
        form.reset();
        for (const key of ['q', 'client', 'dateFrom', 'dateTo', 'type', 'hour', 'playMethod']) form.elements.namedItem(key).value = '';
        form.elements.namedItem('sort').value = 'date_desc';
        form.elements.namedItem('hideZapped').checked = true;
        form.elements.namedItem('dateTo').setCustomValidity('');
        params.set('hideZapped', 'true');
        offset = 0;
        writeURL();
        load();
      });
      listen(find('#history-prev'), 'click', () => { offset = Math.max(0, offset - 50); writeURL(); load(); });
      listen(find('#history-next'), 'click', () => { offset += 50; writeURL(); load(); });
      listen(find('#history-export'), 'click', () => {
        const quote = value => '"' + String(value == null ? '' : value).replace(/^[\t\r\n ]*[=+@-]/, match => "'" + match).replace(/"/g, '""') + '"';
        const columns = ['title', 'username', 'type', 'clientName', 'durationMs', 'playMethod', 'startedAt', 'endedAt'];
        const csv = '\uFEFF' + [columns, ...currentItems.map(item => columns.map(column => item[column]))].map(row => row.map(quote).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'jellytrack-history.csv';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      });
      listen(find('#history-rows'), 'click', async event => {
        const button = event.target.closest('[data-session-index]');
        if (!button) return;
        const item = currentItems[Number(button.dataset.sessionIndex)];
        if (!item) return;
        const dialog = document.createElement('dialog');
        dialog.className = 'history-session-dialog';
        dialog.innerHTML = `<div class="modal-header"><h2 class="modal-title">${esc(item.title)}</h2><button class="btn btn-secondary btn-sm" type="button">${esc(t('common.close', 'Fermer'))}</button></div>
          <div class="modal-body"><dl class="history-session-fields">${[
            [t('logs.colUser', 'Utilisateur'), item.username], [t('logs.colStartedAt', 'Début'), utils.formatDateTime(item.startedAt)],
            [t('logs.colEndedAt', 'Fin'), item.endedAt ? utils.formatDateTime(item.endedAt) : t('logs.inProgress', 'En cours')],
            [t('logs.colDuration', 'Durée'), utils.formatMs(item.durationMs)], [t('logs.colClient', 'Application'), item.clientName],
            [t('logs.colStatus', 'Méthode'), item.playMethod], [t('logs.colResolution', 'Résolution'), item.resolution],
            [t('logs.colIp', 'Adresse IP'), item.ipAddress],
          ].filter(([, value]) => value != null && value !== '').map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>
          ${isAdmin ? `<h3>${esc(t('logs.telemetry', 'Télémétrie'))}</h3><div class="history-telemetry">${esc(t('common.loading', 'Chargement…'))}</div>` : ''}</div>`;
        root.appendChild(dialog);
        dialog.querySelector('button').addEventListener('click', () => dialog.close());
        const dismissDialog = () => { dialog.close(); dialog.remove(); };
        dialog.addEventListener('close', () => {
          if (signal) signal.removeEventListener('abort', dismissDialog);
          dialog.remove();
        }, { once: true });
        if (signal) signal.addEventListener('abort', dismissDialog, { once: true });
        dialog.showModal();
        if (isAdmin) {
          try {
            const data = await get('/api/streams/telemetry?playbackId=' + encodeURIComponent(item.id));
            if (!alive() || !dialog.isConnected) return;
            dialog.querySelector('.history-telemetry').innerHTML = data.events && data.events.length ? `<div class="table-wrapper"><table class="table"><thead><tr><th>${esc(t('logs.timeline.label.default', 'Événement'))}</th><th>${esc(t('logs.position', 'Position'))}</th><th>${esc(t('logs.colDate', 'Date'))}</th></tr></thead><tbody>${data.events.map(e => `<tr><td>${esc(t('logs.timeline.label.' + e.eventType, e.eventType))}</td><td>${esc(utils.formatMs(Number(e.positionMs)))}</td><td>${esc(utils.formatDateTime(e.createdAt))}</td></tr>`).join('')}</tbody></table></div>` : esc(t('logs.noTelemetry', 'Aucun événement de télémétrie enregistré.'));
          } catch (error) {
            if (alive() && dialog.isConnected) dialog.querySelector('.history-telemetry').textContent = error.message;
          }
        }
      });
      let systemLoaded = false;
      const activateTab = async system => {
        find('#history-playback-panel').hidden = system;
        find('#history-system-panel').hidden = !system;
        for (const [id, selected] of [['#history-tab-playback', !system], ['#history-tab-system', system]]) {
          const button = find(id);
          if (button) { button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); }
        }
        if (!system || systemLoaded) return;
        const panel = find('#history-system-panel');
        panel.textContent = t('common.loading', 'Chargement…');
        try {
          const data = await get('/api/logs/system');
          if (!alive()) return;
          const logs = data.logs || [];
          panel.innerHTML = `<div class="page-actions history-pagination">${(data.files || []).map(file => `<a class="btn btn-secondary btn-sm" href="/api/logs/system/download?file=${encodeURIComponent(file.filename || file.name)}" download>${esc(file.filename || file.name)} (${esc(file.formattedSize || '')})</a>`).join('')}<button id="history-clear-system" class="btn btn-danger btn-sm" type="button">${esc(t('logs.clearLogs', 'Vider les logs'))}</button></div><div class="card table-wrapper"><table class="table"><thead><tr><th>${esc(t('logs.system.colAction', 'Action'))}</th><th>${esc(t('logs.system.colUser', 'Acteur'))}</th><th>${esc(t('logs.system.colMessage', 'Message'))}</th><th>${esc(t('logs.colDate', 'Date'))}</th></tr></thead><tbody>${logs.length ? logs.map(log => `<tr><td><span class="badge">${esc(log.action || log.level)}</span></td><td>${esc(log.actor)}</td><td class="history-system-message">${esc(log.details || log.message || log.msg)}</td><td>${esc(utils.formatDateTime(log.createdAt || log.time || log.timestamp))}</td></tr>`).join('') : `<tr><td colspan="4">${esc(t('logs.noResults', 'Aucun journal.'))}</td></tr>`}</tbody></table></div>`;
          systemLoaded = true;
          listen(find('#history-clear-system'), 'click', async () => {
            if (!window.confirm(t('logs.clearLogsConfirm', 'Voulez-vous vraiment effacer tous les journaux système ?'))) return;
            const button = find('#history-clear-system');
            button.disabled = true;
            try {
              await api.delete('/api/logs/system');
              if (alive()) { systemLoaded = false; await activateTab(true); }
            } catch (error) {
              if (alive()) { button.disabled = false; panel.appendChild(document.createTextNode(error.message)); }
            }
          });
        } catch (error) { if (alive()) panel.textContent = error.message; }
      };
      listen(find('#history-tab-playback'), 'click', () => activateTab(false));
      listen(find('#history-tab-system'), 'click', () => activateTab(true));
      await load();
    },
  };
})();
