/* Historical main /users management interface. Keep this module scoped to users. */
(function () {
  'use strict';

  const paths = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
    refresh: '<path d="M3 11a9 9 0 0 1 15.3-6.3L21 7M21 3v4h-4M21 13a9 9 0 0 1-15.3 6.3L3 17M7 17H3v4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    filter: '<path d="M4 4h16l-6.5 7.5V19l-3-1.5v-6z"/>',
    moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1a9 9 0 1 0 9.9 9.9Z"/>',
    userX: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M17 8l5 5M22 8l-5 5"/><circle cx="9" cy="7" r="4"/>',
    flame: '<path d="M12 3c2 4-1 5-1 8 0 2 2 3 3 1 1-1 1-3 1-3 4 4 5 8 2 11-3 3-8 2-10-1-3-5 1-8 5-16Z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    trash: '<path d="M3 6h18M19 6l-1 14H6L5 6M9 6V3h6v3M10 10v6M14 10v6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    loader: '<path d="M12 2a10 10 0 1 1-7.1 2.9"/>',
  };
  function icon(name, className = '') {
    return `<svg class="users-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  }
  function csvCell(value) {
    const raw = value == null ? '' : String(value);
    const safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
    const escaped = safe.replace(/"/g, '""');
    return /[",\r\n]/.test(escaped) ? '"' + escaped + '"' : escaped;
  }

  async function render(main, context) {
    const { API, State, Utils, I18n, Router } = context;
    const e = Utils.escapeHtml;
    const t = (key, fallback) => I18n.t(key) || fallback;
    if (!State.user || !State.user.isAdmin) {
      Router.navigate('/login');
      return;
    }
    let users = [], search = '', filterType = 'all', page = 1, busy = false, deleting = false;
    const pageSize = 25, now = Date.now();
    main.innerHTML = `<section class="users-reference" aria-label="${e(t('users.title', 'Utilisateurs'))}">
      <div class="users-toolbar">
        <div class="users-search">${icon('search')}<input id="users-search" type="search" placeholder="Filtrer par nom ou client..." aria-label="Filtrer par nom ou client" autocomplete="off" disabled></div>
        <div class="users-actions">
          <button type="button" class="users-button users-prune" id="users-prune" title="Détecter et supprimer les utilisateurs qui n'existent plus dans Jellyfin" disabled>${icon('refresh')}<span>Purger supprimés</span></button>
          <button type="button" class="users-button" id="users-export-csv" disabled>${icon('download')}<span>Export CSV</span></button>
          <button type="button" class="users-button" id="users-export-json" disabled>${icon('download')}<span>Export JSON</span></button>
        </div>
      </div>
      <div class="users-filters" role="group" aria-label="Filtres utilisateurs">
        <span class="users-filter-label">${icon('filter')} Filtres :</span>
        <button type="button" class="users-filter is-active" data-filter="all" aria-pressed="true" disabled>Tous (0)</button>
        <button type="button" class="users-filter" data-filter="inactive30" aria-pressed="false" disabled>${icon('moon')}Inactifs &gt; 30 jours</button>
        <button type="button" class="users-filter" data-filter="inactive90" aria-pressed="false" disabled>${icon('userX')}Inactifs &gt; 90 jours</button>
        <button type="button" class="users-filter" data-filter="transcoders" aria-pressed="false" disabled>${icon('flame')}Gros Transcodeurs (≥40%)</button>
        <button type="button" class="users-filter" data-filter="never" aria-pressed="false" disabled>Sans activité (0h)</button>
      </div>
      <div id="users-action-error" class="users-action-error" role="alert" hidden></div>
      <div class="users-table-card">
        <header class="users-card-header"><div><h1>${icon('users')}${e(t('users.title', 'Utilisateurs'))}</h1><p id="users-count" aria-live="polite">Chargement des utilisateurs…</p></div></header>
        <div class="users-card-content">
          <div class="users-table-scroll"><table class="users-table" aria-label="${e(t('users.title', 'Utilisateurs'))}">
            <thead><tr><th scope="col" class="users-rank">#</th><th scope="col">${e(t('users.colUser', 'Utilisateur'))}</th><th scope="col" class="users-right">Temps regardé</th><th scope="col" class="users-right">Sessions</th><th scope="col" class="users-center">Mode de flux</th><th scope="col">Client favori</th><th scope="col" class="users-right">${e(t('users.colLastActive', 'Dernière Act.'))}</th><th scope="col" class="users-right users-actions-column">Actions</th></tr></thead>
            <tbody id="users-body" aria-busy="true">${Array.from({length:8}, () => '<tr class="users-loading-row"><td colspan="8"><div class="skeleton"></div></td></tr>').join('')}</tbody>
          </table></div><div id="users-pagination" hidden></div>
        </div>
      </div>
      <dialog class="users-dialog" aria-labelledby="users-dialog-title"><button type="button" class="users-dialog-close" aria-label="Fermer">${icon('close')}</button><div id="users-dialog-content"></div></dialog>
    </section>`;
    const root = main.querySelector('.users-reference');
    const find = selector => root.querySelector(selector);
    const current = () => root.isConnected && main.firstElementChild === root;
    const modal = find('.users-dialog');
    State.pageCleanups.push(() => { if (modal.open) modal.close(); });
    function actionError(message) {
      const el = find('#users-action-error');
      el.textContent = message || '';
      el.hidden = !message;
    }
    function filtered() {
      const query = search.toLowerCase().trim();
      return users.filter(u => {
        if (query && !u.username.toLowerCase().includes(query) && !u.favoriteClient.toLowerCase().includes(query)) return false;
        const elapsed = now - (u.lastActive ? new Date(u.lastActive).getTime() : 0);
        if (filterType === 'inactive30') return !u.lastActive || elapsed > 30 * 86400000;
        if (filterType === 'inactive90') return !u.lastActive || elapsed > 90 * 86400000;
        if (filterType === 'transcoders') return u.transcodeRatio >= 40 && u.sessionsCount >= 3;
        if (filterType === 'never') return u.sessionsCount === 0 || !u.lastActive;
        return true;
      });
    }
    function lastActive(date) {
      if (!date) return '<span class="users-never">Jamais</span>';
      const d = new Date(date);
      if (!Number.isFinite(d.getTime())) return '<span class="users-never">Jamais</span>';
      return e(d.toLocaleDateString(State.locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
    }
    function draw() {
      const rows = filtered(), totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      page = Math.min(page, totalPages);
      find('#users-count').textContent = `${rows.length} utilisateur${rows.length > 1 ? 's' : ''} trouvé${rows.length > 1 ? 's' : ''}`;
      find('[data-filter="all"]').textContent = `Tous (${users.length})`;
      root.querySelectorAll('[data-filter]').forEach(button => {
        const selected = button.dataset.filter === filterType;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const body = find('#users-body');
      body.setAttribute('aria-busy', 'false');
      body.innerHTML = rows.slice((page - 1) * pageSize, page * pageSize).map((u, index) => {
        const initials = u.username.split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() || '').join('') || u.username.slice(0, 2).toUpperCase();
        const profileID = u.jellyfinUserId || u.id;
        return `<tr>
          <td class="users-rank">${(page - 1) * pageSize + index + 1}</td>
          <td><div class="users-identity"><a class="users-profile-link" href="/users/${encodeURIComponent(profileID)}" data-link><span class="users-avatar"><span>${e(initials)}</span><img src="/api/jellyfin/user-image?userId=${encodeURIComponent(profileID)}&fallback=none${u.serverId ? '&serverId=' + encodeURIComponent(u.serverId) : ''}" alt="${e(u.username)}" width="28" height="28" loading="lazy"></span><span>${e(u.username)}</span></a>${u.jellyfinUserId.startsWith('oidc-') ? '<span class="users-orphan">SSO Orphelin</span>' : ''}</div></td>
          <td class="users-right users-hours"><strong>${u.totalHours}</strong> h</td>
          <td class="users-right users-muted">${u.sessionsCount}</td>
          <td class="users-center">${u.sessionsCount > 0 ? `<div class="users-stream-mode"><span class="users-direct" title="DirectPlay">${100 - u.transcodeRatio}% DP</span><span class="users-muted">/</span><span class="${u.transcodeRatio >= 50 ? 'users-transcode' : 'users-muted'}" title="Transcode">${u.transcodeRatio}% TC</span></div>` : '<span class="users-muted users-small">-</span>'}</td>
          <td><span class="users-client">${icon('monitor')}<span title="${e(u.favoriteClient)}">${e(u.favoriteClient)}</span></span></td>
          <td class="users-right users-last-active">${lastActive(u.lastActive)}</td>
          <td class="users-right"><button type="button" class="users-delete" data-user-id="${e(u.id)}" title="Supprimer cet utilisateur de JellyTrack" aria-label="Supprimer ${e(u.username)} de JellyTrack">${icon('trash')}</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" class="users-empty">Aucun utilisateur ne correspond à ce filtre.</td></tr>';
      body.querySelectorAll('img').forEach(img => { img.addEventListener('error', () => { img.hidden = true; img.parentElement.classList.add('users-avatar-fallback'); }, { once: true }); });
      body.querySelectorAll('[data-user-id]').forEach(button => {
        button.addEventListener('click', () => openDelete(users.find(u => u.id === button.dataset.userId)));
      });
      const pagination = find('#users-pagination');
      pagination.hidden = totalPages <= 1;
      pagination.className = 'users-pagination';
      pagination.innerHTML = `<div>Page <strong>${page}</strong> sur <strong>${totalPages}</strong> (${rows.length} total)</div><div class="users-pagination-actions"><button type="button" class="users-button" id="users-previous" ${page <= 1 ? 'disabled' : ''}>${icon('left')}${e(t('common.previous', 'Précédent'))}</button><button type="button" class="users-button" id="users-next" ${page >= totalPages ? 'disabled' : ''}>${e(t('common.next', 'Suivant'))}${icon('right')}</button></div>`;
      find('#users-previous').onclick = () => { page = Math.max(1, page - 1); draw(); };
      find('#users-next').onclick = () => { page = Math.min(totalPages, page + 1); draw(); };
    }
    function showDialog(contents) {
      find('#users-dialog-content').innerHTML = contents;
      if (!modal.open) modal.showModal();
      root.querySelectorAll('[data-dialog-close]').forEach(button => { button.onclick = () => modal.close(); });
    }
    find('.users-dialog-close').onclick = () => { if (!deleting) modal.close(); };
    modal.addEventListener('cancel', event => { if (deleting) event.preventDefault(); });
    modal.addEventListener('click', event => { if (!deleting && event.target === modal) { const rect = modal.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close(); } });
    function openDelete(user) {
      if (!user) return;
      actionError(null);
      showDialog(`<header><h2 id="users-dialog-title" class="users-danger">${icon('trash')}Supprimer l'utilisateur de JellyTrack</h2><p>Êtes-vous certain de vouloir supprimer <strong>${e(user.username)}</strong> de JellyTrack ?</p></header>
        <div class="users-dialog-body"><p>Cette action supprimera définitivement tout l'historique de lecture, les flux en direct et les données associées à cet utilisateur dans JellyTrack.</p><div class="users-warning">⚠️ Si cet utilisateur existe encore dans Jellyfin, il sera automatiquement recréé lors de la prochaine synchronisation. Supprimez-le d'abord de Jellyfin si vous souhaitez le retirer définitivement.</div><p class="users-danger users-small" id="users-delete-error" role="alert" hidden></p></div>
        <footer><button type="button" class="users-button" data-dialog-close>Annuler</button><button type="button" class="users-button users-button-danger" id="users-confirm-delete">${icon('trash')}<span>Supprimer définitivement</span></button></footer>`);
      find('#users-confirm-delete').onclick = async () => {
        if (deleting) return;
        deleting = true;
        const confirm = find('#users-confirm-delete'), cancel = find('[data-dialog-close]'), close = find('.users-dialog-close');
        confirm.disabled = cancel.disabled = close.disabled = true;
        confirm.innerHTML = `${icon('loader', 'users-spin')}<span>Suppression…</span>`;
        try {
          await API.delete(`/api/admin/users/${encodeURIComponent(user.id)}`);
          if (!current()) return;
          modal.close();
          await load();
        } catch (err) {
          if (!current()) return;
          find('#users-delete-error').textContent = err.message || 'Erreur lors de la suppression';
          find('#users-delete-error').hidden = false;
        } finally {
          deleting = false;
          confirm.disabled = cancel.disabled = close.disabled = false;
          confirm.innerHTML = `${icon('trash')}<span>Supprimer définitivement</span>`;
        }
      };
    }
    function download(contents, type, extension) {
      const url = URL.createObjectURL(new Blob([contents], { type }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `jellytrack_users_${new Date().toISOString().slice(0, 10)}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    find('#users-export-csv').onclick = () => {
      const headers = ['Rank', 'Username', 'JellyfinUserId', 'TotalHours', 'SessionsCount', 'TranscodeCount', 'DirectPlayCount', 'TranscodeRatioPct', 'FavoriteClient', 'LastActive'];
      const rows = filtered().map((u, index) => [index + 1, u.username, u.jellyfinUserId, u.totalHours, u.sessionsCount, u.transcodeCount, u.directPlayCount, `${u.transcodeRatio}%`, u.favoriteClient, u.lastActive || 'Never']);
      download([headers.join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\n'), 'text/csv;charset=utf-8;', 'csv');
    };
    find('#users-export-json').onclick = () => download(JSON.stringify(filtered(), null, 2), 'application/json', 'json');
    find('#users-search').addEventListener('input', event => { search = event.target.value; page = 1; draw(); });
    root.querySelectorAll('[data-filter]').forEach(button => { button.onclick = () => { filterType = button.dataset.filter; page = 1; draw(); }; });
    find('#users-prune').onclick = async () => {
      if (busy) return;
      busy = true;
      actionError(null);
      const button = find('#users-prune');
      button.disabled = true;
      button.innerHTML = `${icon('loader', 'users-spin')}<span>Purger supprimés</span>`;
      try {
        const data = await API.postJSON('/api/admin/users/sync-deleted', {});
        if (!current()) return;
        const result = data.result || data;
        const total = Number(result.totalPruned) || 0;
        showDialog(`<header><h2 id="users-dialog-title">${icon('check', 'users-green')}Nettoyage des utilisateurs Jellyfin</h2><p>Synchronisation avec vos serveurs Jellyfin terminée.</p></header><div class="users-dialog-body">${total > 0 ? `<p class="users-green">${total} utilisateur${total > 1 ? 's' : ''} supprimé${total > 1 ? 's' : ''} de JellyTrack car absent${total > 1 ? 's' : ''} de Jellyfin :</p><ul class="users-pruned-list">${(result.prunedUsers || []).map(name => `<li>${e(name)}</li>`).join('')}</ul>` : '<p class="users-small">Aucun utilisateur orphelin trouvé. Tous les utilisateurs présents dans JellyTrack existent bien sur vos serveurs Jellyfin.</p>'}</div><footer><button type="button" class="users-button users-button-primary" data-dialog-close>Fermer</button></footer>`);
        await load();
      } catch (err) {
        if (current()) actionError(err.message || 'Erreur lors de la synchronisation');
      } finally {
        busy = false;
        button.disabled = false;
        button.innerHTML = `${icon('refresh')}<span>Purger supprimés</span>`;
      }
    };
    async function load() {
      const items = [];
      let offset = 0;
      while (true) {
        const data = await API.getJSON(`/api/users?limit=200&offset=${offset}`);
        if (!current()) return;
        const batch = Array.isArray(data.items) ? data.items : Array.isArray(data.users) ? data.users : [];
        items.push(...batch);
        offset += batch.length;
        if (batch.length < 200 || (Number.isFinite(Number(data.total)) && offset >= Number(data.total))) break;
      }
      users = items.map(u => ({
        id: String(u.id || ''), serverId: String(u.serverId || ''), jellyfinUserId: String(u.jellyfinUserId || ''), username: String(u.username || 'Utilisateur inconnu'),
        totalHours: Number.isFinite(Number(u.totalHours)) ? Number(Number(u.totalHours).toFixed(1)) : 0,
        sessionsCount: Number(u.sessionsCount) || 0, lastActive: u.lastActive && Number.isFinite(new Date(u.lastActive).getTime()) ? u.lastActive : null,
        favoriteClient: String(u.favoriteClient || 'Inconnu'), transcodeCount: Number(u.transcodeCount) || 0,
        directPlayCount: Number(u.directPlayCount) || 0, transcodeRatio: Math.max(0, Math.min(100, Math.round(Number(u.transcodeRatio) || 0))),
      })).sort((a, b) => b.totalHours - a.totalHours);
      draw();
      root.querySelectorAll('.users-toolbar button, .users-toolbar input, [data-filter]').forEach(el => { if (el.id !== 'users-prune' || !busy) el.disabled = false; });
    }
    try {
      await load();
    } catch (err) {
      if (!current() || err.name === 'AbortError') return;
      find('#users-count').textContent = 'Impossible de charger les utilisateurs';
      find('#users-body').setAttribute('aria-busy', 'false');
      find('#users-body').innerHTML = `<tr><td colspan="8" class="users-empty"><span role="alert">${e(err.message || 'Erreur de chargement')}</span><button type="button" class="users-button" id="users-retry">Réessayer</button></td></tr>`;
      find('#users-retry').onclick = () => render(main, context);
    }
  }
  window.UsersUI = { render };
})();
