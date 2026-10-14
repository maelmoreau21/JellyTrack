<script lang="ts">
  import type { DashboardFrameProps } from '../dashboard-types';
  let { t, locale }: DashboardFrameProps = $props();
  let todayPlays = $state<number | string>(0);
  let todayHours = $state('0h');
  let todayUsers = $state<number | string>(0);
  export function setToday(plays: number | string, hours: string, users: number | string): void {
    todayPlays = plays;
    todayHours = hours;
    todayUsers = users;
  }
</script>
        <div class="page-header dashboard-header">
          <div class="page-header-left">
            <h1 class="page-title">{t('dashboard.title') || 'Tableau de bord'}</h1>
            <div class="header-filter-bar" id="dash-media-filter">
              <button class="header-filter-btn active" data-type="">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                <span>{t('common.all') || 'Tous'}</span>
              </button>
              <button class="header-filter-btn" data-type="Movie">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/></svg>
                <span>{t('media.movies') || 'Films'}</span>
              </button>
              <button class="header-filter-btn" data-type="Series">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="15" x="2" y="7" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
                <span>{t('media.series') || 'Séries'}</span>
              </button>
              <button class="header-filter-btn" data-type="Audio">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <span>{t('media.music') || 'Musique'}</span>
              </button>
              <button class="header-filter-btn" data-type="Book">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                <span>{t('media.books') || 'Livres'}</span>
              </button>
            </div>
            <div id="dash-server-filter-container" class="header-filter-bar" style="display:none;"></div>
          </div>
          <div class="page-header-right">
            <select id="dash-time-select" class="form-input" aria-label={String(t('timeRange.period'))}>
              <option value="1d">{t('timeRange.last24h')}</option>
              <option value="7d">{t('timeRange.last7d')}</option>
              <option value="30d">{t('timeRange.last30d')}</option>
              <option value="all">{t('timeRange.allTime')}</option>
              <option value="custom">{t('timeRange.custom')}</option>
              <option value="90d">{t('timeRange.90d') || '90j'}</option>
              <option value="365d">{locale === 'en' ? '1 year' : '1 an'}</option>
            </select>
            <div class="time-pills-bar hidden" id="dash-time-range">
              <button class="time-pill-btn" data-range="1d">24h</button>
              <button class="time-pill-btn active" data-range="7d">7j</button>
              <button class="time-pill-btn" data-range="30d">30j</button>
              <button class="time-pill-btn" data-range="90d">90j</button>
              <button class="time-pill-btn" data-range="365d">1 an</button>
              <button class="time-pill-btn" data-range="all">{t('common.all') || 'Tout'}</button>
              <button class="time-pill-btn" data-range="custom">{t('timeRange.custom') || 'Dates personnalisées'}</button>
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
            <span>{t('dashboard.today') || "Aujourd'hui"}</span>
          </div>
          <div class="banner-metrics-group">
            <div class="banner-metric-item">
              <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
              <span class="banner-metric-val metric-glow-blue" id="today-plays-val">{todayPlays}</span>
              <span class="banner-metric-label">{t('dashboard.readings') || 'lectures'}</span>
            </div>
            <div class="banner-metric-item">
              <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span class="banner-metric-val metric-glow-amber" id="today-hours-val">{todayHours}</span>
              <span class="banner-metric-label">{t('dashboard.watched') || 'regardées'}</span>
            </div>
            <div class="banner-metric-item">
              <svg class="nav-icon text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span class="banner-metric-val metric-glow-emerald" id="today-users-val">{todayUsers}</span>
              <span class="banner-metric-label">{t('dashboard.activeUsers') || 'utilisateurs actifs'}</span>
            </div>
          </div>
        </div>

        <!-- Dashboard Navigation Tabs -->
        <div class="dashboard-tablist" id="dashboard-tablist">
          <button class="dash-tab-btn active" data-tab="overview">{t('dashboard.overviewTab') || "Vue d'ensemble"}</button>
          <button class="dash-tab-btn" data-tab="analytics">{t('dashboard.detailedTab') || "Analyses approfondies"}</button>
          <button class="dash-tab-btn" data-tab="network">{t('dashboard.networkTab') || "Réseau"}</button>
        </div>

        <!-- Tab 1: Overview Tab Content -->
        <div id="tab-content-overview">
          <div class="draggable-toolbar">
            <button class="btn btn-secondary btn-sm" id="btn-toggle-draggable-edit">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
              <span id="draggable-edit-label">{t('draggable.editOrder') || "Modifier l'ordre"}</span>
            </button>
          </div>

          <div class="draggable-dashboard" id="dash-draggable-container"></div>

          <!-- Predictions Panel at the bottom of Overview -->
          <div id="dash-predictions-container" style="margin-top: 1.5rem;"></div>
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
      
