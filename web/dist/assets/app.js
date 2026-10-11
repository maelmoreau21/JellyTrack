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

  function initialLocale() {
    const supported = ['fr', 'en', 'de', 'es', 'it', 'nl', 'pl', 'pt-BR', 'ru', 'zh'];
    const stored = localStorage.getItem('jt_locale');
    if (supported.includes(stored)) return stored;
    let cookie = '';
    try { cookie = decodeURIComponent(document.cookie.split('; ').find(part => part.startsWith('locale='))?.slice(7) || ''); } catch (_) {}
    if (supported.includes(cookie)) return cookie;
    for (const language of navigator.languages || [navigator.language]) {
      const tag = String(language || '').toLowerCase();
      const matched = supported.find(code => code.toLowerCase() === tag) || supported.find(code => code.toLowerCase().split('-')[0] === tag.split('-')[0]);
      if (matched) return matched;
    }
    return 'en';
  }

  const State = {
    navigation: { multiServer: false, wrappedVisible: false },
    user: null, // { username, role, isAdmin, csrfToken }
    locale: initialLocale(),
    translations: {},
    fallbackTranslations: {},
    activeStreamsCount: 0,
    streamPollInterval: null,
    currentPath: window.location.pathname || '/',
    pageController: null,
    pageCleanups: [],
  };

  const Utils = {
    escapeHtml(str) {
      if (str === undefined || str === null) return '';
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
        return d.toLocaleDateString(State.locale, {
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
        return d.toLocaleString(State.locale, {
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
      return new Intl.NumberFormat(State.locale).format(num);
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
      try {
        const res = await fetch('/assets/messages/fr.json');
        if (res.ok) State.fallbackTranslations = await res.json();
      } catch (e) {}
      await this.loadLocale(State.locale);
      this.applyTranslationsToDOM();
    },

    async loadLocale(loc) {
      if (!['fr', 'en', 'de', 'es', 'it', 'nl', 'pl', 'pt-BR', 'ru', 'zh'].includes(loc)) loc = 'fr';
      try {
        const res = await fetch(`/assets/messages/${loc}.json`);
        if (res.ok) {
          State.translations = await res.json();
          State.locale = loc;
          document.documentElement.lang = loc;
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
      window.JellyTrackNavigation.render();
      Router.navigate(window.location.pathname + window.location.search, true, true);
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
      Router.renderCurrent();
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
      if (!opts.signal && State.pageController && (!opts.method || opts.method.toUpperCase() === 'GET')) {
        opts.signal = State.pageController.signal;
      }
      opts.headers = { ...opts.headers };

      if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData) && !(opts.body instanceof Blob) && !(opts.body instanceof ArrayBuffer) && !ArrayBuffer.isView(opts.body)) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(opts.body);
      }

      if (State.user && State.user.csrfToken && (opts.method === 'POST' || opts.method === 'PUT' || opts.method === 'PATCH' || opts.method === 'DELETE')) {
        opts.headers['X-CSRF-Token'] = State.user.csrfToken;
      }

      const res = await fetch(url, opts);
      if (res.status === 401 && !url.includes('/api/auth/me') && !url.includes('/api/auth/login')) {
        State.user = null;
        Auth.updateUserUI();
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
          try {
            const context = await fetch('/api/navigation');
            if (context.ok) State.navigation = await context.json();
          } catch {}
          this.updateUserUI();
          return true;
        }
      } catch (e) {}
      State.user = null;
      this.updateUserUI();
      return false;
    },

    updateUserUI() {
      window.JellyTrackNavigation.render();
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
      await this.checkSession();
      return data;
    },

    async logout() {
      try {
        await API.request('/api/auth/logout', { method: 'POST' });
      } catch (e) {}
      State.user = null;
      this.updateUserUI();
      Router.navigate('/login?logout=1');
    },
  };

  // =========================================================================
  // Modals & Search Dialog
  // =========================================================================

  const Modal = {
    activeCleanup: null,
    showAction({ title, bodyHtml, confirmText = 'Confirmer', cancelText = 'Annuler', onConfirm }) {
      this.closeAction();
      const previousFocus = document.activeElement;
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
        modal.removeEventListener('click', backdrop);
        document.removeEventListener('keydown', keyboard);
        this.activeCleanup = null;
        confirmBtn.disabled = false;
        confirmBtn.replaceWith(confirmBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        closeBtn.replaceWith(closeBtn.cloneNode(true));
        if (previousFocus?.isConnected) previousFocus.focus();
      };

      const backdrop = event => { if (event.target === modal) cleanup(); };
      const keyboard = event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cleanup(); }
        if (event.key !== 'Tab') return;
        const targets = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')].filter(element => element.getClientRects().length);
        const first = targets[0], last = targets.at(-1);
        if (!first) return;
        if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      };
      this.activeCleanup = cleanup;

      document.getElementById('action-modal-cancel').onclick = cleanup;
      document.getElementById('action-modal-close').onclick = cleanup;
      document.getElementById('action-modal-confirm').onclick = async () => {
        if (confirmBtn.disabled) return;
        confirmBtn.disabled = true;
        try {
          if (onConfirm && await onConfirm() === false) return;
          if (this.activeCleanup === cleanup) cleanup();
        } catch (error) { Toast.error(error.message); }
        finally { if (confirmBtn.isConnected) confirmBtn.disabled = false; }
      };

      modal.classList.add('open');
      modal.addEventListener('click', backdrop);
      document.addEventListener('keydown', keyboard);
      (bodyEl.querySelector('input, textarea, select') || cancelBtn).focus();
    },

    closeAction() {
      if (this.activeCleanup) { this.activeCleanup(); return; }
      const modal = document.getElementById('action-modal');
      if (modal) modal.classList.remove('open');
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
          onClick: options.onClick ? (event, elements) => {
            if (!elements?.length) return;
            const hit = elements[0]; options.onClick(hit.index, labels[hit.index], hit.datasetIndex);
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
          onClick: options.onClick ? (event, elements) => {
            if (!elements?.length) return;
            const hit = elements[0]; options.onClick(hit.index, labels[hit.index], hit.datasetIndex);
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
          onClick: options.onClick ? (event, elements) => {
            if (!elements?.length) return;
            const hit = elements[0]; options.onClick(hit.index, labels[hit.index], hit.datasetIndex);
          } : undefined,
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
      document.body.classList.remove('is-auth-page');
      const main = document.getElementById('app-main');

      // Default state
      const pageSignal = State.pageController.signal;
      let hwInterval, healthInterval, streamsInterval;
      State.pageCleanups.push(() => {
        clearInterval(hwInterval);
        clearInterval(healthInterval);
        clearInterval(streamsInterval);
        delete window.openSendMessageModal;
        delete window.confirmKillStream;
        delete window.openAttendanceDrilldown;
        delete window._setMsgTimeout;
      });
      const initialParams = new URLSearchParams(window.location.search);
      let currentTimeRange = initialParams.get('timeRange') || '7d';
      if (!['1d', '24h', '7d', '30d', '90d', '365d', 'all', 'custom'].includes(currentTimeRange)) currentTimeRange = '7d';
      if (currentTimeRange === '24h') currentTimeRange = '1d';
      let customFrom = initialParams.get('from') || '', customTo = initialParams.get('to') || '';
      const appendDateFilters = params => {
        params.set('timeRange', currentTimeRange);
        if (currentTimeRange === 'custom') {
          params.set('from', customFrom);
          params.set('to', customTo);
        }
      };
      let currentMediaType = initialParams.get('type') || '';
      let currentServerId = initialParams.get('servers') || '';
      if (!initialParams.has('servers')) {
        try { currentServerId = localStorage.getItem('jellytrack:server-scope') || ''; } catch (e) {}
      }
      let excludedTypes = (initialParams.get('excludeTypes') || '').split(',').filter(Boolean);
      const excludedLibraries = initialParams.get('excludeLibs') || '';
      const appendMediaFilters = params => {
        if (currentMediaType) params.set('type', currentMediaType);
        if (excludedTypes.length) params.set('excludeTypes', excludedTypes.join(','));
        if (excludedLibraries) params.set('excludeLibs', excludedLibraries);
      };
      const mediaButtonType = type => type === 'Audio' ? 'MusicAlbum' : type;
      const updateMediaButtons = () => document.querySelectorAll('#dash-media-filter .header-filter-btn').forEach(btn => {
        const type = btn.dataset.type;
        const active = currentMediaType ? type === currentMediaType : type ? !excludedTypes.includes(mediaButtonType(type)) : excludedTypes.length === 0;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
      const updateServerButtons = () => {
        const selected = currentServerId.split(',').filter(Boolean);
        document.querySelectorAll('#dash-server-filter-container .header-filter-btn').forEach(btn => {
          const active = btn.dataset.serverId ? selected.length === 0 || selected.includes(btn.dataset.serverId) : selected.length === 0;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
      };
      const historyURL = (extra = '') => {
        const params = new URLSearchParams(extra);
        if (activeTab !== 'overview' && !params.has('hideZapped')) params.set('hideZapped', 'false');
        params.set('days', currentTimeRange === 'all' || currentTimeRange === 'custom' || params.has('dateFrom') ? 'all' : String(parseInt(currentTimeRange, 10) || 7));
        if (currentMediaType && !params.has('type')) params.set('type', currentMediaType);
        if (excludedTypes.length) params.set('excludeTypes', excludedTypes.join(','));
        if (excludedLibraries) params.set('excludeLibs', excludedLibraries);
        if (currentServerId) params.set('servers', currentServerId);
        if (currentTimeRange === 'custom' && !params.has('dateFrom')) {
          params.set('dateFrom', customFrom);
          params.set('dateTo', customTo);
        }
        return '/logs?' + params.toString();
      };
      const heatmapURL = (extra, annual = false) => {
        const params = new URLSearchParams(extra);
        if (!annual) appendDateFilters(params);
        appendMediaFilters(params);
        if (currentServerId) params.set('servers', currentServerId);
        if (annual && selectedHeatmapLib !== '_total') params.set('type', selectedHeatmapLib);
        return '/api/heatmap-detail?' + params.toString();
      };
      let isDraggableEditing = false;
      let activeTab = 'overview';
      let liveStreamsData = [];
      let liveBandwidth = 0, liveBandwidthKnown = true;
      let forceCardsView = false;
      let selectedHeatmapYear = new Date().getFullYear();
      let selectedHeatmapLib = '_total';
      let selectedMonthlyYear = new Date().getFullYear();

      // Read saved dashboard order (0..9)
      const DEFAULT_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      let dashboardOrder = [...DEFAULT_ORDER];
      try {
        const savedOrder = JSON.parse(localStorage.getItem('JellyTrack-dashboard-order') || 'null');
        if (Array.isArray(savedOrder) && savedOrder.length === DEFAULT_ORDER.length && new Set(savedOrder).size === DEFAULT_ORDER.length && savedOrder.every(id => DEFAULT_ORDER.includes(id))) {
          dashboardOrder = savedOrder;
        }
      } catch (e) {}

      // Render base dashboard skeleton
      main.innerHTML = `
        <div class="page-header dashboard-header">
          <div class="page-header-left">
            <h1 class="page-title">${I18n.t('dashboard.title') || 'Tableau de bord'}</h1>
            <div class="header-filter-bar" id="dash-media-filter">
              <button class="header-filter-btn active" data-type="">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                <span>${I18n.t('common.all') || 'Tous'}</span>
              </button>
              <button class="header-filter-btn" data-type="Movie">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/></svg>
                <span>${I18n.t('media.movies') || 'Films'}</span>
              </button>
              <button class="header-filter-btn" data-type="Series">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="15" x="2" y="7" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
                <span>${I18n.t('media.series') || 'Séries'}</span>
              </button>
              <button class="header-filter-btn" data-type="Audio">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <span>${I18n.t('media.music') || 'Musique'}</span>
              </button>
              <button class="header-filter-btn" data-type="Book">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                <span>${I18n.t('media.books') || 'Livres'}</span>
              </button>
            </div>
            <div id="dash-server-filter-container" class="header-filter-bar" style="display:none;"></div>
          </div>
          <div class="page-header-right">
            <select id="dash-time-select" class="form-input" aria-label="${I18n.t('timeRange.period')}">
              <option value="1d">${I18n.t('timeRange.last24h')}</option>
              <option value="7d">${I18n.t('timeRange.last7d')}</option>
              <option value="30d">${I18n.t('timeRange.last30d')}</option>
              <option value="all">${I18n.t('timeRange.allTime')}</option>
              <option value="custom">${I18n.t('timeRange.custom')}</option>
              <option value="90d">${I18n.t('timeRange.90d') || '90j'}</option>
              <option value="365d">${State.locale === 'en' ? '1 year' : '1 an'}</option>
            </select>
            <div class="time-pills-bar hidden" id="dash-time-range">
              <button class="time-pill-btn" data-range="1d">24h</button>
              <button class="time-pill-btn active" data-range="7d">7j</button>
              <button class="time-pill-btn" data-range="30d">30j</button>
              <button class="time-pill-btn" data-range="90d">90j</button>
              <button class="time-pill-btn" data-range="365d">1 an</button>
              <button class="time-pill-btn" data-range="all">${I18n.t('common.all') || 'Tout'}</button>
              <button class="time-pill-btn" data-range="custom">${I18n.t('timeRange.custom') || 'Dates personnalisées'}</button>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-refresh-dashboard" title="Rafraîchir les données">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </button>
          </div>
        </div>

        <!-- System Health Widgets -->
        <div id="dash-system-health-container"></div>

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
          <details class="dashboard-process-resources"><summary>${State.locale === 'en' ? 'Process resources' : 'Ressources du processus'}</summary><div id="dash-hardware-container"></div></details>
        </div>

        <!-- Tab 2: Analytics Tab Content -->
        <div id="tab-content-analytics" class="hidden">
          <div id="dash-deep-insights-container" style="margin-bottom:1.5rem;"></div>
          <div id="dash-granular-container" style="display:flex; flex-direction:column; gap:1.5rem;"></div>
        </div>

        <!-- Tab 3: Network Tab Content -->
        <div id="tab-content-network" class="hidden">
          <div id="dash-network-container" style="display:flex; flex-direction:column; gap:1.5rem;"></div>
        </div>
      `;

      // Helper: Send message to user live playback
      window.openSendMessageModal = (sessionId, userName, mediaTitle, serverId) => {
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
                ${cannedList.map(c => `<button type="button" class="canned-btn" data-canned-message="${Utils.escapeHtml(c)}">${c}</button>`).join('')}
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
                <button type="button" class="time-pill-btn" id="btn-sec-5" data-message-timeout="5">5s</button>
                <button type="button" class="time-pill-btn active" id="btn-sec-10" data-message-timeout="10">10s</button>
                <button type="button" class="time-pill-btn" id="btn-sec-30" data-message-timeout="30">30s</button>
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
                serverId,
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
      window.confirmKillStream = (sessionId, mediaTitle, serverId) => {
        Modal.showAction({
          title: I18n.t('dashboard.killStream') || 'Arrêter le flux',
          bodyHtml: `<p>Voulez-vous forcer l'arrêt de la lecture : <b>${Utils.escapeHtml(mediaTitle || 'Session')}</b> ?</p>`,
          confirmText: 'Arrêter la lecture',
          cancelText: 'Annuler',
          onConfirm: async () => {
            try {
              await API.postJSON('/api/jellyfin/kill-stream', { sessionId, serverId });
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
        if (State.navigation.multiServer && servers.length > 1) {
          const srvContainer = document.getElementById('dash-server-filter-container');
          if (srvContainer) {
            srvContainer.style.display = 'inline-flex';
            srvContainer.innerHTML = `
              <button class="header-filter-btn active" data-server-id="">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                <span>${I18n.t('common.all') || 'Tout'}</span>
              </button>
              ${servers.map(s => {
                const sId = s.id || s.jellyfinServerId || '';
                const sName = s.name || s.url || sId;
                return `
                  <button class="header-filter-btn" data-server-id="${sId}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                    <span>${Utils.escapeHtml(sName)}</span>
                  </button>
                `;
              }).join('')}
            `;
            srvContainer.querySelectorAll('.header-filter-btn').forEach(btn => {
              btn.addEventListener('click', () => {
                const id = btn.dataset.serverId;
                let selected = currentServerId.split(',').filter(Boolean);
                selected = id ? selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] : [];
                currentServerId = selected.join(',');
                try { if (currentServerId) localStorage.setItem('jellytrack:server-scope', currentServerId); else localStorage.removeItem('jellytrack:server-scope'); } catch (e) {}
                document.cookie = `jellytrack_server_scope=${encodeURIComponent(currentServerId)}; path=/; max-age=${currentServerId ? 31536000 : 0}; samesite=lax`;
                updateServerButtons();
                refreshFilteredDashboard();
                refreshLiveStreams();
              });
            });
          }
        }
      } catch (e) {}

      // 2. Load System Health Widgets
      const loadSystemHealth = async () => {
        try {
          const health = await API.getJSON('/api/admin/health');
          if (pageSignal.aborted) return;
          const container = document.getElementById('dash-system-health-container');
          if (!container) return;

          const isErr = health.status && health.status.monitor && health.status.monitor.status === 'error';
          const never = I18n.t('common.never') || (State.locale === 'en' ? 'Never' : 'Jamais');
          const lastPoll = Utils.timeAgo(health.status?.monitor?.lastPollAt) || never;
          const lastSync = Utils.timeAgo(health.status?.sync?.lastSuccessAt) || never;
          const lastBackup = Utils.timeAgo(health.status?.backup?.lastSuccessAt) || never;
          const counts = health.counts || { activeStreams: 0, openPlaybackOrphans: 0, dbStreamsWithoutValkey: 0 };
          const excludedCount = (health.excludedLibraries || []).length;

          container.innerHTML = `
            <div class="system-health-bar">
              <div class="app-chip ${isErr ? 'app-chip-error' : 'app-chip-success'}">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span>${I18n.t('dashboard.monitor')} ${isErr ? I18n.t('dashboard.monitorError') : I18n.t('dashboard.monitorActive')}</span>
              </div>
              <div class="app-chip">
                <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>${I18n.t('dashboard.lastPoll')}: ${lastPoll}</span>
              </div>
              <div class="app-chip">
                <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                <span>${I18n.t('dashboard.lastSync')}: ${lastSync}</span>
              </div>
              <div class="app-chip">
                <svg class="nav-icon text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                <span>${I18n.t('dashboard.lastBackup')}: ${lastBackup}</span>
              </div>
              <a href="/admin/health" class="btn btn-secondary btn-sm" style="margin-left:auto; text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem;">
                <svg class="nav-icon text-red" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                <span>${I18n.t('dashboard.logHealth') || 'Santé du système'}</span>
              </a>
            </div>

            <div class="stat-grid-4" style="margin-bottom:1rem;">
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('dashboard.activeStreams') || 'Flux actifs'}</span>
                  ${window.JellyTrackNavigation.icon("checkCircle")}
                </div>
                <div class="stat-num metric-glow-emerald">${counts.activeStreams}</div>
                <div class="stat-desc">Sessions suivies</div>
              </div>
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('dashboard.openPlaybackOrphans') || 'Lectures orphelines ouvertes'}</span>
                  <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="stat-num metric-glow-amber">${counts.openPlaybackOrphans}</div>
                <div class="stat-desc">Playback sans fermeture</div>
              </div>
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('dashboard.dbWithoutValkey') || 'Flux DB sans cache'}</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div class="stat-num metric-glow-cyan">${counts.dbStreamsWithoutValkey}</div>
                <div class="stat-desc">Fallback base de données</div>
              </div>
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('dashboard.excludedLibraries') || 'Bibliothèques exclues'}</span>
                  <svg class="nav-icon text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 3 18 18M4 7h3m4 0h9M4 12h16M4 17h11"/></svg>
                </div>
                <div class="stat-num metric-glow-violet">${excludedCount}</div>
                <div class="stat-desc">Filtres actifs</div>
              </div>
            </div>
          `;
          if (health.isValkeyEnabled === false) {
            const grid = container.querySelector('.stat-grid-4');
            grid?.children[2]?.remove();
            if (grid) grid.className = 'stat-grid';
          }
        } catch (e) {}
      };

      // 3. Load Hardware Monitor
      const loadHardware = async () => {
        try {
          const hw = await API.getJSON('/api/hardware');
          if (pageSignal.aborted) return;
          const container = document.getElementById('dash-hardware-container');
          if (!container || !hw || !hw.cpu) return;

          container.innerHTML = `
            <div class="hardware-bar">
              <div class="hardware-card">
                <div class="hardware-icon-box" style="background:rgba(59, 130, 246, 0.1); color:#3b82f6;">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9"/><path d="M15 2v2M9 2v2M20 15h2M20 9h2M9 20v2M15 20v2M2 9h2M2 15h2"/></svg>
                </div>
                <div>
                  <div style="font-size:0.75rem; color:var(--muted-foreground);">${I18n.t('hardware.cpuUsage') || 'Processeur (CPU)'}</div>
                  <div class="metric-glow-blue" style="font-size:1.35rem; font-weight:800;">${hw.cpu.usagePercent == null ? 'N/A' : `${hw.cpu.usagePercent}%`}</div>
                </div>
              </div>
              <div class="hardware-card">
                <div class="hardware-icon-box" style="background:rgba(168, 85, 247, 0.1); color:#a855f7;">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M6 8V5M10 8V5M14 8V5M18 8V5"/><rect width="20" height="8" x="2" y="8" rx="2"/></svg>
                </div>
                <div>
                  <div style="font-size:0.75rem; color:var(--muted-foreground);">Mémoire Go (tas alloué)</div>
                  <div class="metric-glow-violet" style="font-size:1.35rem; font-weight:800;">${Number(hw.memory?.allocMb || 0).toFixed(1)} MiB</div>
                </div>
              </div>
              <div class="hardware-card">
                <div class="hardware-icon-box" style="background:rgba(244, 63, 94, 0.1); color:#f43f5e;">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>
                </div>
                <div>
                  <div style="font-size:0.75rem; color:var(--muted-foreground);">${I18n.t('hardware.temperature') || 'Température Système'}</div>
                  <div class="metric-glow-amber" style="font-size:1.35rem; font-weight:800;">${hw.temperature && hw.temperature.main > 0 ? `${hw.temperature.main}°C` : 'N/A'}</div>
                </div>
              </div>
            </div>
          `;
        } catch (e) {}
      };

      // 4. Live Streams Poller & Renderer
      const refreshLiveStreams = async () => {
        if (document.hidden) return;
        try {
          const res = await API.getJSON(`/api/streams${currentServerId ? `?servers=${encodeURIComponent(currentServerId)}` : ''}`);
          if (pageSignal.aborted) return;
          liveStreamsData = res.streams || [];
          liveBandwidth = res.totalBandwidthMbps || 0;
          liveBandwidthKnown = res.bandwidthKnown !== false;
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
          countEl.textContent = `${liveStreamsData.length} ${I18n.t('dashboard.activeStreams') || 'flux actifs'}${liveStreamsData.length ? ` (${liveBandwidthKnown ? `${liveBandwidth} Mbps` : 'N/A'})` : ''}`;
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
                const pct = Math.min(100, Math.max(0, s.progressPercent || 0));
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
                          <span class="badge ${s.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}" style="font-size:0.68rem; padding:0.15rem 0.45rem;">${Utils.escapeHtml(s.playMethod === 'DirectPlay' ? 'DP' : (s.playMethod || I18n.t('common.unknown')))}</span>
                          ${s.isPaused ? '<span style="font-size:0.75rem; color:#f59e0b;">⏸</span>' : ''}
                          <span style="font-size:0.75rem; color:var(--muted-foreground);">${pct}%</span>
                          <button class="btn btn-secondary btn-sm" style="padding:0.2rem 0.45rem; font-size:0.72rem;" data-stream-action="message" data-session-id="${Utils.escapeHtml(s.sessionId)}" data-server-id="${Utils.escapeHtml(s.serverId || '')}" data-user-name="${Utils.escapeHtml(s.user || s.username || '')}" data-media-title="${Utils.escapeHtml(s.mediaTitle || '')}" title="Envoyer un message">💬</button>
                          ${State.user && State.user.isAdmin ? `
                            <button class="btn btn-danger btn-sm" style="padding:0.2rem 0.45rem; font-size:0.72rem;" data-stream-action="kill" data-session-id="${Utils.escapeHtml(s.sessionId)}" data-server-id="${Utils.escapeHtml(s.serverId || '')}" data-media-title="${Utils.escapeHtml(s.mediaTitle || '')}" title="Couper le flux">✕</button>
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
                const imageParams = new URLSearchParams({ itemId: posterId || '', type: 'Primary', maxWidth: '240' });
                if (s.serverId) imageParams.set('serverId', s.serverId);
                if (s.itemId && s.itemId !== posterId) imageParams.set('fallbackId', s.itemId);
                const posterShape = ['Audio', 'Track', 'MusicAlbum'].includes(s.mediaType) ? 'square' : s.mediaType === 'Episode' ? 'wide' : '';
                const pct = Math.min(100, Math.max(0, s.progressPercent || 0));
                const audioSub = [
                  s.audioCodec ? `🔊 ${s.audioCodec.toUpperCase()}${s.audioLanguage ? ` (${s.audioLanguage})` : ''}` : '',
                  s.subtitleCodec ? `💬 ${s.subtitleCodec.toUpperCase()}${s.subtitleLanguage ? ` (${s.subtitleLanguage})` : ''}` : '',
                ].filter(Boolean).join(' • ');

                return `
                  <div class="stream-card">
                    <a href="/media/${encodeURIComponent(s.itemId || s.mediaId || '')}" data-link class="stream-poster-thumb ${posterShape}">
                      ${posterId ? `<img src="/api/jellyfin/image?${Utils.escapeHtml(imageParams.toString())}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" data-hide-on-error alt="${Utils.escapeHtml(s.mediaTitle || '')}">` : ''}
                    </a>
                    <div class="stream-info">
                      <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                        <a href="/media/${encodeURIComponent(s.itemId || s.mediaId || '')}" data-link class="stream-title">${Utils.escapeHtml(s.mediaTitle || I18n.t('common.unknownMedia'))}</a>
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
                      <button class="btn btn-secondary btn-sm" data-stream-action="message" data-session-id="${Utils.escapeHtml(s.sessionId)}" data-server-id="${Utils.escapeHtml(s.serverId || '')}" data-user-name="${Utils.escapeHtml(s.user || s.username || '')}" data-media-title="${Utils.escapeHtml(s.mediaTitle || '')}" title="Envoyer un pop-up à l'écran">
                        💬 Message
                      </button>
                      ${State.user && State.user.isAdmin ? `
                        <button class="btn btn-danger btn-sm" data-stream-action="kill" data-session-id="${Utils.escapeHtml(s.sessionId)}" data-server-id="${Utils.escapeHtml(s.serverId || '')}" data-media-title="${Utils.escapeHtml(s.mediaTitle || '')}" title="Couper la session">
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
      let dashboardRequest = 0, analyticsRequest = 0, networkRequest = 0;

      const loadAllDashboard = async () => {
        try {
          const queryDays = currentTimeRange === 'all' ? 'all' : (parseInt(currentTimeRange, 10) || 7);
          const params = new URLSearchParams();
          params.set('days', String(queryDays));
          appendDateFilters(params);
          appendMediaFilters(params);
          if (currentServerId) params.set('servers', currentServerId);

          const requestNumber = ++dashboardRequest;
          const result = await API.getJSON(`/api/dashboard?${params.toString()}`);
          if (requestNumber !== dashboardRequest) return;
          dashboardData = result;
          if (pageSignal.aborted) return;

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
          if (!pageSignal.aborted) Toast.error(e.message || "Erreur de chargement du tableau de bord");
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
                  ${window.JellyTrackNavigation.icon("activity")}
                </div>
                <div class="stat-num metric-glow-emerald" id="dash-active-streams">${State.activeStreamsCount || 0}</div>
                <div class="stat-desc">${I18n.t('dashboard.managedByServer') || 'Géré par le serveur'}</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('dashboard.totalPlays') || 'Lectures totales'}</span>
                  ${window.JellyTrackNavigation.icon("playCircle")}
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

              <a href="${historyURL()}" data-link class="stat-card-modern" style="text-decoration:none; color:inherit;">
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
                  <span class="stat-title">${I18n.t('dashboard.activeUsersTitle')}</span>
                  <svg class="nav-icon text-pink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div class="stat-num metric-glow-emerald">${Utils.formatNumber(d.currentActiveUsers ?? 0)}</div>
                  ${d.activeUsersGrowth !== undefined && d.activeUsersGrowth !== 0 ? `
                    <span class="badge ${d.activeUsersGrowth >= 0 ? 'badge-success' : 'badge-danger'}" style="font-size:0.7rem;">
                      ${d.activeUsersGrowth > 0 ? '+' : ''}${d.activeUsersGrowth.toFixed(1)}%
                    </span>
                  ` : ''}
                </div>
                <div class="stat-desc">${currentTimeRange !== 'all' && d.previousActiveUsers > 0 ? (State.locale === 'en' ? `vs ${d.previousActiveUsers} previous period` : `vs ${d.previousActiveUsers} période préc.`) : (State.locale === 'en' ? `Out of ${d.totalUsers ?? d.users ?? 0} registered` : `Sur ${d.totalUsers ?? d.users ?? 0} inscrits`)}</div>
              </div>
            </div>
          `,

          // Block 1: breadcrumb (4 Breakdown cards)
          1: () => `
            <div class="stat-grid-4">
              <a href="${historyURL(`type=Movie`)}" data-link class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Films</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/></svg>
                </div>
                <div class="metric-glow-blue" style="font-size:1.6rem; font-weight:800;">${b.movieViews || 0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">vues</span></div>
                <div style="font-size:0.75rem; color:#3b82f6; font-weight:600;">${b.movieHours || 0}h regardées</div>
              </a>

              <a href="${historyURL(`type=Episode`)}" data-link class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Séries</span>
                  <svg class="nav-icon text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="15" x="2" y="7" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
                </div>
                <div class="metric-glow-emerald" style="font-size:1.6rem; font-weight:800;">${b.seriesViews || 0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">lectures</span></div>
                <div style="font-size:0.75rem; color:#10b981; font-weight:600;">${b.seriesHours || 0}h regardées</div>
              </a>

              <a href="${historyURL(`type=Audio`)}" data-link class="breadcrumb-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; font-weight:600; opacity:0.8;">Musique</span>
                  <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="metric-glow-amber" style="font-size:1.6rem; font-weight:800;">${b.musicViews || 0} <span style="font-size:0.8rem; font-weight:400; color:var(--muted-foreground);">titres</span></div>
                <div style="font-size:0.75rem; color:#f59e0b; font-weight:600;">${b.musicHours || 0}h écoutées</div>
              </a>

              <a href="${historyURL(`type=AudioBook`)}" data-link class="breadcrumb-card">
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
                    <div class="card-title">${I18n.t('dashboard.categoryBreakdown') || 'Répartition par catégorie'}</div>
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
                  <div class="card-title">${I18n.t('dashboard.libraryPlays') || 'Lectures quotidiennes par bibliothèque'}</div>
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
                    <div class="card-title">${I18n.t('charts.yearlyActivity') || "📅 Carte thermique d'activité annuelle"}</div>
                    <div class="card-subtitle" id="dash-heatmap-summary">Sessions enregistrées sur l'année</div>
                  </div>
                  <div style="display:flex; align-items:center; gap:0.5rem;">
                    <button class="btn btn-secondary btn-sm" id="btn-heatmap-prev-year">◀</button>
                    <span class="app-chip font-bold" id="heatmap-current-year" style="min-width:60px; text-align:center;">${selectedHeatmapYear}</span>
                    <button class="btn btn-secondary btn-sm" id="btn-heatmap-next-year">▶</button>
                  </div>
                </div>
                <div style="display:flex; gap:0.4rem; margin-top:0.6rem; flex-wrap:wrap;" id="dash-heatmap-lib-filters">
                  ${['_total', ...(d.yearlyHeatmap?.libraryTypes || [])].map(type => `<button class="time-pill-btn ${selectedHeatmapLib === type ? 'active' : ''}" data-lib="${Utils.escapeHtml(type)}">${Utils.escapeHtml(type === '_total' ? I18n.t('common.all') : I18n.t(`common.${type}`) || type)}</button>`).join('')}
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
                    <div class="card-title">${I18n.t('dashboard.loyalUsers') || '👥 Utilisateurs les plus fidèles'}</div>
                    <div class="card-subtitle">${I18n.t('dashboard.loyalUsersDesc') || 'Classement par heures de visionnage sur la période'}</div>
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
                    <div class="card-title">${I18n.t('dashboard.clientEcosystem') || '📱 Écosystème des clients'}</div>
                    <div class="card-subtitle">${I18n.t('dashboard.clientEcosystemDesc') || 'Applications et appareils utilisés pour la lecture'}</div>
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
                      ${window.JellyTrackNavigation.icon("activity")}
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
                    <div class="card-subtitle">Distribution des sessions sur les 24 heures de la journée (UTC)</div>
                  </div>
                </div>
                <div id="chart-hourly-active-banner" style="display:none; padding: 0 1.25rem 0.5rem;"></div>
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
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap:1.25rem;">
              <div class="chart-card" style="grid-column:span 1; min-width:0;">
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

        const historicalChartLabels = {
          'chart-composed-trend': 'volumeHistory', 'chart-category-pie': 'categoryBreakdown',
          'chart-library-plays': 'libraryPlays', 'chart-platform-dist': 'clientEcosystem',
          'chart-activity-by-hour': 'hourlyActivity', 'chart-day-of-week': 'dayOfWeekActivity',
          'chart-monthly-watch': 'monthlyTime', 'chart-completion-ratio': 'completionRate',
          'chart-client-category': 'clientFamilies', 'chart-server-load': 'serverLoad',
        };
        Object.entries(historicalChartLabels).forEach(([id, key]) => {
          const card = container.querySelector(`#${id}`)?.closest('.chart-card');
          if (!card) return;
          card.querySelector('.card-title').textContent = I18n.t(`dashboard.${key}`);
          card.querySelector('.card-subtitle').textContent = I18n.t(`dashboard.${key}Desc`);
        });
        container.querySelectorAll('[data-block-id="1"] .breadcrumb-card').forEach((card, index) => {
          const prefix = ['movies', 'series', 'music', 'books'][index];
          const description = ['moviesWatched', 'seriesWatched', 'musicListened', 'booksSpent'][index];
          card.children[0].querySelector('span').textContent = I18n.t(`dashboard.${prefix}Card`);
          card.children[1].querySelector('span').textContent = I18n.t(`dashboard.${['moviesViews', 'seriesPlays', 'musicTitles', 'booksOpened'][index]}`);
          card.children[2].textContent = `${b[`${prefix === 'movies' ? 'movie' : prefix}Hours`] || 0}h ${I18n.t(`dashboard.${description}`)}`;
        });

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
              { label: I18n.t('charts.movies') + ' (h)', data: d.trendData.map(t => t.movieVolume || 0), color: '#38bdf8' },
              { label: I18n.t('charts.series') + ' (h)', data: d.trendData.map(t => t.seriesVolume || 0), color: '#22c55e' },
              { label: I18n.t('charts.music') + ' (h)', data: d.trendData.map(t => t.musicVolume || 0), color: '#f59e0b' },
              { label: I18n.t('charts.books') + ' (h)', data: d.trendData.map(t => t.booksVolume || 0), color: '#a855f7' },
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
            const rawToLocalized = {
              'movies': I18n.t('media.movies') || 'Films',
              'series': I18n.t('media.series') || 'Séries',
              'music': I18n.t('media.music') || 'Musique',
              'books': I18n.t('media.books') || 'Livres',
              'Movie': I18n.t('media.movies') || 'Films',
              'Series': I18n.t('media.series') || 'Séries',
              'Audio': I18n.t('media.music') || 'Musique',
              'Book': I18n.t('media.books') || 'Livres',
            };
            const rawToLogType = {
              'movies': 'Movie',
              'series': 'Episode',
              'music': 'Audio',
              'books': 'AudioBook',
              'Movie': 'Movie',
              'Series': 'Episode',
              'Audio': 'Audio',
              'Book': 'AudioBook',
            };
            const labels = d.categoryPieData.map(c => rawToLocalized[c.name] || c.name);
            const values = d.categoryPieData.map(c => c.value);
            const colors = ['#38bdf8', '#22c55e', '#f59e0b', '#a855f7'];

            ChartHelper.renderDoughnut('chart-category-pie', labels, values, {
              isHours: true,
              colors,
              onClick: (idx) => {
                const item = d.categoryPieData[idx];
                const raw = item ? item.name : '';
                const logType = rawToLogType[raw] || 'Movie';
                Router.navigate(historyURL(`type=${logType}`));
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
              { label: I18n.t('charts.movies'), data: d.trendData.map(t => t.moviePlays || 0), color: '#3b82f6' },
              { label: I18n.t('charts.series'), data: d.trendData.map(t => t.seriesPlays || 0), color: '#22c55e' },
              { label: I18n.t('charts.music'), data: d.trendData.map(t => t.musicPlays || 0), color: '#eab308' },
              { label: I18n.t('charts.books'), data: d.trendData.map(t => t.booksPlays || 0), color: '#a855f7' },
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
              onClick: (idx, label) => Router.navigate(historyURL(`client=${encodeURIComponent(label)}`)),
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
            const validCounts = values.filter(v => Number.isFinite(v));
            const avg = validCounts.length > 0 ? Math.round(validCounts.reduce((s, v) => s + v, 0) / validCounts.length) : 0;
            const bgColors = values.map(v => v === maxVal && maxVal > 0 ? '#f97316' : '#38bdf8');
            const bannerEl = document.getElementById('chart-hourly-active-banner');

            ChartHelper.renderBar('chart-activity-by-hour', labels, values, {
              backgroundColors: bgColors,
              label: 'Sessions',
              onClick: (idx, label, val) => {
                const count = val !== undefined ? val : values[idx];
                const diff = count - avg;
                const sign = diff >= 0 ? '+' : '';
                const hourNum = label.split(':')[0];
                if (!bannerEl) {
                  Router.navigate(historyURL(`hour=${hourNum}`));
                  return;
                }
                bannerEl.style.display = 'block';
                bannerEl.innerHTML = `
                  <div class="active-hour-banner">
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                      <span style="font-weight:700; color:#22d3ee;">${label}</span>
                      <span>${count} ${I18n.t('charts.sessions') || 'sessions'}</span>
                      <span style="color:var(--muted-foreground); font-size:0.75rem;">(${sign}${diff} vs moy. ${avg})</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-left:auto;">
                      <a href="${historyURL(`hour=${hourNum}`)}" data-link class="btn btn-secondary btn-sm" style="padding:0.2rem 0.6rem; font-size:0.75rem; text-decoration:none;">
                        Voir les logs ↗
                      </a>
                      <button type="button" class="btn btn-secondary btn-sm" style="padding:0.15rem 0.45rem; font-size:0.75rem;" data-dismiss="chart-hourly-active-banner">×</button>
                    </div>
                  </div>
                `;
              },
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
            const rawToLabel = {
              'completed': I18n.t('dashboard.completed') || 'Terminé',
              'partial': I18n.t('dashboard.partial') || 'Partiel',
              'abandoned': I18n.t('dashboard.abandoned') || 'Abandonné',
            };
            const rawColors = {
              'completed': '#22c55e',
              'partial': '#f59e0b',
              'abandoned': '#ef4444',
            };
            const labels = d.completionData.map(c => rawToLabel[c.name] || c.name);
            const values = d.completionData.map(c => c.value);
            const colors = d.completionData.map(c => rawColors[c.name] || '#94a3b8');
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
            const end = new Date(Date.UTC(selectedMonthlyYear, idx + 1, 0)).toISOString().slice(0, 10);
            Router.navigate(historyURL(`dateFrom=${selectedMonthlyYear}-${m}-01&dateTo=${end}`));
          },
        });
      };

      // 9. Render Yearly Heatmap Grid
      const renderHeatmapGrid = () => {
        const container = document.getElementById('dash-heatmap-grid-container');
        if (!container || !dashboardData || !dashboardData.yearlyHeatmap) return;

        const hm = dashboardData.yearlyHeatmap;
        const dataByType = hm.dataByType || hm.heatmapDataByType || {};
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
        const jan1 = new Date(Date.UTC(selectedHeatmapYear, 0, 1));
        let curr = new Date(jan1);
        const dayOfWeek = (curr.getUTCDay() + 6) % 7; // Monday = 0
        curr.setUTCDate(curr.getUTCDate() - dayOfWeek); // align to Monday

        const daysInYear = (Date.UTC(selectedHeatmapYear + 1, 0, 1) - Date.UTC(selectedHeatmapYear, 0, 1)) / 86400000;
        const weekCount = Math.ceil((daysInYear + dayOfWeek) / 7);
        // Month labels along the top (53 columns)
        const monthShortNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
        let lastMonth = -1;
        const weekMonths = [];
        for (let col = 0; col < weekCount; col++) {
          let weekStart = new Date(curr);
          weekStart.setUTCDate(weekStart.getUTCDate() + (col * 7));
          const m = weekStart.getUTCMonth();
          if (weekStart.getUTCFullYear() === selectedHeatmapYear && m !== lastMonth) {
            weekMonths.push({ col, name: monthShortNames[m] });
            lastMonth = m;
          }
        }

        let tableHtml = '<table class="activity-calendar-table"><thead><tr><th style="width:18px;"></th>';
        let curMonthIdx = 0;
        for (let col = 0; col < weekCount; col++) {
          if (curMonthIdx < weekMonths.length && weekMonths[curMonthIdx].col === col) {
            const nextCol = (curMonthIdx + 1 < weekMonths.length) ? weekMonths[curMonthIdx + 1].col : weekCount;
            const span = nextCol - col;
            tableHtml += `<th colspan="${span}" style="font-size:0.65rem; color:var(--muted-foreground); text-align:left; font-weight:600; padding-bottom:3px;">${weekMonths[curMonthIdx].name}</th>`;
            col += span - 1;
            curMonthIdx++;
          } else {
            tableHtml += '<th></th>';
          }
        }
        tableHtml += '</tr></thead><tbody>';

        const dayNames = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

        for (let row = 0; row < 7; row++) {
          tableHtml += '<tr>';
          tableHtml += `<td style="font-size:0.68rem; color:var(--muted-foreground); padding-right:6px; font-weight:600;">${dayNames[row]}</td>`;
          let dayPtr = new Date(curr);
          dayPtr.setUTCDate(dayPtr.getUTCDate() + row);

          for (let col = 0; col < weekCount; col++) {
            const dateStr = dayPtr.toISOString().split('T')[0];
            const isCurYear = dayPtr.getUTCFullYear() === selectedHeatmapYear;
            const count = isCurYear ? (dateMap.get(dateStr) || 0) : 0;
            const lvl = isCurYear ? getLvl(count) : 0;

            tableHtml += `
              <td>
                <div class="activity-calendar-cell cal-lvl-${lvl}" role="button" tabindex="0"
                     title="${dateStr}: ${count} sessions"
                     data-date="${dateStr}"
                     data-count="${count}"
                     style="${!isCurYear ? 'opacity:0.2;' : ''}">
                </div>
              </td>
            `;
            dayPtr.setUTCDate(dayPtr.getUTCDate() + 7);
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';

        tableHtml += `
          <div class="heatmap-legend">
            <span>${I18n.t('charts.less') || 'Moins'}</span>
            <span class="activity-calendar-cell cal-lvl-0" style="display:inline-block;"></span>
            <span class="activity-calendar-cell cal-lvl-1" style="display:inline-block;"></span>
            <span class="activity-calendar-cell cal-lvl-2" style="display:inline-block;"></span>
            <span class="activity-calendar-cell cal-lvl-3" style="display:inline-block;"></span>
            <span class="activity-calendar-cell cal-lvl-4" style="display:inline-block;"></span>
            <span>${I18n.t('charts.more') || 'Plus'}</span>
          </div>
        `;

        container.innerHTML = tableHtml;

        // Drill-down modal on cell click
        container.querySelectorAll('.activity-calendar-cell').forEach(cell => {
          cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cell.click(); } });
          cell.addEventListener('click', async () => {
            const date = cell.getAttribute('data-date');
            const count = parseInt(cell.getAttribute('data-count'), 10) || 0;
            if (count === 0) return;

            try {
              const detail = await API.getJSON(heatmapURL(`date=${date}`, true));
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
                onConfirm: () => Router.navigate(historyURL(`dateFrom=${date}&dateTo=${date}`)),
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
          if (pageSignal.aborted) return;
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
                      <div class="card-subtitle">${I18n.t('dashboard.trendingMediaDesc') || 'Titres en forte accélération de visionnage'}</div>
                    </div>
                  </div>
                  <div class="ranking-list">
                    ${trending.slice(0, 8).map((item, i) => `
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
                      <div class="card-subtitle">${I18n.t('dashboard.peakPredictionsDesc') || 'Créneaux horaires de pointe anticipés par analyse EMA'}</div>
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
          if (topPeaks.length) {
            const note = document.createElement('p'); note.className = 'text-xs text-muted-foreground'; note.textContent = I18n.t('dashboard.predictionBasis');
            container.querySelectorAll('.card').item(container.querySelectorAll('.card').length - 1)?.appendChild(note);
          }
        } catch (e) {}
      };

      // 12. Load Tab 2: Granular Analysis & Deep Insights
      const loadGranularAndDeep = async () => {
        const requestNumber = ++analyticsRequest;
        try {
          const params = new URLSearchParams();
          appendDateFilters(params);
          appendMediaFilters(params);
          if (currentServerId) params.set('servers', currentServerId);

          const [gran, deep] = await Promise.all([
            API.getJSON(`/api/stats/granular?${params.toString()}`),
            API.getJSON(`/api/stats/deep?${params.toString()}`),
          ]);

          if (pageSignal.aborted || requestNumber !== analyticsRequest) return;
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

            const frenchDays = [1, 2, 3, 4, 5, 6, 0].map(dow => ({ dow, name: new Intl.DateTimeFormat(State.locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + dow))) }));

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

            window.openAttendanceDrilldown = async (day, hour, dayName, count) => {
              if (count === 0) return;
              try {
                const detail = await API.getJSON(heatmapURL(`day=${day}&hour=${hour}`));
                const sessions = detail.sessions || [];
                Modal.showAction({
                  title: `${dayName} — ${hour}h00 UTC (${count} ${count > 1 ? 'sessions' : 'session'})`,
                  bodyHtml: sessions.length > 0 ? `
                    <div class="ranking-list" style="max-height:360px; overflow-y:auto;">
                      ${sessions.map(s => `
                        <div class="ranking-item" style="padding:0.6rem 0.75rem; border-radius:var(--radius-sm); background:var(--surface-nested); margin-bottom:0.4rem;">
                          <div style="width:28px; height:28px; border-radius:999px; background:rgba(99, 102, 241, 0.15); color:#6366f1; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.75rem; flex-shrink:0;">
                            ${(s.username || '?').charAt(0).toUpperCase()}
                          </div>
                          <div class="ranking-name" style="flex:1; min-width:0;">
                            <div style="display:flex; align-items:center; gap:0.4rem;">
                              <span style="font-weight:700;">${Utils.escapeHtml(s.username || 'Utilisateur')}</span>
                              <span class="badge ${s.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}" style="font-size:0.65rem;">${Utils.escapeHtml(s.playMethod || 'Stream')}</span>
                            </div>
                            <div style="font-size:0.8rem; color:var(--foreground); margin-top:0.15rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                              ${Utils.escapeHtml(s.mediaTitle || 'Média')}
                            </div>
                            <div style="font-size:0.7rem; color:var(--muted-foreground); margin-top:0.1rem;">
                              ${s.durationMin || 0} min • ${Utils.escapeHtml(s.clientName || 'Client')} • ${s.startedAt ? new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  ` : '<p class="text-muted-foreground text-sm">Aucune session trouvée pour ce créneau.</p>',
                  confirmText: 'Voir les logs',
                  cancelText: 'Fermer',
                  onConfirm: () => Router.navigate(historyURL(`hour=${hour}`)),
                });
              } catch (err) {
                Toast.error('Erreur lors du chargement des détails');
              }
            };

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
                      <div class="card-title">Lectures par heure</div>
                      <div class="card-subtitle">Nombre de lectures démarrées par heure (UTC)</div>
                    </div>
                  </div>
                  <div class="chart-wrap" style="height:280px;">
                    <canvas id="chart-plays-hourly-avg"></canvas>
                  </div>
                </div>

                <div class="chart-card">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">Durée par heure</div>
                      <div class="card-subtitle">Temps total visionné par heure (UTC)</div>
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
                    <div class="card-title">Matrice d'affluence horaire (7j × 24h, UTC)</div>
                    <div class="card-subtitle">Fréquentation selon le jour et l'heure (UTC) (cliquez pour filtrer)</div>
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
                            return `<td class="attendance-cell" style="background:${bg};" title="${fd.name} à ${h}h : ${count} session(s)" tabindex="0" role="button" data-attendance-day="${fd.dow}" data-attendance-hour="${h}" data-attendance-name="${Utils.escapeHtml(fd.name)}" data-attendance-count="${count}"></td>`;
                          }).join('')}
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                  <div class="heatmap-legend" style="padding-top:0.5rem;">
                    <span>Moins</span>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:rgba(148, 163, 184, 0.1);"></span>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:#0e4429;"></span>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:#006d32;"></span>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:#26a641;"></span>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:#39d353;"></span>
                    <span>Plus</span>
                  </div>
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
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap:1.25rem;">
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

            const takeCard = id => granContainer.querySelector(`#${id}`)?.closest('.chart-card, .card');
            const originalCards = Array.from(granContainer.querySelectorAll('.chart-card, .card'));
            const attendanceCard = granContainer.querySelector('.attendance-heatmap-container')?.closest('.card');
            const segmentCard = originalCards.find(card => card.textContent.includes("Segments d'abandon"));
            const abandonedCard = granContainer.querySelector('.ranking-list')?.closest('.card');
            segmentCard.querySelector('div[style*="padding:1.25rem"]').innerHTML = '<div class="chart-wrap" style="height:300px"><canvas id="chart-abandon-segments"></canvas></div>';
            for (const [index, link] of Array.from(abandonedCard.querySelectorAll('a')).entries()) {
              const item = (gran.topAbandoned || [])[index];
              if (!item) continue;
              link.href = item.mediaId ? `/media/${encodeURIComponent(item.mediaId)}` : `/media?q=${encodeURIComponent(item.fullTitle || item.title)}`;
              link.setAttribute('data-link', '');
              const progress = document.createElement('div');
              progress.className = 'historical-completion-track';
              progress.innerHTML = `<span style="width:${Math.max(0, Math.min(100, item.completion || 0))}%"></span>`;
              link.appendChild(progress);
            }
            const pairs = [
              [takeCard('chart-plays-per-day'), takeCard('chart-duration-per-day')],
              [takeCard('chart-plays-by-lib'), takeCard('chart-duration-by-lib')],
              [takeCard('chart-plays-hourly-avg'), takeCard('chart-duration-hourly-avg')],
              [attendanceCard, takeCard('chart-avg-completion-lib')],
              [segmentCard, abandonedCard],
              [takeCard('chart-audio-breakdown'), takeCard('chart-subtitles-breakdown')],
            ];
            const fragment = document.createDocumentFragment();
            pairs.forEach(cards => {
              const row = document.createElement('div'); row.className = 'dash-grid-2';
              cards.filter(Boolean).forEach(card => row.appendChild(card)); fragment.appendChild(row);
            });
            granContainer.replaceChildren(fragment);
            const segments = Object.entries(segMap).map(([name, segment]) => ({ ...segment, name }));
            if (totalDrop > 0) ChartHelper.renderDoughnut('chart-abandon-segments', segments.map(s => I18n.t(`granular.${s.name}`) || s.label), segments.map(s => s.val), {
              colors: segments.map(s => s.color), onClick: index => Router.navigate(historyURL(`completion=${encodeURIComponent(segments[index].name)}`)),
            });
            else ChartHelper.showEmpty('chart-abandon-segments', I18n.t('common.noData'));
            const cardKeys = {
              'chart-plays-per-day': ['playsPerDay', 'playsPerDayDesc'], 'chart-duration-per-day': ['durationPerDay', 'durationPerDayDesc'],
              'chart-plays-by-lib': ['playsByLibTitle', 'playsByLibDesc'], 'chart-duration-by-lib': ['durationByLibTitle', 'durationByLibDesc'],
              'chart-plays-hourly-avg': ['playsHourlyAvg', 'playsHourlyAvgDesc'], 'chart-duration-hourly-avg': ['durationHourlyAvg', 'durationHourlyAvgDesc'],
              'chart-avg-completion-lib': ['avgCompletionByLib', 'avgCompletionByLibDesc'], 'chart-audio-breakdown': ['audioBreakdown', 'audioBreakdownDesc'],
              'chart-subtitles-breakdown': ['subtitles', 'subtitlesDesc'], 'chart-abandon-segments': ['abandonSegments', 'abandonSegmentsDesc'],
            };
            const localizeCard = (card, namespace, keys) => {
              if (!card) return;
              keys.forEach((key, index) => { const target = card.querySelector(index ? '.card-subtitle' : '.card-title'); if (target) target.textContent = I18n.t(`${namespace}.${key}`) || target.textContent; });
            };
            Object.entries(cardKeys).forEach(([id, keys]) => localizeCard(takeCard(id), 'granular', keys));
            localizeCard(attendanceCard, 'granular', ['attendanceHeatmap', 'attendanceHeatmapDesc']);
            localizeCard(abandonedCard, 'granular', ['worstCompletion', 'worstCompletionDesc']);

            // Palette for multi-series
            const palette = ['#38bdf8', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e'];

            // 1. Chart: Plays per day
            const dailyData = gran.dailyData || [];
            if (dailyData.length > 0) {
              const labels = dailyData.map(d => d.time);
              const data = dailyData.map(d => Number(d.totalPlays || 0));
              ChartHelper.renderBar('chart-plays-per-day', labels, data, { label: I18n.t('granular.playsPerDay'), backgroundColors: '#38bdf8', onClick: index => Router.navigate(historyURL(`dateFrom=${encodeURIComponent(dailyData[index].time)}&dateTo=${encodeURIComponent(dailyData[index].time)}`)) });
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
              ChartHelper.renderStackedBar('chart-plays-by-lib', labels, datasets, { onClick: (index, label, datasetIndex) => Router.navigate(historyURL(`library=${encodeURIComponent(gran.collections[datasetIndex])}&dateFrom=${encodeURIComponent(dailyData[index].time)}&dateTo=${encodeURIComponent(dailyData[index].time)}`)) });
            } else {
              ChartHelper.showEmpty('chart-plays-by-lib', 'Aucune donnée par bibliothèque');
            }

            // 3. Chart: Duration per day
            if (dailyData.length > 0) {
              const labels = dailyData.map(d => d.time);
              const data = dailyData.map(d => Number(d.totalDuration || 0));
              ChartHelper.renderArea('chart-duration-per-day', labels, data, { label: I18n.t('granular.durationPerDay'), color: '#a855f7', isHours: true, onClick: index => Router.navigate(historyURL(`dateFrom=${encodeURIComponent(dailyData[index].time)}&dateTo=${encodeURIComponent(dailyData[index].time)}`)) });
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
              ChartHelper.renderStackedBar('chart-duration-by-lib', labels, datasets, { isHours: true, onClick: (index, label, datasetIndex) => Router.navigate(historyURL(`library=${encodeURIComponent(gran.collections[datasetIndex])}&dateFrom=${encodeURIComponent(dailyData[index].time)}&dateTo=${encodeURIComponent(dailyData[index].time)}`)) });
            } else {
              ChartHelper.showEmpty('chart-duration-by-lib', 'Aucune donnée par bibliothèque');
            }

            // 5. Chart: Plays hourly avg
            const hourlyData = gran.hourlyData || [];
            if (hourlyData.length > 0) {
              const labels = hourlyData.map(h => h.time);
              const data = hourlyData.map(h => Number(h.plays || 0));
              ChartHelper.renderBar('chart-plays-hourly-avg', labels, data, { label: 'Lectures', backgroundColors: '#eab308' });
            } else {
              ChartHelper.showEmpty('chart-plays-hourly-avg', 'Aucune donnée horaire');
            }

            // 6. Chart: Duration hourly avg
            if (hourlyData.length > 0) {
              const labels = hourlyData.map(h => h.time);
              const data = hourlyData.map(h => Number(h.duration || 0));
              ChartHelper.renderArea('chart-duration-hourly-avg', labels, data, { label: 'Durée totale (h)', color: '#22c55e', isHours: true });
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
                label: I18n.t('granular.completionPct'),
                onClick: index => Router.navigate(historyURL(`libraryCategory=${encodeURIComponent(dropOff[index].time)}`)),
              });
            } else {
              ChartHelper.showEmpty('chart-avg-completion-lib', 'Aucune donnée de complétion');
            }

            // 8. Chart: Audio breakdown
            const audio = gran.audioData || deep.audioChartData || [];
            if (audio.length > 0 && audio.some(a => (a.value || 0) > 0)) {
              const labels = audio.map(a => a.name || 'Inconnu');
              const values = audio.map(a => Number(a.value || 0));
              ChartHelper.renderDoughnut('chart-audio-breakdown', labels, values, { isHours: false, onClick: index => Router.navigate(historyURL(`audio=${encodeURIComponent(audio[index].name)}`)) });
            } else {
              ChartHelper.showEmpty('chart-audio-breakdown', 'Aucune piste audio enregistrée');
            }

            // 9. Chart: Subtitles breakdown
            const subs = gran.subtitleData || deep.subtitleChartData || [];
            if (subs.length > 0 && subs.some(s => (s.value || 0) > 0)) {
              const labels = subs.map(s => s.name || 'Désactivé');
              const values = subs.map(s => Number(s.value || 0));
              ChartHelper.renderDoughnut('chart-subtitles-breakdown', labels, values, { isHours: false, onClick: index => Router.navigate(historyURL(`subtitle=${encodeURIComponent(subs[index].name)}`)) });
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
                    <a class="category-media-item" href="/media?q=${encodeURIComponent(m.title)}" data-link>
                      <div style="display:flex; align-items:center; gap:0.4rem; overflow:hidden;">
                        <span style="font-size:0.75rem; color:var(--muted-foreground); width:16px;">${i + 1}.</span>
                        <span style="font-size:0.82rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${Utils.escapeHtml(m.title)}">${Utils.escapeHtml(m.title)}</span>
                      </div>
                      <span class="badge badge-secondary" style="font-size:0.7rem; font-family:monospace; shrink-0;">${m.plays} ${I18n.t('deepInsights.views')} · ${m.duration}h</span>
                    </a>
                  `).join('')}
                </div>
              </div>
            `;

            deepContainer.innerHTML = `
              <!-- Categorized Top Media Cards (4 cards) -->
              <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:1rem; margin-bottom:1.25rem;">
                ${renderMediaCategoryCard(I18n.t('deepInsights.topMovies'), movies, I18n.t('deepInsights.noMovies'))}
                ${renderMediaCategoryCard(I18n.t('deepInsights.topSeries'), series, I18n.t('deepInsights.noSeries'))}
                ${renderMediaCategoryCard(I18n.t('deepInsights.topAlbums'), albums, I18n.t('deepInsights.noAlbums'))}
                ${renderMediaCategoryCard(I18n.t('deepInsights.topBooks'), books, I18n.t('deepInsights.noBooks'))}
              </div>

              <!-- Top Genres -->
              ${(deep.topGenres || []).length > 0 ? `
                <div class="card" style="margin-bottom:1.25rem;">
                  <div class="card-header">
                    <div class="card-title-group">
                      <div class="card-title">${I18n.t('deepInsights.topGenres') || 'Top Genres'}</div>
                      <div class="card-subtitle">${I18n.t('deepInsights.genresDesc') || 'Styles et catégories les plus visionnés'}</div>
                    </div>
                  </div>
                  <div style="padding:1rem;">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:1rem;">
                      ${deep.topGenres.map((g, i) => {
                        const maxP = deep.topGenres[0]?.plays || 1;
                        const pct = Math.round((g.plays / maxP) * 100);
                        const genreColors = ['#38bdf8', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4', '#eab308', '#ef4444', '#6366f1', '#14b8a6'];
                        const col = genreColors[i % genreColors.length];
                        return `
                          <a href="/media/all?genre=${encodeURIComponent(g.name)}" data-link style="display:flex; align-items:center; gap:0.6rem; font-size:0.8rem;">
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
                          </a>
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
                      <div class="card-title">${I18n.t('deepInsights.topClients') || 'Top Clients'}</div>
                      <div class="card-subtitle">${I18n.t('deepInsights.topClientsDesc') || 'Applications de lecture les plus sollicitées'}</div>
                    </div>
                  </div>
                  <div class="ranking-list" style="padding:0.75rem 1rem 1rem;">
                    ${(deep.topClients || []).map((c, i) => `
                      <a href="${historyURL(`client=${encodeURIComponent(c.clientName || '')}`)}" data-link class="ranking-item">
                        <span class="ranking-badge">#${i + 1}</span>
                        <span class="ranking-name">${Utils.escapeHtml(c.clientName || '?')}</span>
                        <span class="ranking-value font-mono">${c.count} ${I18n.t('charts.sessions')}</span>
                      </a>
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
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:1rem; padding:1rem;">
                  <div class="app-surface-soft p-4 rounded-lg">
                    <h4 style="font-weight:700; font-size:0.85rem; margin-bottom:0.75rem;">${I18n.t('deepInsights.topActors') || 'Top Acteurs'}</h4>
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
                    <h4 style="font-weight:700; font-size:0.85rem; margin-bottom:0.75rem;">${I18n.t('deepInsights.topDirectors') || 'Top Réalisateurs'}</h4>
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
                    <h4 style="font-weight:700; font-size:0.85rem; margin-bottom:0.75rem;">${I18n.t('deepInsights.topStudios') || 'Top Studios'}</h4>
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

            const extraFigures = Array.from(deepContainer.children).at(-1);
            const deepAudioRow = document.createElement('div'); deepAudioRow.className = 'dash-grid-2'; deepAudioRow.style.marginBottom = '1.25rem';
            deepAudioRow.innerHTML = ['audio', 'subtitle'].map(kind => `<div class="chart-card"><div class="card-header"><div class="card-title-group"><div class="card-title">${I18n.t(kind === 'audio' ? 'granular.audioBreakdown' : 'granular.subtitles')}</div><div class="card-subtitle">${I18n.t(kind === 'audio' ? 'granular.audioBreakdownDesc' : 'granular.subtitlesDesc')}</div></div></div><div class="chart-wrap" style="height:300px"><canvas id="chart-deep-${kind}"></canvas></div></div>`).join('');
            deepContainer.insertBefore(deepAudioRow, extraFigures);
            ['audio', 'subtitle'].forEach(kind => {
              const data = deep[kind === 'audio' ? 'audioChartData' : 'subtitleChartData'] || [];
              if (data.some(item => item.value > 0)) ChartHelper.renderDoughnut(`chart-deep-${kind}`, data.map(item => item.name === 'None' ? I18n.t('common.none') : item.name), data.map(item => item.value), { onClick: index => Router.navigate(historyURL(`hideZapped=true&${kind}=${encodeURIComponent(data[index].name)}`)) });
              else ChartHelper.showEmpty(`chart-deep-${kind}`, I18n.t(kind === 'audio' ? 'deepInsights.noAudioData' : 'deepInsights.noSubtitleData'));
            });
            const deepKeys = { 'chart-stream-methods': ['streamMethods', 'streamMethodsDesc'], 'chart-resolution-matrix': ['resolutionMatrix', 'resolutionMatrixDesc'], 'chart-device-ecosystem': ['deviceEcosystem', 'deviceEcosystemDesc'] };
            Object.entries(deepKeys).forEach(([id, keys]) => { const card = deepContainer.querySelector(`#${id}`)?.closest('.chart-card'); keys.forEach((key, index) => { const target = card?.querySelector(index ? '.card-subtitle' : '.card-title'); if (target) target.textContent = I18n.t(`deepInsights.${key}`) || target.textContent; }); });

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
              ChartHelper.renderDoughnut('chart-resolution-matrix', labels, values, { isHours: false, onClick: index => Router.navigate(historyURL(`hideZapped=true&resolution=${encodeURIComponent(resolutions[index].name)}`)) });
            } else {
              ChartHelper.showEmpty('chart-resolution-matrix', 'Aucune résolution enregistrée');
            }

            // Device ecosystem chart
            const devices = deep.deviceChartData || [];
            if (devices.length > 0 && devices.some(d => (d.value || 0) > 0)) {
              const labels = devices.map(d => d.name || '?');
              const values = devices.map(d => Number(d.value || 0));
              ChartHelper.renderDoughnut('chart-device-ecosystem', labels, values, { isHours: false, onClick: index => Router.navigate(historyURL(`hideZapped=true&device=${encodeURIComponent(devices[index].name)}`)) });
            } else {
              ChartHelper.showEmpty('chart-device-ecosystem', 'Aucun appareil enregistré');
            }
          }
        } catch (e) {
          if (!pageSignal.aborted && requestNumber === analyticsRequest) {
            document.getElementById('dash-granular-container').innerHTML = `<div class="empty-state">${Utils.escapeHtml(e.message)}</div>`;
            Toast.error(e.message);
          }
        }
      };

      // 13. Load Tab 3: Network Analysis & Coupables Table
      const loadNetworkTab = async () => {
        const requestNumber = ++networkRequest;
        try {
          const params = new URLSearchParams();
          appendDateFilters(params);
          appendMediaFilters(params);
          if (currentServerId) params.set('servers', currentServerId);

          const [net, geo] = await Promise.all([
            API.getJSON(`/api/stats/network?${params.toString()}`),
            API.getJSON('/api/geo-stats').catch(error => ({ locations: [], error: error.message })),
          ]);

          if (pageSignal.aborted || requestNumber !== networkRequest) return;
          const container = document.getElementById('dash-network-container');
          if (!container) return;

          const stats = net.stats || { totalSessions: 0, directPlaySessions: 0, transcodeSessions: 0, directStreamSessions: 0, transcodePercent: 0, totalTranscodeDuration: 0 };
          const coupable = net.coupableTable || [];

          container.innerHTML = `
            <!-- 4 Network KPI Cards -->
            <div class="stat-grid-4">
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('network.totalSessions') || 'Sessions totales'}</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                </div>
                <div class="stat-num metric-glow-cyan">${stats.totalSessions}</div>
                <div class="stat-desc text-emerald" style="font-weight:600;">${stats.directPlaySessions} DirectPlay</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('network.transcodeRate') || 'Taux de transcodage'}</span>
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
                <div class="stat-desc">${I18n.t('network.remuxed') || 'Conteneur modifié sans ré-encodage vidéo'}</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">${I18n.t('network.transcodeDuration') || 'Durée de transcodage'}</span>
                  <svg class="nav-icon text-rose" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div class="stat-num metric-glow-rose">${Math.round((stats.totalTranscodeDuration || 0) / 3600)}h</div>
                <div class="stat-desc">${I18n.t('network.transcodeDurationDesc') || 'Temps machine cumulé'}</div>
              </div>
            </div>

            <!-- 2 Network Charts -->
            <div class="dash-grid-2">
              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">${I18n.t('network.directVsTranscodeByHour') || 'DirectPlay vs Transcode par heure'}</div>
                    <div class="card-subtitle">${I18n.t('network.directVsTranscodeByHourDesc') || 'Répartition temporelle des méthodes de flux (UTC)'}</div>
                  </div>
                </div>
                <div class="chart-wrap" style="height:280px;">
                  <canvas id="chart-net-transcode-hourly"></canvas>
                </div>
              </div>

              <div class="chart-card">
                <div class="card-header">
                  <div class="card-title-group">
                    <div class="card-title">${I18n.t('network.transcodeByClient') || 'Transcodage par client'}</div>
                    <div class="card-subtitle">${I18n.t('network.transcodeByClientDesc') || 'Pourcentage de sessions transcodées par application'}</div>
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
                  <div class="card-title">${I18n.t('network.mostTranscoded') || '🚨 Tableau des Coupables (Titres les plus transcodés)'}</div>
                  <div class="card-subtitle">${I18n.t('network.mostTranscodedDesc') || 'Fichiers consommant le plus de ressources CPU/GPU avec motif identifié'}</div>
                </div>
              </div>
              <div style="padding:1rem; overflow-x:auto;">
                ${coupable.length > 0 ? `
                  <table class="table-modern">
                    <thead>
                      <tr>
                        <th>${I18n.t('network.colMedia') || 'Média'}</th>
                        <th>${I18n.t('network.colResolution') || 'Résolution'}</th>
                        <th style="text-align:center;">${I18n.t('network.colSessions') || 'Sessions'}</th>
                        <th style="text-align:center;">${I18n.t('network.colDuration') || 'Durée'}</th>
                        <th>${I18n.t('network.colCause') || 'Cause principale'}</th>
                        <th>${I18n.t('network.colClient') || 'Client principal'}</th>
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
                            <span class="badge ${row.resolution === '4K' ? 'badge-warning' : 'badge-info'}" style="font-size:0.7rem;">${Utils.escapeHtml(row.resolution || I18n.t('common.unknown'))}</span>
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
                  <div class="card-subtitle">Localisation des adresses IP clientes enregistrées, toutes périodes et tous serveurs</div>
                </div>
              </div>
              <div style="padding:1rem;">
                <div class="ranking-list">
                  ${geo.error ? `<p role="status">${Utils.escapeHtml(geo.error)}</p>` : ''}
                  ${(geo.locations || []).slice(0, 10).map((loc, i) => `
                    <div class="ranking-item">
                      <span class="ranking-badge">🌍</span>
                      <span class="ranking-name">${Utils.escapeHtml(loc.city || 'Inconnu')}, ${Utils.escapeHtml(loc.country || '')}</span>
                      <span class="ranking-value">${loc.sessions || 0} sessions</span>
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
          if (!pageSignal.aborted && requestNumber === networkRequest) {
            const container = document.getElementById('dash-network-container');
            if (container) container.innerHTML = `<div class="empty-state">${Utils.escapeHtml(e.message)}</div>`;
            Toast.error(e.message);
          }
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

      const refreshFilteredDashboard = () => {
        document.getElementById('dash-time-select').value = currentTimeRange;
        const params = new URLSearchParams();
        appendDateFilters(params);
        appendMediaFilters(params);
        if (currentServerId) params.set('servers', currentServerId);
        window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
        loadAllDashboard();
        if (activeTab === 'analytics') loadGranularAndDeep();
        if (activeTab === 'network') loadNetworkTab();
      };
      // 15. Time range pills click handlers
      document.getElementById('dash-time-select').addEventListener('change', event => {
        const range = event.target.value;
        event.target.value = currentTimeRange;
        document.querySelector(`#dash-time-range [data-range="${range}"]`)?.click();
      });
      document.querySelectorAll('#dash-time-range .time-pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.range === 'custom') {
            Modal.showAction({
              title: I18n.t('timeRange.custom') || 'Dates personnalisées',
              bodyHtml: `<div class="form-group"><label for="dash-custom-from">${I18n.t('common.from') || 'Du'}</label><input id="dash-custom-from" class="form-input" type="date" value="${Utils.escapeHtml(customFrom)}"></div><div class="form-group"><label for="dash-custom-to">${I18n.t('common.to') || 'Au'}</label><input id="dash-custom-to" class="form-input" type="date" value="${Utils.escapeHtml(customTo)}"></div>`,
              confirmText: I18n.t('common.apply') || 'Appliquer',
              onConfirm: () => {
                const from = document.getElementById('dash-custom-from').value;
                const to = document.getElementById('dash-custom-to').value;
                if (!from || !to || from > to) {
                  Toast.error('Choisissez une date de début et une date de fin dans l’ordre.');
                  return false;
                }
                customFrom = from;
                customTo = to;
                currentTimeRange = 'custom';
                document.querySelectorAll('#dash-time-range .time-pill-btn').forEach(b => b.classList.toggle('active', b === btn));
                refreshFilteredDashboard();
              },
            });
            return;
          }
          document.querySelectorAll('#dash-time-range .time-pill-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentTimeRange = btn.getAttribute('data-range') || '7d';
          refreshFilteredDashboard();
        });
      });

      // 16. Media filter buttons click handlers
      document.querySelectorAll('#dash-media-filter .header-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = mediaButtonType(btn.dataset.type);
          const types = ['Movie', 'Series', 'MusicAlbum', 'Book'];
          if (!type) excludedTypes = [];
          else if (currentMediaType || excludedTypes.length === 0) excludedTypes = types.filter(value => value !== type);
          else excludedTypes = excludedTypes.includes(type) ? excludedTypes.filter(value => value !== type) : [...excludedTypes, type];
          if (excludedTypes.length >= types.length) excludedTypes = [];
          currentMediaType = '';
          updateMediaButtons();
          refreshFilteredDashboard();
        });
      });

      // 17. Refresh button click handler
      const btnRefresh = document.getElementById('btn-refresh-dashboard');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
          loadSystemHealth();
          loadHardware();
          refreshLiveStreams();
          refreshFilteredDashboard();
          Toast.info('Données rafraîchies');
        });
      }

      document.querySelectorAll('#dash-time-range .time-pill-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.range === currentTimeRange));
      document.getElementById('dash-time-select').value = currentTimeRange;
      updateMediaButtons();
      updateServerButtons();
      // Initial loaders
      await Promise.all([
        loadSystemHealth(),
        loadHardware(),
        refreshLiveStreams(),
        loadAllDashboard(),
      ]);

      if (pageSignal.aborted) return;
      hwInterval = setInterval(loadHardware, 10000);
      healthInterval = setInterval(loadSystemHealth, 30000);
      streamsInterval = setInterval(refreshLiveStreams, 4000);
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

      let isLocalLogin = isLocalParam || !oidcEnabled;
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
        const isSsoView = oidcEnabled && !isLocalLogin;
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
                    ${window.JellyTrackNavigation.icon('key')}
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
                    ${window.JellyTrackNavigation.icon('key')}
                    <span>${I18n.t('login.localAdminTitle') || 'Connexion locale (Admin)'}</span>
                  </span>
                  <button type="button" id="btn-back-sso" class="auth-back-sso-btn" ${!oidcEnabled ? 'hidden' : ''}>
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
                  <label class="auth-label" for="login-username">${I18n.t('login.username') || 'Nom d\'utilisateur'}</label>
                  <div class="auth-input-wrapper">
                    <svg class="auth-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <input type="text" class="auth-input-field" id="login-username" required value="admin" placeholder="admin">
                  </div>
                </div>

                <div class="auth-input-group">
                  <label class="auth-label" for="login-password">${I18n.t('login.password') || 'Mot de passe'}</label>
                  <div class="auth-input-wrapper">
                    <svg class="auth-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <input type="password" class="auth-input-field" id="login-password" required autofocus placeholder="••••••••">
                  </div>
                </div>

                <label class="auth-remember" for="login-remember">
                  <input type="checkbox" id="login-remember">
                  <span>${I18n.t('login.rememberMe')}<small>${I18n.t('login.rememberMeHint')}</small></span>
                </label>

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
                    ${window.JellyTrackNavigation.icon(isDark ? "sun" : "moon")}
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
              const callback = new URLSearchParams(location.search).get('callbackUrl');
              const target = callback && callback.startsWith('/') && !callback.startsWith('//') && !callback.includes('\\') && !/^\/login(?:[?#]|$)/.test(callback) ? callback : '/';
              Router.navigate(target, true, true);
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
      window.JellyTrackAbout.render(document.getElementById('app-main'), {
        i18n: I18n, escape: Utils.escapeHtml, locale: State.locale,
        version: State.navigation.appVersion,
      });
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
      const pageSignal = State.pageController.signal;
      const copy = (fr, en) => State.locale.startsWith('fr') ? fr : en;
      const tr = (key, fallback) => I18n.t(`newsletter.${key}`) || fallback;
      const escape = Utils.escapeHtml;
      const icon = name => window.JellyTrackNavigation.icon(name === 'play' ? 'playCircle' : name);
      main.innerHTML = `<div class="newsletter-recovery">${Pages.mediaNav('')}<div class="newsletter-loading skeleton" style="height:500px"></div></div>`;
      try {
        const data = await API.getJSON('/api/newsletter');
        if (pageSignal.aborted) return;
        const media = data.topMedia || [], users = data.topUsers || [], leader = users[0];
        const totalHours = Math.round(Number(data.totalHours) || 0);
        const date = value => new Date(value).toLocaleDateString(State.locale, { day: '2-digit', month: 'short', year: 'numeric' });
        const dateRange = data.startDate && data.endDate ? `${date(data.startDate)} – ${date(data.endDate)}` : data.dateRange || '';
        const poster = item => {
          const params = new URLSearchParams({ itemId: item.jellyfinMediaId || item.jellyfinId || '', type: 'Primary', maxWidth: '160', fallback: 'none' });
          if (item.serverId) params.set('serverId', item.serverId);
          return item.jellyfinMediaId || item.jellyfinId ? `<img src="/api/jellyfin/image?${escape(params.toString())}" alt="${escape(item.title)}" loading="lazy" data-hide-on-error>` : '';
        };
        main.innerHTML = `
          <div class="newsletter-recovery">
            ${Pages.mediaNav('')}
            <article class="rewind-card">
              <header class="rewind-hero"><span class="rewind-sparkles" aria-hidden="true">${icon("sparkles")}</span><h1>JellyTrack Rewind</h1><p>${tr('monthlyRecap', copy('Votre récapitulatif des 30 derniers jours', 'Your recap of the last 30 days'))}</p><time>${escape(dateRange)}</time></header>
              <div class="rewind-content">
                <div class="rewind-metrics">
                  <div class="rewind-metric"><span aria-hidden="true">${icon("clock")}</span><strong class="metric-glow-emerald">${Utils.formatNumber(totalHours)}h</strong><p>${tr('hoursWatched', copy('Visionné', 'Watched'))}</p></div>
                  <div class="rewind-metric"><span aria-hidden="true">${icon("play")}</span><strong class="metric-glow-blue">${Utils.formatNumber(data.totalPlays || 0)}</strong><p>${tr('totalPlays', copy('Lectures totales', 'Total plays'))}</p></div>
                </div>
                <section class="rewind-podium"><h2>${icon("trophy")} ${tr('videoPodium', copy('Le Podium Vidéo', 'The Video Podium'))}</h2>
                  ${media.slice(0, 3).map((item, index) => `<div class="rewind-podium-item"><strong class="rewind-rank">${index + 1}</strong><div class="rewind-poster">${poster(item)}</div><div class="rewind-media-title"><h3>${escape(item.title)}</h3><p>${escape(I18n.t(`common.${item.type}`) || item.type)}</p></div><strong class="metric-glow-emerald">${Number(item.hours || 0).toFixed(1)}h</strong></div>`).join('') || `<p class="text-muted-foreground">${I18n.t('common.noData')}</p>`}
                </section>
                ${leader ? `<section class="rewind-viewer"><span class="rewind-viewer-icon" aria-hidden="true">${icon("users")}</span><div><p>${tr('bestViewer', copy('Meilleur spectateur', 'Best viewer'))}</p><h2>${escape(leader.username)}</h2></div><div class="rewind-viewer-hours"><strong class="metric-glow-violet">${Math.round(leader.hours || 0)}h</strong><p>${tr('hoursWatched', copy('Visionné', 'Watched'))}</p></div></section>` : ''}
              </div>
            </article>
            <div class="rewind-actions"><button class="btn btn-primary" id="btn-download-rewind">${icon("download")} ${copy("Télécharger l'infographie (PNG)", 'Download infographic (PNG)')}</button><button class="btn btn-secondary" id="btn-post-discord">${icon("send")} ${copy('Diffuser sur Discord', 'Post to Discord')}</button></div>
            <p id="rewind-result" role="status" aria-live="polite"></p>
            ${media.length > 3 || users.length > 1 ? `<details class="rewind-complements"><summary>${copy('Classements complémentaires', 'Additional rankings')}</summary><div class="dash-grid-2"><section><h3>${copy('Autres médias du mois', 'More media this month')}</h3>${media.slice(3).map(item => `<div class="newsletter-top-item"><span>${escape(item.title)}</span><span>${Number(item.hours || 0).toFixed(1)}h · ${item.plays || 0} ${I18n.t('dashboard.readings')}</span></div>`).join('') || `<p>${I18n.t('common.noData')}</p>`}</section><section><h3>${copy('Autres spectateurs', 'More viewers')}</h3>${users.slice(1).map(user => `<div class="newsletter-top-item"><span>${escape(user.username)}</span><span>${Number(user.hours || 0).toFixed(1)}h</span></div>`).join('') || `<p>${I18n.t('common.noData')}</p>`}</section></div></details>` : ''}
          </div>`;
        const result = (message, error = false) => {
          const element = document.getElementById('rewind-result');
          if (element) { element.textContent = message; element.className = error ? 'text-danger' : 'text-emerald'; }
        };
        document.getElementById('btn-download-rewind').addEventListener('click', () => {
          const button = document.getElementById('btn-download-rewind'); button.disabled = true;
          try {
            const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
            const context = canvas.getContext('2d');
            if (!context) throw new Error(copy("Impossible de générer l'infographie.", 'Cannot generate the infographic.'));
            const background = context.createLinearGradient(0, 0, 1080, 1350);
            background.addColorStop(0, '#0f172a'); background.addColorStop(.4, '#1e1b4b'); background.addColorStop(1, '#090d16');
            context.fillStyle = background; context.fillRect(0, 0, 1080, 1350);
            const glow = context.createRadialGradient(540, 200, 10, 540, 200, 450);
            glow.addColorStop(0, 'rgba(170,92,195,.4)'); glow.addColorStop(1, 'transparent'); context.fillStyle = glow; context.fillRect(0, 0, 1080, 600);
            const label = (text, x, y, size, color, align = 'left', bold = false, width) => {
              context.fillStyle = color; context.font = `${bold ? 'bold ' : ''}${size}px system-ui, sans-serif`; context.textAlign = align;
              const value = String(text); if (width) context.fillText(value, x, y, width); else context.fillText(value, x, y);
            };
            const card = (x, y, width, height, color = 'rgba(30,41,59,.75)') => { context.fillStyle = color; context.strokeStyle = 'rgba(148,163,184,.2)'; context.lineWidth = 2; context.beginPath(); context.roundRect(x, y, width, height, 20); context.fill(); context.stroke(); };
            label('JellyTrack Rewind', 540, 150, 56, '#fff', 'center', true);
            label(tr('monthlyRecap', copy('Récapitulatif des 30 derniers jours', 'Last 30 days recap')), 540, 200, 28, '#cbd5e1', 'center', false, 960);
            label(dateRange, 540, 240, 20, '#94a3b8', 'center');
            card(80, 310, 440, 160); card(560, 310, 440, 160);
            label(`${totalHours}h`, 300, 390, 52, '#34d399', 'center', true); label(tr('hoursWatched', 'Watched'), 300, 435, 22, '#94a3b8', 'center');
            label(data.totalPlays || 0, 780, 390, 52, '#60a5fa', 'center', true); label(tr('totalPlays', 'Total plays'), 780, 435, 22, '#94a3b8', 'center');
            label(tr('videoPodium', 'Media Podium'), 80, 540, 36, '#fff', 'left', true);
            media.slice(0, 3).forEach((item, index) => { const y = 580 + index * 120; card(80, y, 920, 100); label(index + 1, 130, y + 65, 42, ['#facc15', '#cbd5e1', '#d97706'][index], 'center', true); label(item.title, 190, y + 47, 26, '#f8fafc', 'left', true, 650); label(item.type, 190, y + 80, 20, '#94a3b8'); label(`${Number(item.hours || 0).toFixed(1)}h`, 960, y + 60, 28, '#34d399', 'right', true); });
            if (leader) { card(80, 980, 920, 140, 'rgba(79,70,229,.3)'); label(tr('bestViewer', 'Best viewer'), 120, 1030, 22, '#a5b4fc'); label(leader.username, 120, 1075, 36, '#fff', 'left', true, 650); label(`${Math.round(leader.hours || 0)}h`, 960, 1055, 44, '#c084fc', 'right', true); }
            label(copy('Généré avec JellyTrack pour Jellyfin', 'Generated with JellyTrack for Jellyfin'), 540, 1260, 18, '#64748b', 'center');
            const link = document.createElement('a'); link.download = `jellytrack_rewind_${new Date().toISOString().slice(0, 10)}.png`; link.href = canvas.toDataURL('image/png'); link.click();
            result(copy('Infographie téléchargée.', 'Infographic downloaded.'));
          } catch (error) { result(error.message, true); } finally { button.disabled = false; }
        });
        document.getElementById('btn-post-discord').addEventListener('click', () => {
          Modal.showAction({ title: copy('Diffuser sur Discord', 'Post to Discord'), bodyHtml: `<p>${copy('Envoyer ce récapitulatif sur le canal Discord configuré ?', 'Send this recap to the configured Discord channel?')}</p>`, confirmText: copy('Diffuser', 'Post'), onConfirm: async () => {
            const button = document.getElementById('btn-post-discord'); if (button?.disabled) return false;
            if (button) button.disabled = true;
            try { const response = await API.postJSON('/api/newsletter/discord-post', {}); result(response.message || copy('Bilan diffusé sur Discord !', 'Recap posted to Discord!')); }
            catch (error) { result(error.message, true); return false; }
            finally { if (button && !pageSignal.aborted) button.disabled = false; }
          } });
        });
      } catch (error) {
        if (!pageSignal.aborted) main.innerHTML = `<div class="empty-state" role="alert">${escape(error.message)}</div>`;
      }
    },


    // Historical user interfaces have isolated renderers and scoped styles.
    async users() {
      await window.UsersUI.render(document.getElementById('app-main'), { API, State, Utils, I18n, Router, Toast });
    },

    async userDetail(userId) {
      await window.ProfileUI.render(document.getElementById('app-main'), userId, { API, State, Utils, I18n, Router, Toast, Modal });
    },

    // 9. Wrapped (Annual User Retrospective)
    async wrapped(userId) {
      const main = document.getElementById('app-main');
      const pageSignal = State.pageController.signal;
      const escape = Utils.escapeHtml;
      const copy = (fr, en) => State.locale.startsWith('fr') ? fr : en;
      const t = (key, params = {}) => I18n.t(`wrapped.${key}`, params) || key;
      const search = new URLSearchParams(window.location.search);
      const year = Number(search.get('year')) || new Date().getFullYear();
      const filterType = ['Movies', 'TV', 'Music', 'Books'].includes(search.get('type')) ? search.get('type') : 'general';
      let currentSlide = 0, configOpen = false, timer;
      const cleanup = () => { clearTimeout(timer); document.body.classList.remove('wrapped-active'); };
      State.pageCleanups.push(cleanup);
      main.innerHTML = '<div class="skeleton" style="height:400px;max-width:680px;margin:2rem auto"></div>';
      try {
        const params = new URLSearchParams({ year: String(year) }); if (filterType !== 'general') params.set('type', filterType);
        const data = await API.getJSON(`/api/wrapped/${encodeURIComponent(userId)}?${params}`);
        if (pageSignal.aborted) return;
        document.body.classList.add('wrapped-active');
        const seconds = Number(data.totalSeconds) || 0, hours = Math.round(seconds / 3600);
        const noData = `<p class="wrapped-no-data">${t('noData')}</p>`;
        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayLabel = t(dayKeys[data.peakDay ?? 0]);
        const peakHour = data.totalPlays > 0 ? `${data.peakHour ?? 0}h` : 'N/A';
        const genres = data.topGenres || [], topGenre = genres[0]?.name || t('unknown');
        const duration = value => { const s = Number(value) || 0; return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round(s % 3600 / 60)}m` : `${Math.round(s / 60)}m`; };
        const ranked = items => !items?.length ? noData : `<ol class="wrapped-ranked">${items.slice(0, 5).map((item, index) => `<li><i class="wrapped-rank-bar" aria-hidden="true" style="width:${Math.round(Number(item.seconds ?? Number(item.hours || 0) * 3600) / Math.max(1, Number(items[0].seconds ?? Number(items[0].hours || 0) * 3600)) * 100)}%"></i><b>${index + 1}</b><span>${escape(item.title)}</span><small>${duration(item.seconds ?? Number(item.hours || 0) * 3600)}</small></li>`).join('')}</ol>`;
        const slides = [];
        const add = (title, subtitle, icon, content, theme) => slides.push({ title, subtitle, icon, content, theme });
        add(`JellyTrack Wrapped ${data.year || year}`, t('introSubtitle', { username: data.username }), 'play', `<p>${t('introContent')}</p><button class="btn btn-secondary wrapped-customize" data-wrapped-config>${window.JellyTrackNavigation.icon('filter')} ${t('customize')}</button>`, 'purple');
        add(t('totalTimeTitle'), t('totalTimeSubtitle'), 'clock', `<strong class="wrapped-number">${Utils.formatNumber(hours)}</strong><p>${t('hours')} ${t('streaming')}</p><p>${t('acrossSessions', { count: data.totalPlays || 0 })}</p>`, 'emerald');
        if (hours >= 24) add(t('totalTimeDays', { days: Math.floor(hours / 24), hours: hours % 24 }), t('totalTimeDaysDesc'), 'date', `<div class="wrapped-days-clock" aria-hidden="true"><i></i><span>${window.JellyTrackNavigation.icon("clock")}</span></div>`, 'cyan');
        const monthly = data.monthlyHours || [];
        const maxMonth = Math.max(0, ...monthly.map(item => Number(item.hours) || 0));
        add(t('monthlyTitle'), t('monthlySubtitle'), 'chart', monthly.length ? `<div class="wrapped-months">${monthly.map(item => `<div><span style="height:${maxMonth > 0 ? Math.max(0, Number(item.hours) / maxMonth * 100) : 0}%"><small>${Number(item.hours || 0).toFixed(1)}h</small></span><b>${t(item.name)}</b></div>`).join('')}</div>${maxMonth > 0 ? `<p>${t('bestMonth', { name: t(monthly.find(item => Number(item.hours) === maxMonth)?.name || 'jan'), hours: maxMonth.toFixed(1) })}</p>` : noData}` : noData, 'fuchsia');
        add(t('peakTitle'), t('peakSubtitle'), 'trending', `<strong class="wrapped-number">${peakHour}</strong><p>${data.totalPlays > 0 ? escape(t('peakContent', { bold: '', hour: peakHour, count: data.peakHourSessions ?? data.hourCounts?.[data.peakHour] ?? 0 })) : t('noData')}</p>`, 'orange');
        if (data.topDevice && data.topDevice !== 'N/A') add(t('topDevice'), t('topDeviceDesc', { device: data.topDevice }), 'headphones', `<strong class="wrapped-device">${escape(data.topDevice)}</strong>`, 'amber');
        add(t('genresTitle'), t('genresSubtitle'), 'star', genres.length ? `<p>${t('genreFirst')}</p><strong class="wrapped-device">${escape(topGenre)}</strong><ol class="wrapped-genres">${genres.map(item => `<li><span>${escape(item.name)}</span><div class="wrapped-genre-track"><i style="width:${Math.round(Number(item.count || 0) / Math.max(1, Number(genres[0].count || 0)) * 100)}%"></i></div><small>${item.count || 0}</small></li>`).join('')}</ol>` : noData, 'rose');
        add(t('dayTitle'), t('daySubtitle'), 'date', data.totalPlays > 0 ? `<strong class="wrapped-device">${dayLabel}</strong><p>${t('dayContent')}</p>` : noData, 'amber');
        add(t('pantheonTitle'), t('pantheonSubtitle'), 'star', ranked(data.topMedia || data.topMovies), 'indigo');
        if (data.topSeries?.length) add(t('bingeTitle'), t('bingeSubtitle'), 'tv', ranked(data.topSeries), 'blue');
        if (data.topTracks?.length || data.topMusic?.length) add(t('tracksTitle'), t('tracksSubtitle'), 'music', ranked(data.topTracks || data.topMusic), 'emerald');
        if (data.topArtists?.length) add(t('artistsTitle'), t('artistsSubtitle'), 'headphones', ranked(data.topArtists), 'violet');
        if (data.topAlbums?.length) add(t('albumsTitle'), t('albumsSubtitle'), 'star', ranked(data.topAlbums), 'rose');
        const categoryConfigs = [ ['movies', 'moviesTitle', 'moviesSubtitle', 'moviesLabel', 'film', 'red'], ['series', 'episodesTitle', 'episodesSubtitle', 'episodesLabel', 'tv', 'blue'], ['music', 'musicTitle', 'musicSubtitle', 'musicLabel', 'music', 'green'], ['books', 'booksTitle', 'booksSubtitle', 'booksLabel', 'book', 'yellow'] ];
        categoryConfigs.forEach(([key, title, subtitle, label, icon, theme]) => { const category = data.categories?.[key]; if (category?.totalSeconds > 0) add(t(title), t(subtitle), icon, `<strong class="wrapped-number">${Math.round(category.totalSeconds / 3600)}</strong><p>${t('hours')} ${t('ofLabel', { label: t(label) })}</p>${ranked(category.topMedia)}`, theme); });
        const shareCategories = [['movies', '🎬'], ['series', '📺'], ['music', '🎵'], ['books', '📚']].map(([key, glyph]) => ({ glyph, hours: Math.round(Number(data.categories?.[key]?.totalSeconds || 0) / 3600) })).filter(category => category.hours > 0);
        add(t('shareTitle'), t('shareSubtitle'), 'share', `<div class="wrapped-share-card"><p class="wrapped-share-year">${escape(t('introTitle', { year: data.year || year }))}</p><h3>${escape(data.username)}</h3><p class="wrapped-share-hours">${hours}h ${escape(t('streaming'))}</p><p>${escape(t('genreLabel', { genre: topGenre }))}</p><p>${escape(t('peakLabel', { hour: peakHour }))}</p><p>${escape(t('favDayLabel', { day: dayLabel }))}</p>${shareCategories.length ? `<div class="wrapped-share-categories">${shareCategories.map(category => `<span>${category.glyph} ${category.hours}h</span>`).join('')}</div>` : ''}</div><p class="wrapped-capture-hint">${escape(t('captureScreen'))}</p><button class="btn btn-primary" id="btn-share-wrapped">${copy('Copier le résumé', 'Copy summary')}</button>`, 'share');
        const change = direction => { const next = Math.max(0, Math.min(slides.length - 1, currentSlide + direction)); if (next !== currentSlide) { currentSlide = next; render(); } };
        const schedule = () => { clearTimeout(timer); if (!pageSignal.aborted && !configOpen && !document.hidden && currentSlide < slides.length - 1) timer = setTimeout(() => change(1), 8000); };
        const configuration = () => {
          configOpen = true; clearTimeout(timer);
          const overlay = document.createElement('div'); overlay.className = 'wrapped-config'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', t('customize'));
          const years = data.availableYears?.length ? data.availableYears : [data.year || year];
          overlay.innerHTML = `<button class="btn btn-secondary wrapped-config-close" id="wrapped-config-close" aria-label="${I18n.t('common.close') || copy('Fermer', 'Close')}">${window.JellyTrackNavigation.icon("close")}</button><div><h2>${t('customize')}</h2><label for="wrapped-year">${t('year')}</label><select class="form-input" id="wrapped-year">${years.map(value => `<option value="${value}" ${value === (data.year || year) ? 'selected' : ''}>${value}</option>`).join('')}</select><fieldset><legend>${t('type')}</legend><div class="wrapped-type-buttons">${[['general', 'all'], ['Movies', 'moviesLabel'], ['Music', 'musicLabel'], ['TV', 'tv'], ['Books', 'booksLabel']].map(([value, label]) => `<button class="btn ${filterType === value ? 'btn-primary' : 'btn-secondary'}" data-wrapped-type="${value}" aria-pressed="${filterType === value}">${t(label)}</button>`).join('')}</div></fieldset></div>`;
          main.querySelector('.wrapped-recovery').appendChild(overlay);
          const close = () => { configOpen = false; overlay.remove(); main.querySelector('[data-wrapped-config]')?.focus(); schedule(); };
          overlay.querySelector('#wrapped-config-close').addEventListener('click', close);
          const update = values => { const query = new URLSearchParams(window.location.search); for (const [key, value] of Object.entries(values)) { if (value === 'general') query.delete(key); else query.set(key, value); } Router.navigate(`${window.location.pathname}?${query}`); };
          overlay.querySelector('#wrapped-year').addEventListener('change', event => update({ year: event.target.value }));
          overlay.querySelectorAll('[data-wrapped-type]').forEach(button => button.addEventListener('click', () => update({ type: button.dataset.wrappedType })));
          overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.stopPropagation(); close(); }
            if (event.key === 'Tab') { const focusable = Array.from(overlay.querySelectorAll('button, select')); const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
          });
          overlay.querySelector('#wrapped-config-close').focus();
        };
        const render = () => {
          const slide = slides[currentSlide];
          main.innerHTML = `<section class="wrapped-recovery wrapped-theme-${slide.theme}" aria-label="JellyTrack Wrapped ${data.year || year}">
            <div class="wrapped-progress" aria-label="${currentSlide + 1} / ${slides.length}">${slides.map((_, index) => `<span><i class="${index < currentSlide ? 'complete' : index === currentSlide ? 'playing' : ''}"></i></span>`).join('')}</div>
            <div class="wrapped-touch-zones"><button data-wrap-zone="-1" aria-label="${t('back')}"></button><button data-wrap-zone="1" aria-label="${t('next')}"></button></div>
            <article class="wrapped-slide" aria-live="polite"><span class="wrapped-icon" aria-hidden="true">${window.JellyTrackNavigation.icon(slide.icon)}</span><h2>${escape(slide.subtitle)}</h2><h1>${escape(slide.title)}</h1><div class="wrapped-slide-content">${slide.content}</div></article>
            <nav class="wrapped-controls"><button id="btn-wrap-prev" ${currentSlide === 0 ? 'disabled' : ''}>${window.JellyTrackNavigation.icon("chevronLeft")} ${t('back')}</button><div><span>${data.year || year} • ${escape(filterType === 'general' ? t('all') : filterType)}</span><small>${currentSlide + 1} / ${slides.length}</small><button id="wrapped-config-nav">${t('customize')}</button></div><button id="btn-wrap-next" ${currentSlide === slides.length - 1 ? 'disabled' : ''}>${t('next')} ${window.JellyTrackNavigation.icon("chevronRight")}</button></nav>
          </section>`;
          const close = () => Router.navigate(`/users/${encodeURIComponent(userId)}`);
          document.getElementById('btn-wrap-prev').addEventListener('click', () => change(-1));
          document.getElementById('btn-wrap-next').addEventListener('click', () => change(1));
          main.querySelectorAll('[data-wrap-zone]').forEach(zone => zone.addEventListener('click', () => change(Number(zone.dataset.wrapZone))));
          main.querySelectorAll('[data-wrapped-config], #wrapped-config-nav').forEach(button => button.addEventListener('click', configuration));
          document.getElementById('btn-share-wrapped')?.addEventListener('click', async () => {
            const summary = `JellyTrack Wrapped ${data.year || year} — ${data.username}\n${hours} ${t('hours')} • ${data.totalPlays || 0} ${I18n.t('dashboard.readings')}\n${topGenre} • ${dayLabel}`;
            try { await navigator.clipboard.writeText(summary); Toast.success(copy('Résumé copié !', 'Summary copied!')); } catch (error) { Toast.error(copy('Impossible de copier le résumé.', 'Cannot copy the summary.')); }
          });
          schedule();
        };
        const keyboard = event => { if (configOpen || event.target.closest('input, select, textarea, button')) return; if (event.key === 'ArrowRight') { event.preventDefault(); change(1); } else if (event.key === 'ArrowLeft') { event.preventDefault(); change(-1); } else if (event.key === 'Escape') Router.navigate(`/users/${encodeURIComponent(userId)}`); };
        const visibility = () => { main.querySelector('.wrapped-recovery')?.classList.toggle('wrapped-paused', document.hidden); schedule(); };
        document.addEventListener('keydown', keyboard); document.addEventListener('visibilitychange', visibility);
        State.pageCleanups.push(() => { document.removeEventListener('keydown', keyboard); document.removeEventListener('visibilitychange', visibility); });
        render();
      } catch (error) {
        cleanup(); if (!pageSignal.aborted) main.innerHTML = `<div class="empty-state" role="alert">${escape(error.message)}</div>`;
      }
    },


    mediaNav(active) {
      return window.JellyTrackNavigation.mediaTabs(active);
    },

    async mediaPage(path = window.location.pathname) {
      return window.MediaUI.render(document.getElementById('app-main'), path, {
        API, State, Utils, I18n, Router, Toast, ChartHelper, Modal,
        mediaNav: active => Pages.mediaNav(active),
      });
    },

    // 14. Logs
    async systemLogs() {
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
        ${window.JellyTrackNavigation.settingsTabs(window.location.pathname)}
        <div class="page-header">
          <div>
            <h1 class="page-title">
              <svg style="width:26px;height:26px;color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              ${I18n.t('nav.settings') || 'Paramètres'}
            </h1>
            <p class="page-subtitle">Administration, serveurs, médias, sauvegardes et planificateur.</p>
          </div>
        </div>

        <div id="settings-content" style="margin-top: 1.5rem;">
          <div class="skeleton" style="height: 250px;"></div>
        </div>
      `;

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
                  <div class="stat-card-value">${(servers.servers || []).length}</div>
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
          const { servers = [] } = await API.getJSON('/api/settings/jellyfin-servers');
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
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 1rem;">
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
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 1rem;">
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
                      <b>${Utils.escapeHtml(b.name)}</b>
                      <div style="font-size: 0.78rem; color: var(--muted-foreground);">${Utils.formatDate(b.date)} • ${(b.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <div style="display: flex; gap: 0.4rem;">
                      <a href="/api/backup/auto/download?fileName=${encodeURIComponent(b.name)}" class="btn btn-secondary btn-sm" download>Télécharger</a>
                      <button class="btn btn-outline btn-sm btn-restore-backup" data-id="${Utils.escapeHtml(b.name)}">Restaurer</button>
                      <button class="btn btn-danger btn-sm btn-del-backup" data-id="${Utils.escapeHtml(b.name)}">Supprimer</button>
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
                    await API.postJSON('/api/backup/auto/restore', { fileName: id });
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
                await API.postJSON('/api/backup/auto/delete', { fileName: id });
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
                  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap:1rem;">
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
                  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap:1rem;">
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
        // Historical scheduler presents both sections in one page.

        try {
          const s = await API.getJSON('/api/settings').catch(() => ({}));
          const intervals = s.schedulerIntervals || {
            recentSyncEveryHours: 1,
            fullSyncEveryHours: 24,
            integrityCheckEveryHours: 6,
          };

          container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.25rem; max-width:840px;">
              ${`
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
              `}
              ${`
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

          // Retain existing forms and handlers, in main's tasks -> schedules order.
          const schedules = container.querySelector('#form-scheduler-intervals')?.closest('.card');
          if (schedules) schedules.parentElement.appendChild(schedules);
          window.JellyTrackNavigation.schedulerWrapped(container, s);

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
          <a href="/admin/log-diagnostics" data-link class="admin-tab-link ${active === 'log-health' ? 'active' : ''}">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span>${I18n.t('nav.logHealth') || 'Santé Logs & Moteur'}</span>
          </a>
          <a href="/admin/plugin-diagnostics" data-link class="admin-tab-link ${active === 'plugin-health' ? 'active' : ''}">
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
              if (window.location.pathname === '/admin/health') window.JellyTrackNavigation.healthPage(sub => Pages.health(sub), 'logs');
              else Pages.health('system');
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
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const link = e.target.closest('a[data-link]');
        if (link && link.href && link.target !== '_blank' && !link.hasAttribute('download')) {
          const url = new URL(link.href);
          if (url.origin === window.location.origin) {
            e.preventDefault();
            this.navigate(url.pathname + url.search);
          }
        }
      });

      // Delegate dynamic actions without inline scripts or code evaluation.
      document.body.addEventListener('click', e => {
        const button = e.target.closest('[data-stream-action], [data-canned-message], [data-message-timeout], [data-dismiss], [data-attendance-day]');
        if (!button) return;
        const data = button.dataset;
        if (data.streamAction && State.user?.isAdmin) {
          if (data.streamAction === 'message') window.openSendMessageModal?.(data.sessionId, data.userName, data.mediaTitle, data.serverId);
          if (data.streamAction === 'kill') window.confirmKillStream?.(data.sessionId, data.mediaTitle, data.serverId);
        }
        if (data.cannedMessage !== undefined) {
          const input = document.getElementById('send-msg-text');
          if (input) input.value = data.cannedMessage;
        }
        if (data.messageTimeout) window._setMsgTimeout?.(Number(data.messageTimeout));
        if (data.dismiss) {
          const target = document.getElementById(data.dismiss);
          if (target) target.style.display = 'none';
        }
        if (data.attendanceDay !== undefined) window.openAttendanceDrilldown?.(Number(data.attendanceDay), Number(data.attendanceHour), data.attendanceName, Number(data.attendanceCount));
      });
      document.body.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-attendance-day]')) {
          e.preventDefault();
          e.target.click();
        }
      });
      document.body.addEventListener('error', e => {
        if (e.target.matches?.('img[data-hide-on-error]')) e.target.style.display = 'none';
      }, true);

      window.addEventListener('popstate', () => {
        this.renderCurrent();
      });

      this.renderCurrent();
    },

    navigate(path, replace = false, force = false) {
      if (!force && window.location.pathname + window.location.search === path) return;
      if (replace) {
        window.history.replaceState({}, '', path);
      } else {
        window.history.pushState({}, '', path);
      }
      this.renderCurrent();
    },

    renderCurrent() {
      State.pageController?.abort();
      State.pageCleanups.splice(0).forEach(cleanup => cleanup());
      StreamsPoller.stop();
      Object.keys(ChartHelper.instances).forEach(id => ChartHelper.destroy(id));
      Modal.closeAction();
      State.pageController = new AbortController();
      // Pending pages keep a detached container and cannot replace the next page.
      const oldMain = document.getElementById('app-main');
      if (oldMain) oldMain.replaceWith(oldMain.cloneNode(false));
      const path = window.location.pathname || '/';
      const routeChanged = State.currentPath !== path;
      State.currentPath = path;

      // Parity route aliases & redirects
      if (path === '/settings/analytics') {
        this.navigate('/media/analysis', true);
        return;
      }
      if (path === '/settings') {
        this.navigate('/settings/jellyfin' + window.location.search, true);
        return;
      }
      if (path === '/wrapped') {
        const uid = State.user?.jellyfinUserId || State.user?.id;
        if (uid) {
          this.navigate('/wrapped/' + uid, true);
          return;
        }
      }

      window.JellyTrackNavigation.updateRoute();
      if (routeChanged) window.JellyTrackNavigation.closeMobile();
      window.JellyTrackNavigation.closeSearch(false);

      // Scroll top
      window.scrollTo(0, 0);
      if (routeChanged) document.querySelector('.main-wrapper').scrollTo(0, 0);

      // Auth protection guard
      if (!State.user && path !== '/login' && path !== '/setup/go') {
        this.navigate('/login?callbackUrl=' + encodeURIComponent(path + window.location.search), true);
        return;
      }

      if (path !== '/login') {
        document.body.classList.remove('is-auth-page');
      }

            if (State.user && !State.user.isAdmin && (path === '/' || path === '/users' || path === '/dashboard' || path === '/logs' || path.startsWith('/admin/') || path.startsWith('/settings') || path === '/media/analysis')) {
        const uid = State.user.jellyfinUserId || State.user.id;
        if (uid) this.navigate('/users/' + encodeURIComponent(uid), true);
        else document.getElementById('app-main').innerHTML = '<div class="empty-state">Accès réservé à l’administration.</div>';
        return;
      }

      // Route Dispatcher
      if (path === '/') {
        Pages.dashboard();
      } else if (path === '/login') {
        Pages.login();
      } else if (path === '/setup') {
        this.navigate('/', true);
      } else if (path === '/setup/go') {
        Pages.setup();
      } else if (path === '/about') {
        Pages.about();
      } else if (path === '/recent') {
        Pages.mediaPage(path);
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
      } else if (path === '/media' || path.startsWith('/media/')) {
        Pages.mediaPage(path);
      } else if (path === '/logs') {
        window.JellyTrackHistory.mount({ main: document.getElementById('app-main'), api: API, utils: Utils, i18n: I18n, signal: State.pageController.signal, user: State.user, openSystemLogs: () => Pages.systemLogs() });
      } else if (path.startsWith('/settings')) {
        const rest = path.slice('/settings'.length).replace(/^\//, '');
        const sub = rest || 'overview';
        window.JellyTrackSettings.mount({main:document.getElementById('app-main'),api:API,utils:Utils,i18n:I18n,signal:State.pageController.signal,user:State.user,toast:Toast,navigate:(url,replace=false)=>Router.navigate(url,replace),legacy:page=>Pages.settings(page),cleanup:fn=>State.pageCleanups.push(fn)},sub);
      } else if (path.startsWith('/admin/')) {
        window.JellyTrackAdmin.mount({main:document.getElementById('app-main'),api:API,utils:Utils,i18n:I18n,signal:State.pageController.signal,user:State.user,toast:Toast,navigate:(url,replace=false)=>Router.navigate(url,replace),legacy:{health:sub=>Pages.health(sub),cleanup:()=>Pages.cleanup(),compare:()=>Pages.serverCompare()},cleanup:fn=>State.pageCleanups.push(fn)},path.slice('/admin/'.length));
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
    window.JellyTrackNavigation.init({
      user: () => State.user, context: () => State.navigation, locale: () => State.locale,
      t: (key, params) => I18n.t(key, params), escape: Utils.escapeHtml,
      getJSON: url => API.getJSON(url), postJSON: (url, body) => API.postJSON(url, body),
      navigate: path => Router.navigate(path),
      refreshContext: async () => { State.navigation = await API.getJSON('/api/navigation'); }, changeLocale: locale => I18n.changeLocale(locale),
    });
    Theme.init();
    new MutationObserver(() => window.JellyTrackNavigation.updateTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

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
          window.JellyTrackNavigation.closeSearch(false);
          window.JellyTrackNavigation.updateRoute();
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
        if (sidebar.classList.contains('mobile-open')) window.JellyTrackNavigation.closeMobile();
        else window.JellyTrackNavigation.openMobile();
      });
    }
    if (backdrop && sidebar) {
      backdrop.addEventListener('click', () => {
        window.JellyTrackNavigation.closeMobile();
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

    // 3. Update historical sidebar controls after loading translations.
    window.JellyTrackNavigation.render();

    // 4. Verify user session
    await Auth.checkSession();

    // 5. Mount Router
    Router.init();
  });
})();
