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

    t(path, params = {}) {
      const resolve = (obj, p) => p.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
      let val = resolve(State.translations, path);
      if (val === undefined) {
        val = resolve(State.fallbackTranslations, path);
      }
      if (val === undefined) {
        const parts = path.split('.');
        val = parts[parts.length - 1]; // Fallback to last key
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
        el.textContent = this.t(key);
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.setAttribute('placeholder', this.t(key));
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
        btn.addEventListener('click', () => {
          const isDark = document.documentElement.classList.contains('dark');
          this.set(isDark ? 'light' : 'dark');
        });
      }
    },
    set(theme) {
      const sun = document.getElementById('theme-icon-sun');
      const moon = document.getElementById('theme-icon-moon');
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        if (sun) sun.style.display = 'block';
        if (moon) moon.style.display = 'none';
      } else {
        document.documentElement.classList.remove('dark');
        if (sun) sun.style.display = 'none';
        if (moon) moon.style.display = 'block';
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
      const adminSection = document.getElementById('nav-admin-section');

      if (State.user) {
        if (avatarEl) avatarEl.textContent = State.user.username.slice(0, 2).toUpperCase();
        if (nameEl) nameEl.textContent = State.user.username;
        if (adminSection) adminSection.style.display = State.user.isAdmin ? 'block' : 'none';
      } else {
        if (avatarEl) avatarEl.textContent = '?';
        if (nameEl) nameEl.textContent = I18n.t('common.anonymous') || 'Invité';
        if (adminSection) adminSection.style.display = 'none';
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
      const modal = document.getElementById('search-modal');
      const closeBtn = document.getElementById('search-modal-close');
      const input = document.getElementById('search-modal-input');
      const resultsEl = document.getElementById('search-modal-results');

      if (trigger) {
        trigger.addEventListener('click', () => {
          modal.classList.add('open');
          setTimeout(() => input.focus(), 100);
        });
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
        this.instances[id].destroy();
        delete this.instances[id];
      }
    },

    getThemeColors() {
      const isDark = document.documentElement.classList.contains('dark');
      return {
        text: isDark ? '#94A3B8' : '#64748B',
        grid: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.08)',
        primary: isDark ? '#22D3EE' : '#4F46E5',
        primaryGlow: isDark ? 'rgba(34, 211, 238, 0.2)' : 'rgba(79, 70, 229, 0.15)',
        secondary: isDark ? '#A855F7' : '#7C3AED',
      };
    },

    renderLine(canvasId, labels, data, label = 'Lectures') {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;
      const tc = this.getThemeColors();

      this.instances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label,
            data,
            borderColor: tc.primary,
            backgroundColor: tc.primaryGlow,
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
              backgroundColor: document.documentElement.classList.contains('dark') ? '#0F172A' : '#FFFFFF',
              titleColor: document.documentElement.classList.contains('dark') ? '#F1F5F9' : '#0F172A',
              bodyColor: document.documentElement.classList.contains('dark') ? '#94A3B8' : '#64748B',
              borderColor: tc.primary,
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

    renderBar(canvasId, labels, data, label = 'Sessions') {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;
      const tc = this.getThemeColors();

      this.instances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label,
            data,
            backgroundColor: tc.primary,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: tc.text, font: { size: 10 } },
            },
            y: {
              grid: { color: tc.grid },
              ticks: { color: tc.text, font: { size: 10 }, precision: 0 },
              beginAtZero: true,
            },
          },
        },
      });
    },

    renderDoughnut(canvasId, labels, data) {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !window.Chart) return;

      this.instances[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: ['#22D3EE', '#A855F7', '#EC4899', '#10B981', '#F59E0B'],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: document.documentElement.classList.contains('dark') ? '#F1F5F9' : '#0F172A',
                font: { size: 11, weight: '600' },
                boxWidth: 12,
              },
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
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h1 style="font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em;">${I18n.t('dashboard.title') || 'Tableau de bord'}</h1>
            <p style="color: var(--muted-foreground); font-size: 0.88rem;">${I18n.t('dashboard.subtitle') || 'Activité, tendances et surveillance en temps réel.'}</p>
          </div>
          <div class="segmented-control" id="dash-time-range">
            <button class="segment-btn" data-days="1">24h</button>
            <button class="segment-btn active" data-days="7">7j</button>
            <button class="segment-btn" data-days="30">30j</button>
            <button class="segment-btn" data-days="90">90j</button>
            <button class="segment-btn" data-days="365">1 an</button>
          </div>
        </div>

        <!-- Metric Stat Cards -->
        <div class="metric-grid" id="dash-metrics">
          <div class="metric-card skeleton" style="height: 110px;"></div>
          <div class="metric-card skeleton" style="height: 110px;"></div>
          <div class="metric-card skeleton" style="height: 110px;"></div>
          <div class="metric-card skeleton" style="height: 110px;"></div>
        </div>

        <!-- Live Streams Panel -->
        <div class="card" id="dash-live-panel">
          <div class="card-header">
            <div class="card-title-group">
              <div class="card-title">
                <span class="pulse-dot"></span>
                ${I18n.t('dashboard.liveStreams') || 'Flux en direct'}
              </div>
            </div>
          </div>
          <div id="dashboard-live-streams-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div class="skeleton" style="height: 80px;"></div>
          </div>
        </div>

        <!-- Trend Chart & Hourly Chart -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 1.5rem;">
          <div class="card" style="min-height: 350px; display: flex; flex-direction: column;">
            <div class="card-header">
              <div class="card-title">${I18n.t('charts.activity') || 'Activité de lecture'}</div>
            </div>
            <div style="flex: 1; min-height: 260px; position: relative;">
              <canvas id="chart-activity"></canvas>
            </div>
          </div>

          <div class="card" style="min-height: 350px; display: flex; flex-direction: column;">
            <div class="card-header">
              <div class="card-title">${I18n.t('charts.hours') || 'Heures de pointe'}</div>
            </div>
            <div style="flex: 1; min-height: 260px; position: relative;">
              <canvas id="chart-hours"></canvas>
            </div>
          </div>
        </div>

        <!-- Heatmap Calendar & Deep Stats -->
        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <div class="card-title">📅 ${I18n.t('charts.yearlyActivity') || 'Carte thermique d’activité'}</div>
              <div class="card-subtitle">${I18n.t('charts.clickToViewDetail') || 'Cliquez sur une case pour explorer les sessions.'}</div>
            </div>
          </div>
          <div class="heatmap-container" id="dash-heatmap-container">
            <div class="skeleton" style="height: 110px; width: 100%;"></div>
          </div>
        </div>
      `;

      StreamsPoller.start();

      const loadDashData = async (days = 7) => {
        try {
          const dash = await API.getJSON(`/api/dashboard?days=${days}`);
          const metricsEl = document.getElementById('dash-metrics');
          if (metricsEl) {
            metricsEl.innerHTML = `
              <div class="metric-card">
                <div class="metric-header">
                  <span class="metric-label">${I18n.t('dashboard.views') || 'Lectures'}</span>
                  <div class="metric-icon-box">▶</div>
                </div>
                <div class="metric-value">${Utils.formatNumber(dash.views)}</div>
                <div class="metric-trend">${days} ${I18n.t('common.days') || 'derniers jours'}</div>
              </div>

              <div class="metric-card">
                <div class="metric-header">
                  <span class="metric-label">${I18n.t('dashboard.watchTime') || 'Temps de lecture'}</span>
                  <div class="metric-icon-box">⏱</div>
                </div>
                <div class="metric-value">${Utils.formatMs(dash.durationMs)}</div>
                <div class="metric-trend">Total cumulé</div>
              </div>

              <div class="metric-card">
                <div class="metric-header">
                  <span class="metric-label">${I18n.t('dashboard.users') || 'Utilisateurs actifs'}</span>
                  <div class="metric-icon-box">👥</div>
                </div>
                <div class="metric-value">${Utils.formatNumber(dash.users)}</div>
                <div class="metric-trend"><a href="/users" data-link style="color:var(--primary);">Voir les profils →</a></div>
              </div>

              <div class="metric-card">
                <div class="metric-header">
                  <span class="metric-label">${I18n.t('dashboard.media') || 'Titres multimédia'}</span>
                  <div class="metric-icon-box">🎬</div>
                </div>
                <div class="metric-value">${Utils.formatNumber(dash.media)}</div>
                <div class="metric-trend"><a href="/media" data-link style="color:var(--primary);">Explorer le catalogue →</a></div>
              </div>
            `;
          }

          // Activity Line Chart
          if (dash.activity && dash.activity.length > 0) {
            const labels = dash.activity.map((a) => a.day);
            const data = dash.activity.map((a) => a.views);
            ChartHelper.renderLine('chart-activity', labels, data, I18n.t('dashboard.views') || 'Lectures');
          } else {
            ChartHelper.renderLine('chart-activity', ['Aujourd’hui'], [0]);
          }

          // Load Heatmap & Hours
          const hmData = await API.getJSON('/api/heatmap-detail');
          const hoursMap = new Array(24).fill(0);
          if (hmData.heatmap) {
            hmData.heatmap.forEach((item) => {
              hoursMap[item.hour] = (hoursMap[item.hour] || 0) + item.count;
            });
          }
          const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}h`);
          ChartHelper.renderBar('chart-hours', hourLabels, hoursMap, I18n.t('dashboard.views') || 'Lectures');

          // Render Heatmap Matrix
          const hmContainer = document.getElementById('dash-heatmap-container');
          if (hmContainer && hmData.heatmap) {
            let cellsHtml = '<div class="heatmap-grid">';
            for (let w = 0; w < 52; w++) {
              for (let d = 0; d < 7; d++) {
                const match = hmData.heatmap.find((h) => h.dayOfWeek === d);
                const count = match ? match.count : 0;
                let lvl = 0;
                if (count > 0) lvl = count > 10 ? 4 : count > 5 ? 3 : count > 2 ? 2 : 1;
                cellsHtml += `<div class="heatmap-cell level-${lvl}" title="Jour ${d}: ${count} sessions" data-day="${d}" data-count="${count}"></div>`;
              }
            }
            cellsHtml += '</div>';
            hmContainer.innerHTML = cellsHtml;

            // Drilldown click
            hmContainer.querySelectorAll('.heatmap-cell').forEach((cell) => {
              cell.addEventListener('click', async () => {
                const day = cell.getAttribute('data-day');
                const dd = await API.getJSON(`/api/heatmap-detail?day=${day}&hour=20`);
                Modal.showAction({
                  title: `Sessions du jour`,
                  bodyHtml: dd.sessions && dd.sessions.length > 0
                    ? `<div style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:0.5rem;">
                        ${dd.sessions.map((s) => `
                          <div class="card" style="padding:0.6rem;">
                            <b>${Utils.escapeHtml(s.username)}</b> — ${Utils.escapeHtml(s.mediaTitle)}
                            <div style="font-size:0.75rem; color:var(--muted-foreground);">${s.durationMin} min • ${Utils.escapeHtml(s.clientName)}</div>
                          </div>
                        `).join('')}
                       </div>`
                    : '<p>Aucune session enregistrée pour ce créneau.</p>',
                  cancelText: 'Fermer',
                  confirmText: 'OK',
                });
              });
            });
          }
        } catch (e) {
          Toast.error(e.message);
        }
      };

      // Segmented control click
      document.querySelectorAll('#dash-time-range .segment-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#dash-time-range .segment-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          loadDashData(btn.getAttribute('data-days'));
        });
      });

      await loadDashData(7);
    },

    // 2. Login Page
    async login() {
      StreamsPoller.stop();
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 75vh;">
          <div class="card" style="width: 100%; max-width: 420px; padding: 2.25rem; border-radius: var(--radius-xl);">
            <div style="text-align: center; margin-bottom: 2rem;">
              <img src="/assets/logo.svg" alt="JellyTrack" style="width: 52px; height: 52px; margin-bottom: 0.75rem; border-radius: 12px; box-shadow: 0 0 25px var(--primary-glow);">
              <h1 style="font-size: 1.5rem; font-weight: 800;">JellyTrack</h1>
              <p style="color: var(--muted-foreground); font-size: 0.85rem; margin-top: 0.25rem;">${I18n.t('login.signInToContinue') || 'Connectez-vous pour accéder au tableau de bord'}</p>
            </div>

            <form id="form-login" style="display: flex; flex-direction: column; gap: 1rem;">
              <div id="login-error" style="display:none; padding: 0.65rem 0.85rem; background: rgba(239, 68, 68, 0.15); border: 1px solid var(--destructive); border-radius: var(--radius-md); font-size: 0.82rem; color: var(--destructive);"></div>

              <div class="form-group" style="margin: 0;">
                <label class="form-label">${I18n.t('login.username') || 'Nom d’utilisateur'}</label>
                <input type="text" class="form-input" id="login-username" required autofocus placeholder="admin">
              </div>

              <div class="form-group" style="margin: 0;">
                <label class="form-label">${I18n.t('login.password') || 'Mot de passe'}</label>
                <input type="password" class="form-input" id="login-password" required placeholder="••••••••">
              </div>

              <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--muted-foreground); cursor: pointer;">
                <input type="checkbox" id="login-remember">
                ${I18n.t('login.rememberMe') || 'Se souvenir de moi (30 jours)'}
              </label>

              <button type="submit" class="btn btn-primary" id="btn-login-submit" style="margin-top: 0.5rem;">
                ${I18n.t('login.signIn') || 'Se connecter'}
              </button>

              <div id="oidc-login-wrapper" style="display: none; margin-top: 0.5rem;">
                <div style="text-align: center; font-size: 0.75rem; color: var(--muted-foreground); margin: 0.5rem 0;">OU</div>
                <a href="/api/auth/oidc/start" class="btn btn-secondary" style="width: 100%;">
                  🔐 ${I18n.t('login.ssoLogin') || 'Connexion SSO / OpenID'}
                </a>
              </div>
            </form>
          </div>
        </div>
      `;

      // Check OIDC options
      try {
        const opts = await API.getJSON('/api/auth/options');
        if (opts.oidc) {
          const oidcWrapper = document.getElementById('oidc-login-wrapper');
          if (oidcWrapper) oidcWrapper.style.display = 'block';
        }
      } catch (e) {}

      const form = document.getElementById('form-login');
      const errEl = document.getElementById('login-error');
      const submitBtn = document.getElementById('btn-login-submit');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errEl.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Connexion...';

        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value;
        const rem = document.getElementById('login-remember').checked;

        try {
          await Auth.login(u, p, rem);
          Toast.success('Connecté avec succès !');
          Router.navigate('/');
        } catch (err) {
          errEl.textContent = err.message;
          errEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = I18n.t('login.signIn') || 'Se connecter';
        }
      });
    },

    // 3. Setup Wizard
    async setup() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 75vh;">
          <div class="card" style="width: 100%; max-width: 580px; padding: 2.5rem; border-radius: var(--radius-xl);">
            <h1 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem;">Configuration Initiale JellyTrack</h1>
            <p style="color: var(--muted-foreground); font-size: 0.88rem; margin-bottom: 1.5rem;">Connectez votre serveur Jellyfin pour démarrer l’analyse et la surveillance.</p>

            <form id="form-setup">
              <div class="form-group">
                <label class="form-label">Nom du serveur</label>
                <input type="text" class="form-input" id="setup-name" required value="Serveur Principal">
              </div>

              <div class="form-group">
                <label class="form-label">URL Jellyfin</label>
                <input type="url" class="form-input" id="setup-url" required placeholder="http://192.168.1.50:8096">
              </div>

              <div class="form-group">
                <label class="form-label">Clé API Jellyfin</label>
                <input type="text" class="form-input" id="setup-api-key" required placeholder="Générée dans Jellyfin > Tableau de bord > Clés API">
              </div>

              <div style="margin-top: 1.5rem; display: flex; justify-content: flex-end; gap: 0.75rem;">
                <button type="submit" class="btn btn-primary">Enregistrer et Synchroniser</button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.getElementById('form-setup').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('setup-name').value.trim();
        const url = document.getElementById('setup-url').value.trim();
        const apiKey = document.getElementById('setup-api-key').value.trim();

        try {
          await API.postJSON('/api/settings/jellyfin-servers', { name, url, apiKey, isActive: true });
          Toast.success('Serveur Jellyfin configuré avec succès !');
          await API.postJSON('/api/sync', { recentOnly: false });
          Router.navigate('/');
        } catch (err) {
          Toast.error(err.message);
        }
      });
    },

    // 4. About Page
    async about() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div style="max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
          <div class="card" style="text-align: center; padding: 3rem 2rem;">
            <img src="/assets/logo.svg" alt="JellyTrack" style="width: 72px; height: 72px; margin-bottom: 1rem; border-radius: 16px; box-shadow: 0 0 30px var(--primary-glow);">
            <h1 style="font-size: 2rem; font-weight: 800;">JellyTrack</h1>
            <p style="font-size: 0.95rem; color: var(--primary); font-weight: 600; margin-bottom: 1rem;">Version 3.0.0 (Go Native Engine)</p>
            <p style="color: var(--muted-foreground); max-width: 600px; margin: 0 auto; line-height: 1.6;">
              ${I18n.t('about.description') || 'Tableau de bord d’analyse et de surveillance complet pour serveurs Jellyfin. Propulsé par un binaire Go autonome ultra-rapide sans dépendance Node.js.'}
            </p>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">🚀 Fonctionnalités Clés</div>
            </div>
            <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.9rem; color: var(--foreground);">
              <li>⚡ <b>Architecture Go 100% autonome</b> : zéro Node.js, zéro React, zéro npm au runtime.</li>
              <li>📊 <b>Graphiques haute performance</b> : suivi de lecture en temps réel, analyses par genre et client.</li>
              <li>📅 <b>Carte thermique annuelle</b> : style GitHub interactive avec zoom sur chaque tranche horaire.</li>
              <li>🎬 <b>Catalogue multimédia</b> : films, séries, musique et livres avec métadonnées enrichies.</li>
              <li>🎉 <b>JellyTrack Wrapped</b> : rétrospective annuelle utilisateur interactive avec partage.</li>
              <li>🔒 <b>Sécurité d’entreprise</b> : sessions signées, protection CSRF/SSRF, OpenID Connect / SSO.</li>
              <li>🌍 <b>Internationalisation complète</b> : 11 langues supportées (FR, EN, DE, ES, IT, NL, PL, PT, RU, ZH).</li>
            </ul>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">🔗 Liens & Communauté</div>
            </div>
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
              <a href="https://github.com/maelmoreau21/JellyTrack" target="_blank" class="btn btn-secondary">
                GitHub Repository
              </a>
              <a href="https://jellyfin.org" target="_blank" class="btn btn-secondary">
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
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('nav.recent') || 'Historique Récent'}</h1>
          <p style="color: var(--muted-foreground); font-size: 0.88rem;">Dernières lectures enregistrées sur vos serveurs.</p>
        </div>

        <div class="table-wrapper">
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
              <tr><td colspan="6" class="skeleton" style="height: 60px;"></td></tr>
            </tbody>
          </table>
        </div>
      `;

      try {
        const data = await API.getJSON('/api/history?limit=50&days=30');
        const tbody = document.getElementById('recent-table-body');
        if (!data.items || data.items.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Aucun historique disponible.</td></tr>`;
          return;
        }

        tbody.innerHTML = data.items.map((it) => `
          <tr>
            <td><b><a href="/media/${it.id}" data-link>${Utils.escapeHtml(it.title)}</a></b></td>
            <td><span class="badge badge-secondary">${Utils.escapeHtml(it.type)}</span></td>
            <td><a href="/users/${it.username}" data-link>${Utils.escapeHtml(it.username || 'Inconnu')}</a></td>
            <td>${Utils.formatMs(it.durationMs)}</td>
            <td><span class="badge ${it.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}">${Utils.escapeHtml(it.playMethod || 'Stream')}</span></td>
            <td>${Utils.formatDateTime(it.startedAt)} <span style="color:var(--muted-foreground); font-size:0.75rem;">(${Utils.timeAgo(it.startedAt)})</span></td>
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
        <div style="max-width: 840px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('newsletter.title') || 'Newsletter & Récapitulatif'}</h1>
            <p style="color: var(--muted-foreground); font-size: 0.88rem;">Générez et publiez le résumé mensuel sur Discord.</p>
          </div>

          <div class="card" id="newsletter-preview-card">
            <div class="skeleton" style="height: 250px;"></div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
            <button class="btn btn-primary" id="btn-post-discord">
              🚀 ${I18n.t('newsletter.sendDiscord') || 'Publier sur Discord'}
            </button>
          </div>
        </div>
      `;

      try {
        const data = await API.getJSON('/api/newsletter');
        const card = document.getElementById('newsletter-preview-card');
        card.innerHTML = `
          <div class="card-header">
            <div class="card-title">📢 Récapitulatif des 30 derniers jours (${data.dateRange})</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 1.25rem;">
            <div class="metric-grid" style="grid-template-columns: repeat(2, 1fr);">
              <div class="metric-card" style="padding:1rem;">
                <div class="metric-label">Lectures totales</div>
                <div class="metric-value">${Utils.formatNumber(data.totalPlays)}</div>
              </div>
              <div class="metric-card" style="padding:1rem;">
                <div class="metric-label">Heures visionnées</div>
                <div class="metric-value">${Math.round(data.totalHours || 0)} h</div>
              </div>
            </div>

            <div>
              <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 0.5rem;">🏆 Top Médias</h3>
              <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.4rem;">
                ${(data.topMedia || []).map((m, idx) => `
                  <li style="display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; background: var(--surface-soft); border-radius: var(--radius-sm); font-size: 0.88rem;">
                    <span><b>#${idx + 1}</b> ${Utils.escapeHtml(m.title)} (${Utils.escapeHtml(m.type)})</span>
                    <span style="color: var(--primary); font-weight: 600;">${m.hours.toFixed(1)} h • ${m.plays} lectures</span>
                  </li>
                `).join('')}
              </ul>
            </div>

            <div>
              <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 0.5rem;">👑 Top Utilisateurs</h3>
              <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.4rem;">
                ${(data.topUsers || []).map((u, idx) => `
                  <li style="display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; background: var(--surface-soft); border-radius: var(--radius-sm); font-size: 0.88rem;">
                    <span><b>#${idx + 1}</b> ${Utils.escapeHtml(u.username)}</span>
                    <span style="color: var(--accent); font-weight: 600;">${u.hours.toFixed(1)} h</span>
                  </li>
                `).join('')}
              </ul>
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
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('nav.users') || 'Utilisateurs'}</h1>
            <p style="color: var(--muted-foreground); font-size: 0.88rem;">Comptes Jellyfin et profils d’écoute.</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem;" id="users-grid">
          <div class="card skeleton" style="height: 160px;"></div>
          <div class="card skeleton" style="height: 160px;"></div>
          <div class="card skeleton" style="height: 160px;"></div>
        </div>
      `;

      try {
        const data = await API.getJSON('/api/users?limit=100');
        const grid = document.getElementById('users-grid');
        if (!data.items || data.items.length === 0) {
          grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Aucun utilisateur trouvé.</div>';
          return;
        }

        grid.innerHTML = data.items.map((u) => `
          <div class="card" style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div class="user-avatar-mini" style="width: 44px; height: 44px; font-size: 1rem;">
                ${Utils.escapeHtml(u.username.slice(0, 2).toUpperCase())}
              </div>
              <div>
                <div style="font-weight: 700; font-size: 1rem;">
                  <a href="/users/${u.id}" data-link>${Utils.escapeHtml(u.username)}</a>
                </div>
                <div style="font-size: 0.78rem; color: var(--muted-foreground);">${Utils.escapeHtml(u.server || 'Jellyfin')}</div>
              </div>
            </div>

            <div style="font-size: 0.8rem; color: var(--muted-foreground);">
              Dernière activité : <b>${u.lastActive ? Utils.timeAgo(u.lastActive) : 'Inconnue'}</b>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: auto; padding-top: 0.5rem; border-top: 1px solid var(--border-subtle);">
              <a href="/users/${u.id}" data-link class="btn btn-secondary btn-sm" style="flex: 1;">Profil</a>
              <a href="/wrapped/${u.id}" data-link class="btn btn-outline btn-sm" title="JellyTrack Wrapped">🎉 Wrapped</a>
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
        <div class="skeleton" style="height: 80px; margin-bottom: 1rem;"></div>
        <div class="metric-grid" style="margin-bottom: 1.5rem;">
          <div class="metric-card skeleton" style="height: 100px;"></div>
          <div class="metric-card skeleton" style="height: 100px;"></div>
        </div>
      `;

      try {
        const u = await API.getJSON(`/api/users/${encodeURIComponent(userId)}`);
        main.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div class="user-avatar-mini" style="width: 60px; height: 60px; font-size: 1.4rem;">
                ${Utils.escapeHtml(u.username.slice(0, 2).toUpperCase())}
              </div>
              <div>
                <h1 style="font-size: 1.6rem; font-weight: 800;">${Utils.escapeHtml(u.username)}</h1>
                <p style="color: var(--muted-foreground); font-size: 0.88rem;">${Utils.escapeHtml(u.server || 'Jellyfin')} • Dernière activité : ${u.lastActive ? Utils.formatDateTime(u.lastActive) : 'Jamais'}</p>
              </div>
            </div>

            <div style="display: flex; gap: 0.75rem;">
              <a href="/wrapped/${u.id}" data-link class="btn btn-primary">
                🎉 Voir le Wrapped ${new Date().getFullYear()}
              </a>
            </div>
          </div>

          <!-- Active stream indicator if watching right now -->
          <div id="user-active-stream-banner" style="display:none; padding: 0.85rem 1.25rem; background: var(--surface-card); border: 1px solid var(--accent); border-radius: var(--radius-lg); margin-top: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span class="pulse-dot"></span>
              <span id="user-active-stream-text">Lecture en cours...</span>
            </div>
          </div>

          <div class="metric-grid" style="margin-top: 1.5rem;">
            <div class="metric-card">
              <div class="metric-label">Lectures totales</div>
              <div class="metric-value">${Utils.formatNumber(u.totalPlays)}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Temps visionné</div>
              <div class="metric-value">${Utils.formatMs(u.totalDurationMs)}</div>
            </div>
          </div>

          <!-- Recent sessions -->
          <div class="card" style="margin-top: 1.5rem;">
            <div class="card-header">
              <div class="card-title">Dernières lectures de ${Utils.escapeHtml(u.username)}</div>
            </div>
            <div class="table-wrapper">
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
                  ${(u.recentActivity || []).map((a) => `
                    <tr>
                      <td><b>${Utils.escapeHtml(a.title)}</b></td>
                      <td><span class="badge badge-secondary">${Utils.escapeHtml(a.type)}</span></td>
                      <td>${Utils.formatMs(a.durationMs)}</td>
                      <td><span class="badge ${a.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}">${Utils.escapeHtml(a.playMethod || 'Stream')}</span></td>
                      <td>${Utils.formatDateTime(a.startedAt)}</td>
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
              text.textContent = `En train de regarder : ${s.stream.mediaTitle} (${s.stream.playMethod})`;
              banner.style.display = 'block';
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

    // 10. Media Catalog & Overview
    async media(type = '') {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('nav.media') || 'Catalogue Multimédia'}</h1>
            <p style="color: var(--muted-foreground); font-size: 0.88rem;">Films, séries, albums et livres synchronisés.</p>
          </div>

          <div class="segmented-control" id="media-type-filter">
            <button class="segment-btn ${!type ? 'active' : ''}" data-type="">Tout</button>
            <button class="segment-btn ${type === 'Movie' ? 'active' : ''}" data-type="Movie">Films</button>
            <button class="segment-btn ${type === 'Series' ? 'active' : ''}" data-type="Series">Séries</button>
            <button class="segment-btn ${type === 'Audio' ? 'active' : ''}" data-type="Audio">Musique</button>
            <button class="segment-btn ${type === 'Book' ? 'active' : ''}" data-type="Book">Livres</button>
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
          <input type="text" class="form-input" id="media-search-input" placeholder="Filtrer par titre, acteur, réalisateur..." style="max-width: 380px;">
          <select class="form-select" id="media-sort-select" style="max-width: 180px;">
            <option value="title">Titre (A-Z)</option>
            <option value="popular">Les plus vus</option>
            <option value="recent">Récemment lus</option>
            <option value="duration">Plus longs</option>
          </select>
        </div>

        <div class="poster-grid" id="media-grid" style="margin-top: 1.25rem;">
          <div class="poster-card skeleton" style="height: 280px;"></div>
          <div class="poster-card skeleton" style="height: 280px;"></div>
          <div class="poster-card skeleton" style="height: 280px;"></div>
          <div class="poster-card skeleton" style="height: 280px;"></div>
        </div>

        <div class="pagination" id="media-pagination">
          <button class="btn btn-secondary btn-sm" id="media-page-prev" disabled>← Précédent</button>
          <span id="media-page-info">Page 1</span>
          <button class="btn btn-secondary btn-sm" id="media-page-next">Suivant →</button>
        </div>
      `;

      let currentOffset = 0;
      const limit = 24;

      const loadMedia = async () => {
        const grid = document.getElementById('media-grid');
        const q = document.getElementById('media-search-input')?.value.trim() || '';
        const sort = document.getElementById('media-sort-select')?.value || 'title';
        const url = `/api/media?limit=${limit}&offset=${currentOffset}&type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}&sort=${sort}`;

        try {
          const res = await API.getJSON(url);
          if (!res.items || res.items.length === 0) {
            grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Aucun média trouvé.</div>';
            return;
          }

          grid.innerHTML = res.items.map((m) => `
            <a href="/media/${m.id}" data-link class="poster-card">
              <div class="poster-image-box">
                ${m.jellyfinMediaId
                  ? `<img src="/api/jellyfin/image?id=${m.jellyfinMediaId}&type=Primary&maxWidth=300" loading="lazy" alt="${Utils.escapeHtml(m.title)}">`
                  : `<div class="poster-fallback">🎬 ${Utils.escapeHtml(m.type)}</div>`}
              </div>
              <div class="poster-meta">
                <div class="poster-title" title="${Utils.escapeHtml(m.title)}">${Utils.escapeHtml(m.title)}</div>
                <div class="poster-sub">
                  <span>${Utils.escapeHtml(m.type)}</span>
                  <span>${m.durationMs ? Utils.formatMs(m.durationMs) : ''}</span>
                </div>
              </div>
            </a>
          `).join('');

          // Pagination update
          const pageNum = Math.floor(currentOffset / limit) + 1;
          const totalPages = Math.ceil((res.total || 1) / limit) || 1;
          document.getElementById('media-page-info').textContent = `Page ${pageNum} / ${totalPages} (${res.total || 0} éléments)`;
          document.getElementById('media-page-prev').disabled = currentOffset === 0;
          document.getElementById('media-page-next').disabled = currentOffset + limit >= (res.total || 0);
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
      main.innerHTML = `<div class="skeleton" style="height: 350px;"></div>`;

      try {
        const m = await API.getJSON(`/api/media/${encodeURIComponent(mediaId)}`);
        main.innerHTML = `
          <div class="card" style="display: flex; gap: 2rem; flex-wrap: wrap;">
            <div style="width: 220px; aspect-ratio: 2/3; border-radius: var(--radius-lg); overflow: hidden; background: var(--surface-nested); flex-shrink: 0;">
              ${m.jellyfinMediaId ? `<img src="/api/jellyfin/image?id=${m.jellyfinMediaId}&type=Primary&maxWidth=400" style="width:100%; height:100%; object-fit:cover;">` : ''}
            </div>

            <div style="flex: 1; min-width: 300px; display: flex; flex-direction: column; gap: 0.75rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span class="badge badge-primary">${Utils.escapeHtml(m.type)}</span>
                ${m.resolution ? `<span class="badge badge-secondary">${Utils.escapeHtml(m.resolution)}</span>` : ''}
                ${m.library ? `<span class="badge badge-secondary">${Utils.escapeHtml(m.library)}</span>` : ''}
              </div>

              <h1 style="font-size: 1.8rem; font-weight: 800;">${Utils.escapeHtml(m.title)}</h1>

              <div style="display: flex; gap: 1.5rem; font-size: 0.88rem; color: var(--muted-foreground);">
                <span>⏱️ ${Utils.formatMs(m.durationMs)}</span>
                <span>▶️ <b>${m.totalPlays || 0}</b> lectures</span>
                <span>⌛ <b>${Utils.formatMs(m.totalDurationMs)}</b> visionnés au total</span>
              </div>

              ${m.genres && m.genres.length > 0 ? `
                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.5rem;">
                  ${m.genres.map((g) => `<span class="badge" style="background:var(--surface-soft);">${Utils.escapeHtml(g)}</span>`).join('')}
                </div>
              ` : ''}

              ${m.directors && m.directors.length > 0 ? `
                <div style="font-size: 0.85rem; color: var(--muted-foreground); margin-top: 0.5rem;">
                  <b>Réalisation :</b> ${m.directors.map(Utils.escapeHtml).join(', ')}
                </div>
              ` : ''}

              ${m.actors && m.actors.length > 0 ? `
                <div style="font-size: 0.85rem; color: var(--muted-foreground);">
                  <b>Acteurs :</b> ${m.actors.slice(0, 8).map(Utils.escapeHtml).join(', ')}
                </div>
              ` : ''}

              ${State.user && State.user.isAdmin ? `
                <div style="margin-top: auto; padding-top: 1rem;">
                  <button class="btn btn-secondary btn-sm" id="btn-rotate-poster">
                    🔄 Faire pivoter la jaquette
                  </button>
                </div>
              ` : ''}
            </div>
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
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('nav.collections') || 'Collections & Bibliothèques'}</h1>
          <p style="color: var(--muted-foreground); font-size: 0.88rem;">Volumes et proportions par bibliothèque Jellyfin.</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem;" id="collections-grid">
          <div class="card skeleton" style="height: 180px;"></div>
          <div class="card skeleton" style="height: 180px;"></div>
        </div>
      `;

      try {
        const data = await API.getJSON('/api/media/collections');
        const grid = document.getElementById('collections-grid');
        if (!data.collections || data.collections.length === 0) {
          grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Aucune collection trouvée.</div>';
          return;
        }

        grid.innerHTML = data.collections.map((c) => `
          <div class="card" style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div class="card-header">
              <div class="card-title">📁 ${Utils.escapeHtml(c.name)}</div>
              <span class="badge badge-primary">${Utils.formatNumber(c.totalItems)} titres</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--muted-foreground);">
              Durée totale : <b>${Math.round(c.totalHours || 0)} heures</b>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: auto;">
              ${(c.types || []).map((t) => `
                <span class="badge badge-secondary">${Utils.escapeHtml(t.type)}: ${t.count}</span>
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
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('nav.analysis') || 'Analyses Approfondies'}</h1>
          <p style="color: var(--muted-foreground); font-size: 0.88rem;">Réalisateurs, acteurs, studios et prédictions.</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
          <div class="card">
            <div class="card-header">
              <div class="card-title">🎬 Top Réalisateurs</div>
            </div>
            <div id="analysis-directors" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div class="skeleton" style="height: 100px;"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">⭐ Top Acteurs & Actrices</div>
            </div>
            <div id="analysis-actors" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div class="skeleton" style="height: 100px;"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">🏢 Top Studios</div>
            </div>
            <div id="analysis-studios" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div class="skeleton" style="height: 100px;"></div>
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
            el.innerHTML = '<p class="empty-state" style="padding:1rem;">Données insuffisantes.</p>';
            return;
          }
          el.innerHTML = items.map((it, idx) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.65rem; background: var(--surface-soft); border-radius: var(--radius-sm); font-size: 0.85rem;">
              <span><b>#${idx + 1}</b> ${Utils.escapeHtml(it.name)}</span>
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
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('nav.logs') || 'Journaux Système'}</h1>
            <p style="color: var(--muted-foreground); font-size: 0.88rem;">Événements, erreurs et synchronisations JellyTrack.</p>
          </div>

          <div style="display: flex; gap: 0.5rem;">
            <a href="/api/logs/system/download" class="btn btn-secondary btn-sm" download>📥 Télécharger</a>
            <a href="/api/logs/export" class="btn btn-secondary btn-sm">📊 Export CSV</a>
            ${State.user && State.user.isAdmin ? `<button class="btn btn-danger btn-sm" id="btn-clear-logs">🗑️ Vider</button>` : ''}
          </div>
        </div>

        <div class="card" style="padding: 0;">
          <div class="table-wrapper" style="border: none;">
            <table class="table">
              <thead>
                <tr>
                  <th>Niveau</th>
                  <th>Message</th>
                  <th>Horodatage</th>
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
          tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Aucun log enregistré.</td></tr>';
          return;
        }

        tbody.innerHTML = data.logs.map((l) => `
          <tr>
            <td>
              <span class="badge ${l.level === 'ERROR' ? 'badge-danger' : l.level === 'WARN' ? 'badge-warning' : 'badge-primary'}">
                ${Utils.escapeHtml(l.level || 'INFO')}
              </span>
            </td>
            <td style="font-family: monospace; font-size: 0.82rem;">${Utils.escapeHtml(l.message || l.msg || '')}</td>
            <td style="white-space: nowrap; font-size: 0.78rem; color: var(--muted-foreground);">${Utils.formatDateTime(l.time || l.timestamp)}</td>
          </tr>
        `).join('');

        document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
          Modal.showAction({
            title: 'Vider les journaux',
            bodyHtml: '<p>Êtes-vous certain de vouloir purger les journaux système ?</p>',
            confirmText: 'Purger',
            onConfirm: async () => {
              try {
                await API.delete('/api/logs/system');
                Toast.success('Journaux vidés.');
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
      main.innerHTML = `
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('nav.settings') || 'Paramètres'}</h1>
          <p style="color: var(--muted-foreground); font-size: 0.88rem;">Administration, serveurs, sauvegardes et automatisations.</p>
        </div>

        <div class="segmented-control" id="settings-tabs" style="flex-wrap: wrap; margin-top: 0.5rem;">
          <button class="segment-btn ${subpage === 'overview' ? 'active' : ''}" data-sub="overview">Vue d’ensemble</button>
          <button class="segment-btn ${subpage === 'jellyfin' ? 'active' : ''}" data-sub="jellyfin">Serveurs Jellyfin</button>
          <button class="segment-btn ${subpage === 'dataBackups' ? 'active' : ''}" data-sub="dataBackups">Sauvegardes</button>
          <button class="segment-btn ${subpage === 'sso' ? 'active' : ''}" data-sub="sso">Authentification SSO</button>
          <button class="segment-btn ${subpage === 'notifications' ? 'active' : ''}" data-sub="notifications">Notifications Discord</button>
          <button class="segment-btn ${subpage === 'plugin' ? 'active' : ''}" data-sub="plugin">Plugin Jellyfin</button>
          <button class="segment-btn ${subpage === 'scheduler' ? 'active' : ''}" data-sub="scheduler">Tâches planifiées</button>
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
          const s = await API.getJSON('/api/settings');
          container.innerHTML = `
            <div class="card">
              <div class="card-header">
                <div class="card-title">⚙️ Configuration Globale</div>
              </div>
              <div class="metric-grid">
                <div class="metric-card">
                  <div class="metric-label">Langue par défaut</div>
                  <div class="metric-value" style="font-size:1.4rem;">${Utils.escapeHtml(s.defaultLocale || 'fr')}</div>
                </div>
                <div class="metric-card">
                  <div class="metric-label">Wrapped activé</div>
                  <div class="metric-value" style="font-size:1.4rem;">${s.wrappedVisible ? 'Oui' : 'Non'}</div>
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
            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
              <h2 style="font-size: 1.15rem; font-weight: 700;">Serveurs enregistrés</h2>
              <button class="btn btn-primary btn-sm" id="btn-add-server">+ Ajouter un serveur</button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${(servers || []).map((srv) => `
                <div class="card" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem;">
                  <div>
                    <div style="font-weight: 700; font-size: 1rem;">${Utils.escapeHtml(srv.name)}</div>
                    <div style="font-size: 0.82rem; color: var(--muted-foreground);">${Utils.escapeHtml(srv.url)}</div>
                  </div>
                  <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <span class="badge ${srv.isActive ? 'badge-success' : 'badge-secondary'}">${srv.isActive ? 'Actif' : 'Inactif'}</span>
                    <button class="btn btn-danger btn-sm btn-del-server" data-id="${srv.id}">Supprimer</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `;

          document.querySelectorAll('.btn-del-server').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const id = btn.getAttribute('data-id');
              Modal.showAction({
                title: 'Supprimer le serveur',
                bodyHtml: '<p>Êtes-vous certain de vouloir supprimer ce serveur ?</p>',
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
                  <label class="form-label">Nom</label>
                  <input type="text" class="form-input" id="m-srv-name" required value="Nouveau Serveur">
                </div>
                <div class="form-group">
                  <label class="form-label">URL</label>
                  <input type="url" class="form-input" id="m-srv-url" required placeholder="http://192.168.1.50:8096">
                </div>
                <div class="form-group">
                  <label class="form-label">Clé API</label>
                  <input type="text" class="form-input" id="m-srv-key" required placeholder="Clé API Jellyfin">
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

      // Subpage 3: Backups
      else if (subpage === 'dataBackups') {
        try {
          const autoList = await API.getJSON('/api/backup/auto');
          container.innerHTML = `
            <div class="card" style="margin-bottom: 1.5rem;">
              <div class="card-header">
                <div class="card-title">💾 Actions de Sauvegarde</div>
              </div>
              <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                <button class="btn btn-primary" id="btn-trigger-backup">Créer une sauvegarde maintenant</button>
                <a href="/api/backup/export" class="btn btn-secondary" download="jellytrack-export.json">Exporter en JSON</a>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <div class="card-title">Sauvegardes automatiques disponibles</div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${(autoList.backups || []).length === 0 ? '<p class="empty-state">Aucune sauvegarde automatique trouvée.</p>' : ''}
                ${(autoList.backups || []).map((b) => `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; background: var(--surface-soft); border-radius: var(--radius-md);">
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

          document.querySelectorAll('.btn-restore-backup').forEach((btn) => {
            btn.addEventListener('click', () => {
              const id = btn.getAttribute('data-id');
              Modal.showAction({
                title: 'Restaurer la sauvegarde',
                bodyHtml: '<p><b>Attention :</b> Cette opération restaurera les données depuis cette sauvegarde.</p>',
                confirmText: 'Restaurer',
                onConfirm: async () => {
                  try {
                    await API.postJSON('/api/backup/auto/restore', { id });
                    Toast.success('Restauration terminée.');
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

      // Subpage 4: SSO
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

      // Subpage 5: Notifications Discord
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

      // Subpage 6: Plugin
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
              <div style="display: flex; gap: 0.75rem;">
                <button class="btn btn-secondary btn-sm" id="btn-copy-plugin-key">📋 Copier</button>
                <button class="btn btn-primary btn-sm" id="btn-rotate-plugin-key">🔄 Régénérer la clé</button>
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

      // Subpage 7: Scheduler
      else if (subpage === 'scheduler') {
        container.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
            <div class="card">
              <div class="card-header">
                <div class="card-title">⚡ Exécution Manuelle de Tâches</div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <button class="btn btn-secondary" id="task-sync-recent">Synchroniser les lectures récentes</button>
                <button class="btn btn-secondary" id="task-sync-full">Synchronisation complète des médias</button>
                <button class="btn btn-secondary" id="task-integrity">Vérification de l’intégrité</button>
                <button class="btn btn-secondary" id="task-consolidate">Consolidation de l’historique</button>
              </div>
            </div>
          </div>
        `;

        const bindTask = (id, url, payload) => {
          document.getElementById(id)?.addEventListener('click', async () => {
            try {
              await API.postJSON(url, payload);
              Toast.success('Tâche déclenchée avec succès.');
            } catch (e) {
              Toast.error(e.message);
            }
          });
        };

        bindTask('task-sync-recent', '/api/sync', { recentOnly: true });
        bindTask('task-sync-full', '/api/sync', { recentOnly: false });
        bindTask('task-integrity', '/api/admin/integrity-cleanup', {});
        bindTask('task-consolidate', '/api/admin/consolidate-history', { mergeWindowMinutes: 30 });
      }
    },

    // 16. Admin Health
    async health() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('nav.health') || 'Santé Système'}</h1>
          <p style="color: var(--muted-foreground); font-size: 0.88rem;">Diagnostics base de données, processus et sondes.</p>
        </div>

        <div class="metric-grid" id="health-metrics">
          <div class="metric-card skeleton" style="height: 120px;"></div>
          <div class="metric-card skeleton" style="height: 120px;"></div>
        </div>
      `;

      try {
        const [h, hw] = await Promise.all([
          API.getJSON('/api/admin/health'),
          API.getJSON('/api/hardware').catch(() => ({})),
        ]);

        document.getElementById('health-metrics').innerHTML = `
          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-label">Base de données</span>
              <div class="metric-icon-box">🗄️</div>
            </div>
            <div class="metric-value" style="font-size:1.6rem; color: ${h.database === 'healthy' ? 'var(--accent)' : 'var(--destructive)'};">
              ${Utils.escapeHtml(h.database || 'OK')}
            </div>
            <div class="metric-trend">Moteur : ${Utils.escapeHtml(h.driver || 'SQLite')}</div>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-label">Enregistrements Orphelins</span>
              <div class="metric-icon-box">🧹</div>
            </div>
            <div class="metric-value">${h.counts ? h.counts.openPlaybackOrphans : 0}</div>
            <div class="metric-trend">Sessions sans fermeture propre</div>
          </div>

          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-label">Mémoire allouée</span>
              <div class="metric-icon-box">🧠</div>
            </div>
            <div class="metric-value">${hw.memory ? hw.memory.allocMb.toFixed(1) + ' MB' : '-'}</div>
            <div class="metric-trend">Cœurs CPU : ${hw.cpu ? hw.cpu.cores : '-'}</div>
          </div>
        `;
      } catch (e) {
        Toast.error(e.message);
      }
    },

    // 17. Server Compare
    async serverCompare() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('nav.serverCompare') || 'Comparateur de Serveurs'}</h1>
          <p style="color: var(--muted-foreground); font-size: 0.88rem;">Analyse comparative entre vos serveurs Jellyfin connectés.</p>
        </div>

        <div class="table-wrapper" style="margin-top: 1.5rem;">
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
      `;

      try {
        const data = await API.getJSON('/api/admin/server-compare');
        const tbody = document.getElementById('compare-table-body');
        if (!data.servers || data.servers.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Aucun serveur configuré.</td></tr>';
          return;
        }

        tbody.innerHTML = data.servers.map((s) => `
          <tr>
            <td>
              <b>${Utils.escapeHtml(s.name)}</b>
              <div style="font-size: 0.75rem; color: var(--muted-foreground);">${Utils.escapeHtml(s.url)}</div>
            </td>
            <td><span class="badge ${s.isActive ? 'badge-success' : 'badge-secondary'}">${s.isActive ? 'Actif' : 'Inactif'}</span></td>
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

    // 18. Cleanup
    async cleanup() {
      const main = document.getElementById('app-main');
      main.innerHTML = `
        <div style="max-width: 680px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 800;">${I18n.t('nav.cleanup') || 'Outils de Nettoyage'}</h1>
            <p style="color: var(--muted-foreground); font-size: 0.88rem;">Maintenez une base de données saine et compacte.</p>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">🗑️ Supprimer les films orphelins / obsolètes</div>
            </div>
            <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
              Supprime les entrées de films qui ne figurent plus sur vos serveurs Jellyfin.
            </p>
            <button class="btn btn-danger btn-sm" id="btn-del-stale">Supprimer les films obsolètes</button>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">👥 Synchroniser les utilisateurs supprimés</div>
            </div>
            <p style="font-size:0.85rem; color:var(--muted-foreground); margin-bottom:1rem;">
              Désactive les utilisateurs Jellyfin qui ont été effacés du serveur.
            </p>
            <button class="btn btn-secondary btn-sm" id="btn-sync-deleted-users">Synchroniser les suppressions</button>
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

      // Update sidebar active state
      document.querySelectorAll('.nav-item').forEach((item) => {
        const r = item.getAttribute('data-route');
        if (r === path || (r !== '/' && path.startsWith(r))) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });

      // Close mobile drawer on route change
      const sidebar = document.getElementById('app-sidebar');
      if (sidebar) sidebar.classList.remove('mobile-open');

      // Scroll top
      window.scrollTo(0, 0);

      // Auth protection guard
      if (!State.user && path !== '/login' && path !== '/setup') {
        Pages.login();
        return;
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
        Pages.media();
      } else if (path === '/media/collections') {
        Pages.collections();
      } else if (path === '/media/analysis') {
        Pages.analysis();
      } else if (path.startsWith('/media/artist/')) {
        const artist = decodeURIComponent(path.split('/')[3] || '');
        Pages.media(artist);
      } else if (path.startsWith('/media/')) {
        const id = path.split('/')[2];
        Pages.mediaDetail(id);
      } else if (path === '/logs') {
        Pages.logs();
      } else if (path.startsWith('/settings')) {
        const parts = path.split('/');
        const sub = parts[2] || 'overview';
        Pages.settings(sub);
      } else if (path === '/admin/health' || path === '/admin/log-health' || path === '/admin/plugin-health') {
        Pages.health();
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

    // Mobile menu toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('app-sidebar');
    if (mobileBtn && sidebar) {
      mobileBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
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
