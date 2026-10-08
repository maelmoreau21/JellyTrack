/**
 * JellyTrack Vanilla Client Application
 * Zero framework, zero Node/npm runtime dependency.
 * Direct Go API integration, i18n, Chart.js, HTML5 routing.
 */

(function () {
  'use strict';

  // =========================================================================
  // State & Utilities
  // =========================================================================

  const State = {
    user: null, // { username, role, isAdmin, csrfToken }
    locale: localStorage.getItem('jt_locale') || 'fr',
    translations: {},
    fallbackTranslations: {},
    activeStreamsCount: 0,
    streamPollInterval: null,
    currentPath: window.location.pathname || '/',
  };

  const Utils = {
    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    formatSeconds(seconds) {
      if (!seconds || seconds <= 0) return '0 min';
      const s = Math.round(seconds);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      if (h > 0) return `${h}h ${m > 0 ? m + 'm' : ''}`;
      return `${m} min`;
    },

    formatMs(ms) {
      return Utils.formatSeconds((ms || 0) / 1000);
    },

    formatDate(dateStr) {
      if (!dateStr) return '-';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString(State.locale === 'fr' ? 'fr-FR' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      } catch (e) {
        return dateStr;
      }
    },

    formatDateTime(dateStr) {
      if (!dateStr) return '-';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleString(State.locale === 'fr' ? 'fr-FR' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch (e) {
        return dateStr;
      }
    },

    formatNumber(num) {
      if (num === undefined || num === null) return '0';
      return new Intl.NumberFormat(State.locale === 'fr' ? 'fr-FR' : 'en-US').format(num);
    },

    timeAgo(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        const diffMs = Date.now() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return I18n.t('common.justNow') || 'À l’instant';
        if (diffMins < 60) return `${diffMins} min`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}j`;
      } catch (e) {
        return '';
      }
    },

    debounce(fn, delay = 300) {
      let timer = null;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },
  };

  // =========================================================================
  // Toast Notifications
  // =========================================================================

  const Toast = {
    show(message, type = 'info', duration = 3500) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      el.textContent = message;
      container.appendChild(el);

      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        setTimeout(() => el.remove(), 250);
      }, duration);
    },
    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error', 4500); },
    info(msg) { this.show(msg, 'info'); },
  };

  // =========================================================================
  // i18n Translation Engine
  // =========================================================================

  const I18n = {
    async init() {
      await this.loadLocale(State.locale);
      if (State.locale !== 'fr') {
        try {
          const res = await fetch('/assets/messages/fr.json');
          if (res.ok) State.fallbackTranslations = await res.json();
        } catch (e) {}
      }
      this.applyTranslationsToDOM();
    },

    async loadLocale(loc) {
      try {
        const res = await fetch(`/assets/messages/${loc}.json`);
        if (res.ok) {
          State.translations = await res.json();
          State.locale = loc;
          localStorage.setItem('jt_locale', loc);
        }
      } catch (e) {
        console.warn('Failed to load translations for', loc, e);
      }
    },

    t(path, params = {}, defaultVal = '') {
      const resolve = (obj, p) => p.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
      let val = resolve(State.translations, path);
      if (val === undefined) {
        val = resolve(State.fallbackTranslations, path);
      }
      if (val === undefined) {
        return defaultVal || '';
      }
      if (typeof val === 'string') {
        for (const [k, v] of Object.entries(params)) {
          val = val.replaceAll(`{${k}}`, v);
        }
      }
      return val;
    },

    applyTranslationsToDOM() {
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        const val = this.t(key);
        if (val && typeof val === 'string' && val.trim() !== '') {
          el.textContent = val;
        }
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        const val = this.t(key);
        if (val && typeof val === 'string' && val.trim() !== '') {
          el.setAttribute('placeholder', val);
        }
      });
    },

    async changeLocale(newLoc) {
      await this.loadLocale(newLoc);
      this.applyTranslationsToDOM();
      Router.navigate(window.location.pathname, false, true);
    },
  };

  // =========================================================================
  // Theme Manager
  // =========================================================================

  const Theme = {
    init() {
      const saved = localStorage.getItem('jt_theme') || 'dark';
      this.set(saved);
      const btn = document.getElementById('btn-theme-toggle');
      if (btn) {
        btn.addEventListener('click', () => this.toggle());
      }
    },
    isDark() {
      return document.documentElement.classList.contains('dark');
    },
    toggle() {
      const isDark = this.isDark();
      this.set(isDark ? 'light' : 'dark');
      if (window.location.pathname === '/' || window.location.pathname === '/dashboard') {
        Router.renderCurrent();
      }
    },
    set(theme) {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('jt_theme', theme);
    },
  };

  // =========================================================================
  // API Fetch Client
  // =========================================================================

  const API = {
    async request(url, options = {}) {
      const opts = { ...options };
      opts.headers = { ...opts.headers };

      if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(opts.body);
      }

      if (State.user && State.user.csrfToken && (opts.method === 'POST' || opts.method === 'PUT' || opts.method === 'PATCH' || opts.method === 'DELETE')) {
        opts.headers['X-CSRF-Token'] = State.user.csrfToken;
      }

      const res = await fetch(url, opts);
      if (res.status === 401 && !url.includes('/api/auth/me') && !url.includes('/api/auth/login')) {
        State.user = null;
        Router.navigate('/login');
        throw new Error('Session expirée');
      }

      return res;
    },

    async getJSON(url) {
      const res = await this.request(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur HTTP ${res.status}`);
      }
      return res.json();
    },

    async postJSON(url, body) {
      const res = await this.request(url, { method: 'POST', body });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur HTTP ${res.status}`);
      }
      return res.json();
    },

    async patchJSON(url, body) {
      const res = await this.request(url, { method: 'PATCH', body });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur HTTP ${res.status}`);
      }
      return res.json();
    },

    async delete(url) {
      const res = await this.request(url, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur HTTP ${res.status}`);
      }
      return res.json();
    },
  };

  // =========================================================================
  // Authentication & Session
  // =========================================================================

  const Auth = {
    async checkSession() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          State.user = await res.json();
          State.user.isAdmin = String(State.user.role).toLowerCase() === 'admin';
          this.updateUserUI();
          return true;
        }
      } catch (e) {}
      State.user = null;
      this.updateUserUI();
      return false;
    },

    updateUserUI() {
      const avatarEl = document.getElementById('sidebar-user-avatar');
      const nameEl = document.getElementById('sidebar-user-name');
      const userBadge = document.getElementById('sidebar-user-badge');
      const userSection = document.getElementById('nav-user-section');
      const adminSection = document.getElementById('nav-admin-section');
      const myProfileItem = document.getElementById('nav-item-my-profile');
      const myWrappedItem = document.getElementById('nav-item-my-wrapped');
      const backupBanner = document.getElementById('backup-server-banner');
      const backupDesc = document.getElementById('backup-server-desc');

      if (State.user) {
        const uname = State.user.username || 'User';
        if (avatarEl) avatarEl.textContent = uname.slice(0, 2).toUpperCase();
        if (nameEl) nameEl.textContent = uname;

        const currentUid = State.user.jellyfinUserId || State.user.id;

        // User account & Wrapped links
        if (userSection) {
          userSection.style.display = 'block';
          if (currentUid) {
            if (myProfileItem) {
              myProfileItem.setAttribute('data-route', `/users/${currentUid}`);
              const link = myProfileItem.querySelector('a');
              if (link) link.setAttribute('href', `/users/${currentUid}`);
            }
            if (myWrappedItem) {
              myWrappedItem.setAttribute('data-route', `/wrapped/${currentUid}`);
              const link = myWrappedItem.querySelector('a');
              if (link) link.setAttribute('href', `/wrapped/${currentUid}`);
            }
          }
        }

        // Click on user badge goes to profile
        if (userBadge && currentUid) {
          userBadge.style.cursor = 'pointer';
          userBadge.onclick = () => Router.navigate(`/users/${currentUid}`);
        }

        // Admin section & admin-only elements
        const isAdmin = Boolean(State.user.isAdmin);
        if (adminSection) adminSection.style.display = isAdmin ? 'block' : 'none';
        document.querySelectorAll('.nav-admin-only').forEach((el) => {
          el.style.display = isAdmin ? '' : 'none';
        });

        // Backup Server Banner
        if (backupBanner && State.user.authServerIsPrimary === false && State.user.authServerName) {
          backupBanner.style.display = 'block';
          if (backupDesc) {
            backupDesc.textContent = I18n.t('nav.backupServerDesc', { server: State.user.authServerName }) ||
              `Connecté sur ${State.user.authServerName}. Le serveur principal est indisponible.`;
          }
        } else if (backupBanner) {
          backupBanner.style.display = 'none';
        }
      } else {
        if (avatarEl) avatarEl.textContent = '?';
        if (nameEl) nameEl.textContent = I18n.t('common.anonymous') || 'Invité';
        if (userSection) userSection.style.display = 'none';
        if (adminSection) adminSection.style.display = 'none';
        if (backupBanner) backupBanner.style.display = 'none';
        document.querySelectorAll('.nav-admin-only').forEach((el) => {
          el.style.display = 'none';
        });
      }
    },

    async login(username, password, rememberMe = false) {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Identifiants invalides');
      }
      State.user = data;
      State.user.isAdmin = String(State.user.role).toLowerCase() === 'admin';
      this.updateUserUI();
      return data;
    },

    async logout() {
      try {
        await API.request('/api/auth/logout', { method: 'POST' });
      } catch (e) {}
      State.user = null;
      this.updateUserUI();
      Router.navigate('/login');
    },
  };

  // =========================================================================
  // Modals & Search Dialog
  // =========================================================================

  const Modal = {
    showAction({ title, bodyHtml, confirmText = 'Confirmer', cancelText = 'Annuler', onConfirm }) {
      const modal = document.getElementById('action-modal');
      const titleEl = document.getElementById('action-modal-title');
      const bodyEl = document.getElementById('action-modal-body');
      const confirmBtn = document.getElementById('action-modal-confirm');
      const cancelBtn = document.getElementById('action-modal-cancel');
      const closeBtn = document.getElementById('action-modal-close');

      titleEl.textContent = title;
      bodyEl.innerHTML = bodyHtml;
      confirmBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;

      const cleanup = () => {
        modal.classList.remove('open');
        confirmBtn.replaceWith(confirmBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        closeBtn.replaceWith(closeBtn.cloneNode(true));
      };

      document.getElementById('action-modal-cancel').onclick = cleanup;
      document.getElementById('action-modal-close').onclick = cleanup;
      document.getElementById('action-modal-confirm').onclick = async () => {
        if (onConfirm) await onConfirm();
        cleanup();
      };

      modal.classList.add('open');
    },

    closeAction() {
      const modal = document.getElementById('action-modal');
      if (modal) modal.classList.remove('open');
    },
  };

  const SearchDialog = {
    init() {
      const trigger = document.getElementById('search-trigger-btn');
      const sidebarTrigger = document.getElementById('sidebar-search-trigger');
      const modal = document.getElementById('search-modal');
      const closeBtn = document.getElementById('search-modal-close');
      const input = document.getElementById('search-modal-input');
      const resultsEl = document.getElementById('search-modal-results');

      const openSearch = () => {
        if (!modal) return;
        modal.classList.add('open');
        setTimeout(() => input && input.focus(), 100);
      };

      if (trigger) {
        trigger.addEventListener('click', openSearch);
      }
      if (sidebarTrigger) {
        sidebarTrigger.addEventListener('click', openSearch);
      }

      if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.classList.remove('open'));
      }

      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          modal.classList.add('open');
          setTimeout(() => input.focus(), 100);
        } else if (e.key === 'Escape' && modal.classList.contains('open')) {
          modal.classList.remove('open');
        }
      });

      const onSearch = Utils.debounce(async () => {
        const query = input.value.trim();
        if (query.length < 2) {
          resultsEl.innerHTML = '';
          return;
        }
        resultsEl.innerHTML = '<div class="skeleton" style="height: 60px;"></div>';
        try {
          const data = await API.getJSON(`/api/search?q=${encodeURIComponent(query)}`);
          let html = '';

          if ((!data.media || data.media.length === 0) && (!data.users || data.users.length === 0)) {
            resultsEl.innerHTML = `<div class="empty-state" style="padding: 1.5rem;"><p>${I18n.t('common.noResults') || 'Aucun résultat'}</p></div>`;
            return;
          }

          if (data.media && data.media.length > 0) {
            html += `<div style="font-size:0.75rem; font-weight:700; color:var(--muted-foreground); text-transform:uppercase;">Médias</div>`;
            data.media.forEach((m) => {
              html += `
                <a href="/media/${m.id}" class="card" data-link style="padding: 0.65rem; display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 32px; height: 48px; background: var(--surface-nested); border-radius: 4px; overflow: hidden; flex-shrink: 0;">
                    ${m.jellyfinMediaId ? `<img src="/api/jellyfin/image?id=${m.jellyfinMediaId}&type=Primary&maxWidth=100" style="width:100%; height:100%; object-fit:cover;">` : ''}
                  </div>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${Utils.escapeHtml(m.title)}</div>
                    <div style="font-size: 0.75rem; color: var(--muted-foreground);">${Utils.escapeHtml(m.type)} ${m.subtitle ? '• ' + Utils.escapeHtml(m.subtitle) : ''}</div>
                  </div>
                </a>
              `;
            });
          }

          if (data.users && data.users.length > 0) {
            html += `<div style="font-size:0.75rem; font-weight:700; color:var(--muted-foreground); text-transform:uppercase; margin-top:0.5rem;">Utilisateurs</div>`;
            data.users.forEach((u) => {
              html += `
                <a href="/users/${u.id}" class="card" data-link style="padding: 0.65rem; display: flex; align-items: center; gap: 0.75rem;">
                  <div class="user-avatar-mini" style="width: 32px; height: 32px;">${Utils.escapeHtml(u.username.slice(0, 2).toUpperCase())}</div>
                  <div style="font-weight: 600; font-size: 0.88rem;">${Utils.escapeHtml(u.username)}</div>
                </a>
              `;
            });
          }

          resultsEl.innerHTML = html;
        } catch (e) {
          resultsEl.innerHTML = `<p style="color:var(--destructive); font-size:0.85rem;">Erreur de recherche.</p>`;
        }
      }, 250);

      input.addEventListener('input', onSearch);
    },
  };

  // =========================================================================
  // Chart Helper (Clean Chart.js styling wrapper)
  // =========================================================================

  const ChartHelper = {
    instances: {},

    destroy(id) {
      if (this.instances[id]) {
        try { this.instances[id].destroy(); } catch (e) {}
        delete this.instances[id];
      }
      const canvas = document.getElementById(id);
      if (canvas) {
        canvas.style.display = '';
        const parent = canvas.parentElement;
        if (parent) {
          const emptyEl = parent.querySelector('.chart-empty-state');
          if (emptyEl) emptyEl.style.display = 'none';
        }
      }
    },

    showEmpty(id, message = 'Aucune donnée disponible') {
      this.destroy(id);
      const canvas = document.getElementById(id);
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      let emptyEl = parent.querySelector('.chart-empty-state');
      if (!emptyEl) {
        emptyEl = document.createElement('div');
        emptyEl.className = 'chart-empty-state';
        parent.appendChild(emptyEl);
      }
      emptyEl.innerHTML = `
        <svg class="chart-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
        </svg>
        <span>${message}</span>
      `;
      canvas.style.display = 'none';
      emptyEl.style.display = 'flex';
    },

    getThemeColors() {
      const isDark = document.documentElement.classList.contains('dark');
      return {
        text: isDark ? '#94A3B8' : '#64748B',
        grid: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.08)',
        tooltipBg: isDark ? '#0F172A' : '#FFFFFF',
        tooltipTitle: isDark ? '#F1F5F9' : '#0F172A',
        tooltipText: isDark ? '#94A3B8' : '#64748B',
        tooltipBorder: isDark ? 'rgba(34, 211, 238, 0.3)' : 'rgba(79, 70, 229, 0.25)',
        primary: isDark ? '#22D3EE' : '#4F46E5',
        primaryGlow: isDark ? 'rgba(34, 211, 238, 0.2)' : 'rgba(79, 70, 229, 0.15)',
        secondary: isDark ? '#A855F7' : '#7C3AED',
      };
    },

    formatCompactHours(val) {
      const v = Number(val);
      if (!Number.isFinite(v) || v === 0) return '0h';
      const abs = Math.abs(v);
      const sign = v < 0 ? '-' : '';
      if (abs < 1 / 60) return `${sign}${Math.max(1, Math.round(abs * 3600))}s`;
      if (abs < 1) return `${sign}${Math.round(abs * 60)}m`;
      if (abs < 10) return `${sign}${abs.toFixed(1).replace(/\.0$/, '')}h`;
      return `${sign}${Math.round(abs)}h`;
    },

    renderLine(canvasId, labels, data, label = 'Lectures', color = null) {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;
      const tc = this.getThemeColors();
      const col = color || tc.primary;

      this.instances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label,
            data,
            borderColor: col,
            backgroundColor: col + '22',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tc.tooltipBg,
              titleColor: tc.tooltipTitle,
              bodyColor: tc.tooltipText,
              borderColor: tc.tooltipBorder,
              borderWidth: 1,
              padding: 10,
              displayColors: false,
            },
          },
          scales: {
            x: {
              grid: { color: tc.grid },
              ticks: { color: tc.text, font: { size: 11 } },
            },
            y: {
              grid: { color: tc.grid },
              ticks: { color: tc.text, font: { size: 11 }, precision: 0 },
              beginAtZero: true,
            },
          },
        },
      });
    },

    renderMultiLine(canvasId, labels, datasets, options = {}) {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;
      const tc = this.getThemeColors();

      const formattedDatasets = datasets.map(d => ({
        label: d.label,
        data: d.data,
        borderColor: d.color,
        backgroundColor: d.fill ? (d.color + '22') : 'transparent',
        fill: !!d.fill,
        tension: 0.35,
        borderWidth: 2.2,
        pointRadius: 2,
        pointHoverRadius: 5,
        yAxisID: d.yAxisID || 'y',
      }));

      this.instances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: formattedDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: options.showLegend !== false,
              position: 'top',
              align: 'end',
              labels: {
                color: tc.text,
                font: { size: 11, weight: '500' },
                boxWidth: 12,
                boxHeight: 12,
                usePointStyle: true,
              },
            },
            tooltip: {
              backgroundColor: tc.tooltipBg,
              titleColor: tc.tooltipTitle,
              bodyColor: tc.tooltipText,
              borderColor: tc.tooltipBorder,
              borderWidth: 1,
              padding: 10,
              callbacks: options.tooltipCallbacks || (options.isHours ? {
                label: (ctx) => `${ctx.dataset.label}: ${ChartHelper.formatCompactHours(ctx.parsed.y)}`
              } : {}),
            },
          },
          scales: {
            x: {
              grid: { color: tc.grid },
              ticks: { color: tc.text, font: { size: 10 }, maxRotation: 0, autoSkip: true },
            },
            y: {
              grid: { color: tc.grid },
              ticks: {
                color: tc.text,
                font: { size: 10 },
                callback: options.isHours ? (v) => ChartHelper.formatCompactHours(v) : (v) => v,
              },
              beginAtZero: true,
            },
          },
        },
      });
    },

    renderBar(canvasId, labels, data, options = {}) {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;
      const tc = this.getThemeColors();

      const bgColors = options.backgroundColors || tc.primary;

      this.instances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: options.label || 'Sessions',
            data,
            backgroundColor: bgColors,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: options.onClick ? (evt, elements) => {
            if (elements && elements.length > 0) {
              const idx = elements[0].index;
              options.onClick(idx, labels[idx], data[idx]);
            }
          } : undefined,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tc.tooltipBg,
              titleColor: tc.tooltipTitle,
              bodyColor: tc.tooltipText,
              borderColor: tc.tooltipBorder,
              borderWidth: 1,
              padding: 8,
              callbacks: options.tooltipCallbacks || {},
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: tc.text, font: { size: 10 } },
            },
            y: {
              grid: { color: tc.grid },
              ticks: {
                color: tc.text,
                font: { size: 10 },
                precision: 0,
                callback: options.isHours ? (v) => `${v}h` : (v) => v,
              },
              beginAtZero: true,
            },
          },
        },
      });
    },

    renderHorizontalBar(canvasId, labels, data, options = {}) {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;
      const tc = this.getThemeColors();

      this.instances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: options.label || 'Valeur',
            data,
            backgroundColor: options.backgroundColors || tc.primary,
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tc.tooltipBg,
              titleColor: tc.tooltipTitle,
              bodyColor: tc.tooltipText,
              borderColor: tc.tooltipBorder,
              borderWidth: 1,
              padding: 8,
              callbacks: options.tooltipCallbacks || {},
            },
          },
          scales: {
            x: {
              grid: { color: tc.grid },
              ticks: { color: tc.text, font: { size: 10 }, precision: 0 },
              beginAtZero: true,
            },
            y: {
              grid: { display: false },
              ticks: { color: tc.text, font: { size: 11, weight: '600' } },
            },
          },
        },
      });
    },

    renderDoughnut(canvasId, labels, data, options = {}) {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;
      const tc = this.getThemeColors();

      const defaultColors = ['#38BDF8', '#22C55E', '#F59E0B', '#A855F7', '#EC4899', '#6366F1'];

      this.instances[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: options.colors || defaultColors,
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: options.cutout || '68%',
          onClick: options.onClick ? (evt, elements) => {
            if (elements && elements.length > 0) {
              const idx = elements[0].index;
              options.onClick(idx, labels[idx], data[idx]);
            }
          } : undefined,
          plugins: {
            legend: {
              display: options.showLegend !== false,
              position: options.legendPosition || 'bottom',
              labels: {
                color: tc.text,
                font: { size: 11, weight: '500' },
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true,
              },
            },
            tooltip: {
              backgroundColor: tc.tooltipBg,
              titleColor: tc.tooltipTitle,
              bodyColor: tc.tooltipText,
              borderColor: tc.tooltipBorder,
              borderWidth: 1,
              padding: 10,
              callbacks: options.tooltipCallbacks || {
                label: (ctx) => {
                  const val = ctx.parsed;
                  const total = ctx.dataset.data.reduce((a, b) => a + Number(b || 0), 0);
                  const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                  return ` ${ctx.label}: ${options.isHours ? ChartHelper.formatCompactHours(val) : val} (${pct}%)`;
                },
              },
            },
          },
        },
      });
    },

    renderStackedArea(canvasId, labels, datasets, options = {}) {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;
      const tc = this.getThemeColors();

      this.instances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: datasets.map(d => ({
            label: d.label,
            data: d.data,
            borderColor: d.color,
            backgroundColor: d.color + '44',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: { color: tc.text, font: { size: 11 }, boxWidth: 10, usePointStyle: true },
            },
            tooltip: {
              backgroundColor: tc.tooltipBg,
              titleColor: tc.tooltipTitle,
              bodyColor: tc.tooltipText,
              borderColor: tc.tooltipBorder,
              borderWidth: 1,
              padding: 8,
            },
          },
          scales: {
            x: {
              grid: { color: tc.grid },
              ticks: { color: tc.text, font: { size: 10 } },
            },
            y: {
              stacked: true,
              grid: { color: tc.grid },
              ticks: { color: tc.text, font: { size: 10 }, precision: 0 },
              beginAtZero: true,
            },
          },
        },
      });
    },

    renderArea(canvasId, labels, data, options = {}) {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;
      const tc = this.getThemeColors();
      const col = options.color || tc.primary;

      this.instances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: options.label || 'Valeur',
            data,
            borderColor: col,
            backgroundColor: col + '33',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tc.tooltipBg,
              titleColor: tc.tooltipTitle,
              bodyColor: tc.tooltipText,
              borderColor: tc.tooltipBorder,
              borderWidth: 1,
              padding: 8,
              callbacks: options.tooltipCallbacks || (options.isHours ? {
                label: (ctx) => `${ctx.dataset.label}: ${ChartHelper.formatCompactHours(ctx.parsed.y)}`
              } : {}),
            },
          },
          scales: {
            x: {
              grid: { color: tc.grid },
              ticks: { color: tc.text, font: { size: 10 } },
            },
            y: {
              grid: { color: tc.grid },
              ticks: {
                color: tc.text,
                font: { size: 10 },
                precision: 0,
                callback: options.isHours ? (v) => `${v}h` : (v) => v,
              },
              beginAtZero: true,
            },
          },
        },
      });
    },

    renderStackedBar(canvasId, labels, datasets, options = {}) {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;
      const tc = this.getThemeColors();

      this.instances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: datasets.map(d => ({
            label: d.label,
            data: d.data,
            backgroundColor: d.color,
            borderRadius: options.borderRadius || 2,
            stack: 'stack0',
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: options.showLegend !== false,
              position: 'top',
              align: 'end',
              labels: { color: tc.text, font: { size: 11 }, boxWidth: 10, usePointStyle: true },
            },
            tooltip: {
              backgroundColor: tc.tooltipBg,
              titleColor: tc.tooltipTitle,
              bodyColor: tc.tooltipText,
              borderColor: tc.tooltipBorder,
              borderWidth: 1,
              padding: 8,
              callbacks: options.tooltipCallbacks || (options.isHours ? {
                label: (ctx) => `${ctx.dataset.label}: ${ChartHelper.formatCompactHours(ctx.parsed.y)}`
              } : {}),
            },
          },
          scales: {
            x: {
              stacked: true,
              grid: { display: false },
              ticks: { color: tc.text, font: { size: 10 } },
            },
            y: {
              stacked: true,
              grid: { color: tc.grid },
              ticks: {
                color: tc.text,
                font: { size: 10 },
                precision: 0,
                callback: options.isHours ? (v) => `${v}h` : (v) => v,
              },
              beginAtZero: true,
            },
          },
        },
      });
    },
  };

  // =========================================================================
  // Live Streams Poller
  // =========================================================================

  const StreamsPoller = {
    start() {
      this.poll();
      if (!State.streamPollInterval) {
        State.streamPollInterval = setInterval(() => this.poll(), 5000);
      }
    },

    stop() {
      if (State.streamPollInterval) {
        clearInterval(State.streamPollInterval);
        State.streamPollInterval = null;
      }
    },

    async poll() {
      if (!State.user) return;
      try {
        const data = await API.getJSON('/api/streams');
        const streams = data.streams || [];
        State.activeStreamsCount = streams.length;

        const countEl = document.getElementById('topbar-live-streams-count');
        if (countEl) countEl.textContent = streams.length;

        const container = document.getElementById('dashboard-live-streams-list');
        if (container) {
          if (streams.length === 0) {
            container.innerHTML = `
              <div class="empty-state" style="padding: 1.5rem;">
                <p>${I18n.t('dashboard.noLiveStreams') || 'Aucun flux actif pour le moment.'}</p>
              </div>
            `;
          } else {
            container.innerHTML = streams.map((s) => `
              <div class="stream-card">
                <div class="stream-poster-thumb">
                  ${s.mediaJellyfinId ? `<img src="/api/jellyfin/image?id=${s.mediaJellyfinId}&type=Primary&maxWidth=140" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;">` : ''}
                </div>
                <div class="stream-info">
                  <div class="stream-title">${Utils.escapeHtml(s.mediaTitle || 'Titre inconnu')}</div>
                  <div class="stream-details">
                    <span>👤 ${Utils.escapeHtml(s.username || 'Utilisateur')}</span>
                    <span>📱 ${Utils.escapeHtml(s.clientName || 'Lecteur')}</span>
                    <span class="badge ${s.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}">${Utils.escapeHtml(s.playMethod || 'Stream')}</span>
                  </div>
                  <div class="stream-progress-bar">
                    <div class="stream-progress-fill" style="width: ${Math.min(100, Math.max(5, s.progressPercent || 25))}%;"></div>
                  </div>
                </div>
                ${State.user.isAdmin ? `
                  <button class="btn btn-danger btn-sm btn-kill-stream" data-session-id="${s.sessionId}">
                    ${I18n.t('dashboard.killStream') || 'Arrêter'}
                  </button>
                ` : ''}
              </div>
            `).join('');

            // Bind kill stream buttons
            container.querySelectorAll('.btn-kill-stream').forEach((btn) => {
              btn.addEventListener('click', async () => {
                const sid = btn.getAttribute('data-session-id');
                Modal.showAction({
                  title: I18n.t('dashboard.killStream') || 'Arrêter le flux',
                  bodyHtml: '<p>Voulez-vous forcer l’arrêt de cette lecture en cours ?</p>',
                  confirmText: 'Arrêter le flux',
                  onConfirm: async () => {
                    try {
                      await API.postJSON('/api/jellyfin/kill-stream', { sessionId: sid });
                      Toast.success('Flux arrêté avec succès.');
                      StreamsPoller.poll();
                    } catch (e) {
                      Toast.error(e.message);
                    }
                  },
                });
              });
            });
          }
        }
      } catch (e) {}
    },
  };

  // =========================================================================
  // Page Controllers
  // =========================================================================

  const Pages = {
    // 1. Dashboard
    async dashboard() {
      StreamsPoller.start();
      document.body.classList.remove('is-auth-page');
      const main = document.getElementById('app-main');

      // Default state
      let currentTimeRange = '7d';
      let currentMediaType = '';
      let currentServerId = '';
      let isDraggableEditing = false;
      let activeTab = 'overview';
      let liveStreamsData = [];
      let liveBandwidth = 0;
      let forceCardsView = false;
      let selectedHeatmapYear = new Date().getFullYear();
      let selectedHeatmapLib = '_total';
      let selectedMonthlyYear = new Date().getFullYear();

      // Read saved dashboard order (0..9)
      const DEFAULT_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      let dashboardOrder = [...DEFAULT_ORDER];
      try {
        const savedOrder = JSON.parse(localStorage.getItem('JellyTrack-dashboard-order') || 'null');
        if (Array.isArray(savedOrder) && savedOrder.length === DEFAULT_ORDER.length) {
          dashboardOrder = savedOrder;
        }
      } catch (e) {}

      // Render base dashboard skeleton
      main.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <h1 class="page-title">${I18n.t('dashboard.title') || 'Tableau de bord'}</h1>
            <div class="header-filter-bar" id="dash-media-filter">
              <button class="header-filter-btn active" data-type="">${I18n.t('media.allMedia') || 'Tous'}</button>
              <button class="header-filter-btn" data-type="Movie">${I18n.t('media.movies') || 'Films'}</button>
              <button class="header-filter-btn" data-type="Series">${I18n.t('media.series') || 'Séries'}</button>
              <button class="header-filter-btn" data-type="Audio">${I18n.t('media.music') || 'Musique'}</button>
              <button class="header-filter-btn" data-type="Book">${I18n.t('media.books') || 'Livres'}</button>
            </div>
            <div id="dash-server-filter-container" style="display:none; margin-left:0.5rem;">
              <select id="dash-server-filter" class="form-input text-xs" style="padding:0.3rem 0.6rem; border-radius:var(--radius-sm);">
                <option value="">${I18n.t('dashboard.allServers') || 'Tous les serveurs'}</option>
              </select>
            </div>
          </div>
          <div class="page-header-right">
            <div class="time-pills-bar" id="dash-time-range">
              <button class="time-pill-btn" data-range="1d">24h</button>
              <button class="time-pill-btn active" data-range="7d">7j</button>
              <button class="time-pill-btn" data-range="30d">30j</button>
              <button class="time-pill-btn" data-range="90d">90j</button>
              <button class="time-pill-btn" data-range="365d">1 an</button>
              <button class="time-pill-btn" data-range="all">${I18n.t('common.all') || 'Tout'}</button>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-refresh-dashboard" title="Rafraîchir les données">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </button>
          </div>
        </div>

        <!-- System Health Widgets -->
        <div id="dash-system-health-container"></div>

        <!-- Hardware Monitor Bar -->
        <div id="dash-hardware-container"></div>

        <!-- Today Stats Banner -->
        <div class="dashboard-banner">
          <div class="banner-title-group">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>${I18n.t('dashboard.today') || "Aujourd'hui"}</span>
          </div>
          <div class="banner-metrics-group">
            <div class="banner-metric-item">
              <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
              <span class="banner-metric-val metric-glow-blue" id="today-plays-val">0</span>
              <span class="banner-metric-label">${I18n.t('dashboard.readings') || 'lectures'}</span>
            </div>
            <div class="banner-metric-item">
              <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span class="banner-metric-val metric-glow-amber" id="today-hours-val">0h</span>
              <span class="banner-metric-label">${I18n.t('dashboard.watched') || 'regardées'}</span>
            </div>
            <div class="banner-metric-item">
              <svg class="nav-icon text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span class="banner-metric-val metric-glow-emerald" id="today-users-val">0</span>
              <span class="banner-metric-label">${I18n.t('dashboard.activeUsers') || 'utilisateurs actifs'}</span>
            </div>
          </div>
        </div>

        <!-- Dashboard Navigation Tabs -->
        <div class="dashboard-tablist" id="dashboard-tablist">
          <button class="dash-tab-btn active" data-tab="overview">${I18n.t('dashboard.overviewTab') || "Vue d'ensemble"}</button>
          <button class="dash-tab-btn" data-tab="analytics">${I18n.t('dashboard.detailedTab') || "Analyses approfondies"}</button>
          <button class="dash-tab-btn" data-tab="network">${I18n.t('dashboard.networkTab') || "Réseau"}</button>
        </div>

        <!-- Tab 1: Overview Tab Content -->
        <div id="tab-content-overview">
          <div class="draggable-toolbar">
            <button class="btn btn-secondary btn-sm" id="btn-toggle-draggable-edit">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
              <span id="draggable-edit-label">${I18n.t('draggable.editOrder') || "Modifier l'ordre"}</span>
            </button>
          </div>

          <div class="draggable-dashboard" id="dash-draggable-container"></div>

          <!-- Predictions Panel at the bottom of Overview -->
          <div id="dash-predictions-container" style="margin-top: 1.5rem;"></div>
        </div>

        <!-- Tab 2: Analytics Tab Content -->
        <div id="tab-content-analytics" class="hidden">
          <div id="dash-granular-container" style="display:flex; flex-direction:column; gap:1.5rem; margin-bottom:1.5rem;"></div>
          <div id="dash-deep-insights-container"></div>
        </div>

        <!-- Tab 3: Network Tab Content -->
        <div id="tab-content-network" class="hidden">
          <div id="dash-network-container" style="display:flex; flex-direction:column; gap:1.5rem;"></div>
        </div>
      `;

      // Helper: Send message to user live playback
      window.openSendMessageModal = (sessionId, userName, mediaTitle) => {
        let selectedSec = 10;
        const cannedList = [
          "Redémarrage du serveur dans 5 minutes.",
          "Merci de passer en lecture directe ou réduire la qualité.",
          "Maintenance technique en cours sur le serveur.",
          "Bonne séance cinéma !",
        ];

        Modal.showAction({
          title: `Envoyer un message à ${userName}`,
          bodyHtml: `
            <div style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:0.75rem;">
              Ce message apparaîtra immédiatement en pop-up sur l'écran du lecteur (${Utils.escapeHtml(mediaTitle)}).
            </div>
            <div style="margin-bottom:0.75rem;">
              <span style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); display:block; margin-bottom:0.35rem;">Messages prédéfinis :</span>
              <div class="canned-pills">
                ${cannedList.map(c => `<button type="button" class="canned-btn" onclick="document.getElementById('send-msg-text').value = '${c.replace(/'/g, "\\'")}';">${c}</button>`).join('')}
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
                <button type="button" class="time-pill-btn active" id="btn-sec-5" onclick="window._setMsgTimeout(5)">5s</button>
                <button type="button" class="time-pill-btn" id="btn-sec-10" onclick="window._setMsgTimeout(10)">10s</button>
                <button type="button" class="time-pill-btn" id="btn-sec-30" onclick="window._setMsgTimeout(30)">30s</button>
              </div>
            </div>
          `,
          confirmText: 'Envoyer à Jellyfin',
          cancelText: 'Annuler',
          onConfirm: async () => {
            const header = document.getElementById('send-msg-header')?.value || "Message de l'administrateur";
            const text = document.getElementById('send-msg-text')?.value?.trim();
            if (!text) {
              Toast.error('Veuillez saisir un message.');
              return;
            }
            try {
              await API.postJSON('/api/jellyfin/send-message', {
                sessionId,
                header,
                message: text,
                text,
                timeoutMs: selectedSec * 1000,
              });
              Toast.success('Message transmis avec succès à Jellyfin !');
            } catch (e) {
              Toast.error(e.message || "Erreur lors de l'envoi");
            }
          },
        });

        window._setMsgTimeout = (sec) => {
          selectedSec = sec;
          ['5', '10', '30'].forEach(s => {
            const b = document.getElementById(`btn-sec-${s}`);
            if (b) b.classList.toggle('active', s === String(sec));
          });
        };
      };

      // Helper: Kill stream
      window.confirmKillStream = (sessionId, mediaTitle) => {
        Modal.showAction({
          title: I18n.t('dashboard.killStream') || 'Arrêter le flux',
          bodyHtml: `<p>Voulez-vous forcer l'arrêt de la lecture : <b>${Utils.escapeHtml(mediaTitle || 'Session')}</b> ?</p>`,
          confirmText: 'Arrêter la lecture',
          cancelText: 'Annuler',
          onConfirm: async () => {
            try {
              await API.postJSON('/api/jellyfin/kill-stream', { sessionId });
              Toast.success('Flux arrêté avec succès.');
              refreshLiveStreams();
            } catch (e) {
              Toast.error(e.message || "Erreur lors de l'arrêt du flux");
            }
          },
        });
      };

      // 1. Fetch Servers for ServerFilter
      try {
        const srvRes = await API.getJSON('/api/settings/jellyfin-servers').catch(() => null);
        const servers = (srvRes && srvRes.servers) ? srvRes.servers : [];
        if (servers.length > 1) {
          const srvContainer = document.getElementById('dash-server-filter-container');
          const srvSelect = document.getElementById('dash-server-filter');
          if (srvContainer && srvSelect) {
            srvContainer.style.display = 'block';
            servers.forEach(s => {
              const opt = document.createElement('option');
              opt.value = s.id || s.jellyfinServerId || '';
              opt.textContent = s.name || s.url || opt.value;
              srvSelect.appendChild(opt);
            });
            srvSelect.addEventListener('change', () => {
              currentServerId = srvSelect.value;
              loadAllDashboard();
            });
          }
        }
      } catch (e) {}

      // 2. Load System Health Widgets
      const loadSystemHealth = async () => {
        try {
          const health = await API.getJSON('/api/admin/health');
          const container = document.getElementById('dash-system-health-container');
          if (!container) return;

          const isErr = health.status && health.status.monitor && health.status.monitor.status === 'error';
          const lastPoll = health.status && health.status.monitor ? Utils.timeAgo(health.status.monitor.lastPollAt) : '-';
          const lastSync = health.status && health.status.sync ? Utils.timeAgo(health.status.sync.lastSuccessAt) : '-';
          const lastBackup = health.status && health.status.backup ? Utils.timeAgo(health.status.backup.lastSuccessAt) : '-';
          const counts = health.counts || { activeStreams: 0, openPlaybackOrphans: 0, dbStreamsWithoutValkey: 0 };
          const excludedCount = (health.excludedLibraries || []).length;

          container.innerHTML = `
            <div class="system-health-bar">
              <div class="app-chip ${isErr ? 'app-chip-error' : 'app-chip-success'}">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span>Moniteur : ${isErr ? 'Erreur' : 'Actif'}</span>
              </div>
              <div class="app-chip">
                <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>Dernier sondage : ${lastPoll}</span>
              </div>
              <div class="app-chip">
                <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                <span>Synchro : ${lastSync}</span>
              </div>
              <div class="app-chip">
                <svg class="nav-icon text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                <span>Sauvegarde : ${lastBackup}</span>
              </div>
              <a href="/admin/health" class="btn btn-secondary btn-sm" style="margin-left:auto; text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem;">
                <svg class="nav-icon text-red" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                <span>Santé du système</span>
              </a>
            </div>

            <div class="stat-grid-4" style="margin-bottom:1rem;">
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">Flux actifs</span>
                  <span class="pulse-dot"></span>
                </div>
                <div class="stat-num metric-glow-emerald">${counts.activeStreams}</div>
                <div class="stat-desc">Sessions suivies</div>
              </div>
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">Lectures orphelines</span>
                  <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="stat-num metric-glow-amber">${counts.openPlaybackOrphans}</div>
                <div class="stat-desc">Playback sans fermeture</div>
              </div>
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">Flux DB sans cache</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div class="stat-num metric-glow-cyan">${counts.dbStreamsWithoutValkey}</div>
                <div class="stat-desc">Fallback base de données</div>
              </div>
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">Bibliothèques exclues</span>
                  <svg class="nav-icon text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 3 18 18M4 7h3m4 0h9M4 12h16M4 17h11"/></svg>
                </div>
                <div class="stat-num metric-glow-violet">${excludedCount}</div>
                <div class="stat-desc">Filtres actifs</div>
              </div>
            </div>
          `;
        } catch (e) {}
      };

      // 3. Load Hardware Monitor
      const loadHardware = async () => {
        try {
          const hw = await API.getJSON('/api/hardware');
          const container = document.getElementById('dash-hardware-container');
          if (!container || !hw || !hw.cpu) return;

          container.innerHTML = `
            <div class="hardware-bar">
              <div class="hardware-card">
                <div class="hardware-icon-box" style="background:rgba(59, 130, 246, 0.1); color:#3b82f6;">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9"/><path d="M15 2v2M9 2v2M20 15h2M20 9h2M9 20v2M15 20v2M2 9h2M2 15h2"/></svg>
                </div>
                <div>
                  <div style="font-size:0.75rem; color:var(--muted-foreground);">Processeur (CPU)</div>
                  <div class="metric-glow-blue" style="font-size:1.35rem; font-weight:800;">${hw.cpu.usagePercent || 0}%</div>
                </div>
              </div>
              <div class="hardware-card">
                <div class="hardware-icon-box" style="background:rgba(168, 85, 247, 0.1); color:#a855f7;">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M6 8V5M10 8V5M14 8V5M18 8V5"/><rect width="20" height="8" x="2" y="8" rx="2"/></svg>
                </div>
                <div>
                  <div style="font-size:0.75rem; color:var(--muted-foreground);">Mémoire RAM (${hw.memory ? hw.memory.totalGb : 0} Go)</div>
                  <div class="metric-glow-violet" style="font-size:1.35rem; font-weight:800;">${hw.memory ? hw.memory.usagePercent : 0}%</div>
                </div>
              </div>
              <div class="hardware-card">
                <div class="hardware-icon-box" style="background:rgba(244, 63, 94, 0.1); color:#f43f5e;">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>
                </div>
                <div>
                  <div style="font-size:0.75rem; color:var(--muted-foreground);">Température Système</div>
                  <div class="metric-glow-amber" style="font-size:1.35rem; font-weight:800;">${hw.temperature && hw.temperature.main > 0 ? `${hw.temperature.main}°C` : 'N/A'}</div>
                </div>
              </div>
            </div>
          `;
        } catch (e) {}
      };

      // 4. Live Streams Poller & Renderer
      const refreshLiveStreams = async () => {
        try {
          const res = await API.getJSON(`/api/streams${currentServerId ? `?servers=${currentServerId}` : ''}`);
          liveStreamsData = res.streams || [];
          liveBandwidth = res.totalBandwidthMbps || 0;
          State.activeStreamsCount = liveStreamsData.length;

          const topbarBadge = document.getElementById('topbar-live-streams-count');
          if (topbarBadge) topbarBadge.textContent = liveStreamsData.length;

          renderLiveStreamsBlock();
        } catch (e) {}
      };

      const renderLiveStreamsBlock = () => {
        const container = document.getElementById('dash-live-streams-body');
        if (!container) return;

        const countEl = document.getElementById('dash-live-header-info');
        if (countEl) {
          countEl.textContent = `${liveStreamsData.length} ${I18n.t('dashboard.activeStreams') || 'flux actifs'}${liveBandwidth > 0 ? ` (~${liveBandwidth} Mbps)` : ''}`;
        }

        if (liveStreamsData.length === 0) {
          container.innerHTML = `<div class="empty-state text-muted-foreground" style="padding:1.5rem;">${I18n.t('dashboard.noLiveStreams') || 'Aucun flux actif pour le moment.'}</div>`;
          return;
        }

        const useTimeline = liveStreamsData.length >= 3 && !forceCardsView;
        const GANTT_COLORS = ['#a855f7', '#3b82f6', '#10b981', '#f97316', '#ec4899', '#06b6d4', '#eab308'];

        if (useTimeline) {
          container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:0.6rem;">
              ${liveStreamsData.map((s, idx) => {
                const c = GANTT_COLORS[idx % GANTT_COLORS.length];
                const pct = Math.min(100, Math.max(3, s.progressPercent || 0));
                return `
                  <div class="live-stream-timeline-row">
                    <div class="gantt-avatar" style="background:${c}22; color:${c};">${(s.user || s.username || '?').charAt(0).toUpperCase()}</div>
                    <div style="flex:1; min-width:0;">
                      <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem; min-width:0;">
                          <span style="font-size:0.82rem; font-weight:700; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${Utils.escapeHtml(s.user || s.username || 'Utilisateur')}</span>
                          ${s.itemId ? `
                            <a href="/media/${s.itemId}" style="font-size:0.75rem; color:var(--muted-foreground); text-decoration:none; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" class="hover:underline">
                              ${Utils.escapeHtml(s.mediaTitle || 'Média')}
                            </a>
                          ` : `<span style="font-size:0.75rem; color:var(--muted-foreground); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${Utils.escapeHtml(s.mediaTitle || 'Média')}</span>`}
                        </div>
                        <div style="display:flex; align-items:center; gap:0.4rem; flex-shrink:0;">
                          <span class="badge ${s.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}" style="font-size:0.68rem; padding:0.15rem 0.45rem;">${s.playMethod === 'DirectPlay' ? 'DP' : 'Transcode'}</span>
                          ${s.isPaused ? '<span style="font-size:0.75rem; color:#f59e0b;">⏸</span>' : ''}
                          <span style="font-size:0.75rem; color:var(--muted-foreground);">${pct}%</span>
                          <button class="btn btn-secondary btn-sm" style="padding:0.2rem 0.45rem; font-size:0.72rem;" onclick="window.openSendMessageModal('${s.sessionId}', '${Utils.escapeHtml(s.user || s.username || '')}', '${Utils.escapeHtml(s.mediaTitle || '')}')" title="Envoyer un message">💬</button>
                          ${State.user && State.user.isAdmin ? `
                            <button class="btn btn-danger btn-sm" style="padding:0.2rem 0.45rem; font-size:0.72rem;" onclick="window.confirmKillStream('${s.sessionId}', '${Utils.escapeHtml(s.mediaTitle || '')}')" title="Couper le flux">✕</button>
                          ` : ''}
                        </div>
                      </div>
                      <div class="gantt-track">
                        <div class="gantt-fill" style="width:${pct}%; background:${s.isPaused ? '#f59e0b' : c};"></div>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        } else {
          container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:0.75rem;">
              ${liveStreamsData.map(s => {
                const posterId = s.posterItemId || s.itemId;
                const pct = Math.min(100, Math.max(3, s.progressPercent || 0));
                const audioSub = [
                  s.audioCodec ? `🔊 ${s.audioCodec.toUpperCase()}${s.audioLanguage ? ` (${s.audioLanguage})` : ''}` : '',
                  s.subtitleCodec ? `💬 ${s.subtitleCodec.toUpperCase()}${s.subtitleLanguage ? ` (${s.subtitleLanguage})` : ''}` : '',
                ].filter(Boolean).join(' • ');

                return `
                  <div class="stream-card">
                    <div class="stream-poster-thumb">
                      ${posterId ? `<img src="/api/jellyfin/image?itemId=${posterId}&type=Primary&maxWidth=140" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" onerror="this.style.display='none'">` : ''}
                    </div>
                    <div class="stream-info">
                      <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                        <span class="stream-title">${Utils.escapeHtml(s.mediaTitle || 'Titre inconnu')}</span>
                        ${s.versionName ? `<span class="badge badge-info" style="font-size:0.65rem;">${Utils.escapeHtml(s.versionName)}</span>` : ''}
                        ${s.isPaused ? '<span class="badge badge-warning" style="font-size:0.65rem;">⏸ En pause</span>' : ''}
                      </div>
                      ${s.seriesName || s.seasonName ? `<div style="font-size:0.75rem; color:var(--muted-foreground);">${Utils.escapeHtml(s.seriesName || '')} ${Utils.escapeHtml(s.seasonName || '')}</div>` : ''}
                      <div class="stream-details">
                        <span>👤 ${Utils.escapeHtml(s.user || s.username || 'Utilisateur')}</span>
                        <span>📱 ${Utils.escapeHtml(s.device || s.clientName || 'Lecteur')}</span>
                        ${s.city || s.country ? `<span>📍 ${Utils.escapeHtml(s.city || '')}${s.country ? `, ${Utils.escapeHtml(s.country)}` : ''}</span>` : ''}
                        <span class="badge ${s.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}">${Utils.escapeHtml(s.playMethod || 'Stream')}</span>
                      </div>
                      ${audioSub ? `<div style="font-size:0.72rem; color:var(--muted-foreground); margin-top:0.15rem;">${Utils.escapeHtml(audioSub)}</div>` : ''}
                      <div class="stream-progress-bar">
                        <div class="stream-progress-fill" style="width: ${pct}%;"></div>
                      </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:0.35rem; align-items:flex-end;">
                      <button class="btn btn-secondary btn-sm" onclick="window.openSendMessageModal('${s.sessionId}', '${Utils.escapeHtml(s.user || s.username || '')}', '${Utils.escapeHtml(s.mediaTitle || '')}')" title="Envoyer un pop-up à l'écran">
                        💬 Message
                      </button>
                      ${State.user && State.user.isAdmin ? `
                        <button class="btn btn-danger btn-sm" onclick="window.confirmKillStream('${s.sessionId}', '${Utils.escapeHtml(s.mediaTitle || '')}')" title="Couper la session">
                          ${I18n.t('dashboard.killStream') || 'Arrêter'}
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        }
      };

      // 5. Main Dashboard Data Loader
      let dashboardData = null;

      const loadAllDashboard = async () => {
        try {
          const queryDays = currentTimeRange === 'all' ? 'all' : (parseInt(currentTimeRange, 10) || 7);
          const params = new URLSearchParams();
          params.set('days', String(queryDays));
          if (currentMediaType) params.set('type', currentMediaType);
          if (currentServerId) params.set('servers', currentServerId);

          dashboardData = await API.getJSON(`/api/dashboard?${params.toString()}`);

          // Update Today Stats Banner
          const todayPlaysEl = document.getElementById('today-plays-val');
          const todayHoursEl = document.getElementById('today-hours-val');
          const todayUsersEl = document.getElementById('today-users-val');
          if (todayPlaysEl) todayPlaysEl.textContent = Utils.formatNumber(dashboardData.todayPlays || 0);
          if (todayHoursEl) todayHoursEl.textContent = `${dashboardData.todayHours !== undefined ? dashboardData.todayHours : 0}h`;
          if (todayUsersEl) todayUsersEl.textContent = Utils.formatNumber(dashboardData.todayActiveUsers || 0);

          renderDraggableDashboardBlocks();
          loadPredictions();
        } catch (e) {
          Toast.error(e.message || "Erreur de chargement du tableau de bord");
        }
      };

      // 6. Render Draggable Dashboard (10 Blocks)
      const renderDraggableDashboardBlocks = () => {
        const container = document.getElementById('dash-draggable-container');
        if (!container || !dashboardData) return;

        const d = dashboardData;
        const b = d.breakdown || { movieViews: 0, movieHours: 0, seriesViews: 0, seriesHours: 0, musicViews: 0, musicHours: 0, booksViews: 0, booksHours: 0 };

        // Define Block Generators
        const blockGenerators = {
          // Block 0: metrics (5 KPI cards)
          0: () => `
            <div class="stat-grid-5">
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('dashboard.activeStreams') || 'Flux actifs'}</span>
                  <span class="pulse-dot"></span>
                </div>
                <div class="stat-num metric-glow-emerald" id="dash-active-streams">${State.activeStreamsCount || 0}</div>
                <div class="stat-desc">${I18n.t('dashboard.managedByServer') || 'Géré par le serveur'}</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('dashboard.totalPlays') || 'Lectures totales'}</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div class="stat-num metric-glow-cyan">${Utils.formatNumber(d.totalPlays || d.views || 0)}</div>
                  ${d.playsGrowth !== undefined && d.playsGrowth !== 0 ? `
                    <span class="badge ${d.playsGrowth >= 0 ? 'badge-success' : 'badge-danger'}" style="font-size:0.7rem;">
                      ${d.playsGrowth > 0 ? '+' : ''}${d.playsGrowth.toFixed(1)}%
                    </span>
                  ` : ''}
                </div>
                <div class="stat-desc">${d.previousPlays > 0 ? `vs ${d.previousPlays} période préc.` : 'Période sélectionnée'}</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('dashboard.directPlay') || 'Direct Play'}</span>
                  <svg class="nav-icon text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="15" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/></svg>
                </div>
                <div class="stat-num metric-glow-violet">${d.directPlayPercent || 0}%<span style="font-size:0.8rem; font-weight:400; margin-left:0.25rem;">DP</span></div>
                <div class="stat-desc">${I18n.t('dashboard.directPlayDesc') || 'Taux de lecture native sans ré-encodage'}</div>
              </div>

              <a href="/logs" class="stat-card-modern" style="text-decoration:none; color:inherit;">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('dashboard.globalTime') || 'Temps de visionnage'}</span>
                  <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div class="stat-num metric-glow-amber">${Utils.formatNumber(d.hoursWatched || Math.round((d.durationMs || 0) / 3600000))}h</div>
                  ${d.hoursGrowth !== undefined && d.hoursGrowth !== 0 ? `
                    <span class="badge ${d.hoursGrowth >= 0 ? 'badge-success' : 'badge-danger'}" style="font-size:0.7rem;">
                      ${d.hoursGrowth > 0 ? '+' : ''}${d.hoursGrowth.toFixed(1)}%
                    </span>
                  ` : ''}
                </div>
                <div class="stat-desc">${d.previousHoursWatched > 0 ? `vs ${d.previousHoursWatched}h période préc.` : 'Total cumulé'}</div>
              </a>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('dashboard.users') || 'Utilisateurs actifs'}</span>
                  <svg class="nav-icon text-pink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div class="stat-num metric-glow-emerald">${Utils.formatNumber(d.currentActiveUsers || d.users || 0)}</div>
                  ${d.activeUsersGrowth !== undefined && d.activeUsersGrowth !== 0 ? `
                    <span class="badge ${d.activeUsersGrowth >= 0 ? 'badge-success' : 'badge-danger'}" style="font-size:0.7rem;">
                      ${d.activeUsersGrowth > 0 ? '+' : ''}${d.activeUsersGrowth.toFixed(1)}%
                    </span>
                  ` : ''}
                </div>
                <div class="stat-desc">Comptes actifs</div>
              </div>
            </div>
          `,

          // Block 1: breadcrumb (4 Breakdown cards)
          1: () => `
            <div class="stat-grid-4">
              <a href="/logs?type=Movie" class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Films</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/></svg>
                </div>
                <div class="metric-glow-blue" style="font-size:1.6rem; font-weight:800;">${b.movieViews || 0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">vues</span></div>
                <div style="font-size:0.75rem; color:#3b82f6; font-weight:600;">${b.movieHours || 0}h regardées</div>
              </a>

              <a href="/logs?type=Episode" class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Séries</span>
                  <svg class="nav-icon text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="15" x="2" y="7" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
                </div>
                <div class="metric-glow-emerald" style="font-size:1.6rem; font-weight:800;">${b.seriesViews || 0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">lectures</span></div>
                <div style="font-size:0.75rem; color:#10b981; font-weight:600;">${b.seriesHours || 0}h regardées</div>
              </a>

              <a href="/logs?type=Audio" class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Musique</span>
                  <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="metric-glow-amber" style="font-size:1.6rem; font-weight:800;">${b.musicViews || 0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">titres</span></div>
                <div style="font-size:0.75rem; color:#f59e0b; font-weight:600;">${b.musicHours || 0}h écoutées</div>
              </a>

              <a href="/logs?type=AudioBook" class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Livres</span>
                  <svg class="nav-icon text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>
                </div>
                <div class="metric-glow-violet" style="font-size:1.6rem; font-weight:800;">${b.booksViews || 0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">ouverts</span></div>
                <div style="font-size:0.75rem; color:#a855f7; font-weight:600;">${b.booksHours || 0}h passées</div>
              </a>
            </div>
          `,

          // Block 2: volumes (Bento Hero: ComposedTrendChart + CategoryPieChart)
          2: () => `
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
                    <div class="card-title">Répartition par catégorie</div>
                    <div class="card-subtitle">Volume global d'écoute par catégorie</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:350px;">
                  <canvas id="chart-category-pie"></canvas>
                </div>
              </div>
            </div>
          `,

          // Block 3: libraryPlays (LibraryDailyPlaysChart)
          3: () => `
            <div class="chart-card">
              <div class="card-header">
                <div class="card-title-group">
                  <div class="card-title">Lectures quotidiennes par bibliothèque</div>
                  <div class="card-subtitle">Sessions journalières initiées par type de contenu</div>
                </div>
              </div>
              <div class="chart-wrap" style="height:320px;">
                <canvas id="chart-library-plays"></canvas>
              </div>
            </div>
          `,

          // Block 4: heatmap (YearlyHeatmap)
          4: () => `
            <div class="card">
              <div class="card-header">
                <div class="card-title-group" style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:0.5rem;">
                  <div>
                    <div class="card-title">📅 Carte thermique d'activité annuelle</div>
                    <div class="card-subtitle" id="dash-heatmap-summary">Sessions enregistrées sur l'année</div>
                  </div>
                  <div style="display:flex; align-items:center; gap:0.5rem;">
                    <button class="btn btn-secondary btn-sm" id="btn-heatmap-prev-year">◀</button>
                    <span class="app-chip font-bold" id="heatmap-current-year" style="min-width:60px; text-align:center;">${selectedHeatmapYear}</span>
                    <button class="btn btn-secondary btn-sm" id="btn-heatmap-next-year">▶</button>
                  </div>
                </div>
                <div style="display:flex; gap:0.4rem; margin-top:0.6rem; flex-wrap:wrap;" id="dash-heatmap-lib-filters">
                  <button class="time-pill-btn active" data-lib="_total">Tous</button>
                  <button class="time-pill-btn" data-lib="Movie">Films</button>
                  <button class="time-pill-btn" data-lib="Series">Séries</button>
                  <button class="time-pill-btn" data-lib="Audio">Musique</button>
                  <button class="time-pill-btn" data-lib="Book">Livres</button>
                </div>
              </div>
              <div class="yearly-heatmap-wrapper" id="dash-heatmap-grid-container" style="padding:1rem;">
                <div class="skeleton" style="height:140px;"></div>
              </div>
            </div>
          `,

          // Block 5: users-platforms (Top Users + PlatformDistributionChart)
          5: () => `
            <div class="dash-grid-2">
              <div class="card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">👥 Utilisateurs les plus fidèles</div>
                    <div class="card-subtitle">Classement par heures de visionnage sur la période</div>
                  </div>
                </div>
                <div class="ranking-list" id="dash-top-users-list">
                  ${(d.topUsers || []).length > 0 ? (d.topUsers || []).slice(0, 5).map((u, i) => `
                    <a href="/users/${u.jellyfinUserId || ''}" class="ranking-item">
                      <span class="ranking-badge">#${i + 1}</span>
                      <div class="ranking-name">
                        <span style="font-weight:700;">${Utils.escapeHtml(u.username)}</span>
                      </div>
                      <span class="ranking-value">${u.hours || 0}h</span>
                    </a>
                  `).join('') : '<div class="text-muted-foreground text-sm" style="padding:1rem;">Aucune activité enregistrée.</div>'}
                </div>
              </div>

              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">📱 Écosystème des clients</div>
                    <div class="card-subtitle">Applications et appareils utilisés pour la lecture</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:280px;">
                  <canvas id="chart-platform-dist"></canvas>
                </div>
              </div>
            </div>
          `,

          // Block 6: live-streams (LiveStreamsPanel)
          6: () => `
            <div class="card" id="dash-live-panel">
              <div class="card-header">
                <div class="card-title-group" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                  <div>
                    <div class="card-title" style="display:flex; align-items:center; gap:0.5rem;">
                      <span class="pulse-dot"></span>
                      ${I18n.t('dashboard.liveStreams') || 'Flux en direct'}
                    </div>
                    <div class="card-subtitle" id="dash-live-header-info">Surveillance active des lectures en cours</div>
                  </div>
                  <button class="btn btn-secondary btn-sm" id="btn-toggle-live-view" title="Basculer vue Cartes / Chronologie">
                    ${forceCardsView ? '📊 Chronologie Gantt' : '🗂️ Vue Cartes'}
                  </button>
                </div>
              </div>
              <div id="dash-live-streams-body">
                <div class="empty-state text-muted-foreground" style="padding:1.5rem;">Chargement des flux...</div>
              </div>
            </div>
          `,

          // Block 7: hourly (ActivityByHourChart + DayOfWeekChart)
          7: () => `
            <div class="dash-grid-2">
              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">🕒 Heures de pointe</div>
                    <div class="card-subtitle">Distribution des sessions sur les 24 heures de la journée</div>
                  </div>
                </div>
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
          `,

          // Block 8: new-stats (MonthlyWatchTimeChart + CompletionRatioChart + ClientCategoryChart)
          8: () => `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:1.25rem;">
              <div class="chart-card" style="grid-column:span 1; min-width:320px;">
                <div class="card-header">
                  <div class="card-title-group" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <div>
                      <div class="card-title">📈 Visionnage mensuel</div>
                      <div class="card-subtitle">Total d'heures par mois</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.4rem;">
                      <button class="btn btn-secondary btn-sm" id="btn-monthly-prev-year">◀</button>
                      <span class="app-chip font-bold" id="monthly-current-year">${selectedMonthlyYear}</span>
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
          `,

          // Block 9: server-load (Server Load Timeline)
          9: () => `
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
          `,
        };

        // Render blocks in current dashboardOrder
        container.innerHTML = dashboardOrder.map((blockId, visualIndex) => `
          <div class="draggable-block-wrapper ${isDraggableEditing ? 'is-editing' : ''}" data-block-id="${blockId}">
            ${isDraggableEditing ? `
              <div class="draggable-block-controls">
                <button class="draggable-move-btn" data-action="up" data-index="${visualIndex}" ${visualIndex === 0 ? 'disabled' : ''} title="Monter">▲</button>
                <button class="draggable-move-btn" data-action="down" data-index="${visualIndex}" ${visualIndex === dashboardOrder.length - 1 ? 'disabled' : ''} title="Descendre">▼</button>
              </div>
            ` : ''}
            ${blockGenerators[blockId] ? blockGenerators[blockId]() : ''}
          </div>
        `).join('');

        // Wire Draggable Move Buttons
        if (isDraggableEditing) {
          container.querySelectorAll('.draggable-move-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const action = btn.getAttribute('data-action');
              const idx = parseInt(btn.getAttribute('data-index'), 10);
              const targetIdx = action === 'up' ? idx - 1 : idx + 1;
              if (targetIdx >= 0 && targetIdx < dashboardOrder.length) {
                const temp = dashboardOrder[idx];
                dashboardOrder[idx] = dashboardOrder[targetIdx];
                dashboardOrder[targetIdx] = temp;
                localStorage.setItem('JellyTrack-dashboard-order', JSON.stringify(dashboardOrder));
                renderDraggableDashboardBlocks();
              }
            });
          });
        }

        // Render Charts inside the instantiated blocks
        renderChartsForOverview();
        renderLiveStreamsBlock();
        renderHeatmapGrid();
        wireBlockControls();
      };

      // 7. Render Charts inside Overview Blocks
      const renderChartsForOverview = () => {
        if (!dashboardData) return;
        const d = dashboardData;

        // Composed Trend Chart (Volume History)
        const trendEl = document.getElementById('chart-composed-trend');
        if (trendEl) {
          if (d.trendData && d.trendData.length > 0) {
            const labels = d.trendData.map(t => t.time);
            const datasets = [
              { label: 'Films (h)', data: d.trendData.map(t => t.movieVolume || 0), color: '#38bdf8' },
              { label: 'Séries (h)', data: d.trendData.map(t => t.seriesVolume || 0), color: '#22c55e' },
              { label: 'Musique (h)', data: d.trendData.map(t => t.musicVolume || 0), color: '#f59e0b' },
              { label: 'Livres (h)', data: d.trendData.map(t => t.booksVolume || 0), color: '#a855f7' },
            ];
            ChartHelper.renderMultiLine('chart-composed-trend', labels, datasets, { isHours: true });
          } else {
            ChartHelper.showEmpty('chart-composed-trend', 'Aucune tendance disponible');
          }
        }

        // Category Pie Chart
        const pieEl = document.getElementById('chart-category-pie');
        if (pieEl) {
          const hasPieData = d.categoryPieData && d.categoryPieData.some(c => (c.value || 0) > 0);
          if (hasPieData) {
            const labels = d.categoryPieData.map(c => c.name);
            const values = d.categoryPieData.map(c => c.value);
            ChartHelper.renderDoughnut('chart-category-pie', labels, values, {
              isHours: true,
              colors: ['#38bdf8', '#22c55e', '#f59e0b', '#a855f7'],
              onClick: (idx, label) => {
                const typeMap = { 'Films': 'Movie', 'Séries': 'Episode', 'Musique': 'Audio', 'Livres': 'AudioBook' };
                Router.navigate(`/logs?type=${typeMap[label] || label}`);
              },
            });
          } else {
            ChartHelper.showEmpty('chart-category-pie', 'Aucune lecture sur la période');
          }
        }

        // Library Daily Plays Chart
        const libEl = document.getElementById('chart-library-plays');
        if (libEl) {
          if (d.trendData && d.trendData.length > 0) {
            const labels = d.trendData.map(t => t.time);
            const datasets = [
              { label: 'Films', data: d.trendData.map(t => t.moviePlays || 0), color: '#3b82f6' },
              { label: 'Séries', data: d.trendData.map(t => t.seriesPlays || 0), color: '#22c55e' },
              { label: 'Musique', data: d.trendData.map(t => t.musicPlays || 0), color: '#eab308' },
              { label: 'Livres', data: d.trendData.map(t => t.booksPlays || 0), color: '#a855f7' },
              { label: 'Total lectures', data: d.trendData.map(t => t.totalViews || 0), color: '#94a3b8' },
            ];
            ChartHelper.renderMultiLine('chart-library-plays', labels, datasets, { isHours: false });
          } else {
            ChartHelper.showEmpty('chart-library-plays', 'Aucune lecture enregistrée');
          }
        }

        // Platform Distribution Chart
        const platEl = document.getElementById('chart-platform-dist');
        if (platEl) {
          const hasPlatData = d.platformChartData && d.platformChartData.some(p => (p.value || 0) > 0);
          if (hasPlatData) {
            const labels = d.platformChartData.map(p => p.name);
            const values = d.platformChartData.map(p => p.value);
            ChartHelper.renderDoughnut('chart-platform-dist', labels, values, {
              isHours: false,
              onClick: (idx, label) => Router.navigate(`/logs?client=${encodeURIComponent(label)}`),
            });
          } else {
            ChartHelper.showEmpty('chart-platform-dist', 'Aucune plateforme détectée');
          }
        }

        // Activity By Hour Chart (0..23h)
        const hourEl = document.getElementById('chart-activity-by-hour');
        if (hourEl) {
          if (d.hourlyChartData && d.hourlyChartData.length > 0) {
            const labels = d.hourlyChartData.map(h => h.hour);
            const values = d.hourlyChartData.map(h => Number(h.count || h.value || 0));
            const maxVal = Math.max(...values, 0);
            const bgColors = values.map(v => v === maxVal && maxVal > 0 ? '#f97316' : '#38bdf8');
            ChartHelper.renderBar('chart-activity-by-hour', labels, values, {
              backgroundColors: bgColors,
              label: 'Sessions',
              onClick: (idx, label) => Router.navigate(`/logs?hour=${label.split(':')[0]}`),
            });
          } else {
            ChartHelper.showEmpty('chart-activity-by-hour', 'Aucune activité horaire');
          }
        }

        // Day Of Week Chart (Lun..Dim)
        const dayEl = document.getElementById('chart-day-of-week');
        if (dayEl) {
          const standardDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
          const dayMap = new Map();
          if (d.dayOfWeekChartData && d.dayOfWeekChartData.length > 0) {
            d.dayOfWeekChartData.forEach(item => {
              const raw = (item.day || '').trim();
              const prefix = raw.substring(0, 3);
              dayMap.set(prefix, Number(item.count || 0));
              dayMap.set(raw, Number(item.count || 0));
            });
          }
          const values = standardDays.map(sd => dayMap.get(sd) || 0);
          const maxVal = Math.max(...values, 0);
          const bgColors = values.map(v => v === maxVal && maxVal > 0 ? '#ea580c' : '#059669');
          ChartHelper.renderBar('chart-day-of-week', standardDays, values, {
            backgroundColors: bgColors,
            label: 'Sessions',
          });
        }

        // Monthly Watch Time Chart
        renderMonthlyWatchChart();

        // Completion Ratio Chart
        const compEl = document.getElementById('chart-completion-ratio');
        if (compEl) {
          const hasCompData = d.completionData && d.completionData.some(c => (c.value || 0) > 0);
          if (hasCompData) {
            const labels = d.completionData.map(c => c.name);
            const values = d.completionData.map(c => c.value);
            const colorMap = { 'Terminé': '#22c55e', 'Partiel': '#f59e0b', 'Abandonné': '#ef4444' };
            const colors = labels.map(l => colorMap[l] || '#94a3b8');
            ChartHelper.renderDoughnut('chart-completion-ratio', labels, values, { colors, isHours: false });
          } else {
            ChartHelper.showEmpty('chart-completion-ratio', 'Aucune donnée de complétion');
          }
        }

        // Client Category Chart (TV, Mobile, Web, Desktop, Autre)
        const clientEl = document.getElementById('chart-client-category');
        if (clientEl) {
          const hasClientData = d.clientCategoryData && d.clientCategoryData.some(c => (c.count || 0) > 0);
          if (hasClientData) {
            const labels = d.clientCategoryData.map(c => c.category);
            const values = d.clientCategoryData.map(c => c.count);
            const catColors = { 'TV': '#6366f1', 'Web': '#3b82f6', 'Mobile': '#22c55e', 'Desktop': '#f59e0b', 'Autre': '#71717a' };
            const bgColors = labels.map(l => catColors[l] || '#71717a');
            ChartHelper.renderHorizontalBar('chart-client-category', labels, values, { backgroundColors: bgColors, label: 'Sessions' });
          } else {
            ChartHelper.showEmpty('chart-client-category', 'Aucun type d\'appareil');
          }
        }

        // Server Load Timeline (Peak Concurrent Streams)
        const loadEl = document.getElementById('chart-server-load');
        if (loadEl) {
          if (d.serverLoadData && d.serverLoadData.length > 0) {
            const labels = d.serverLoadData.map(s => s.time);
            const datasets = [{
              label: 'Flux simultanés max',
              data: d.serverLoadData.map(s => s.peakStreams || 0),
              color: '#ec4899',
              fill: true,
            }];
            ChartHelper.renderMultiLine('chart-server-load', labels, datasets, { isHours: false });
          } else {
            ChartHelper.showEmpty('chart-server-load', 'Aucun pic simultané');
          }
        }
      };

      // 8. Render Monthly Watch Chart
      const renderMonthlyWatchChart = () => {
        const monthlyEl = document.getElementById('chart-monthly-watch');
        if (!monthlyEl) return;

        const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
        const dataMap = new Map();
        if (dashboardData && dashboardData.monthlyWatchData) {
          dashboardData.monthlyWatchData.forEach(m => dataMap.set(m.month, m.hours));
        }

        const values = [];
        for (let i = 0; i < 12; i++) {
          values.push(dataMap.get(`${selectedMonthlyYear}_${i}`) || 0);
        }
        const maxVal = Math.max(...values, 0);
        const bgColors = values.map(v => v === maxVal && maxVal > 0 ? '#f97316' : '#38bdf8');

        ChartHelper.renderBar('chart-monthly-watch', monthNames, values, {
          backgroundColors: bgColors,
          isHours: true,
          onClick: (idx) => {
            const m = String(idx + 1).padStart(2, '0');
            Router.navigate(`/logs?dateFrom=${selectedMonthlyYear}-${m}-01`);
          },
        });
      };

      // 9. Render Yearly Heatmap Grid
      const renderHeatmapGrid = () => {
        const container = document.getElementById('dash-heatmap-grid-container');
        if (!container || !dashboardData || !dashboardData.yearlyHeatmap) return;

        const hm = dashboardData.yearlyHeatmap;
        const dataByType = hm.heatmapDataByType || {};
        const entries = dataByType[selectedHeatmapLib] || dataByType['_total'] || [];

        // Build date map
        const dateMap = new Map();
        let totalYearCount = 0;
        entries.forEach(e => {
          dateMap.set(e.date, e.count);
          if (e.date.startsWith(String(selectedHeatmapYear))) {
            totalYearCount += e.count;
          }
        });

        const summaryEl = document.getElementById('dash-heatmap-summary');
        if (summaryEl) summaryEl.textContent = `${totalYearCount} sessions enregistrées en ${selectedHeatmapYear}`;

        // Compute mean and levels
        const counts = Array.from(dateMap.values()).filter(c => c > 0);
        const mean = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
        const maxCount = counts.length > 0 ? Math.max(...counts) : 0;

        const getLvl = (c) => {
          if (!c || c <= 0) return 0;
          if (mean <= 0) return 1;
          if (c <= mean) return (c / mean < 0.5) ? 1 : 2;
          if (maxCount <= mean) return 3;
          return ((c - mean) / (maxCount - mean) < 0.45) ? 3 : 4;
        };

        // Construct 53 weeks x 7 days calendar
        const jan1 = new Date(selectedHeatmapYear, 0, 1);
        let curr = new Date(jan1);
        const dayOfWeek = (curr.getDay() + 6) % 7; // Monday = 0
        curr.setDate(curr.getDate() - dayOfWeek); // align to Monday

        let tableHtml = '<table class="activity-calendar-table"><tbody>';
        const dayNames = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

        for (let row = 0; row < 7; row++) {
          tableHtml += '<tr>';
          tableHtml += `<td style="font-size:0.68rem; color:var(--muted-foreground); padding-right:6px; font-weight:600;">${dayNames[row]}</td>`;
          let dayPtr = new Date(curr);
          dayPtr.setDate(dayPtr.getDate() + row);

          for (let col = 0; col < 53; col++) {
            const dateStr = dayPtr.toISOString().split('T')[0];
            const isCurYear = dayPtr.getFullYear() === selectedHeatmapYear;
            const count = isCurYear ? (dateMap.get(dateStr) || 0) : 0;
            const lvl = isCurYear ? getLvl(count) : 0;

            tableHtml += `
              <td>
                <div class="activity-calendar-cell cal-lvl-${lvl}" 
                     title="${dateStr}: ${count} sessions" 
                     data-date="${dateStr}" 
                     data-count="${count}"
                     style="${!isCurYear ? 'opacity:0.2;' : ''}">
                </div>
              </td>
            `;
            dayPtr.setDate(dayPtr.getDate() + 7);
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';

        container.innerHTML = tableHtml;

        // Drill-down modal on cell click
        container.querySelectorAll('.activity-calendar-cell').forEach(cell => {
          cell.addEventListener('click', async () => {
            const date = cell.getAttribute('data-date');
            const count = parseInt(cell.getAttribute('data-count'), 10) || 0;
            if (count === 0) return;

            try {
              const detail = await API.getJSON(`/api/heatmap-detail?date=${date}`);
              const sessions = detail.sessions || [];

              Modal.showAction({
                title: `Sessions du ${date} (${count} lectures)`,
                bodyHtml: sessions.length > 0 ? `
                  <div class="ranking-list" style="max-height:360px; overflow-y:auto;">
                    ${sessions.map(s => `
                      <div class="ranking-item">
                        <span class="ranking-badge">▶</span>
                        <div class="ranking-name">
                          <b>${Utils.escapeHtml(s.username)}</b> — ${Utils.escapeHtml(s.mediaTitle)}
                          <div class="text-xs text-muted-foreground">${s.durationMin || 0} min • ${Utils.escapeHtml(s.clientName || 'Client')}</div>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                ` : '<p class="text-muted-foreground">Aucun détail disponible pour cette date.</p>',
                cancelText: 'Fermer',
                confirmText: 'Voir les logs complets',
                onConfirm: () => Router.navigate(`/logs?dateFrom=${date}&dateTo=${date}`),
              });
            } catch (err) {}
          });
        });
      };

      // 10. Wire block controls (Year switchers, view toggles)
      const wireBlockControls = () => {
        // Draggable edit toggle
        const btnToggleEdit = document.getElementById('btn-toggle-draggable-edit');
        const editLabel = document.getElementById('draggable-edit-label');
        if (btnToggleEdit) {
          btnToggleEdit.onclick = () => {
            isDraggableEditing = !isDraggableEditing;
            if (editLabel) editLabel.textContent = isDraggableEditing ? (I18n.t('draggable.finishEdit') || 'Terminer') : (I18n.t('draggable.editOrder') || "Modifier l'ordre");
            btnToggleEdit.classList.toggle('btn-primary', isDraggableEditing);
            btnToggleEdit.classList.toggle('btn-secondary', !isDraggableEditing);
            renderDraggableDashboardBlocks();
          };
        }

        // Live view toggle (Gantt vs Cards)
        const btnLiveView = document.getElementById('btn-toggle-live-view');
        if (btnLiveView) {
          btnLiveView.onclick = () => {
            forceCardsView = !forceCardsView;
            renderLiveStreamsBlock();
          };
        }

        // Heatmap Year Switch
        const btnHmPrev = document.getElementById('btn-heatmap-prev-year');
        const btnHmNext = document.getElementById('btn-heatmap-next-year');
        const hmYearEl = document.getElementById('heatmap-current-year');
        if (btnHmPrev) {
          btnHmPrev.onclick = () => {
            selectedHeatmapYear--;
            if (hmYearEl) hmYearEl.textContent = selectedHeatmapYear;
            renderHeatmapGrid();
          };
        }
        if (btnHmNext) {
          btnHmNext.onclick = () => {
            selectedHeatmapYear++;
            if (hmYearEl) hmYearEl.textContent = selectedHeatmapYear;
            renderHeatmapGrid();
          };
        }

        // Heatmap Library filter buttons
        document.querySelectorAll('#dash-heatmap-lib-filters .time-pill-btn').forEach(btn => {
          btn.onclick = () => {
            document.querySelectorAll('#dash-heatmap-lib-filters .time-pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedHeatmapLib = btn.getAttribute('data-lib') || '_total';
            renderHeatmapGrid();
          };
        });

        // Monthly Watch Year Switch
        const btnMonPrev = document.getElementById('btn-monthly-prev-year');
        const btnMonNext = document.getElementById('btn-monthly-next-year');
        const monYearEl = document.getElementById('monthly-current-year');
        if (btnMonPrev) {
          btnMonPrev.onclick = () => {
            selectedMonthlyYear--;
            if (monYearEl) monYearEl.textContent = selectedMonthlyYear;
            renderMonthlyWatchChart();
          };
        }
        if (btnMonNext) {
          btnMonNext.onclick = () => {
            selectedMonthlyYear++;
            if (monYearEl) monYearEl.textContent = selectedMonthlyYear;
            renderMonthlyWatchChart();
          };
        }
      };

      // 11. Load AI Predictions Panel
      const loadPredictions = async () => {
        const container = document.getElementById('dash-predictions-container');
        if (!container) return;

        try {
          const preds = await API.getJSON('/api/predictions');
          const trending = preds.trendingMedia || [];
          const topPeaks = (preds.peakPredictions || []).slice(0, 10);
          const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

          if (trending.length === 0 && topPeaks.length === 0) {
            container.innerHTML = '';
            return;
          }

          container.innerHTML = `
            <div class="dash-grid-2">
              ${trending.length > 0 ? `
                <div class="card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title" style="display:flex; align-items:center; gap:0.4rem;">
                        <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                        Tendances émergentes
                      </div>
                      <div class="card-subtitle">Titres en forte accélération de visionnage</div>
                    </div>
                  </div>
                  <div class="ranking-list">
                    ${trending.slice(0, 6).map((item, i) => `
                      <a href="/media/${item.jellyfinMediaId || ''}" class="ranking-item">
                        <span class="ranking-badge">#${i + 1}</span>
                        <div class="ranking-name">
                          <span style="font-weight:700;">${Utils.escapeHtml(item.title)}</span>
                          <div style="font-size:0.72rem; color:var(--muted-foreground);">${item.currentWeekPlays || 0} lectures cette semaine</div>
                        </div>
                        <span class="badge ${item.growthPercent > 0 ? 'badge-success' : 'badge-info'}" style="font-size:0.72rem;">
                          ${item.growthPercent > 0 ? `+${item.growthPercent}%` : 'Nouveau'}
                        </span>
                      </a>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              ${topPeaks.length > 0 ? `
                <div class="card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title" style="display:flex; align-items:center; gap:0.4rem;">
                        <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        Prévisions des pics d'affluence
                      </div>
                      <div class="card-subtitle">Créneaux horaires de pointe anticipés par analyse EMA</div>
                    </div>
                  </div>
                  <div style="display:flex; flex-direction:column; gap:0.6rem; padding:0.5rem 0;">
                    ${topPeaks.map(peak => {
                      const maxPred = topPeaks[0]?.predictedSessions || 1;
                      const barW = Math.round((peak.predictedSessions / maxPred) * 100);
                      const isHighConf = peak.confidence >= 70;
                      return `
                        <div style="display:flex; align-items:center; gap:0.6rem; font-size:0.75rem;">
                          <span style="width:40px; font-weight:700; color:var(--muted-foreground);">${dayNames[peak.dayOfWeek] || '?'}</span>
                          <span style="width:35px; color:var(--muted-foreground);">${String(peak.hour).padStart(2, '0')}h</span>
                          <div style="flex:1; height:18px; border-radius:999px; background:rgba(148, 163, 184, 0.15); overflow:hidden; position:relative;">
                            <div style="height:100%; width:${barW}%; border-radius:999px; background:${isHighConf ? '#f59e0b' : 'rgba(245, 158, 11, 0.5)'}; transition:width 0.4s ease;"></div>
                            <span style="position:absolute; right:8px; top:1px; font-size:0.68rem; font-weight:700;">~${Math.round(peak.predictedSessions)} flux</span>
                          </div>
                          <span class="badge ${isHighConf ? 'badge-success' : 'badge-info'}" style="font-size:0.68rem; width:45px; text-align:center;">${peak.confidence}%</span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        } catch (e) {}
      };

      // 12. Load Tab 2: Granular Analysis & Deep Insights
      const loadGranularAndDeep = async () => {
        try {
          const params = new URLSearchParams();
          params.set('timeRange', currentTimeRange);
          if (currentMediaType) params.set('type', currentMediaType);
          if (currentServerId) params.set('servers', currentServerId);

          const [gran, deep] = await Promise.all([
            API.getJSON(`/api/stats/granular?${params.toString()}`).catch(() => ({})),
            API.getJSON(`/api/stats/deep?${params.toString()}`).catch(() => ({})),
          ]);

          const granContainer = document.getElementById('dash-granular-container');
          if (granContainer) {
            // Process Heatmap 7x24 Matrix
            const hmData = gran.heatmapData || [];
            let maxCellVal = 0;
            hmData.forEach(c => {
              const v = Number(c.views || c.value || c.Views || c.Value || 0);
              if (v > maxCellVal) maxCellVal = v;
            });

            const cellMap = new Map();
            hmData.forEach(c => {
              const d = c.DayOfWeek != null ? c.DayOfWeek : (c.day != null ? c.day : c.Day);
              const h = c.Hour != null ? c.Hour : c.hour;
              const v = Number(c.views || c.value || c.Views || c.Value || 0);
              cellMap.set(`${d}-${h}`, v);
            });

            const frenchDays = [
              { name: 'Lun', dow: 1 },
              { name: 'Mar', dow: 2 },
              { name: 'Mer', dow: 3 },
              { name: 'Jeu', dow: 4 },
              { name: 'Ven', dow: 5 },
              { name: 'Sam', dow: 6 },
              { name: 'Dim', dow: 0 },
            ];

            const getHeatmapColor = (count) => {
              if (!count || count <= 0) return 'rgba(148, 163, 184, 0.1)';
              const ratio = maxCellVal > 0 ? count / maxCellVal : 0;
              if (ratio <= 0.25) return '#0e4429';
              if (ratio <= 0.5) return '#006d32';
              if (ratio <= 0.75) return '#26a641';
              return '#39d353';
            };

            // Process Abandonment Segments
            const rawSegments = gran.dropSegments || [];
            const segMap = {
              skipped: { label: 'Zappé (<10%)', color: '#ef4444', val: 0 },
              abandoned: { label: 'Abandonné (10-50%)', color: '#f97316', val: 0 },
              almost: { label: 'Presque vu (50-80%)', color: '#eab308', val: 0 },
              finished: { label: 'Terminé (≥80%)', color: '#22c55e', val: 0 },
            };
            rawSegments.forEach(s => {
              if (segMap[s.name]) segMap[s.name].val = Number(s.value || 0);
            });
            const totalDrop = Object.values(segMap).reduce((acc, s) => acc + s.val, 0);

            granContainer.innerHTML = `
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
                      <div class="card-title">Moyenne horaire des lectures</div>
                      <div class="card-subtitle">Volume moyen de flux démarrés par heure de la journée</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:280px;">
                    <canvas id="chart-plays-hourly-avg"></canvas>
                  </div>
                </div>

                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Moyenne horaire de la durée</div>
                      <div class="card-subtitle">Temps moyen visionné par heure de la journée</div>
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
                    <div class="card-title">Matrice d'affluence horaire (7j × 24h)</div>
                    <div class="card-subtitle">Intensité moyenne de fréquentation selon le jour et l'heure (cliquez pour filtrer)</div>
                  </div>
                </div>
                <div class="attendance-heatmap-container" style="padding:1rem;">
                  <table class="attendance-table">
                    <thead>
                      <tr>
                        <th class="attendance-row-lbl"></th>
                        ${Array.from({ length: 24 }, (_, h) => `<th class="attendance-th">${h}h</th>`).join('')}
                      </tr>
                    </thead>
                    <tbody>
                      ${frenchDays.map(fd => `
                        <tr>
                          <td class="attendance-row-lbl">${fd.name}</td>
                          ${Array.from({ length: 24 }, (_, h) => {
                            const count = cellMap.get(`${fd.dow}-${h}`) || 0;
                            const bg = getHeatmapColor(count);
                            return `<td class="attendance-cell" style="background:${bg};" title="${fd.name} à ${h}h : ${count} session(s)" onclick="Router.navigate('/logs?hour=${h}')"></td>`;
                          }).join('')}
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
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
                    ${Object.values(segMap).map(seg => {
                      const pct = totalDrop > 0 ? Math.round((seg.val / totalDrop) * 100) : 0;
                      return `
                        <div>
                          <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.3rem;">
                            <span style="font-weight:600;">${seg.label}</span>
                            <span style="color:var(--muted-foreground); font-family:monospace;">${seg.val} (${pct}%)</span>
                          </div>
                          <div style="height:8px; background:var(--surface-nested, rgba(148,163,184,0.2)); border-radius:999px; overflow:hidden;">
                            <div style="height:100%; border-radius:999px; width:${pct}%; background:${seg.color}; transition:width 0.4s ease;"></div>
                          </div>
                        </div>
                      `;
                    }).join('')}
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
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:1.25rem;">
                <div class="card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Titres les plus abandonnés</div>
                      <div class="card-subtitle">Contenus arrêtés prématurément par les spectateurs</div>
                    </div>
                  </div>
                  <div class="ranking-list" style="padding:0.5rem 1rem 1rem;">
                    ${(gran.topAbandoned || []).map((m, i) => `
                      <a href="${m.mediaId ? `/media/${m.mediaId}` : '#'}" class="ranking-item">
                        <span class="ranking-badge" style="background:rgba(239, 68, 68, 0.15); color:#ef4444;">#${i + 1}</span>
                        <div class="ranking-name">
                          <span style="font-weight:700;" title="${Utils.escapeHtml(m.fullTitle || m.title)}">${Utils.escapeHtml(m.title)}</span>
                          <div style="font-size:0.72rem; color:var(--muted-foreground);">${m.count || 0} abandons · ${m.completion || 0}% vu</div>
                        </div>
                        <span class="badge badge-danger" style="font-size:0.72rem;">${m.completion || 0}%</span>
                      </a>
                    `).join('') || '<div class="text-muted-foreground text-sm" style="padding:1rem;">Aucun abandon prématuré recensé.</div>'}
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
            `;

            // Palette for multi-series
            const palette = ['#38bdf8', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e'];

            // 1. Chart: Plays per day
            const dailyData = gran.dailyData || [];
            if (dailyData.length > 0) {
              const labels = dailyData.map(d => d.time);
              const data = dailyData.map(d => Number(d.totalPlays || 0));
              ChartHelper.renderArea('chart-plays-per-day', labels, data, { label: 'Lectures', color: '#38bdf8' });
            } else {
              ChartHelper.showEmpty('chart-plays-per-day', 'Aucune lecture quotidienne');
            }

            // 2. Chart: Plays by library
            if (dailyData.length > 0 && gran.collections && gran.collections.length > 0) {
              const labels = dailyData.map(d => d.time);
              const datasets = gran.collections.map((col, idx) => ({
                label: col,
                data: dailyData.map(d => Number(d[`${col}_plays`] || 0)),
                color: palette[idx % palette.length],
              }));
              ChartHelper.renderStackedBar('chart-plays-by-lib', labels, datasets);
            } else {
              ChartHelper.showEmpty('chart-plays-by-lib', 'Aucune donnée par bibliothèque');
            }

            // 3. Chart: Duration per day
            if (dailyData.length > 0) {
              const labels = dailyData.map(d => d.time);
              const data = dailyData.map(d => Number(d.totalDuration || 0));
              ChartHelper.renderArea('chart-duration-per-day', labels, data, { label: 'Durée (h)', color: '#a855f7', isHours: true });
            } else {
              ChartHelper.showEmpty('chart-duration-per-day', 'Aucune durée enregistrée');
            }

            // 4. Chart: Duration by library
            if (dailyData.length > 0 && gran.collections && gran.collections.length > 0) {
              const labels = dailyData.map(d => d.time);
              const datasets = gran.collections.map((col, idx) => ({
                label: col,
                data: dailyData.map(d => Number(d[`${col}_duration`] || 0)),
                color: palette[idx % palette.length],
              }));
              ChartHelper.renderStackedArea('chart-duration-by-lib', labels, datasets);
            } else {
              ChartHelper.showEmpty('chart-duration-by-lib', 'Aucune donnée par bibliothèque');
            }

            // 5. Chart: Plays hourly avg
            const hourlyData = gran.hourlyData || [];
            if (hourlyData.length > 0) {
              const labels = hourlyData.map(h => h.time);
              const data = hourlyData.map(h => Number(h.plays || 0));
              ChartHelper.renderBar('chart-plays-hourly-avg', labels, data, { label: 'Lectures moyennes', backgroundColors: '#eab308' });
            } else {
              ChartHelper.showEmpty('chart-plays-hourly-avg', 'Aucune donnée horaire');
            }

            // 6. Chart: Duration hourly avg
            if (hourlyData.length > 0) {
              const labels = hourlyData.map(h => h.time);
              const data = hourlyData.map(h => Number(h.duration || 0));
              ChartHelper.renderArea('chart-duration-hourly-avg', labels, data, { label: 'Durée moyenne (h)', color: '#22c55e', isHours: true });
            } else {
              ChartHelper.showEmpty('chart-duration-hourly-avg', 'Aucune donnée horaire');
            }

            // 7. Chart: Average completion by lib
            const dropOff = gran.dropOffData || [];
            if (dropOff.length > 0) {
              const labels = dropOff.map(d => d.time || 'Bibliothèque');
              const values = dropOff.map(d => Number(d.completion || 0));
              ChartHelper.renderHorizontalBar('chart-avg-completion-lib', labels, values, {
                backgroundColors: '#8b5cf6',
                label: '% Moyen vu',
              });
            } else {
              ChartHelper.showEmpty('chart-avg-completion-lib', 'Aucune donnée de complétion');
            }

            // 8. Chart: Audio breakdown
            const audio = gran.audioData || deep.audioChartData || [];
            if (audio.length > 0 && audio.some(a => (a.value || 0) > 0)) {
              const labels = audio.map(a => a.name || 'Inconnu');
              const values = audio.map(a => Number(a.value || 0));
              ChartHelper.renderDoughnut('chart-audio-breakdown', labels, values, { isHours: false });
            } else {
              ChartHelper.showEmpty('chart-audio-breakdown', 'Aucune piste audio enregistrée');
            }

            // 9. Chart: Subtitles breakdown
            const subs = gran.subtitleData || deep.subtitleChartData || [];
            if (subs.length > 0 && subs.some(s => (s.value || 0) > 0)) {
              const labels = subs.map(s => s.name || 'Désactivé');
              const values = subs.map(s => Number(s.value || 0));
              ChartHelper.renderDoughnut('chart-subtitles-breakdown', labels, values, { isHours: false });
            } else {
              ChartHelper.showEmpty('chart-subtitles-breakdown', 'Aucun sous-titre utilisé');
            }
          }

          const deepContainer = document.getElementById('dash-deep-insights-container');
          if (deepContainer) {
            const cat = deep.categorized || {};
            const movies = cat.movie || [];
            const series = cat.series || [];
            const albums = cat.album || [];
            const books = cat.book || [];

            const renderMediaCategoryCard = (title, items, emptyText) => `
              <div class="card">
                <div class="card-header" style="padding-bottom:0.5rem;">
                  <div class="card-title" style="font-size:0.95rem;">${title}</div>
                </div>
                <div style="padding:0.5rem 0.75rem 0.75rem; display:flex; flex-direction:column; gap:0.4rem;">
                  ${items.length === 0 ? `<div class="text-muted-foreground text-xs" style="padding:0.5rem;">${emptyText}</div>` : ''}
                  ${items.map((m, i) => `
                    <div class="category-media-item">
                      <div style="display:flex; align-items:center; gap:0.4rem; overflow:hidden;">
                        <span style="font-size:0.75rem; color:var(--muted-foreground); width:16px;">${i + 1}.</span>
                        <span style="font-size:0.82rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${Utils.escapeHtml(m.title)}">${Utils.escapeHtml(m.title)}</span>
                      </div>
                      <span class="badge badge-secondary" style="font-size:0.7rem; font-family:monospace; shrink-0;">${m.plays} v. · ${m.duration}h</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;

            deepContainer.innerHTML = `
              <!-- Categorized Top Media Cards (4 cards) -->
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem; margin-bottom:1.25rem;">
                ${renderMediaCategoryCard('Top Films', movies, 'Aucun film regardé')}
                ${renderMediaCategoryCard('Top Séries', series, 'Aucune série regardée')}
                ${renderMediaCategoryCard('Top Musique', albums, 'Aucun album écouté')}
                ${renderMediaCategoryCard('Top Livres', books, 'Aucun livre lu')}
              </div>

              <!-- Top Genres -->
              ${(deep.topGenres || []).length > 0 ? `
                <div class="card" style="margin-bottom:1.25rem;">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Top Genres</div>
                      <div class="card-subtitle">Styles et catégories les plus visionnés</div>
                    </div>
                  </div>
                  <div style="padding:1rem;">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1rem;">
                      ${deep.topGenres.map((g, i) => {
                        const maxP = deep.topGenres[0]?.plays || 1;
                        const pct = Math.round((g.plays / maxP) * 100);
                        const genreColors = ['#38bdf8', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4', '#eab308', '#ef4444', '#6366f1', '#14b8a6'];
                        const col = genreColors[i % genreColors.length];
                        return `
                          <div style="display:flex; align-items:center; gap:0.6rem; font-size:0.8rem;">
                            <span style="width:20px; text-align:right; color:var(--muted-foreground);">${i + 1}.</span>
                            <div style="flex:1; min-width:0;">
                              <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
                                <span style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${Utils.escapeHtml(g.name)}</span>
                                <span style="font-size:0.75rem; color:var(--muted-foreground); margin-left:0.5rem; font-family:monospace;">${g.plays} v. · ${g.duration}h</span>
                              </div>
                              <div style="height:6px; background:var(--surface-nested, rgba(148,163,184,0.2)); border-radius:999px; overflow:hidden;">
                                <div style="height:100%; border-radius:999px; width:${pct}%; background:${col}; transition:width 0.4s ease;"></div>
                              </div>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                </div>
              ` : ''}

              <!-- Top Clients & Stream Methods -->
              <div class="dash-grid-2" style="margin-bottom:1.25rem;">
                <div class="card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Top Clients</div>
                      <div class="card-subtitle">Applications de lecture les plus sollicitées</div>
                    </div>
                  </div>
                  <div class="ranking-list" style="padding:0.75rem 1rem 1rem;">
                    ${(deep.topClients || []).map((c, i) => `
                      <div class="ranking-item">
                        <span class="ranking-badge">#${i + 1}</span>
                        <span class="ranking-name">${Utils.escapeHtml(c.clientName || '?')}</span>
                        <span class="ranking-value font-mono">${c.count} sessions</span>
                      </div>
                    `).join('') || '<div class="text-muted-foreground text-sm" style="padding:1rem;">Aucun client enregistré</div>'}
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
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1rem; padding:1rem;">
                  <div class="app-surface-soft p-4 rounded-lg">
                    <h4 style="font-weight:700; font-size:0.85rem; margin-bottom:0.75rem;">Top Acteurs</h4>
                    <div class="ranking-list">
                      ${(deep.topActors || []).slice(0, 5).map((a, i) => `
                        <div class="ranking-item">
                          <span class="ranking-badge">#${i + 1}</span>
                          <span class="ranking-name">${Utils.escapeHtml(a.name)}</span>
                          <span class="ranking-value">${a.count} films</span>
                        </div>
                      `).join('') || '<div class="text-muted-foreground text-sm">Aucune donnée</div>'}
                    </div>
                  </div>
                  <div class="app-surface-soft p-4 rounded-lg">
                    <h4 style="font-weight:700; font-size:0.85rem; margin-bottom:0.75rem;">Top Réalisateurs</h4>
                    <div class="ranking-list">
                      ${(deep.topDirectors || []).slice(0, 5).map((d, i) => `
                        <div class="ranking-item">
                          <span class="ranking-badge">#${i + 1}</span>
                          <span class="ranking-name">${Utils.escapeHtml(d.name)}</span>
                          <span class="ranking-value">${d.count} films</span>
                        </div>
                      `).join('') || '<div class="text-muted-foreground text-sm">Aucune donnée</div>'}
                    </div>
                  </div>
                  <div class="app-surface-soft p-4 rounded-lg">
                    <h4 style="font-weight:700; font-size:0.85rem; margin-bottom:0.75rem;">Top Studios</h4>
                    <div class="ranking-list">
                      ${(deep.topStudios || []).slice(0, 5).map((s, i) => `
                        <div class="ranking-item">
                          <span class="ranking-badge">#${i + 1}</span>
                          <span class="ranking-name">${Utils.escapeHtml(s.name)}</span>
                          <span class="ranking-value">${s.count} titres</span>
                        </div>
                      `).join('') || '<div class="text-muted-foreground text-sm">Aucune donnée</div>'}
                    </div>
                  </div>
                </div>
              </div>
            `;

            // Stream methods chart
            const streamMethods = deep.streamMethodsChartData || [];
            if (streamMethods.length > 0 && streamMethods.some(s => (s.value || 0) > 0)) {
              const labels = streamMethods.map(s => s.name || '?');
              const values = streamMethods.map(s => Number(s.value || 0));
              ChartHelper.renderDoughnut('chart-stream-methods', labels, values, {
                colors: ['#10b981', '#f59e0b', '#3b82f6', '#a855f7'],
                isHours: false,
              });
            } else {
              ChartHelper.showEmpty('chart-stream-methods', 'Aucune méthode de flux');
            }

            // Resolution matrix chart
            const resolutions = deep.resolutionChartData || [];
            if (resolutions.length > 0 && resolutions.some(r => (r.value || 0) > 0)) {
              const labels = resolutions.map(r => r.name || '?');
              const values = resolutions.map(r => Number(r.value || 0));
              ChartHelper.renderDoughnut('chart-resolution-matrix', labels, values, { isHours: false });
            } else {
              ChartHelper.showEmpty('chart-resolution-matrix', 'Aucune résolution enregistrée');
            }

            // Device ecosystem chart
            const devices = deep.deviceChartData || [];
            if (devices.length > 0 && devices.some(d => (d.value || 0) > 0)) {
              const labels = devices.map(d => d.name || '?');
              const values = devices.map(d => Number(d.value || 0));
              ChartHelper.renderDoughnut('chart-device-ecosystem', labels, values, { isHours: false });
            } else {
              ChartHelper.showEmpty('chart-device-ecosystem', 'Aucun appareil enregistré');
            }
          }
        } catch (e) {
          console.error('[GranularAndDeep] Error loading analytics:', e);
        }
      };

      // 13. Load Tab 3: Network Analysis & Coupables Table
      const loadNetworkTab = async () => {
        try {
          const params = new URLSearchParams();
          params.set('timeRange', currentTimeRange);
          if (currentMediaType) params.set('type', currentMediaType);
          if (currentServerId) params.set('servers', currentServerId);

          const [net, geo] = await Promise.all([
            API.getJSON(`/api/stats/network?${params.toString()}`).catch(() => ({})),
            API.getJSON('/api/geo-stats').catch(() => ({})),
          ]);

          const container = document.getElementById('dash-network-container');
          if (!container) return;

          const stats = net.stats || { totalSessions: 0, directPlaySessions: 0, transcodeSessions: 0, directStreamSessions: 0, transcodePercent: 0, totalTranscodeDuration: 0 };
          const coupable = net.coupableTable || [];

          container.innerHTML = `
            <!-- 4 Network KPI Cards -->
            <div class="stat-grid-4">
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">Sessions totales</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                </div>
                <div class="stat-num metric-glow-cyan">${stats.totalSessions}</div>
                <div class="stat-desc text-emerald" style="font-weight:600;">${stats.directPlaySessions} DirectPlay</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">Taux de transcodage</span>
                  <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                </div>
                <div class="stat-num metric-glow-amber">${stats.transcodePercent}%</div>
                <div class="stat-desc">${stats.transcodeSessions} lectures transcodées</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">DirectStream (Remux)</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="15" x="2" y="3" rx="2"/></svg>
                </div>
                <div class="stat-num metric-glow-blue">${stats.directStreamSessions}</div>
                <div class="stat-desc">Conteneur modifié sans ré-encodage vidéo</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">Durée de transcodage</span>
                  <svg class="nav-icon text-rose" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div class="stat-num metric-glow-rose">${Math.round((stats.totalTranscodeDuration || 0) / 3600)}h</div>
                <div class="stat-desc">Temps machine cumulé</div>
              </div>
            </div>

            <!-- 2 Network Charts -->
            <div class="dash-grid-2">
              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">DirectPlay vs Transcode par heure</div>
                    <div class="card-subtitle">Répartition temporelle des méthodes de flux</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:280px;">
                  <canvas id="chart-net-transcode-hourly"></canvas>
                </div>
              </div>

              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">Transcodage par client</div>
                    <div class="card-subtitle">Pourcentage de sessions transcodées par application</div>
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
                  <div class="card-title">🚨 Tableau des Coupables (Titres les plus transcodés)</div>
                  <div class="card-subtitle">Fichiers consommant le plus de ressources CPU/GPU avec motif identifié</div>
                </div>
              </div>
              <div style="padding:1rem; overflow-x:auto;">
                ${coupable.length > 0 ? `
                  <table class="table-modern">
                    <thead>
                      <tr>
                        <th>Média</th>
                        <th>Résolution</th>
                        <th style="text-align:center;">Sessions</th>
                        <th style="text-align:center;">Durée</th>
                        <th>Cause principale</th>
                        <th>Client principal</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${coupable.map((row, i) => `
                        <tr>
                          <td>
                            <div style="display:flex; align-items:center; gap:0.5rem;">
                              <span style="font-size:0.75rem; color:var(--muted-foreground);">${i + 1}.</span>
                              <span style="font-weight:600;" title="${Utils.escapeHtml(row.fullTitle || row.title)}">${Utils.escapeHtml(row.title)}</span>
                            </div>
                          </td>
                          <td>
                            <span class="badge ${row.resolution === '4K' ? 'badge-warning' : 'badge-info'}" style="font-size:0.7rem;">${row.resolution || 'HD'}</span>
                          </td>
                          <td style="text-align:center; font-weight:700;" class="metric-glow-amber">${row.count}</td>
                          <td style="text-align:center; font-size:0.8rem;">${row.durationMin} min</td>
                          <td>
                            <span class="badge badge-danger" style="font-size:0.72rem;">${Utils.escapeHtml(row.mainReason || 'Transcode')}</span>
                          </td>
                          <td>
                            <span style="font-size:0.8rem; color:var(--muted-foreground);">${Utils.escapeHtml(row.topClient || 'Inconnu')}</span>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                ` : '<div class="text-muted-foreground text-sm" style="padding:1.5rem; text-align:center;">Aucune session transcodée enregistrée sur cette période. Bravo pour votre bande passante !</div>'}
              </div>
            </div>

            <!-- Geographic Distribution -->
            <div class="card">
              <div class="card-header">
                <div class="card-title-group">
                  <div class="card-title">🌍 Origine géographique des connexions</div>
                  <div class="card-subtitle">Localisation des adresses IP clientes enregistrées</div>
                </div>
              </div>
              <div style="padding:1rem;">
                <div class="ranking-list">
                  ${(geo.locations || []).slice(0, 10).map((loc, i) => `
                    <div class="ranking-item">
                      <span class="ranking-badge">🌍</span>
                      <span class="ranking-name">${Utils.escapeHtml(loc.city || 'Inconnu')}, ${Utils.escapeHtml(loc.country || '')}</span>
                      <span class="ranking-value">${loc.count || 0} sessions</span>
                    </div>
                  `).join('') || '<div class="text-muted-foreground text-sm">Aucune donnée géographique enregistrée.</div>'}
                </div>
              </div>
            </div>
          `;

          // Render Network Charts
          const hourly = net.hourlyData || [];
          if (hourly.length > 0) {
            const labels = hourly.map(h => h.hour || h.time || h.Hour || h.Time);
            const datasets = [
              { label: 'DirectPlay', data: hourly.map(h => h.DirectPlay != null ? h.DirectPlay : (h.directPlay || 0)), color: '#10b981' },
              { label: 'Transcode', data: hourly.map(h => h.Transcode != null ? h.Transcode : (h.transcode || 0)), color: '#f59e0b' },
              { label: 'DirectStream', data: hourly.map(h => h.DirectStream != null ? h.DirectStream : (h.directStream || 0)), color: '#3b82f6' },
            ];
            ChartHelper.renderStackedArea('chart-net-transcode-hourly', labels, datasets);
          } else {
            ChartHelper.showEmpty('chart-net-transcode-hourly', 'Aucune donnée horaire réseau');
          }

          if (net.clientTranscodeData && net.clientTranscodeData.length > 0) {
            const labels = net.clientTranscodeData.map(c => c.name);
            const values = net.clientTranscodeData.map(c => c.transcodePercent || 0);
            ChartHelper.renderHorizontalBar('chart-net-client-transcode', labels, values, {
              backgroundColors: '#f97316',
              label: '% Transcodé',
            });
          } else {
            ChartHelper.showEmpty('chart-net-client-transcode', 'Aucun transcodage client');
          }
        } catch (e) {
          console.error('[NetworkTab] Error loading network analytics:', e);
        }
      };

      // 14. Tab switcher click handlers
      document.querySelectorAll('#dashboard-tablist .dash-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#dashboard-tablist .dash-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeTab = btn.getAttribute('data-tab');

          document.getElementById('tab-content-overview')?.classList.toggle('hidden', activeTab !== 'overview');
          document.getElementById('tab-content-analytics')?.classList.toggle('hidden', activeTab !== 'analytics');
          document.getElementById('tab-content-network')?.classList.toggle('hidden', activeTab !== 'network');

          if (activeTab === 'overview') {
            renderChartsForOverview();
          } else if (activeTab === 'analytics') {
            loadGranularAndDeep();
          } else if (activeTab === 'network') {
            loadNetworkTab();
          }
        });
      });

      // 15. Time range pills click handlers
      document.querySelectorAll('#dash-time-range .time-pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#dash-time-range .time-pill-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentTimeRange = btn.getAttribute('data-range') || '7d';
          loadAllDashboard();
          if (activeTab === 'analytics') loadGranularAndDeep();
          if (activeTab === 'network') loadNetworkTab();
        });
      });

      // 16. Media filter buttons click handlers
      document.querySelectorAll('#dash-media-filter .header-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#dash-media-filter .header-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentMediaType = btn.getAttribute('data-type') || '';
          loadAllDashboard();
          if (activeTab === 'analytics') loadGranularAndDeep();
          if (activeTab === 'network') loadNetworkTab();
        });
      });

      // 17. Refresh button click handler
      const btnRefresh = document.getElementById('btn-refresh-dashboard');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
          loadSystemHealth();
          loadHardware();
          refreshLiveStreams();
          loadAllDashboard();
          if (activeTab === 'analytics') loadGranularAndDeep();
          if (activeTab === 'network') loadNetworkTab();
          Toast.info('Données rafraîchies');
        });
      }

      // Initial loaders
      await Promise.all([
        loadSystemHealth(),
        loadHardware(),
        refreshLiveStreams(),
        loadAllDashboard(),
      ]);

      // Polling for live streams & hardware
      const hwInterval = setInterval(loadHardware, 10000);
      const healthInterval = setInterval(loadSystemHealth, 30000);
      const streamsInterval = setInterval(refreshLiveStreams, 4000);

      // Cleanup on page navigate
      const originalNavigate = Router.navigate;
      const cleanup = () => {
        clearInterval(hwInterval);
        clearInterval(healthInterval);
        clearInterval(streamsInterval);
        window.removeEventListener('popstate', cleanup);
      };
      window.addEventListener('popstate', cleanup, { once: true });
    },

    // 2. Login Page
    async login() {
      StreamsPoller.stop();
      document.body.classList.add('is-auth-page');
      const main = document.getElementById('app-main');

      // 1. Fetch Auth Options
      let oidcEnabled = false;
      let oidcAutoRedirect = false;
      let localAdminEnabled = false;
      try {
        const opts = await API.getJSON('/api/auth/options');
        oidcEnabled = !!opts.oidc;
        oidcAutoRedirect = !!opts.autoRedirect;
        localAdminEnabled = !!opts.localAdmin;
      } catch (e) {}

      // 2. Query Parameters
      const urlParams = new URLSearchParams(window.location.search);
      const queryError = urlParams.get('error');
      const isLogout = urlParams.get('logout') === '1' || urlParams.get('logout') === 'true';
      const isManual = urlParams.get('manual') === '1' || urlParams.get('manual') === 'true';
      const isLocalParam = urlParams.get('local') === '1' || urlParams.get('local') === 'true';

      let isLocalLogin = isLocalParam;
      let isAutoRedirecting = false;
      let autoRedirectAttempted = false;
      let error = null;

      if (queryError) {
        const msgs = {
          'AccessDeniedGroup': I18n.t('login.unauthorizedGroup') || 'Accès refusé : groupe non autorisé.',
          'AccessDenied': I18n.t('login.unauthorizedGroup') || 'Accès refusé.',
          'OAuthSignin': I18n.t('login.ssoError') || 'Erreur lors de la connexion SSO.',
          'OAuthCallback': I18n.t('login.ssoError') || 'Erreur lors du retour SSO.',
          'OAuthCreateAccount': I18n.t('login.ssoError') || 'Erreur lors du compte SSO.',
          'CredentialsSignin': I18n.t('login.invalidCredentials') || 'Identifiants incorrects.',
        };
        error = msgs[queryError] || I18n.t('login.unexpectedError') || 'Une erreur inattendue s\'est produite.';
      }

      // Auto-redirect condition (matching main branch)
      if (oidcEnabled && !isLocalLogin && oidcAutoRedirect && !queryError && !isLogout && !isManual && !isLocalParam) {
        isAutoRedirecting = true;
      }

      const render = () => {
        const isSsoView = !isLocalLogin;
        const headerClass = isSsoView ? 'auth-card-header auth-header-sso' : 'auth-card-header';
        const showSubtitle = false;

        let contentHtml = '';

        if (isSsoView) {
          // --- MODE 1: SSO Primary View (matching historical pre-rewrite behavior) ---
          contentHtml = `
            <div class="auth-sso-container">
              ${error ? `
                <div class="auth-alert-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span>${Utils.escapeHtml(error)}</span>
                </div>
              ` : ''}

              ${isLogout && !error ? `
                <div class="auth-alert-success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <span>${I18n.t('login.loggedOutNotice') || 'Vous avez été déconnecté avec succès.'}</span>
                </div>
              ` : ''}

              ${isAutoRedirecting && !error ? `
                <div class="auth-sso-auto-box">
                  <div class="auth-sso-auto-icon-wrap">
                    <div class="auth-sso-ping"></div>
                    <div class="auth-sso-icon-box">
                      <svg class="auth-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    </div>
                  </div>
                  <div>
                    <div class="auth-sso-auto-title">${I18n.t('login.autoRedirecting') || 'Redirection vers votre fournisseur SSO...'}</div>
                    <div class="auth-sso-auto-subtitle">${I18n.t('login.autoRedirectHint') || 'Connexion automatique via OpenID Connect...'}</div>
                  </div>
                  <a href="/api/auth/oidc/start" class="auth-sso-manual-link">${I18n.t('login.continueManually') || 'Continuer vers le SSO'}</a>
                </div>
              ` : `
                <a href="/api/auth/oidc/start" class="auth-sso-primary-btn" id="btn-sso-start">
                  <span>${I18n.t('login.signIn') || 'Se connecter'}</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </a>
              `}

              ${localAdminEnabled ? `
                <div class="auth-toggle-local-wrap">
                  <button type="button" id="btn-toggle-local" class="auth-toggle-local-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3M17.5 5.5l3 3"/></svg>
                    <span>${I18n.t('login.localLogin') || 'Utilisateur local'}</span>
                  </button>
                </div>
              ` : ''}
            </div>
          `;
        } else {
          // --- MODE 2: Emergency Local Admin Mode (matching historical pre-rewrite behavior) ---
          contentHtml = `
            <div class="auth-card-body">
              <form id="form-login-local" class="auth-form">
                <div class="auth-local-header">
                  <span class="auth-local-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3M17.5 5.5l3 3"/></svg>
                    <span>${I18n.t('login.localAdminTitle') || 'Connexion locale (Admin)'}</span>
                  </span>
                  <button type="button" id="btn-back-sso" class="auth-back-sso-btn">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 19-7-7 7-7M5 12h14"/></svg>
                    <span>${I18n.t('login.backToSso') || 'Retour au SSO'}</span>
                  </button>
                </div>

                ${error ? `
                  <div class="auth-alert-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>${Utils.escapeHtml(error)}</span>
                  </div>
                ` : ''}

                <div class="auth-input-group">
                  <label class="auth-label">${I18n.t('login.username') || 'Nom d\'utilisateur'}</label>
                  <div class="auth-input-wrapper">
                    <svg class="auth-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <input type="text" class="auth-input-field" id="login-username" required value="admin" placeholder="admin">
                  </div>
                </div>

                <div class="auth-input-group">
                  <label class="auth-label">${I18n.t('login.password') || 'Mot de passe'}</label>
                  <div class="auth-input-wrapper">
                    <svg class="auth-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <input type="password" class="auth-input-field" id="login-password" required autofocus placeholder="••••••••">
                  </div>
                </div>

                <button type="submit" id="btn-login-submit" class="auth-submit-btn auth-submit-btn-amber">
                  <span id="btn-login-text">${I18n.t('login.signIn') || 'Se connecter'}</span>
                  <svg id="btn-login-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </form>
            </div>
          `;
        }

        const isDark = Theme.isDark();

        main.innerHTML = `
          <div class="auth-wrapper">
            <div class="auth-glow-blob-1"></div>
            <div class="auth-glow-blob-2"></div>

            <div class="auth-card-container">
              <div class="auth-card">
                <div class="${headerClass}">
                  <div class="auth-logo-box">
                    <svg class="auth-logo-svg" width="52" height="52" viewBox="18 23 64 69" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <linearGradient id="jellyGradLogin" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stop-color="#AA5CC3"/>
                          <stop offset="100%" stop-color="#00A4DC"/>
                        </linearGradient>
                        <mask id="holeMaskLogin">
                          <rect x="0" y="0" width="100" height="100" fill="#ffffff"/>
                          <circle cx="50" cy="39" r="10" fill="black"/>
                        </mask>
                      </defs>
                      <path d="M 20 55 A 30 30 0 0 1 80 55 Z" fill="url(#jellyGradLogin)" mask="url(#holeMaskLogin)"/>
                      <polygon points="46,32 46,46 58,39" fill="#00A4DC"/>
                      <rect x="30" y="60" width="8" height="20" rx="4" fill="url(#jellyGradLogin)"/>
                      <rect x="46" y="60" width="8" height="30" rx="4" fill="url(#jellyGradLogin)"/>
                      <rect x="62" y="60" width="8" height="15" rx="4" fill="url(#jellyGradLogin)"/>
                    </svg>
                  </div>
                  <div>
                    <h1 class="auth-card-title">${I18n.t('login.title') || 'Connexion JellyTrack'}</h1>
                    ${showSubtitle ? `
                      <p class="auth-card-subtitle">${I18n.t('login.subtitle') || 'Authentification via Jellyfin'}</p>
                    ` : ''}
                  </div>
                </div>

                ${contentHtml}
              </div>

              <!-- Bottom Language Switcher & Theme Card (matching main branch) -->
              <div class="auth-controls-container">
                <div class="auth-controls-bottom">
                  <select id="login-language-select" aria-label="Langue">
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                    <option value="de">Deutsch</option>
                    <option value="es">Español</option>
                    <option value="it">Italiano</option>
                    <option value="nl">Nederlands</option>
                    <option value="pl">Polski</option>
                    <option value="pt-BR">Português</option>
                    <option value="ru">Русский</option>
                    <option value="zh">中文</option>
                  </select>
                </div>

                <button type="button" id="login-theme-card" class="auth-theme-card" aria-label="${isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}">
                  <div class="auth-theme-icon-box">
                    ${isDark ? `
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                    ` : `
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
                    `}
                  </div>
                  <div class="auth-theme-text">
                    <div class="auth-theme-label">${I18n.t('common.theme') || 'THÈME'}</div>
                    <div class="auth-theme-value">${isDark ? (I18n.t('common.themeDark') || 'Sombre') : (I18n.t('common.themeLight') || 'Clair')}</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        `;

        // Wire Event Listeners
        const langSelect = document.getElementById('login-language-select');
        if (langSelect) {
          langSelect.value = State.locale;
          langSelect.addEventListener('change', async (e) => {
            await I18n.changeLocale(e.target.value);
            render();
          });
        }

        const themeCard = document.getElementById('login-theme-card');
        if (themeCard) {
          themeCard.addEventListener('click', () => {
            Theme.toggle();
            render();
          });
        }

        const toggleLocalBtn = document.getElementById('btn-toggle-local');
        if (toggleLocalBtn) {
          toggleLocalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            error = null;
            isAutoRedirecting = false;
            isLocalLogin = true;
            render();
          });
        }

        const backSsoBtn = document.getElementById('btn-back-sso');
        if (backSsoBtn) {
          backSsoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            error = null;
            isLocalLogin = false;
            render();
          });
        }

        // Handle Auto-Redirect timer
        if (isSsoView && isAutoRedirecting && !autoRedirectAttempted) {
          autoRedirectAttempted = true;
          setTimeout(() => {
            if (isAutoRedirecting) {
              window.location.href = '/api/auth/oidc/start';
            }
          }, 400);
        }

        // Form submission (Local Admin or Jellyfin)
        const formLocal = document.getElementById('form-login-local');
        const formJellyfin = document.getElementById('form-login-jellyfin');
        const activeForm = formLocal || formJellyfin;

        if (activeForm) {
          activeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('btn-login-submit');
            const btnText = document.getElementById('btn-login-text');
            const btnArrow = document.getElementById('btn-login-arrow');

            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.style.opacity = '0.6';
              submitBtn.style.cursor = 'not-allowed';
            }
            if (btnText) btnText.textContent = I18n.t('login.verifying') || 'Vérification…';
            if (btnArrow) btnArrow.style.display = 'none';

            const u = document.getElementById('login-username')?.value.trim() || '';
            const p = document.getElementById('login-password')?.value || '';
            const remEl = document.getElementById('login-remember');
            const rem = remEl ? remEl.checked : false;

            try {
              await Auth.login(u, p, rem);
              Toast.success(I18n.t('login.loginSuccess') || 'Connecté avec succès !');
              document.body.classList.remove('is-auth-page');
              Router.navigate('/');
            } catch (err) {
              error = err.message || (I18n.t('login.invalidCredentials') || 'Identifiants incorrects.');
              render();
            }
          });
        }
      };

      render();
    },

    // 3. Setup Wizard
    async setup() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
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
      `;

      document.getElementById('btn-setup-submit').addEventListener('click', async () => {
        const name = document.getElementById('setup-name').value.trim();
        const url = document.getElementById('setup-url').value.trim();
        const apiKey = document.getElementById('setup-api-key').value.trim();
        const errEl = document.getElementById('setup-error');
        const btn = document.getElementById('btn-setup-submit');
        const btnText = document.getElementById('setup-btn-text');

        if (!name || !url || !apiKey) {
          errEl.textContent = 'Tous les champs sont obligatoires.';
          errEl.style.display = 'block';
          return;
        }

        btn.disabled = true;
        if (btnText) btnText.textContent = 'Connexion en cours…';
        errEl.style.display = 'none';

        try {
          await API.postJSON('/api/settings/jellyfin-servers', { name, url, apiKey, isActive: true });
          Toast.success('Serveur Jellyfin configuré avec succès !');
          await API.postJSON('/api/sync', { recentOnly: false });
          Router.navigate('/');
        } catch (err) {
          errEl.textContent = err.message;
          errEl.style.display = 'block';
          btn.disabled = false;
          if (btnText) btnText.textContent = 'Enregistrer et Synchroniser';
        }
      });
    },

    // 4. About Page
    async about() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div class="about-wrapper">
          <div class="about-hero">
            <div class="about-logo-box">
              <img src="/assets/logo.svg" alt="JellyTrack" style="width: 44px; height: 44px;">
            </div>
            <span class="about-version-pill">v3.0.0 • Go Native Engine</span>
            <h1 class="about-hero-title">JellyTrack</h1>
            <p class="about-hero-desc">
              ${I18n.t('about.description') || 'Tableau de bord d’analyse, de statistiques et de surveillance en temps réel pour serveurs Jellyfin. Propulsé par un binaire Go autonome ultra-rapide sans dépendance Node.js.'}
            </p>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <svg style="width:20px;height:20px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                Fonctionnalités Clés
              </div>
            </div>
            <ul class="feature-list">
              <li class="feature-item"><div class="feature-dot"></div><span><b>Architecture Go 100% autonome</b> : zéro Node.js, zéro React, zéro npm au runtime.</span></li>
              <li class="feature-item"><div class="feature-dot"></div><span><b>Graphiques haute performance</b> : suivi de lecture en direct, analyse par format et client.</span></li>
              <li class="feature-item"><div class="feature-dot"></div><span><b>Carte thermique annuelle</b> : style GitHub interactive avec zoom par session.</span></li>
              <li class="feature-item"><div class="feature-dot"></div><span><b>Catalogue multimédia enrichi</b> : films, séries, musique et livres avec métadonnées.</span></li>
              <li class="feature-item"><div class="feature-dot"></div><span><b>JellyTrack Wrapped</b> : rétrospective annuelle interactive style Spotify avec partage.</span></li>
              <li class="feature-item"><div class="feature-dot"></div><span><b>Sécurité d’entreprise</b> : sessions chiffrées, CSRF/SSRF guard, OpenID Connect / SSO.</span></li>
              <li class="feature-item"><div class="feature-dot"></div><span><b>Internationalisation</b> : 11 langues traduites (FR, EN, DE, ES, IT, NL, PL, PT, RU, ZH).</span></li>
            </ul>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <svg style="width:20px;height:20px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                Stack Technique
              </div>
            </div>
            <div class="tech-grid">
              <div class="tech-item">
                <span class="tech-icon">🐹</span>
                <div>
                  <div class="tech-name">Go 1.23+</div>
                  <div class="tech-desc">Backend ultra-rapide & serveur HTTP natif</div>
                </div>
              </div>
              <div class="tech-item">
                <span class="tech-icon">🗄️</span>
                <div>
                  <div class="tech-name">SQLite / PostgreSQL</div>
                  <div class="tech-desc">Stockage persistant & migrations automatiques</div>
                </div>
              </div>
              <div class="tech-item">
                <span class="tech-icon">📊</span>
                <div>
                  <div class="tech-name">Chart.js</div>
                  <div class="tech-desc">Visualisations fluides et interactives</div>
                </div>
              </div>
              <div class="tech-item">
                <span class="tech-icon">🔑</span>
                <div>
                  <div class="tech-name">OIDC & SSO</div>
                  <div class="tech-desc">Authentification unique unifiée</div>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <svg style="width:20px;height:20px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                Liens & Communauté
              </div>
            </div>
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
              <a href="https://github.com/maelmoreau21/JellyTrack" target="_blank" rel="noopener" class="btn btn-secondary" style="display:flex;align-items:center;gap:0.5rem;">
                <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                GitHub Repository
              </a>
              <a href="https://jellyfin.org" target="_blank" rel="noopener" class="btn btn-secondary" style="display:flex;align-items:center;gap:0.5rem;">
                <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                Projet Jellyfin
              </a>
            </div>
          </div>
        </div>
      `;
    },

    // 5. Recent Playback History
    async recent() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
              ${I18n.t('nav.recentlyAdded') || I18n.t('nav.recent') || 'Ajouts Récents'}
            </h1>
            <p class="page-subtitle">${I18n.t('recent.subtitle') || 'Dernières lectures enregistrées sur vos serveurs.'}</p>
          </div>
          <span class="chip" id="recent-count">Chargement…</span>
        </div>

        <div class="card" style="padding: 0;">
          <div class="table-wrapper" style="border: none; border-radius: var(--radius-lg);">
            <table class="table">
              <thead>
                <tr>
                  <th>Média</th>
                  <th>Type</th>
                  <th>Utilisateur</th>
                  <th>Durée</th>
                  <th>Méthode</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody id="recent-table-body">
                <tr><td colspan="6" style="padding: 0;"><div class="skeleton" style="height: 56px; border-radius: 0;"></div></td></tr>
                <tr><td colspan="6" style="padding: 0;"><div class="skeleton" style="height: 56px; border-radius: 0;"></div></td></tr>
                <tr><td colspan="6" style="padding: 0;"><div class="skeleton" style="height: 56px; border-radius: 0;"></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `;

      try {
        const data = await API.getJSON('/api/history?limit=50&days=30');
        const tbody = document.getElementById('recent-table-body');
        const countEl = document.getElementById('recent-count');
        if (!data.items || data.items.length === 0) {
          if (countEl) countEl.textContent = '0 lecture';
          tbody.innerHTML = `
            <tr>
              <td colspan="6">
                <div class="empty-state">
                  <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span class="empty-state-title">Aucun historique disponible</span>
                  <span>Les lectures apparaîtront ici après synchronisation.</span>
                </div>
              </td>
            </tr>`;
          return;
        }
        if (countEl) countEl.textContent = `${data.items.length} lecture${data.items.length > 1 ? 's' : ''}`;

        tbody.innerHTML = data.items.map((it) => `
          <tr>
            <td>
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="width: 30px; height: 44px; background: var(--surface-nested); border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0;">
                  ${it.jellyfinMediaId ? `<img src="/api/jellyfin/image?id=${it.jellyfinMediaId}&type=Primary&maxWidth=100" style="width:100%;height:100%;object-fit:cover;">` : '<div style="width:100%;height:100%;background:var(--surface-nested);"></div>'}
                </div>
                <div style="min-width:0;">
                  <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">
                    <a href="/media/${it.mediaId || it.id}" data-link style="color:inherit;">${Utils.escapeHtml(it.title)}</a>
                  </div>
                  ${it.library ? `<div style="font-size:0.72rem;color:var(--muted-foreground);">${Utils.escapeHtml(it.library)}</div>` : ''}
                </div>
              </div>
            </td>
            <td><span class="badge badge-secondary">${Utils.escapeHtml(it.type || '—')}</span></td>
            <td>
              <a href="/users/${it.userId || it.username}" data-link style="font-weight:500;">${Utils.escapeHtml(it.username || 'Inconnu')}</a>
            </td>
            <td style="white-space:nowrap;">${Utils.formatMs(it.durationMs)}</td>
            <td><span class="badge ${it.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}">${Utils.escapeHtml(it.playMethod || 'Stream')}</span></td>
            <td style="white-space:nowrap;">
              <div style="font-size:0.85rem;">${Utils.formatDateTime(it.startedAt)}</div>
              <div style="font-size:0.72rem;color:var(--muted-foreground);">${Utils.timeAgo(it.startedAt)}</div>
            </td>
          </tr>
        `).join('');
      } catch (e) {
        Toast.error(e.message);
      }
    },

    // 6. Newsletter / Discord Announcement
    async newsletter() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div style="max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
          <div class="page-header">
            <div>
              <h1 class="page-title">
                <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                ${I18n.t('newsletter.title') || 'Newsletter & Récapitulatif'}
              </h1>
              <p class="page-subtitle">Générez et publiez le résumé mensuel automatisé sur votre canal Discord.</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" id="btn-post-discord" style="display: flex; align-items: center; gap: 0.5rem;">
                <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z"/></svg>
                ${I18n.t('newsletter.sendDiscord') || 'Publier sur Discord'}
              </button>
            </div>
          </div>

          <div class="card" id="newsletter-preview-card" style="padding: 1.75rem;">
            <div class="skeleton" style="height: 250px;"></div>
          </div>
        </div>
      `;

      try {
        const data = await API.getJSON('/api/newsletter');
        const card = document.getElementById('newsletter-preview-card');
        card.innerHTML = `
          <div class="card-header" style="padding:0 0 1.25rem 0; border-bottom: 1px solid var(--border-subtle);">
            <div class="card-title-group">
              <div class="card-title" style="display:flex;align-items:center;gap:0.5rem;">
                <span>📢</span>
                Récapitulatif des 30 derniers jours
              </div>
              <div class="card-subtitle">Période : ${Utils.escapeHtml(data.dateRange || 'Derniers 30 jours')}</div>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 1.5rem; margin-top: 1.25rem;">
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-card-header">
                  <span class="stat-card-label">Lectures totales</span>
                  <div class="stat-icon stat-icon-indigo">
                    <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                </div>
                <div class="stat-card-value">${Utils.formatNumber(data.totalPlays)}</div>
                <div class="stat-card-footer">Sessions enregistrées</div>
              </div>

              <div class="stat-card">
                <div class="stat-card-header">
                  <span class="stat-card-label">Heures visionnées</span>
                  <div class="stat-icon stat-icon-cyan">
                    <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                </div>
                <div class="stat-card-value">${Math.round(data.totalHours || 0)} h</div>
                <div class="stat-card-footer">Temps cumulé</div>
              </div>
            </div>

            <div>
              <div class="card-title" style="font-size: 1.05rem; margin-bottom: 0.75rem;">🏆 Top Médias du mois</div>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${(data.topMedia || []).map((m, idx) => `
                  <div class="newsletter-top-item">
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                      <span class="user-card-avatar" style="width:24px;height:24px;font-size:0.7rem;border:none;background:${idx === 0 ? 'var(--primary)' : 'var(--surface-nested)'};color:${idx === 0 ? 'white' : 'var(--muted-foreground)'};">#${idx + 1}</span>
                      <span style="font-weight:600;">${Utils.escapeHtml(m.title)}</span>
                      <span class="badge badge-secondary" style="font-size:0.7rem;">${Utils.escapeHtml(m.type)}</span>
                    </div>
                    <span style="color: var(--primary); font-weight: 700; font-size: 0.85rem;">${m.hours.toFixed(1)} h • ${m.plays} lectures</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div>
              <div class="card-title" style="font-size: 1.05rem; margin-bottom: 0.75rem;">👑 Top Utilisateurs les plus actifs</div>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${(data.topUsers || []).map((u, idx) => `
                  <div class="newsletter-top-item">
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                      <span class="user-card-avatar" style="width:24px;height:24px;font-size:0.7rem;border:none;background:${idx === 0 ? '#a855f7' : 'var(--surface-nested)'};color:${idx === 0 ? 'white' : 'var(--muted-foreground)'};">#${idx + 1}</span>
                      <span style="font-weight:600;">${Utils.escapeHtml(u.username)}</span>
                    </div>
                    <span style="color: var(--accent); font-weight: 700; font-size: 0.85rem;">${u.hours.toFixed(1)} h</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;

        document.getElementById('btn-post-discord').addEventListener('click', async () => {
          Modal.showAction({
            title: 'Publier sur Discord',
            bodyHtml: '<p>Voulez-vous envoyer ce récapitulatif sur le canal Discord configuré ?</p>',
            confirmText: 'Publier',
            onConfirm: async () => {
              try {
                await API.postJSON('/api/newsletter/discord-post', {});
                Toast.success('Message envoyé sur Discord avec succès !');
              } catch (e) {
                Toast.error(e.message);
              }
            },
          });
        });
      } catch (e) {
        Toast.error(e.message);
      }
    },

    // 7. Users List
    async users() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">
              ${I18n.t('nav.users') || 'Utilisateurs'}
            </h1>
            <p class="page-subtitle">Comptes Jellyfin et profils d'écoute.</p>
          </div>
        </div>

        <div class="users-grid" id="users-grid">
          <div class="user-card skeleton" style="height: 160px;"></div>
          <div class="user-card skeleton" style="height: 160px;"></div>
          <div class="user-card skeleton" style="height: 160px;"></div>
          <div class="user-card skeleton" style="height: 160px;"></div>
        </div>
      `;

      try {
        const data = await API.getJSON('/api/users?limit=100');
        const grid = document.getElementById('users-grid');
        if (!data.items || data.items.length === 0) {
          grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
              <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span class="empty-state-title">Aucun utilisateur trouvé</span>
              <span>Synchronisez votre serveur Jellyfin pour importer les utilisateurs.</span>
            </div>`;
          return;
        }

        grid.innerHTML = data.items.map((u) => `
          <div class="user-card">
            <div class="user-card-header">
              <div class="user-card-avatar">${Utils.escapeHtml(u.username.slice(0, 2).toUpperCase())}</div>
              <div style="min-width:0;">
                <div class="user-card-name">
                  <a href="/users/${u.id}" data-link style="color:inherit;">${Utils.escapeHtml(u.username)}</a>
                </div>
                <div class="user-card-server">${Utils.escapeHtml(u.server || 'Jellyfin')}</div>
              </div>
            </div>

            <div class="user-card-last-active">
              Dernière activité : <b>${u.lastActive ? Utils.timeAgo(u.lastActive) : 'Inconnue'}</b>
            </div>

            <div class="user-card-actions">
              <a href="/users/${u.id}" data-link class="btn btn-secondary btn-sm" style="flex: 1; text-align: center;">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Profil
              </a>
              <a href="/wrapped/${u.id}" data-link class="btn btn-outline btn-sm" title="JellyTrack Wrapped">
                🎉 Wrapped
              </a>
            </div>
          </div>
        `).join('');
      } catch (e) {
        Toast.error(e.message);
      }
    },

    // 8. User Detail
    async userDetail(userId) {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div class="skeleton" style="height: 80px; margin-bottom: 1.25rem;"></div>
        <div class="stat-grid" style="margin-bottom: 1.5rem;">
          <div class="stat-card skeleton" style="height: 120px;"></div>
          <div class="stat-card skeleton" style="height: 120px;"></div>
        </div>
      `;

      try {
        const u = await API.getJSON(`/api/users/${encodeURIComponent(userId)}`);
        main.innerHTML = `
          <div class="page-header">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div class="user-card-avatar" style="width: 56px; height: 56px; font-size: 1.3rem;">
                ${Utils.escapeHtml(u.username.slice(0, 2).toUpperCase())}
              </div>
              <div>
                <h1 class="page-title">${Utils.escapeHtml(u.username)}</h1>
                <p class="page-subtitle">${Utils.escapeHtml(u.server || 'Jellyfin')} • Dernière activité : <b>${u.lastActive ? Utils.formatDateTime(u.lastActive) : 'Jamais'}</b></p>
              </div>
            </div>

            <div class="page-actions">
              <a href="/wrapped/${u.id}" data-link class="btn btn-primary" style="display: flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, #6366f1, #a855f7); border: none;">
                🎉 Voir le Wrapped ${new Date().getFullYear()}
              </a>
            </div>
          </div>

          <!-- Active stream indicator if watching right now -->
          <div id="user-active-stream-banner" class="stream-banner" style="display:none; margin-top: 1rem;">
            <span class="pulse-dot"></span>
            <span id="user-active-stream-text">Lecture en cours...</span>
          </div>

          <div class="stat-grid" style="margin-top: 1.5rem;">
            <div class="stat-card">
              <div class="stat-card-header">
                <span class="stat-card-label">Lectures totales</span>
                <div class="stat-icon stat-icon-indigo">
                  <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
              </div>
              <div class="stat-card-value">${Utils.formatNumber(u.totalPlays)}</div>
              <div class="stat-card-footer">Sessions enregistrées</div>
            </div>

            <div class="stat-card">
              <div class="stat-card-header">
                <span class="stat-card-label">Temps visionné</span>
                <div class="stat-icon stat-icon-cyan">
                  <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
              </div>
              <div class="stat-card-value">${Utils.formatMs(u.totalDurationMs)}</div>
              <div class="stat-card-footer">Durée cumulée</div>
            </div>
          </div>

          <!-- Recent sessions -->
          <div class="card" style="margin-top: 1.5rem; padding: 0;">
            <div class="card-header" style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-subtle);">
              <div class="card-title-group">
                <div class="card-title">Dernières lectures de ${Utils.escapeHtml(u.username)}</div>
                <div class="card-subtitle">Historique récent des flux et médias démarrés</div>
              </div>
            </div>
            <div class="table-wrapper" style="border: none;">
              <table class="table">
                <thead>
                  <tr>
                    <th>Média</th>
                    <th>Type</th>
                    <th>Durée</th>
                    <th>Méthode</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${(u.recentActivity || []).length === 0 ? `
                    <tr><td colspan="5" class="empty-state" style="padding: 2rem;">Aucune activité récente pour cet utilisateur.</td></tr>
                  ` : (u.recentActivity || []).map((a) => `
                    <tr>
                      <td>
                        <div style="font-weight: 600;">${Utils.escapeHtml(a.title)}</div>
                      </td>
                      <td><span class="badge badge-secondary">${Utils.escapeHtml(a.type || '—')}</span></td>
                      <td style="white-space: nowrap;">${Utils.formatMs(a.durationMs)}</td>
                      <td><span class="badge ${a.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}">${Utils.escapeHtml(a.playMethod || 'Stream')}</span></td>
                      <td style="white-space: nowrap; font-size: 0.85rem; color: var(--muted-foreground);">${Utils.formatDateTime(a.startedAt)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;

        // Check active stream
        try {
          const s = await API.getJSON(`/api/users/${encodeURIComponent(userId)}/active-stream`);
          if (s.stream) {
            const banner = document.getElementById('user-active-stream-banner');
            const text = document.getElementById('user-active-stream-text');
            if (banner && text) {
              text.textContent = `En train de regarder : ${s.stream.mediaTitle || 'Média'} (${s.stream.playMethod || 'Stream'})`;
              banner.style.display = 'flex';
            }
          }
        } catch (e) {}
      } catch (e) {
        main.innerHTML = `<div class="empty-state"><h1>Utilisateur introuvable</h1><p>${Utils.escapeHtml(e.message)}</p></div>`;
      }
    },

    // 9. Wrapped (Annual User Retrospective)
    async wrapped(userId) {
      const main = document.getElementById('app-main');
      const year = new Date().getFullYear();
      main.innerHTML = `<div class="skeleton" style="height: 400px; max-width: 680px; margin: 2rem auto;"></div>`;

      try {
        const data = await API.getJSON(`/api/wrapped/${encodeURIComponent(userId)}?year=${year}`);
        let currentSlide = 0;

        const slides = [
          // Slide 0: Intro
          `
            <div class="wrapped-tag">JellyTrack Wrapped ${year}</div>
            <h1 class="wrapped-hero-title">Une Année Extraordinaire</h1>
            <p style="color: var(--muted-foreground); font-size: 1.05rem; margin-top: 0.5rem;">
              Prêt à revivre vos moments forts sur votre serveur Jellyfin ?
            </p>
            <div class="wrapped-stat-big">${Math.round(data.totalHours || 0)}</div>
            <div style="font-size: 1.15rem; font-weight: 700; color: var(--foreground); margin-bottom: 1.5rem;">
              Heures totales passées à regarder et écouter
            </div>
            <p style="color: var(--muted-foreground); font-size: 0.88rem;">
              Soit environ ${(data.totalHours / 24).toFixed(1)} jours non-stop de pur divertissement !
            </p>
          `,

          // Slide 1: Top Movies
          `
            <div class="wrapped-tag">Cinéma & Films</div>
            <h2 class="wrapped-hero-title">Vos Films Incontournables</h2>
            <div style="display: flex; flex-direction: column; gap: 0.6rem; text-align: left; margin: 1.5rem 0;">
              ${(data.topMovies || []).slice(0, 4).map((m, i) => `
                <div style="padding: 0.75rem 1rem; background: var(--surface-soft); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
                  <span><b>#${i + 1}</b> ${Utils.escapeHtml(m.title)}</span>
                  <span style="color: var(--primary); font-weight: 700;">${m.hours.toFixed(1)} h</span>
                </div>
              `).join('')}
            </div>
          `,

          // Slide 2: Top Series
          `
            <div class="wrapped-tag">Séries TV</div>
            <h2 class="wrapped-hero-title">Vos Meilleurs Marathons</h2>
            <div style="display: flex; flex-direction: column; gap: 0.6rem; text-align: left; margin: 1.5rem 0;">
              ${(data.topSeries || []).slice(0, 4).map((s, i) => `
                <div style="padding: 0.75rem 1rem; background: var(--surface-soft); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
                  <span><b>#${i + 1}</b> ${Utils.escapeHtml(s.title)}</span>
                  <span style="color: var(--accent-purple, #A855F7); font-weight: 700;">${s.hours.toFixed(1)} h</span>
                </div>
              `).join('')}
            </div>
          `,

          // Slide 3: Habits & Peak Times
          `
            <div class="wrapped-tag">Habitudes de lecture</div>
            <h2 class="wrapped-hero-title">Votre Rythme Idéal</h2>
            <div class="metric-grid" style="grid-template-columns: repeat(2, 1fr); margin: 1.5rem 0; text-align: center;">
              <div class="metric-card">
                <div class="metric-label">Jour favori</div>
                <div class="metric-value" style="font-size: 1.8rem;">${['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][data.peakDay || 0]}</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">Heure de pointe</div>
                <div class="metric-value" style="font-size: 1.8rem;">${data.peakHour || 21}h:00</div>
              </div>
            </div>
            <p style="color: var(--muted-foreground); font-size: 0.88rem;">Vous adorez profiter de votre médiathèque en soirée !</p>
          `,

          // Slide 4: Summary Card
          `
            <div class="wrapped-tag">Bilan ${year}</div>
            <h2 class="wrapped-hero-title">${Utils.escapeHtml(data.username)}</h2>
            <div style="margin: 1.5rem 0; font-size: 1.1rem; line-height: 1.8;">
              🍿 <b>${Utils.formatNumber(data.totalPlays)}</b> lectures lancées<br>
              ⏱️ <b>${Math.round(data.totalHours || 0)}</b> heures de divertissement<br>
              🌟 Film n°1 : <b>${data.topMovies && data.topMovies[0] ? Utils.escapeHtml(data.topMovies[0].title) : 'Aucun'}</b><br>
              📺 Série n°1 : <b>${data.topSeries && data.topSeries[0] ? Utils.escapeHtml(data.topSeries[0].title) : 'Aucune'}</b>
            </div>
            <button class="btn btn-primary" id="btn-share-wrapped">📋 Copier le résumé</button>
          `,
        ];

        const renderSlide = (idx) => {
          main.innerHTML = `
            <div class="wrapped-container">
              <div class="wrapped-card" id="wrapped-deck-card">
                ${slides[idx]}
              </div>

              <div class="wrapped-nav-bar">
                <button class="btn btn-secondary btn-sm" id="btn-wrap-prev" ${idx === 0 ? 'disabled' : ''}>← Précédent</button>
                <span style="font-size: 0.82rem; color: var(--muted-foreground); font-weight: 600;">${idx + 1} / ${slides.length}</span>
                <button class="btn btn-primary btn-sm" id="btn-wrap-next" ${idx === slides.length - 1 ? 'disabled' : ''}>Suivant →</button>
              </div>
            </div>
          `;

          document.getElementById('btn-wrap-prev')?.addEventListener('click', () => {
            if (currentSlide > 0) {
              currentSlide--;
              renderSlide(currentSlide);
            }
          });

          document.getElementById('btn-wrap-next')?.addEventListener('click', () => {
            if (currentSlide < slides.length - 1) {
              currentSlide++;
              renderSlide(currentSlide);
            }
          });

          document.getElementById('btn-share-wrapped')?.addEventListener('click', () => {
            const text = `🎉 Mon JellyTrack Wrapped ${year} :\n- ${Math.round(data.totalHours)} heures visionnées\n- ${data.totalPlays} lectures\nDécouvrez vos stats sur JellyTrack !`;
            navigator.clipboard.writeText(text);
            Toast.success('Résumé copié dans le presse-papiers !');
          });
        };

        renderSlide(currentSlide);
      } catch (e) {
        main.innerHTML = `<div class="empty-state"><h1>Wrapped indisponible</h1><p>${Utils.escapeHtml(e.message)}</p></div>`;
      }
    },

    mediaNav(active) {
      return `
        <nav class="media-tabs-nav">
          <a href="/media" data-link class="media-tab-link ${active === 'media' ? 'active' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/></svg>
            <span>${I18n.t('media.allMedia') || 'Tout le catalogue'}</span>
          </a>
          <a href="/media/popular" data-link class="media-tab-link ${active === 'popular' ? 'active' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
            <span>${I18n.t('media.popularTab') || 'Top Contenus'}</span>
          </a>
          <a href="/media/analysis" data-link class="media-tab-link ${active === 'analysis' ? 'active' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            <span>${I18n.t('media.deepAnalysisTitle') || 'Analyses Approfondies'}</span>
          </a>
          <a href="/media/collections" data-link class="media-tab-link ${active === 'collections' ? 'active' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>
            <span>${I18n.t('media.libraries') || 'Bibliothèques'}</span>
          </a>
        </nav>
      `;
    },

    // 10. Media Catalog & Overview
    async media(options = {}) {
      let { type = '', sort = 'title', artist = '', q = '' } = typeof options === 'string' ? { type: options } : (options || {});
      const activeNav = sort === 'popular' ? 'popular' : 'media';
      const main = document.getElementById('app-main');
      main.innerHTML = `
        ${Pages.mediaNav(activeNav)}
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/></svg>
              ${activeNav === 'popular' ? (I18n.t('media.popularTab') || 'Top Contenus') : (I18n.t('nav.media') || 'Catalogue Multimédia')}
            </h1>
            <p class="page-subtitle">Films, séries, albums et livres synchronisés depuis vos serveurs.</p>
          </div>

          <div class="page-actions">
            <div class="segmented-control" id="media-type-filter">
              <button class="segment-btn ${!type ? 'active' : ''}" data-type="">Tout</button>
              <button class="segment-btn ${type === 'Movie' ? 'active' : ''}" data-type="Movie">Films</button>
              <button class="segment-btn ${type === 'Series' ? 'active' : ''}" data-type="Series">Séries</button>
              <button class="segment-btn ${type === 'Audio' ? 'active' : ''}" data-type="Audio">Musique</button>
              <button class="segment-btn ${type === 'Book' ? 'active' : ''}" data-type="Book">Livres</button>
            </div>
          </div>
        </div>

        ${artist ? `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.25rem; background: var(--surface-soft); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-top: 1rem;">
            <span>🎵 Filtré par artiste : <b>${Utils.escapeHtml(artist)}</b></span>
            <button class="btn btn-secondary btn-sm" id="btn-clear-artist">✕ Effacer le filtre</button>
          </div>
        ` : ''}

        <div style="display: flex; gap: 0.75rem; margin-top: 1rem; flex-wrap: wrap;">
          <input type="text" class="form-input" id="media-search-input" value="${Utils.escapeHtml(q)}" placeholder="Filtrer par titre, réalisateur..." style="max-width: 380px;">
          <select class="form-select" id="media-sort-select" style="max-width: 200px;">
            <option value="title" ${sort === 'title' ? 'selected' : ''}>Titre (A-Z)</option>
            <option value="popular" ${sort === 'popular' ? 'selected' : ''}>Les plus vus</option>
            <option value="recent" ${sort === 'recent' ? 'selected' : ''}>Récemment lus</option>
            <option value="duration" ${sort === 'duration' ? 'selected' : ''}>Plus longs</option>
          </select>
        </div>

        <div class="poster-grid" id="media-grid" style="margin-top: 1.5rem;">
          <div class="poster-card skeleton" style="height: 280px;"></div>
          <div class="poster-card skeleton" style="height: 280px;"></div>
          <div class="poster-card skeleton" style="height: 280px;"></div>
          <div class="poster-card skeleton" style="height: 280px;"></div>
          <div class="poster-card skeleton" style="height: 280px;"></div>
          <div class="poster-card skeleton" style="height: 280px;"></div>
        </div>

        <div class="pager" id="media-pagination" style="margin-top: 2rem;">
          <button class="btn btn-secondary btn-sm" id="media-page-prev" disabled>← Précédent</button>
          <span class="pager-info" id="media-page-info">Page 1</span>
          <button class="btn btn-secondary btn-sm" id="media-page-next">Suivant →</button>
        </div>
      `;

      let currentOffset = 0;
      const limit = 24;

      const loadMedia = async () => {
        const grid = document.getElementById('media-grid');
        const searchInput = document.getElementById('media-search-input');
        const sortSelect = document.getElementById('media-sort-select');
        const searchVal = searchInput ? searchInput.value.trim() : q;
        const sortVal = sortSelect ? sortSelect.value : sort;
        let url = `/api/media?limit=${limit}&offset=${currentOffset}&type=${encodeURIComponent(type)}&q=${encodeURIComponent(searchVal)}&sort=${sortVal}`;
        if (artist) {
          url += `&artist=${encodeURIComponent(artist)}`;
        }

        try {
          const res = await API.getJSON(url);
          if (!res.items || res.items.length === 0) {
            grid.innerHTML = `
              <div class="empty-state" style="grid-column: 1/-1;">
                <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
                <span class="empty-state-title">Aucun média trouvé</span>
                <span>Essayez de modifier vos filtres ou vos critères de recherche.</span>
              </div>`;
            return;
          }

          grid.innerHTML = res.items.map((m) => {
            const typeClass = m.type ? `poster-type-${m.type}` : 'poster-type-default';
            return `
              <a href="/media/${m.id}" data-link class="poster-card-link">
                <div class="poster-image-wrap">
                  ${m.jellyfinMediaId
                    ? `<img src="/api/jellyfin/image?id=${m.jellyfinMediaId}&type=Primary&maxWidth=340" loading="lazy" alt="${Utils.escapeHtml(m.title)}">`
                    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--surface-nested);color:var(--muted-foreground);font-size:1.8rem;">🎬</div>`}
                  <div class="poster-badge-tr">
                    <span class="poster-type-badge ${typeClass}">${Utils.escapeHtml(m.type || 'Média')}</span>
                  </div>
                  <div class="poster-overlay">
                    <div class="poster-overlay-title">${Utils.escapeHtml(m.title)}</div>
                    <div class="poster-overlay-sub">${m.durationMs ? Utils.formatMs(m.durationMs) : (m.library || '')}</div>
                  </div>
                  <div class="poster-bottom-gradient"></div>
                </div>
                <div class="poster-title-below">${Utils.escapeHtml(m.title)}</div>
                <div class="poster-meta-below">
                  ${m.library ? Utils.escapeHtml(m.library) : ''}
                  ${m.durationMs ? ` • ${Utils.formatMs(m.durationMs)}` : ''}
                </div>
              </a>
            `;
          }).join('');

          // Pagination update
          const pageNum = Math.floor(currentOffset / limit) + 1;
          const totalPages = Math.ceil((res.total || 1) / limit) || 1;
          const pageInfo = document.getElementById('media-page-info');
          if (pageInfo) pageInfo.textContent = `Page ${pageNum} sur ${totalPages} (${res.total || 0} titres)`;
          const prevBtn = document.getElementById('media-page-prev');
          const nextBtn = document.getElementById('media-page-next');
          if (prevBtn) prevBtn.disabled = currentOffset === 0;
          if (nextBtn) nextBtn.disabled = currentOffset + limit >= (res.total || 0);
        } catch (e) {
          Toast.error(e.message);
        }
      };

      document.querySelectorAll('#media-type-filter .segment-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          type = btn.getAttribute('data-type');
          document.querySelectorAll('#media-type-filter .segment-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          currentOffset = 0;
          loadMedia();
        });
      });

      document.getElementById('btn-clear-artist')?.addEventListener('click', () => {
        Router.navigate('/media');
      });

      document.getElementById('media-search-input')?.addEventListener('input', Utils.debounce(() => {
        currentOffset = 0;
        loadMedia();
      }, 300));

      document.getElementById('media-sort-select')?.addEventListener('change', () => {
        currentOffset = 0;
        loadMedia();
      });

      document.getElementById('media-page-prev')?.addEventListener('click', () => {
        if (currentOffset >= limit) {
          currentOffset -= limit;
          loadMedia();
        }
      });

      document.getElementById('media-page-next')?.addEventListener('click', () => {
        currentOffset += limit;
        loadMedia();
      });

      await loadMedia();
    },

    // 11. Media Detail Page
    async mediaDetail(mediaId) {
      const main = document.getElementById('app-main');
      main.innerHTML = `<div class="skeleton" style="height: 380px; border-radius: var(--radius-xl);"></div>`;

      try {
        const m = await API.getJSON(`/api/media/${encodeURIComponent(mediaId)}`);
        main.innerHTML = `
          <div class="card" style="display: flex; gap: 2.25rem; flex-wrap: wrap; padding: 2rem;">
            <div style="width: 240px; aspect-ratio: 2/3; border-radius: var(--radius-lg); overflow: hidden; background: var(--surface-nested); flex-shrink: 0; border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.35);">
              ${m.jellyfinMediaId
                ? `<img src="/api/jellyfin/image?id=${m.jellyfinMediaId}&type=Primary&maxWidth=480" style="width:100%; height:100%; object-fit:cover;">`
                : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:2.5rem; background:var(--surface-nested);">🎬</div>`}
            </div>

            <div style="flex: 1; min-width: 320px; display: flex; flex-direction: column; gap: 0.85rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span class="badge badge-primary">${Utils.escapeHtml(m.type || 'Média')}</span>
                ${m.resolution ? `<span class="badge badge-secondary">${Utils.escapeHtml(m.resolution)}</span>` : ''}
                ${m.library ? `<span class="chip">📁 ${Utils.escapeHtml(m.library)}</span>` : ''}
              </div>

              <h1 style="font-size: 2rem; font-weight: 800; letter-spacing: -0.03em; margin: 0; line-height: 1.2;">
                ${Utils.escapeHtml(m.title)}
              </h1>

              <div style="display: flex; gap: 1.5rem; font-size: 0.88rem; color: var(--muted-foreground); flex-wrap: wrap; padding: 0.5rem 0;">
                <span>⏱️ <b>${Utils.formatMs(m.durationMs)}</b></span>
                <span>▶️ <b>${m.totalPlays || 0}</b> lectures</span>
                <span>⌛ <b>${Utils.formatMs(m.totalDurationMs)}</b> visionnés au total</span>
              </div>

              ${m.genres && m.genres.length > 0 ? `
                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem;">
                  ${m.genres.map((g) => `<span class="chip" style="font-size:0.75rem;">${Utils.escapeHtml(g)}</span>`).join('')}
                </div>
              ` : ''}

              ${m.directors && m.directors.length > 0 ? `
                <div style="font-size: 0.85rem; color: var(--muted-foreground); margin-top: 0.5rem; line-height: 1.5;">
                  <b style="color:var(--foreground);">Réalisation :</b> ${m.directors.map(Utils.escapeHtml).join(', ')}
                </div>
              ` : ''}

              ${m.actors && m.actors.length > 0 ? `
                <div style="font-size: 0.85rem; color: var(--muted-foreground); line-height: 1.5;">
                  <b style="color:var(--foreground);">Distribution :</b> ${m.actors.slice(0, 8).map(Utils.escapeHtml).join(', ')}
                </div>
              ` : ''}

              ${State.user && State.user.isAdmin ? `
                <div style="margin-top: auto; padding-top: 1.25rem;">
                  <button class="btn btn-secondary btn-sm" id="btn-rotate-poster" style="display:flex;align-items:center;gap:0.4rem;">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    Faire pivoter la jaquette
                  </button>
                </div>
              ` : ''}
            </div>

            ${m.recentActivity && m.recentActivity.length > 0 ? `
              <div style="margin-top: 1.75rem; width: 100%;">
                <div class="card-title-group" style="margin-bottom: 0.85rem;">
                  <div class="card-title">Dernières lectures de ce titre</div>
                  <div class="card-subtitle">Historique des utilisateurs ayant regardé ce média</div>
                </div>
                <div class="table-wrapper">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Utilisateur</th>
                        <th>Durée</th>
                        <th>Méthode</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${m.recentActivity.map((r) => `
                        <tr>
                          <td><a href="/users/${r.userId || r.username}" data-link style="font-weight:600;">${Utils.escapeHtml(r.username || 'Inconnu')}</a></td>
                          <td style="white-space: nowrap;">${Utils.formatMs(r.durationMs)}</td>
                          <td><span class="badge ${r.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}">${Utils.escapeHtml(r.playMethod || 'Stream')}</span></td>
                          <td style="white-space: nowrap; font-size: 0.85rem; color: var(--muted-foreground);">
                            ${Utils.formatDateTime(r.startedAt)} <span style="font-size:0.75rem;">(${Utils.timeAgo(r.startedAt)})</span>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : ''}
          </div>
        `;

        document.getElementById('btn-rotate-poster')?.addEventListener('click', async () => {
          try {
            await API.postJSON(`/api/media/${encodeURIComponent(mediaId)}/poster-rotator/rotate`, {});
            Toast.success('Jaquette mise à jour !');
            Router.renderCurrent();
          } catch (e) {
            Toast.error(e.message);
          }
        });
      } catch (e) {
        main.innerHTML = `<div class="empty-state"><h1>Média introuvable</h1><p>${Utils.escapeHtml(e.message)}</p></div>`;
      }
    },

    // 12. Collections
    async collections() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        ${Pages.mediaNav('collections')}
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>
              ${I18n.t('nav.collections') || 'Collections & Bibliothèques'}
            </h1>
            <p class="page-subtitle">Volumes et proportions par bibliothèque Jellyfin.</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.25rem;" id="collections-grid">
          <div class="card skeleton" style="height: 180px;"></div>
          <div class="card skeleton" style="height: 180px;"></div>
          <div class="card skeleton" style="height: 180px;"></div>
        </div>
      `;

      try {
        const data = await API.getJSON('/api/media/collections');
        const grid = document.getElementById('collections-grid');
        if (!data.collections || data.collections.length === 0) {
          grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
              <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10"/></svg>
              <span class="empty-state-title">Aucune collection trouvée</span>
              <span>Vérifiez la synchronisation de vos serveurs multimédias.</span>
            </div>`;
          return;
        }

        grid.innerHTML = data.collections.map((c) => `
          <div class="card" style="display: flex; flex-direction: column; gap: 0.9rem;">
            <div class="card-header" style="padding-bottom: 0;">
              <div class="card-title" style="display:flex;align-items:center;gap:0.5rem;font-size:1.15rem;">
                <span style="font-size:1.3rem;">📁</span>
                ${Utils.escapeHtml(c.name)}
              </div>
              <span class="badge badge-primary">${Utils.formatNumber(c.totalItems)} titres</span>
            </div>
            <div style="font-size: 0.88rem; color: var(--muted-foreground); display:flex; align-items:center; gap:0.4rem;">
              <span>⏱️</span>
              <span>Durée totale : <b style="color:var(--foreground);">${Math.round(c.totalHours || 0)} heures</b></span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: auto; padding-top: 0.6rem; border-top: 1px solid var(--border-subtle);">
              ${(c.types || []).map((t) => `
                <span class="chip" style="font-size:0.74rem;">${Utils.escapeHtml(t.type)}: <b>${t.count}</b></span>
              `).join('')}
            </div>
          </div>
        `).join('');
      } catch (e) {
        Toast.error(e.message);
      }
    },

    // 13. Deep Analysis
    async analysis() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        ${Pages.mediaNav('analysis')}
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              ${I18n.t('nav.analysis') || 'Analyses Approfondies'}
            </h1>
            <p class="page-subtitle">Réalisateurs, acteurs, studios et tendances de consommation.</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
          <div class="card">
            <div class="card-header">
              <div class="card-title-group">
                <div class="card-title">🎬 Top Réalisateurs</div>
                <div class="card-subtitle">Cinéastes les plus présents dans vos lectures</div>
              </div>
            </div>
            <div id="analysis-directors" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div class="skeleton" style="height: 120px;"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title-group">
                <div class="card-title">⭐ Top Acteurs & Actrices</div>
                <div class="card-subtitle">Interprètes les plus regardés</div>
              </div>
            </div>
            <div id="analysis-actors" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div class="skeleton" style="height: 120px;"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title-group">
                <div class="card-title">🏢 Top Studios</div>
                <div class="card-subtitle">Maisons de production favorites</div>
              </div>
            </div>
            <div id="analysis-studios" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div class="skeleton" style="height: 120px;"></div>
            </div>
          </div>
        </div>
      `;

      try {
        const stats = await API.getJSON('/api/stats/deep');
        const renderList = (containerId, items) => {
          const el = document.getElementById(containerId);
          if (!el) return;
          if (!items || items.length === 0) {
            el.innerHTML = '<p class="empty-state" style="padding:1.5rem;">Données insuffisantes.</p>';
            return;
          }
          el.innerHTML = items.map((it, idx) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.85rem; background: var(--surface-soft); border-radius: var(--radius-md); font-size: 0.86rem; border: 1px solid var(--border-subtle); transition: border-color 0.15s;">
              <div style="display:flex; align-items:center; gap:0.6rem;">
                <span class="user-card-avatar" style="width:26px; height:26px; font-size:0.75rem; background:${idx === 0 ? 'var(--primary)' : 'var(--surface-nested)'}; color:${idx === 0 ? 'white' : 'var(--muted-foreground)'}; border:none;">#${idx + 1}</span>
                <span style="font-weight:600;">${Utils.escapeHtml(it.name)}</span>
              </div>
              <span class="badge badge-primary">${it.count} titres</span>
            </div>
          `).join('');
        };

        renderList('analysis-directors', stats.topDirectors);
        renderList('analysis-actors', stats.topActors);
        renderList('analysis-studios', stats.topStudios);
      } catch (e) {
        Toast.error(e.message);
      }
    },

    // 14. Logs
    async logs() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              ${I18n.t('nav.logs') || 'Journaux Système'}
            </h1>
            <p class="page-subtitle">Événements internes, erreurs, diagnostics et synchronisations JellyTrack.</p>
          </div>

          <div class="page-actions">
            <a href="/api/logs/system/download" class="btn btn-secondary btn-sm" download style="display:flex;align-items:center;gap:0.4rem;">
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Télécharger
            </a>
            <a href="/api/logs/export" class="btn btn-secondary btn-sm" style="display:flex;align-items:center;gap:0.4rem;">
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><line x1="18" y1="8" x2="23" y2="8"/></svg>
              Export CSV
            </a>
            ${State.user && State.user.isAdmin ? `
              <button class="btn btn-danger btn-sm" id="btn-clear-logs" style="display:flex;align-items:center;gap:0.4rem;">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Purger
              </button>
            ` : ''}
          </div>
        </div>

        <div class="card" style="padding: 0; margin-top: 1.25rem;">
          <div class="table-wrapper" style="border: none;">
            <table class="table">
              <thead>
                <tr>
                  <th style="width: 100px;">Niveau</th>
                  <th>Message</th>
                  <th style="width: 180px;">Horodatage</th>
                </tr>
              </thead>
              <tbody id="logs-table-body">
                <tr><td colspan="3" class="skeleton" style="height: 80px;"></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `;

      try {
        const data = await API.getJSON('/api/logs/system');
        const tbody = document.getElementById('logs-table-body');
        if (!data.logs || data.logs.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="3">
                <div class="empty-state">
                  <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
                  <span class="empty-state-title">Aucun log enregistré</span>
                  <span>Les événements système récents apparaîtront ici.</span>
                </div>
              </td>
            </tr>`;
          return;
        }

        tbody.innerHTML = data.logs.map((l) => `
          <tr>
            <td>
              <span class="badge ${l.level === 'ERROR' ? 'badge-danger' : l.level === 'WARN' ? 'badge-warning' : 'badge-primary'}">
                ${Utils.escapeHtml(l.level || 'INFO')}
              </span>
            </td>
            <td style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.82rem; word-break: break-all;">
              ${Utils.escapeHtml(l.message || l.msg || '')}
            </td>
            <td style="white-space: nowrap; font-size: 0.8rem; color: var(--muted-foreground);">
              ${Utils.formatDateTime(l.time || l.timestamp)}
            </td>
          </tr>
        `).join('');

        document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
          Modal.showAction({
            title: 'Vider les journaux',
            bodyHtml: '<p>Êtes-vous certain de vouloir purger l’historique des journaux système ? Cette action est irréversible.</p>',
            confirmText: 'Purger les journaux',
            onConfirm: async () => {
              try {
                await API.delete('/api/logs/system');
                Toast.success('Journaux vidés avec succès.');
                Router.renderCurrent();
              } catch (e) {
                Toast.error(e.message);
              }
            },
          });
        });
      } catch (e) {
        Toast.error(e.message);
      }
    },

    // 15. Settings Layout & Pages
    async settings(subpage = 'overview') {
      const main = document.getElementById('app-main');
      const activeTab = subpage.startsWith('scheduler') ? 'scheduler' : (subpage.startsWith('plugin/security') ? 'plugin/security' : subpage);

      main.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              ${I18n.t('nav.settings') || 'Paramètres'}
            </h1>
            <p class="page-subtitle">Administration, serveurs, médias, sauvegardes et planificateur.</p>
          </div>
        </div>

        <div class="segmented-control" id="settings-tabs" style="flex-wrap: wrap; margin-top: 1rem; gap: 0.25rem;">
          <button class="segment-btn ${activeTab === 'overview' ? 'active' : ''}" data-sub="overview">Vue d’ensemble</button>
          <button class="segment-btn ${activeTab === 'jellyfin' ? 'active' : ''}" data-sub="jellyfin">Serveurs Jellyfin</button>
          <button class="segment-btn ${activeTab === 'media' ? 'active' : ''}" data-sub="media">Médias & Règles</button>
          <button class="segment-btn ${activeTab === 'network' ? 'active' : ''}" data-sub="network">Réseau</button>
          <button class="segment-btn ${activeTab === 'dataBackups' ? 'active' : ''}" data-sub="dataBackups">Sauvegardes</button>
          <button class="segment-btn ${activeTab === 'sso' ? 'active' : ''}" data-sub="sso">Authentification SSO</button>
          <button class="segment-btn ${activeTab === 'notifications' ? 'active' : ''}" data-sub="notifications">Notifications Discord</button>
          <button class="segment-btn ${activeTab === 'plugin' ? 'active' : ''}" data-sub="plugin">Plugin Jellyfin</button>
          <button class="segment-btn ${activeTab === 'plugin/security' ? 'active' : ''}" data-sub="plugin/security">Sécurité Plugin</button>
          <button class="segment-btn ${activeTab === 'scheduler' ? 'active' : ''}" data-sub="scheduler">Tâches & Cron</button>
        </div>

        <div id="settings-content" style="margin-top: 1.5rem;">
          <div class="skeleton" style="height: 250px;"></div>
        </div>
      `;

      document.querySelectorAll('#settings-tabs .segment-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sub = btn.getAttribute('data-sub');
          Router.navigate(`/settings/${sub}`);
        });
      });

      const container = document.getElementById('settings-content');

      // Subpage 1: Overview
      if (subpage === 'overview') {
        try {
          const [s, servers] = await Promise.all([
            API.getJSON('/api/settings'),
            API.getJSON('/api/settings/jellyfin-servers').catch(() => []),
          ]);
          container.innerHTML = `
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
                  <div class="stat-card-value">${Utils.escapeHtml(s.defaultLocale || 'fr').toUpperCase()}</div>
                  <div class="stat-card-footer">Interface utilisateur</div>
                </div>
                <div class="stat-card">
                  <div class="stat-card-header">
                    <span class="stat-card-label">Serveurs connectés</span>
                    <div class="stat-icon stat-icon-cyan">🖥️</div>
                  </div>
                  <div class="stat-card-value">${Array.isArray(servers) ? servers.length : 0}</div>
                  <div class="stat-card-footer"><a href="/settings/jellyfin" data-link>Gérer les instances →</a></div>
                </div>
                <div class="stat-card">
                  <div class="stat-card-header">
                    <span class="stat-card-label">Wrapped activé</span>
                    <div class="stat-icon stat-icon-purple">🎉</div>
                  </div>
                  <div class="stat-card-value" style="color: ${s.wrappedVisible !== false ? 'var(--accent)' : 'var(--muted-foreground)'};">
                    ${s.wrappedVisible !== false ? 'Oui' : 'Non'}
                  </div>
                  <div class="stat-card-footer">Rétrospective annuelle</div>
                </div>
                <div class="stat-card">
                  <div class="stat-card-header">
                    <span class="stat-card-label">Alertes Discord</span>
                    <div class="stat-icon stat-icon-amber">🔔</div>
                  </div>
                  <div class="stat-card-value" style="color: ${s.discordAlertsEnabled ? 'var(--accent)' : 'var(--muted-foreground)'};">
                    ${s.discordAlertsEnabled ? 'Actives' : 'Inactives'}
                  </div>
                  <div class="stat-card-footer"><a href="/settings/notifications" data-link>Webhooks Discord →</a></div>
                </div>
              </div>
            </div>
          `;
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Subpage 2: Jellyfin Servers
      else if (subpage === 'jellyfin') {
        try {
          const servers = await API.getJSON('/api/settings/jellyfin-servers');
          container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
              <h2 style="font-size: 1.15rem; font-weight: 700;">Serveurs Jellyfin Connectés</h2>
              <button class="btn btn-primary btn-sm" id="btn-add-server">+ Ajouter un serveur</button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${(servers || []).length === 0 ? '<div class="empty-state">Aucun serveur Jellyfin configuré pour le moment.</div>' : ''}
              ${(servers || []).map((srv) => `
                <div class="card" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; flex-wrap: wrap; gap: 0.75rem;">
                  <div>
                    <div style="font-weight: 700; font-size: 1.05rem;">${Utils.escapeHtml(srv.name)}</div>
                    <div style="font-size: 0.82rem; color: var(--muted-foreground);">${Utils.escapeHtml(srv.url)}</div>
                  </div>
                  <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <span class="badge ${srv.isActive ? 'badge-success' : 'badge-secondary'}">${srv.isActive ? 'Actif' : 'Inactif'}</span>
                    <button class="btn btn-secondary btn-sm btn-rotate-srv-key" data-id="${srv.id}" title="Régénérer la clé plugin">🔑 Clé</button>
                    <button class="btn btn-danger btn-sm btn-del-server" data-id="${srv.id}">Supprimer</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `;

          document.querySelectorAll('.btn-rotate-srv-key').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = btn.getAttribute('data-id');
              try {
                const res = await API.postJSON('/api/settings/jellyfin-servers/plugin-key', { serverId: id });
                Toast.success(`Nouvelle clé générée : ${res.apiKey || 'OK'}`);
              } catch (e) {
                Toast.error(e.message);
              }
            });
          });

          document.querySelectorAll('.btn-del-server').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = btn.getAttribute('data-id');
              Modal.showAction({
                title: 'Supprimer le serveur',
                bodyHtml: '<p>Êtes-vous certain de vouloir supprimer ce serveur ? Les statistiques historiques seront conservées.</p>',
                confirmText: 'Supprimer',
                onConfirm: async () => {
                  try {
                    await API.delete(`/api/settings/jellyfin-servers/${id}`);
                    Toast.success('Serveur supprimé.');
                    Pages.settings('jellyfin');
                  } catch (e) {
                    Toast.error(e.message);
                  }
                },
              });
            });
          });

          document.getElementById('btn-add-server').addEventListener('click', () => {
            Modal.showAction({
              title: 'Ajouter un serveur Jellyfin',
              bodyHtml: `
                <div class="form-group">
                  <label class="form-label">Nom du serveur</label>
                  <input type="text" class="form-input" id="m-srv-name" required value="Serveur Principal">
                </div>
                <div class="form-group">
                  <label class="form-label">URL Jellyfin</label>
                  <input type="url" class="form-input" id="m-srv-url" required placeholder="http://192.168.1.50:8096">
                </div>
                <div class="form-group">
                  <label class="form-label">Clé API Jellyfin</label>
                  <input type="text" class="form-input" id="m-srv-key" required placeholder="Générée dans Jellyfin > Tableau de bord">
                </div>
              `,
              confirmText: 'Ajouter',
              onConfirm: async () => {
                const name = document.getElementById('m-srv-name').value.trim();
                const url = document.getElementById('m-srv-url').value.trim();
                const apiKey = document.getElementById('m-srv-key').value.trim();
                try {
                  await API.postJSON('/api/settings/jellyfin-servers', { name, url, apiKey, isActive: true });
                  Toast.success('Serveur ajouté avec succès.');
                  Pages.settings('jellyfin');
                } catch (e) {
                  Toast.error(e.message);
                }
              },
            });
          });
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Subpage 3: Media Settings & Rules
      else if (subpage === 'media') {
        try {
          const [s, srvData] = await Promise.all([
            API.getJSON('/api/settings'),
            API.getJSON('/api/settings/jellyfin-servers').catch(() => []),
          ]);

          const resThresh = s.resolutionThresholds || {};
          const compRules = resThresh.completionRules || {};
          const defRules = compRules.default || { abandonedThreshold: 10, partialThreshold: 50, completedThreshold: 90 };
          const excludedLibs = Array.isArray(s.excludedLibraries) ? s.excludedLibraries : [];
          const availScopes = Array.isArray(s.availableLibraryScopes) ? s.availableLibraryScopes : [];

          container.innerHTML = `
            <form id="form-settings-media" style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 820px;">
              <!-- 1. Badges Switch -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">🏷️ Affichage des Badges Média</div>
                </div>
                <label class="form-switch">
                  <input type="checkbox" id="media-badges-enabled" ${resThresh.showLibraryMediaBadges !== false ? 'checked' : ''} style="display:none;">
                  <span class="switch-toggle"></span>
                  <span class="form-label" style="margin: 0;">Afficher les badges de résolution et de type sur les jaquettes</span>
                </label>
              </div>

              <!-- 2. Resolution Thresholds -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">📺 Seuils de Résolution (Largeur × Hauteur max)</div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
                  <div class="form-group">
                    <label class="form-label">480p SD (maxW / maxH)</label>
                    <div style="display:flex; gap:0.4rem;">
                      <input type="number" class="form-input" id="res-480-w" value="${resThresh['480p']?.maxW || 792}">
                      <input type="number" class="form-input" id="res-480-h" value="${resThresh['480p']?.maxH || 528}">
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">720p HD</label>
                    <div style="display:flex; gap:0.4rem;">
                      <input type="number" class="form-input" id="res-720-w" value="${resThresh['720p']?.maxW || 1408}">
                      <input type="number" class="form-input" id="res-720-h" value="${resThresh['720p']?.maxH || 792}">
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">1080p FHD</label>
                    <div style="display:flex; gap:0.4rem;">
                      <input type="number" class="form-input" id="res-1080-w" value="${resThresh['1080p']?.maxW || 2112}">
                      <input type="number" class="form-input" id="res-1080-h" value="${resThresh['1080p']?.maxH || 1188}">
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">4K UHD</label>
                    <div style="display:flex; gap:0.4rem;">
                      <input type="number" class="form-input" id="res-4k-w" value="${resThresh['4K']?.maxW || 4224}">
                      <input type="number" class="form-input" id="res-4k-h" value="${resThresh['4K']?.maxH || 2376}">
                    </div>
                  </div>
                </div>
              </div>

              <!-- 3. Completion Rules -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">⏱️ Règles de Complétion de Lecture (%)</div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                  <div class="form-group">
                    <label class="form-label">Abandonné si inférieur à (%)</label>
                    <input type="number" min="1" max="100" class="form-input" id="comp-abandoned" value="${defRules.abandonedThreshold || 10}">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Partiel si inférieur à (%)</label>
                    <input type="number" min="1" max="100" class="form-input" id="comp-partial" value="${defRules.partialThreshold || 50}">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Complété si supérieur à (%)</label>
                    <input type="number" min="1" max="100" class="form-input" id="comp-completed" value="${defRules.completedThreshold || 90}">
                  </div>
                </div>
              </div>

              <!-- 4. Excluded Libraries -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">🚫 Bibliothèques Exclues du Suivi</div>
                </div>
                <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
                  Les bibliothèques cochées ne seront pas incluses dans les métriques et graphiques du tableau de bord.
                </p>
                <div id="media-excluded-libs-list" style="display:flex; flex-direction:column; gap:0.6rem;">
                  ${availScopes.length === 0 ? '<p style="color:var(--muted-foreground); font-size:0.85rem;">Aucune bibliothèque découverte via les serveurs connectés.</p>' : ''}
                  ${availScopes.map((scope) => {
                    const isExcluded = excludedLibs.includes(scope.key || scope.libraryName);
                    return `
                      <label class="form-switch" style="padding:0.4rem 0;">
                        <input type="checkbox" class="cb-exclude-lib" data-key="${Utils.escapeHtml(scope.key || scope.libraryName)}" ${isExcluded ? 'checked' : ''} style="display:none;">
                        <span class="switch-toggle"></span>
                        <span style="font-size:0.88rem; font-weight:600;">${Utils.escapeHtml(scope.libraryName)} <span style="font-size:0.75rem; color:var(--muted-foreground); font-weight:normal;">(${Utils.escapeHtml(scope.serverName || scope.serverId)})</span></span>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>

              <button type="submit" class="btn btn-primary" style="align-self: flex-start;">Enregistrer les règles multimédias</button>
            </form>
          `;

          document.getElementById('form-settings-media').addEventListener('submit', async (e) => {
            e.preventDefault();
            const showLibraryMediaBadges = document.getElementById('media-badges-enabled').checked;
            const resolutionThresholds = {
              '480p': { maxW: parseInt(document.getElementById('res-480-w').value) || 792, maxH: parseInt(document.getElementById('res-480-h').value) || 528 },
              '720p': { maxW: parseInt(document.getElementById('res-720-w').value) || 1408, maxH: parseInt(document.getElementById('res-720-h').value) || 792 },
              '1080p': { maxW: parseInt(document.getElementById('res-1080-w').value) || 2112, maxH: parseInt(document.getElementById('res-1080-h').value) || 1188 },
              '4K': { maxW: parseInt(document.getElementById('res-4k-w').value) || 4224, maxH: parseInt(document.getElementById('res-4k-h').value) || 2376 },
              showLibraryMediaBadges,
              completionRules: {
                default: {
                  abandonedThreshold: parseInt(document.getElementById('comp-abandoned').value) || 10,
                  partialThreshold: parseInt(document.getElementById('comp-partial').value) || 50,
                  completedThreshold: parseInt(document.getElementById('comp-completed').value) || 90,
                },
              },
            };

            const excludedLibraries = [];
            document.querySelectorAll('.cb-exclude-lib:checked').forEach((cb) => {
              excludedLibraries.push(cb.getAttribute('data-key'));
            });

            try {
              await API.postJSON('/api/settings', { resolutionThresholds, excludedLibraries });
              Toast.success('Règles et seuils multimédias enregistrés.');
            } catch (err) {
              Toast.error(err.message);
            }
          });
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Subpage 4: Network Diagnostics
      else if (subpage === 'network') {
        try {
          const servers = await API.getJSON('/api/settings/jellyfin-servers').catch(() => []);
          container.innerHTML = `
            <div class="card" style="margin-bottom: 1.5rem;">
              <div class="card-header">
                <div class="card-title">🌐 Connectivité Réseau & Points d’Accès</div>
              </div>
              <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
                État des points de terminaison réseau utilisés par JellyTrack pour contacter les serveurs Jellyfin.
              </p>
              <div style="display:flex; flex-direction:column; gap:0.75rem;">
                ${(servers || []).length === 0 ? '<p class="empty-state">Aucun serveur configuré.</p>' : ''}
                ${(servers || []).map((s) => `
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; background:var(--surface-soft); border-radius:var(--radius-md); flex-wrap:wrap; gap:0.5rem;">
                    <div>
                      <div style="font-weight:700;">${Utils.escapeHtml(s.name)}</div>
                      <div style="font-size:0.82rem; color:var(--muted-foreground); font-family:monospace;">${Utils.escapeHtml(s.url)}</div>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                      <span class="badge ${s.isActive ? 'badge-success' : 'badge-secondary'}">${s.isActive ? 'Connecté' : 'Inactif'}</span>
                      <a href="/settings/jellyfin" data-link class="btn btn-secondary btn-sm">Gérer</a>
                    </div>
                  </div>
                `).join('')}
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
          `;
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Subpage 5: Backups
      else if (subpage === 'dataBackups') {
        try {
          const autoList = await API.getJSON('/api/backup/auto');
          container.innerHTML = `
            <div class="card" style="margin-bottom: 1.5rem;">
              <div class="card-header">
                <div class="card-title">💾 Actions de Sauvegarde & Restauration</div>
              </div>
              <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
                <button class="btn btn-primary" id="btn-trigger-backup">Créer une sauvegarde maintenant</button>
                <a href="/api/backup/export" class="btn btn-secondary" download="jellytrack-export.json">Exporter en JSON</a>
                <label class="btn btn-outline" style="cursor: pointer; margin: 0;">
                  📥 Importer JSON
                  <input type="file" id="input-import-backup" accept=".json" style="display: none;">
                </label>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <div class="card-title">Sauvegardes automatiques disponibles</div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${(autoList.backups || []).length === 0 ? '<p class="empty-state">Aucune sauvegarde automatique trouvée.</p>' : ''}
                ${(autoList.backups || []).map((b) => `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; background: var(--surface-soft); border-radius: var(--radius-md); flex-wrap: wrap; gap: 0.5rem;">
                    <div>
                      <b>${Utils.escapeHtml(b.filename || b.id)}</b>
                      <div style="font-size: 0.78rem; color: var(--muted-foreground);">${Utils.formatDate(b.createdAt)} • ${(b.sizeBytes / 1024).toFixed(1)} KB</div>
                    </div>
                    <div style="display: flex; gap: 0.4rem;">
                      <a href="/api/backup/auto/download?id=${encodeURIComponent(b.id)}" class="btn btn-secondary btn-sm" download>Télécharger</a>
                      <button class="btn btn-outline btn-sm btn-restore-backup" data-id="${b.id}">Restaurer</button>
                      <button class="btn btn-danger btn-sm btn-del-backup" data-id="${b.id}">Supprimer</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;

          document.getElementById('btn-trigger-backup')?.addEventListener('click', async () => {
            try {
              await API.postJSON('/api/backup/auto/trigger', {});
              Toast.success('Sauvegarde créée avec succès.');
              Pages.settings('dataBackups');
            } catch (e) {
              Toast.error(e.message);
            }
          });

          document.getElementById('input-import-backup')?.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
              const text = await file.text();
              const payload = JSON.parse(text);
              await API.postJSON('/api/backup/import', payload);
              Toast.success('Restauration depuis le fichier JSON réussie !');
              Pages.settings('dataBackups');
            } catch (err) {
              Toast.error(`Erreur d'import : ${err.message}`);
            }
          });

          document.querySelectorAll('.btn-restore-backup').forEach((btn) => {
            btn.addEventListener('click', () => {
              const id = btn.getAttribute('data-id');
              Modal.showAction({
                title: 'Restaurer la sauvegarde',
                bodyHtml: '<p><b>Attention :</b> Cette opération restaurera l’ensemble de vos configurations et sessions depuis cette archive.</p>',
                confirmText: 'Restaurer',
                onConfirm: async () => {
                  try {
                    await API.postJSON('/api/backup/auto/restore', { id });
                    Toast.success('Restauration terminée avec succès.');
                  } catch (e) {
                    Toast.error(e.message);
                  }
                },
              });
            });
          });

          document.querySelectorAll('.btn-del-backup').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = btn.getAttribute('data-id');
              try {
                await API.postJSON('/api/backup/auto/delete', { id });
                Toast.success('Sauvegarde supprimée.');
                Pages.settings('dataBackups');
              } catch (e) {
                Toast.error(e.message);
              }
            });
          });
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Subpage 6: SSO
      else if (subpage === 'sso') {
        try {
          const sso = await API.getJSON('/api/settings/sso');
          container.innerHTML = `
            <div class="card" style="max-width: 650px;">
              <div class="card-header">
                <div class="card-title">🔐 Fournisseur OpenID Connect (Authentik, Keycloak)</div>
              </div>
              <form id="form-sso" style="display: flex; flex-direction: column; gap: 1rem;">
                <label class="form-switch">
                  <input type="checkbox" id="sso-enabled" ${sso.enabled ? 'checked' : ''} style="display:none;">
                  <span class="switch-toggle"></span>
                  <span class="form-label" style="margin: 0;">Activer la connexion SSO</span>
                </label>

                <div class="form-group">
                  <label class="form-label">URL de l’émetteur (Issuer URL)</label>
                  <input type="url" class="form-input" id="sso-url" value="${Utils.escapeHtml(sso.url || '')}" placeholder="https://auth.example.com/application/o/jellytrack/">
                </div>

                <div class="form-group">
                  <label class="form-label">Client ID</label>
                  <input type="text" class="form-input" id="sso-client-id" value="${Utils.escapeHtml(sso.clientId || '')}">
                </div>

                <div class="form-group">
                  <label class="form-label">Client Secret</label>
                  <input type="password" class="form-input" id="sso-client-secret" placeholder="Laisser vide pour ne pas modifier">
                </div>

                <button type="submit" class="btn btn-primary" style="margin-top: 0.5rem;">Enregistrer la configuration SSO</button>
              </form>
            </div>
          `;

          document.getElementById('form-sso').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
              enabled: document.getElementById('sso-enabled').checked,
              url: document.getElementById('sso-url').value.trim(),
              clientId: document.getElementById('sso-client-id').value.trim(),
            };
            const sec = document.getElementById('sso-client-secret').value;
            if (sec) payload.clientSecret = sec;

            try {
              await API.request('/api/settings/sso', { method: 'PUT', body: payload });
              Toast.success('Configuration SSO enregistrée.');
            } catch (err) {
              Toast.error(err.message);
            }
          });
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Subpage 7: Notifications Discord
      else if (subpage === 'notifications') {
        try {
          const s = await API.getJSON('/api/settings');
          container.innerHTML = `
            <div class="card" style="max-width: 650px;">
              <div class="card-header">
                <div class="card-title">🔔 Webhook Discord</div>
              </div>
              <form id="form-notif" style="display: flex; flex-direction: column; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label">URL du Webhook Discord</label>
                  <input type="url" class="form-input" id="notif-webhook-url" value="${Utils.escapeHtml(s.discordWebhookUrl || '')}" placeholder="https://discord.com/api/webhooks/...">
                </div>

                <label class="form-switch">
                  <input type="checkbox" id="notif-enabled" ${s.discordAlertsEnabled ? 'checked' : ''} style="display:none;">
                  <span class="switch-toggle"></span>
                  <span class="form-label" style="margin: 0;">Activer les alertes automatiques</span>
                </label>

                <button type="submit" class="btn btn-primary">Enregistrer les notifications</button>
              </form>
            </div>
          `;

          document.getElementById('form-notif').addEventListener('submit', async (e) => {
            e.preventDefault();
            const discordWebhookUrl = document.getElementById('notif-webhook-url').value.trim();
            const discordAlertsEnabled = document.getElementById('notif-enabled').checked;

            try {
              await API.postJSON('/api/settings', { discordWebhookUrl, discordAlertsEnabled });
              Toast.success('Paramètres Discord enregistrés.');
            } catch (err) {
              Toast.error(err.message);
            }
          });
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Subpage 8: Plugin API Key
      else if (subpage === 'plugin') {
        try {
          const keyData = await API.getJSON('/api/plugin/api-key');
          container.innerHTML = `
            <div class="card" style="max-width: 650px;">
              <div class="card-header">
                <div class="card-title">🔌 Clé API du Plugin Jellyfin</div>
              </div>
              <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
                Copiez cette clé dans la configuration du plugin Jellyfin pour autoriser l’envoi des événements temps réel.
              </p>
              <div class="form-group">
                <input type="text" class="form-input" readonly value="${Utils.escapeHtml(keyData.apiKey || 'Aucune clé configurée')}" id="plugin-key-val">
              </div>
              <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                <button class="btn btn-secondary btn-sm" id="btn-copy-plugin-key">📋 Copier</button>
                <button class="btn btn-primary btn-sm" id="btn-rotate-plugin-key">🔄 Régénérer la clé</button>
                <a href="/settings/plugin/security" data-link class="btn btn-outline btn-sm">🛡️ Paramètres de sécurité du plugin</a>
              </div>
            </div>
          `;

          document.getElementById('btn-copy-plugin-key')?.addEventListener('click', () => {
            const v = document.getElementById('plugin-key-val').value;
            navigator.clipboard.writeText(v);
            Toast.success('Clé copiée !');
          });

          document.getElementById('btn-rotate-plugin-key')?.addEventListener('click', async () => {
            try {
              await API.postJSON('/api/plugin/api-key', {});
              Toast.success('Nouvelle clé générée.');
              Pages.settings('plugin');
            } catch (e) {
              Toast.error(e.message);
            }
          });
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Subpage 9: Plugin Security & Telemetry
      else if (subpage === 'plugin/security') {
        try {
          const [secOverview, smartSettings, settingsData] = await Promise.all([
            API.getJSON('/api/admin/security/overview').catch(() => ({ plugin: {} })),
            API.getJSON('/api/admin/security/smart-settings').catch(() => ({ thresholds: {} })),
            API.getJSON('/api/settings').catch(() => ({})),
          ]);

          const p = secOverview.plugin || {};
          const thresholds = smartSettings.thresholds || { ipAttemptThreshold: 50, ipWindowMinutes: 60, newCountryGraceMinutes: 120 };
          const telem = settingsData.pluginTelemetrySettings || {
            precisionProfile: 'very_precise',
            playingIntervalSeconds: 5,
            pausedIntervalSeconds: 30,
            staleSessionTimeoutSeconds: 90,
            mergeWindowSeconds: 300,
            seekThresholdSeconds: 20,
            trackPauseResume: true,
            trackSeek: true,
            trackAudioSubtitleChanges: true,
            trackSessionEnded: true,
          };

          container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.5rem; max-width:820px;">
              <!-- 1. Connection Status Card -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">🔌 État de Connexion du Plugin</div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                  <div>
                    <div style="font-size:1.1rem; font-weight:700;">Serveur : ${Utils.escapeHtml(p.serverName || 'Serveur Jellyfin')}</div>
                    <div style="font-size:0.82rem; color:var(--muted-foreground);">Version plugin : ${Utils.escapeHtml(p.version || 'v3.0.0')} • Dernier contact : ${p.lastSeen ? Utils.formatDateTime(p.lastSeen) : 'Inconnu'}</div>
                  </div>
                  <span class="badge ${p.connected ? 'badge-success' : 'badge-danger'}" style="font-size:0.88rem; padding:0.4rem 0.8rem;">
                    ${p.connected ? '● En ligne' : '○ Déconnecté'}
                  </span>
                </div>
              </div>

              <!-- 2. Smart Security Thresholds -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">🛡️ Seuils de Sécurité Intelligents</div>
                </div>
                <form id="form-smart-thresholds" style="display:flex; flex-direction:column; gap:1rem;">
                  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem;">
                    <div class="form-group">
                      <label class="form-label">Tentatives d’accès IP max</label>
                      <input type="number" min="1" class="form-input" id="sec-ip-threshold" value="${thresholds.ipAttemptThreshold || 50}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Fenêtre de surveillance (minutes)</label>
                      <input type="number" min="5" class="form-input" id="sec-ip-window" value="${thresholds.ipWindowMinutes || 60}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Grâce nouveau pays (minutes)</label>
                      <input type="number" min="1" class="form-input" id="sec-country-grace" value="${thresholds.newCountryGraceMinutes || 120}">
                    </div>
                  </div>
                  <button type="submit" class="btn btn-primary" style="align-self:flex-start;">Enregistrer les seuils de sécurité</button>
                </form>
              </div>

              <!-- 3. Plugin Telemetry Settings -->
              <div class="card">
                <div class="card-header">
                  <div class="card-title">⚡ Paramètres de Télémétrie & Précision</div>
                </div>
                <form id="form-telemetry-settings" style="display:flex; flex-direction:column; gap:1rem;">
                  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem;">
                    <div class="form-group">
                      <label class="form-label">Intervalle en lecture (secondes)</label>
                      <input type="number" min="1" class="form-input" id="telem-playing" value="${telem.playingIntervalSeconds || 5}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Intervalle en pause (secondes)</label>
                      <input type="number" min="5" class="form-input" id="telem-paused" value="${telem.pausedIntervalSeconds || 30}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Expiration session inactive (s)</label>
                      <input type="number" min="30" class="form-input" id="telem-stale" value="${telem.staleSessionTimeoutSeconds || 90}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Fenêtre de fusion d'historique (s)</label>
                      <input type="number" min="60" class="form-input" id="telem-merge" value="${telem.mergeWindowSeconds || 300}">
                    </div>
                  </div>

                  <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">
                    <label class="form-switch">
                      <input type="checkbox" id="telem-pause-resume" ${telem.trackPauseResume ? 'checked' : ''} style="display:none;">
                      <span class="switch-toggle"></span>
                      <span class="form-label" style="margin:0;">Enregistrer les événements de pause / reprise</span>
                    </label>
                    <label class="form-switch">
                      <input type="checkbox" id="telem-seek" ${telem.trackSeek ? 'checked' : ''} style="display:none;">
                      <span class="switch-toggle"></span>
                      <span class="form-label" style="margin:0;">Enregistrer les sauts temporels (seek)</span>
                    </label>
                    <label class="form-switch">
                      <input type="checkbox" id="telem-audio-sub" ${telem.trackAudioSubtitleChanges ? 'checked' : ''} style="display:none;">
                      <span class="switch-toggle"></span>
                      <span class="form-label" style="margin:0;">Suivre les changements de langue audio et sous-titres</span>
                    </label>
                  </div>

                  <button type="submit" class="btn btn-primary" style="align-self:flex-start; margin-top:0.5rem;">Enregistrer la configuration de télémétrie</button>
                </form>
              </div>
            </div>
          `;

          document.getElementById('form-smart-thresholds').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
              thresholds: {
                ipAttemptThreshold: parseInt(document.getElementById('sec-ip-threshold').value) || 50,
                ipWindowMinutes: parseInt(document.getElementById('sec-ip-window').value) || 60,
                newCountryGraceMinutes: parseInt(document.getElementById('sec-country-grace').value) || 120,
              },
            };
            try {
              await API.patchJSON('/api/admin/security/smart-settings', payload);
              Toast.success('Seuils de sécurité intelligents enregistrés.');
            } catch (err) {
              Toast.error(err.message);
            }
          });

          document.getElementById('form-telemetry-settings').addEventListener('submit', async (e) => {
            e.preventDefault();
            const pluginTelemetrySettings = {
              precisionProfile: 'custom',
              playingIntervalSeconds: parseInt(document.getElementById('telem-playing').value) || 5,
              pausedIntervalSeconds: parseInt(document.getElementById('telem-paused').value) || 30,
              staleSessionTimeoutSeconds: parseInt(document.getElementById('telem-stale').value) || 90,
              mergeWindowSeconds: parseInt(document.getElementById('telem-merge').value) || 300,
              seekThresholdSeconds: 20,
              trackPauseResume: document.getElementById('telem-pause-resume').checked,
              trackSeek: document.getElementById('telem-seek').checked,
              trackAudioSubtitleChanges: document.getElementById('telem-audio-sub').checked,
              trackSessionEnded: true,
            };
            try {
              await API.postJSON('/api/settings', { pluginTelemetrySettings });
              Toast.success('Paramètres de télémétrie enregistrés.');
            } catch (err) {
              Toast.error(err.message);
            }
          });
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Subpage 10: Scheduler (Schedules & Tasks)
      else if (subpage.startsWith('scheduler')) {
        const isSchedules = subpage === 'scheduler/schedules';

        try {
          const s = await API.getJSON('/api/settings').catch(() => ({}));
          const intervals = s.schedulerIntervals || {
            recentSyncEveryHours: 1,
            fullSyncEveryHours: 24,
            integrityCheckEveryHours: 6,
          };

          container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.25rem; max-width:840px;">
              <!-- Scheduler Sub-tabs -->
              <div class="segmented-control" style="align-self:flex-start;">
                <button class="segment-btn ${!isSchedules ? 'active' : ''}" id="sched-tab-tasks">⚡ Exécution Manuelle</button>
                <button class="segment-btn ${isSchedules ? 'active' : ''}" id="sched-tab-schedules">🕒 Intervalles Automatiques (Cron)</button>
              </div>

              ${isSchedules ? `
                <!-- Schedules Form -->
                <div class="card">
                  <div class="card-header">
                    <div class="card-title">🕒 Fréquence des Tâches Planifiées</div>
                  </div>
                  <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
                    Définissez la fréquence à laquelle les tâches de fond s’exécutent automatiquement sur le serveur Go.
                  </p>
                  <form id="form-scheduler-intervals" style="display:flex; flex-direction:column; gap:1rem;">
                    <div class="form-group">
                      <label class="form-label">Synchronisation récente des lectures (toutes les X heures)</label>
                      <input type="number" min="1" max="24" class="form-input" id="sched-recent" value="${intervals.recentSyncEveryHours || 1}" style="max-width:180px;">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Synchronisation complète de la médiathèque (toutes les X heures)</label>
                      <input type="number" min="6" max="168" class="form-input" id="sched-full" value="${intervals.fullSyncEveryHours || 24}" style="max-width:180px;">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Nettoyage d'intégrité et sessions orphelines (toutes les X heures)</label>
                      <input type="number" min="1" max="48" class="form-input" id="sched-integrity" value="${intervals.integrityCheckEveryHours || 6}" style="max-width:180px;">
                    </div>
                    <button type="submit" class="btn btn-primary" style="align-self:flex-start;">Enregistrer les intervalles</button>
                  </form>
                </div>
              ` : `
                <!-- Manual Tasks Cards -->
                <div class="card">
                  <div class="card-header">
                    <div class="card-title">⚡ Déclencheur Manuel de Tâches</div>
                  </div>
                  <div style="display:flex; flex-direction:column; gap:0.85rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; background:var(--surface-soft); border-radius:var(--radius-md); flex-wrap:wrap; gap:0.5rem;">
                      <div>
                        <b>Synchronisation des lectures récentes</b>
                        <div style="font-size:0.78rem; color:var(--muted-foreground);">Récupère les dernières sessions de visionnage (exécution rapide).</div>
                      </div>
                      <button class="btn btn-secondary btn-sm" id="btn-task-sync-recent">Exécuter</button>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; background:var(--surface-soft); border-radius:var(--radius-md); flex-wrap:wrap; gap:0.5rem;">
                      <div>
                        <b>Synchronisation complète de la médiathèque</b>
                        <div style="font-size:0.78rem; color:var(--muted-foreground);">Met à jour l'ensemble des films, séries, saisons, épisodes et métadonnées.</div>
                      </div>
                      <button class="btn btn-secondary btn-sm" id="btn-task-sync-full">Exécuter</button>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; background:var(--surface-soft); border-radius:var(--radius-md); flex-wrap:wrap; gap:0.5rem;">
                      <div>
                        <b>Vérification d’intégrité & fermeture des orphelins</b>
                        <div style="font-size:0.78rem; color:var(--muted-foreground);">Détecte et clôture les flux de lecture restés ouverts suite à une coupure réseau.</div>
                      </div>
                      <button class="btn btn-secondary btn-sm" id="btn-task-integrity">Exécuter</button>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; background:var(--surface-soft); border-radius:var(--radius-md); flex-wrap:wrap; gap:0.5rem;">
                      <div>
                        <b>Consolidation de l’historique</b>
                        <div style="font-size:0.78rem; color:var(--muted-foreground);">Fusionne les sessions fragmentées consécutives dans une fenêtre de 30 minutes.</div>
                      </div>
                      <button class="btn btn-secondary btn-sm" id="btn-task-consolidate">Exécuter</button>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; background:var(--surface-soft); border-radius:var(--radius-md); flex-wrap:wrap; gap:0.5rem;">
                      <div>
                        <b>Sauvegarde automatique immédiate</b>
                        <div style="font-size:0.78rem; color:var(--muted-foreground);">Génère une archive instantanée des configurations et sessions.</div>
                      </div>
                      <button class="btn btn-secondary btn-sm" id="btn-task-auto-backup">Exécuter</button>
                    </div>
                  </div>
                </div>
              `}
            </div>
          `;

          document.getElementById('sched-tab-tasks')?.addEventListener('click', () => {
            Router.navigate('/settings/scheduler/tasks');
          });

          document.getElementById('sched-tab-schedules')?.addEventListener('click', () => {
            Router.navigate('/settings/scheduler/schedules');
          });

          document.getElementById('form-scheduler-intervals')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const schedulerIntervals = {
              recentSyncEveryHours: parseInt(document.getElementById('sched-recent').value) || 1,
              fullSyncEveryHours: parseInt(document.getElementById('sched-full').value) || 24,
              integrityCheckEveryHours: parseInt(document.getElementById('sched-integrity').value) || 6,
            };
            try {
              await API.postJSON('/api/settings', { schedulerIntervals });
              Toast.success('Intervalles de planification enregistrés.');
            } catch (err) {
              Toast.error(err.message);
            }
          });

          const bindTaskBtn = (id, url, body) => {
            document.getElementById(id)?.addEventListener('click', async () => {
              try {
                await API.postJSON(url, body);
                Toast.success('Tâche déclenchée avec succès.');
              } catch (err) {
                Toast.error(err.message);
              }
            });
          };

          bindTaskBtn('btn-task-sync-recent', '/api/sync', { recentOnly: true });
          bindTaskBtn('btn-task-sync-full', '/api/sync', { recentOnly: false });
          bindTaskBtn('btn-task-integrity', '/api/admin/integrity-cleanup', {});
          bindTaskBtn('btn-task-consolidate', '/api/admin/consolidate-history', { mergeWindowMinutes: 30 });
          bindTaskBtn('btn-task-auto-backup', '/api/backup/auto/trigger', {});
        } catch (e) {
          Toast.error(e.message);
        }
      }
    },

    adminNav(active) {
      return `
        <nav class="admin-tabs-nav">
          <a href="/admin/health" data-link class="admin-tab-link ${active === 'health' ? 'active' : ''}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 11l6.92 3-3.96 4"/></svg>
            <span>${I18n.t('nav.health') || 'Santé Système'}</span>
          </a>
          <a href="/admin/cleanup" data-link class="admin-tab-link ${active === 'cleanup' ? 'active' : ''}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span>${I18n.t('nav.cleanup') || 'Nettoyage & Stockage'}</span>
          </a>
          <a href="/admin/log-health" data-link class="admin-tab-link ${active === 'log-health' ? 'active' : ''}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span>${I18n.t('nav.logHealth') || 'Santé Logs & Moteur'}</span>
          </a>
          <a href="/admin/plugin-health" data-link class="admin-tab-link ${active === 'plugin-health' ? 'active' : ''}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>
            <span>${I18n.t('nav.pluginHealth') || 'Santé Plugin'}</span>
          </a>
          <a href="/admin/server-compare" data-link class="admin-tab-link ${active === 'server-compare' ? 'active' : ''}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            <span>${I18n.t('nav.serverCompare') || 'Comparaison Serveurs'}</span>
          </a>
        </nav>
      `;
    },

    // 16. Admin Health & Diagnostics
    async health(sub = 'system') {
      const activeAdminTab = sub === 'plugin' ? 'plugin-health' : (sub === 'logs' ? 'log-health' : 'health');
      const main = document.getElementById('app-main');
      main.innerHTML = `
        ${Pages.adminNav(activeAdminTab)}
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              ${I18n.t('nav.health') || 'Santé Système & Diagnostics'}
            </h1>
            <p class="page-subtitle">Surveillance de la base de données, des processus, du plugin et des alertes de sécurité.</p>
          </div>
        </div>

        <div id="health-content" style="margin-top: 1.5rem;">
          <div class="skeleton" style="height: 250px;"></div>
        </div>
      `;

      const container = document.getElementById('health-content');

      // Tab 1: System & Database Health
      if (sub === 'system') {
        try {
          const [h, hw] = await Promise.all([
            API.getJSON('/api/admin/health'),
            API.getJSON('/api/hardware').catch(() => ({})),
          ]);

          container.innerHTML = `
            <div class="stat-grid" style="margin-bottom: 1.5rem;">
              <div class="stat-card">
                <div class="stat-card-header">
                  <span class="stat-card-label">Base de données</span>
                  <div class="stat-icon stat-icon-green">🗄️</div>
                </div>
                <div class="stat-card-value" style="font-size:1.6rem; color: ${h.database === 'healthy' ? 'var(--accent)' : 'var(--destructive)'};">
                  ${Utils.escapeHtml(h.database === 'healthy' ? 'Opérationnelle' : h.database || 'OK')}
                </div>
                <div class="stat-card-footer">Moteur : <b>${Utils.escapeHtml(h.driver || 'SQLite')}</b></div>
              </div>

              <div class="stat-card">
                <div class="stat-card-header">
                  <span class="stat-card-label">Sessions Orphelines</span>
                  <div class="stat-icon stat-icon-amber">🧹</div>
                </div>
                <div class="stat-card-value">${h.counts ? (h.counts.openPlaybackOrphans || 0) : 0}</div>
                <div class="stat-card-footer">Lectures sans fermeture propre</div>
              </div>

              <div class="stat-card">
                <div class="stat-card-header">
                  <span class="stat-card-label">Mémoire allouée</span>
                  <div class="stat-icon stat-icon-cyan">🧠</div>
                </div>
                <div class="stat-card-value">${hw.memory ? hw.memory.allocMb.toFixed(1) + ' MB' : '-'}</div>
                <div class="stat-card-footer">Cœurs CPU : <b>${hw.cpu ? hw.cpu.cores : '-'}</b></div>
              </div>

              <div class="stat-card">
                <div class="stat-card-header">
                  <span class="stat-card-label">Goroutines actives</span>
                  <div class="stat-icon stat-icon-indigo">⚙️</div>
                </div>
                <div class="stat-card-value">${hw.runtime ? (hw.runtime.goroutines || '-') : '-'}</div>
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
          `;

          document.getElementById('btn-fix-orphans')?.addEventListener('click', async () => {
            try {
              await API.postJSON('/api/admin/integrity-cleanup', {});
              Toast.success('Nettoyage des sessions orphelines terminé !');
              Pages.health('system');
            } catch (err) {
              Toast.error(err.message);
            }
          });
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Tab 2: Plugin Health
      else if (sub === 'plugin') {
        try {
          const [secOverview, pHealth] = await Promise.all([
            API.getJSON('/api/admin/security/overview').catch(() => ({ plugin: {} })),
            API.getJSON('/api/admin/plugin/health').catch(() => ({ status: 'ok' })),
          ]);

          const p = secOverview.plugin || {};
          container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.5rem; max-width:820px;">
              <div class="card">
                <div class="card-header">
                  <div class="card-title">🔌 Sondes & Connectivité du Plugin Jellyfin</div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
                  <div>
                    <div style="font-size:1.15rem; font-weight:700;">${Utils.escapeHtml(p.serverName || 'Serveur Jellyfin')}</div>
                    <div style="font-size:0.85rem; color:var(--muted-foreground);">Dernier signal : ${p.lastSeen ? Utils.formatDateTime(p.lastSeen) : 'Inconnu'}</div>
                  </div>
                  <span class="badge ${p.connected ? 'badge-success' : 'badge-danger'}" style="font-size:0.9rem; padding:0.4rem 0.85rem;">
                    ${p.connected ? '● Plugin En Ligne' : '○ Déconnecté'}
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
          `;

          document.getElementById('btn-refresh-plugin-health')?.addEventListener('click', async () => {
            try {
              await API.postJSON('/api/admin/plugin/health', {});
              Toast.success('Diagnostic plugin exécuté avec succès.');
              Pages.health('plugin');
            } catch (e) {
              Toast.error(e.message);
            }
          });
        } catch (e) {
          Toast.error(e.message);
        }
      }

      // Tab 3: Log & Anomaly Health
      else if (sub === 'logs') {
        try {
          const [audit, logsData] = await Promise.all([
            API.getJSON('/api/admin/security/audit').catch(() => ({ anomalies: [] })),
            API.getJSON('/api/logs/system').catch(() => ({ logs: [] })),
          ]);

          const logs = logsData.logs || [];
          const errorCount = logs.filter((l) => l.level === 'ERROR').length;
          const warnCount = logs.filter((l) => l.level === 'WARN').length;
          const anomalies = audit.anomalies || [];

          container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.5rem;">
              <div class="metric-grid">
                <div class="metric-card">
                  <div class="metric-header">
                    <span class="metric-label">Erreurs Système</span>
                    <div class="metric-icon-box">⚠️</div>
                  </div>
                  <div class="metric-value" style="color:${errorCount > 0 ? 'var(--destructive)' : 'var(--accent)'};">${errorCount}</div>
                  <div class="metric-trend">Sur les derniers logs</div>
                </div>

                <div class="metric-card">
                  <div class="metric-header">
                    <span class="metric-label">Avertissements</span>
                    <div class="metric-icon-box">⚡</div>
                  </div>
                  <div class="metric-value">${warnCount}</div>
                  <div class="metric-trend">Avertissements de synchronisation</div>
                </div>

                <div class="metric-card">
                  <div class="metric-header">
                    <span class="metric-label">Anomalies de Sécurité</span>
                    <div class="metric-icon-box">🛡️</div>
                  </div>
                  <div class="metric-value" style="color:${anomalies.length > 0 ? 'var(--destructive)' : 'var(--accent)'};">
                    ${anomalies.length}
                  </div>
                  <div class="metric-trend">${anomalies.length === 0 ? 'Aucun comportement suspect' : 'Comportements détectés'}</div>
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
                      ${logs.filter((l) => l.level === 'ERROR' || l.level === 'WARN').slice(0, 8).map((l) => `
                        <tr>
                          <td><span class="badge ${l.level === 'ERROR' ? 'badge-danger' : 'badge-warning'}">${Utils.escapeHtml(l.level)}</span></td>
                          <td style="font-family:monospace; font-size:0.82rem;">${Utils.escapeHtml(l.message || l.msg || '')}</td>
                          <td style="white-space:nowrap; font-size:0.78rem; color:var(--muted-foreground);">${Utils.formatDateTime(l.time || l.timestamp)}</td>
                        </tr>
                      `).join('') || '<tr><td colspan="3" class="empty-state">Aucune erreur récente enregistrée. Système sain.</td></tr>'}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `;
        } catch (e) {
          Toast.error(e.message);
        }
      }
    },

    // 17. Server Compare
    async serverCompare() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        ${Pages.adminNav('server-compare')}
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
              ${I18n.t('nav.serverCompare') || 'Comparateur de Serveurs'}
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
      `;

      try {
        const data = await API.getJSON('/api/admin/server-compare');
        const tbody = document.getElementById('compare-table-body');
        if (!data.servers || data.servers.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6">
                <div class="empty-state">
                  <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                  <span class="empty-state-title">Aucun serveur configuré</span>
                  <span>Ajoutez au moins deux serveurs pour comparer leurs données.</span>
                </div>
              </td>
            </tr>`;
          return;
        }

        tbody.innerHTML = data.servers.map((s) => `
          <tr>
            <td>
              <div style="font-weight: 700; font-size: 0.95rem;">${Utils.escapeHtml(s.name)}</div>
              <div style="font-size: 0.76rem; color: var(--muted-foreground);">${Utils.escapeHtml(s.url)}</div>
            </td>
            <td><span class="badge ${s.isActive ? 'badge-success' : 'badge-secondary'}">${s.isActive ? '● En ligne' : '○ Inactif'}</span></td>
            <td><b>${Utils.formatNumber(s.mediaCount)}</b></td>
            <td><b>${Utils.formatNumber(s.userCount)}</b></td>
            <td><b>${Utils.formatNumber(s.playsCount)}</b></td>
            <td><span class="badge ${s.activeStreams > 0 ? 'badge-primary' : 'badge-secondary'}">${s.activeStreams}</span></td>
          </tr>
        `).join('');
      } catch (e) {
        Toast.error(e.message);
      }
    },

    // 18. Cleanup & Database Hygiene
    async cleanup() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        ${Pages.adminNav('cleanup')}
        <div style="max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
          <div class="page-header">
            <div>
              <h1 class="page-title">
                <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                ${I18n.t('nav.cleanup') || 'Outils de Nettoyage & Hygiène'}
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
      `;

      document.getElementById('btn-del-stale')?.addEventListener('click', () => {
        Modal.showAction({
          title: 'Supprimer les films obsolètes',
          bodyHtml: '<p>Voulez-vous lancer le nettoyage des médias orphelins ?</p>',
          confirmText: 'Nettoyer',
          onConfirm: async () => {
            try {
              await API.postJSON('/api/admin/cleanup/delete-stale-movies', {});
              Toast.success('Nettoyage effectué.');
            } catch (e) {
              Toast.error(e.message);
            }
          },
        });
      });

      document.getElementById('btn-sync-deleted-users')?.addEventListener('click', async () => {
        try {
          await API.postJSON('/api/admin/users/sync-deleted', {});
          Toast.success('Utilisateurs synchronisés.');
        } catch (e) {
          Toast.error(e.message);
        }
      });

      document.getElementById('btn-check-duplicates')?.addEventListener('click', async () => {
        const listEl = document.getElementById('cleanup-duplicates-list');
        listEl.innerHTML = '<div class="skeleton" style="height:60px;"></div>';
        try {
          const data = await API.getJSON('/api/admin/users/duplicates');
          const groups = data.duplicates || [];
          if (groups.length === 0) {
            listEl.innerHTML = '<p style="color:var(--accent); font-size:0.85rem; font-weight:600;">✓ Aucun utilisateur en double détecté.</p>';
            return;
          }
          listEl.innerHTML = groups.map((g) => `
            <div style="padding:0.6rem; background:var(--surface-soft); border-radius:var(--radius-sm); margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;">
              <span><b>${Utils.escapeHtml(g.username)}</b> (${g.count} comptes)</span>
              <button class="btn btn-secondary btn-sm btn-merge-users" data-username="${Utils.escapeHtml(g.username)}">Fusionner</button>
            </div>
          `).join('');

          listEl.querySelectorAll('.btn-merge-users').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const uname = btn.getAttribute('data-username');
              try {
                await API.postJSON('/api/admin/users/merge', { username: uname });
                Toast.success(`Utilisateurs "${uname}" fusionnés avec succès.`);
                Pages.cleanup();
              } catch (err) {
                Toast.error(err.message);
              }
            });
          });
        } catch (e) {
          listEl.innerHTML = `<p style="color:var(--destructive); font-size:0.85rem;">Erreur : ${Utils.escapeHtml(e.message)}</p>`;
        }
      });

      document.getElementById('btn-run-consolidate')?.addEventListener('click', async () => {
        try {
          await API.postJSON('/api/admin/consolidate-history', { mergeWindowMinutes: 30 });
          Toast.success('Consolidation de l’historique effectuée avec succès.');
        } catch (e) {
          Toast.error(e.message);
        }
      });
    },
  };

  // =========================================================================
  // Client Router
  // =========================================================================

  const Router = {
    init() {
      // Global click handler for client routing: <a href="..." data-link>
      document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-link]');
        if (link && link.href && link.target !== '_blank') {
          const url = new URL(link.href);
          if (url.origin === window.location.origin) {
            e.preventDefault();
            this.navigate(url.pathname + url.search);
          }
        }
      });

      window.addEventListener('popstate', () => {
        this.renderCurrent();
      });

      this.renderCurrent();
    },

    navigate(path, replace = false, force = false) {
      if (!force && window.location.pathname === path) return;
      if (replace) {
        window.history.replaceState({}, '', path);
      } else {
        window.history.pushState({}, '', path);
      }
      this.renderCurrent();
    },

    renderCurrent() {
      const path = window.location.pathname || '/';
      State.currentPath = path;

      // Parity route aliases & redirects
      if (path === '/settings/analytics') {
        this.navigate('/media/analysis', true);
        return;
      }
      if (path === '/settings/network') {
        this.navigate('/settings/jellyfin', true);
        return;
      }
      if (path === '/wrapped') {
        const uid = State.user?.jellyfinUserId || State.user?.id;
        if (uid) {
          this.navigate('/wrapped/' + uid, true);
          return;
        }
      }

      // Update sidebar active states
      const currentUid = State.user?.jellyfinUserId || State.user?.id;

      document.querySelectorAll('.nav-item, .nav-sub-item').forEach((item) => {
        const r = item.getAttribute('data-route');
        if (!r) return;
        let matches = false;

        if (r === '/') {
          matches = (path === '/');
        } else if (r === '/users/me' || (currentUid && r === `/users/${currentUid}`)) {
          matches = Boolean(currentUid && (path === `/users/${currentUid}` || path === '/users/me'));
        } else if (r === '/wrapped/me' || (currentUid && r === `/wrapped/${currentUid}`)) {
          matches = Boolean(currentUid && (path.startsWith(`/wrapped/${currentUid}`) || path.startsWith('/wrapped/me')));
        } else if (r === '/media') {
          matches = (path === '/media' || path === '/media/all');
        } else if (r === '/media/all') {
          matches = (path === '/media/all' || path === '/media');
        } else if (r === '/settings') {
          matches = (path === '/settings' || path === '/settings/overview');
        } else if (r === '/settings/scheduler') {
          matches = (path === '/settings/scheduler');
        } else if (r === '/users') {
          matches = (path === '/users' || (path.startsWith('/users/') && (!currentUid || path !== `/users/${currentUid}`)));
        } else {
          matches = (path === r || (path.startsWith(r + '/') && !r.startsWith('/users') && !r.startsWith('/wrapped')));
        }

        if (matches) {
          item.classList.add('active');
          const group = item.closest('.nav-item-group');
          if (group && group !== item) group.classList.add('child-active');
        } else {
          item.classList.remove('active');
        }
      });

      // Clear child-active if no sub-item in group is active
      document.querySelectorAll('.nav-item-group').forEach((group) => {
        if (!group.querySelector('.nav-sub-item.active')) {
          group.classList.remove('child-active');
        }
      });

      // Close mobile drawer and backdrop on route change
      const sidebar = document.getElementById('app-sidebar');
      if (sidebar) sidebar.classList.remove('mobile-open');
      const backdrop = document.getElementById('sidebar-backdrop');
      if (backdrop) backdrop.classList.remove('active');

      // Scroll top
      window.scrollTo(0, 0);

      // Auth protection guard
      if (!State.user && path !== '/login' && path !== '/setup') {
        Pages.login();
        return;
      }

      if (path !== '/login') {
        document.body.classList.remove('is-auth-page');
      }

      // Route Dispatcher
      if (path === '/') {
        Pages.dashboard();
      } else if (path === '/login') {
        Pages.login();
      } else if (path === '/setup') {
        Pages.setup();
      } else if (path === '/about') {
        Pages.about();
      } else if (path === '/recent') {
        Pages.recent();
      } else if (path === '/newsletter') {
        Pages.newsletter();
      } else if (path === '/users') {
        Pages.users();
      } else if (path.startsWith('/users/')) {
        const id = path.split('/')[2];
        Pages.userDetail(id);
      } else if (path.startsWith('/wrapped/')) {
        const id = path.split('/')[2];
        Pages.wrapped(id);
      } else if (path === '/media' || path === '/media/all') {
        Pages.media();
      } else if (path === '/media/popular') {
        Pages.media({ sort: 'popular' });
      } else if (path === '/media/collections') {
        Pages.collections();
      } else if (path === '/media/analysis') {
        Pages.analysis();
      } else if (path.startsWith('/media/artist/')) {
        const artist = decodeURIComponent(path.slice('/media/artist/'.length));
        Pages.media({ artist });
      } else if (path.startsWith('/media/')) {
        const id = path.split('/')[2];
        Pages.mediaDetail(id);
      } else if (path === '/logs') {
        Pages.logs();
      } else if (path.startsWith('/settings')) {
        const rest = path.slice('/settings'.length).replace(/^\//, '');
        const sub = rest || 'overview';
        Pages.settings(sub);
      } else if (path === '/admin/health') {
        Pages.health('system');
      } else if (path === '/admin/plugin-health') {
        Pages.health('plugin');
      } else if (path === '/admin/log-health') {
        Pages.health('logs');
      } else if (path === '/admin/server-compare') {
        Pages.serverCompare();
      } else if (path === '/admin/cleanup') {
        Pages.cleanup();
      } else {
        // Fallback to dashboard
        Pages.dashboard();
      }
    },
  };

  // =========================================================================
  // Application Bootstrap
  // =========================================================================

  document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Theme
    Theme.init();

    // 2. Initialize i18n
    await I18n.init();

    // Language dropdown bind
    const langSelect = document.getElementById('select-language');
    if (langSelect) {
      langSelect.value = State.locale;
      langSelect.addEventListener('change', (e) => {
        I18n.changeLocale(e.target.value);
      });
    }

    // Sidebar collapse state & button toggle
    const sidebar = document.getElementById('app-sidebar');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (sidebar) {
      try {
        if (localStorage.getItem('jellytrack_sidebar_collapsed') === 'true') {
          sidebar.classList.add('collapsed');
        }
      } catch (e) {}

      if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
          sidebar.classList.toggle('collapsed');
          const isCollapsed = sidebar.classList.contains('collapsed');
          try {
            localStorage.setItem('jellytrack_sidebar_collapsed', isCollapsed ? 'true' : 'false');
          } catch (e) {}
        });
      }
    }

    // Mobile menu toggle & backdrop click
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (mobileBtn && sidebar) {
      mobileBtn.addEventListener('click', () => {
        const isOpen = sidebar.classList.toggle('mobile-open');
        if (backdrop) {
          if (isOpen) backdrop.classList.add('active');
          else backdrop.classList.remove('active');
        }
      });
    }
    if (backdrop && sidebar) {
      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        backdrop.classList.remove('active');
      });
    }

    // Logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => Auth.logout());
    }

    // Quick sync button
    const quickSyncBtn = document.getElementById('btn-quick-sync');
    if (quickSyncBtn) {
      quickSyncBtn.addEventListener('click', async () => {
        const icon = document.getElementById('sync-icon');
        if (icon) icon.style.animation = 'spin 1s linear infinite';
        try {
          await API.postJSON('/api/sync', { recentOnly: true });
          Toast.success('Synchronisation Jellyfin déclenchée !');
          Router.renderCurrent();
        } catch (e) {
          Toast.error(e.message);
        } finally {
          if (icon) icon.style.animation = '';
        }
      });
    }

    // Quick live streams pill click jumps to dashboard
    document.getElementById('topbar-live-streams-pill')?.addEventListener('click', () => {
      Router.navigate('/');
    });

    // 3. Initialize Global Search Dialog
    SearchDialog.init();

    // 4. Verify user session
    await Auth.checkSession();

    // 5. Mount Router
    Router.init();
  });
})();
