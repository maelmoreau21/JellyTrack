<script lang="ts">
  import type { DashboardKpiContext } from '../dashboard-kpi-types';
  let { context }: { context: DashboardKpiContext } = $props();
  let override = $state<DashboardKpiContext | undefined>();
  const current = $derived(override ?? context);
  const d = $derived(current.data);
  const activeStreamsCount = $derived(current.activeStreamsCount);
  const currentTimeRange = $derived(current.currentTimeRange);
  const locale = $derived(current.locale);
  const t = (key: string) => current.t(key);
  const icon = (name: string) => current.icon(name);
  const formatNumber = (value: number) => current.formatNumber(value);
  const historyURL = () => current.historyURL();
  export function update(next: DashboardKpiContext): void { override = next; }
</script>

            <div class="stat-grid-5">
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">{t('dashboard.activeStreams') || 'Flux actifs'}</span>
                  {@html icon("activity")}
                </div>
                <div class="stat-num metric-glow-emerald" id="dash-active-streams">{activeStreamsCount || 0}</div>
                <div class="stat-desc">{t('dashboard.managedByServer') || 'Géré par le serveur'}</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">{t('dashboard.totalPlays') || 'Lectures totales'}</span>
                  {@html icon("playCircle")}
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div class="stat-num metric-glow-cyan">{formatNumber(d.totalPlays || d.views || 0)}</div>
                  {#if d.playsGrowth !== undefined && d.playsGrowth !== 0}
                    <span class="badge {d.playsGrowth >= 0 ? 'badge-success' : 'badge-danger'}" style="font-size:0.7rem;">
                      {d.playsGrowth > 0 ? '+' : ''}{d.playsGrowth.toFixed(1)}%
                    </span>
                  {/if}
                </div>
                <div class="stat-desc">{(d.previousPlays ?? 0) > 0 ? `vs ${d.previousPlays} période préc.` : 'Période sélectionnée'}</div>
              </div>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">{t('dashboard.directPlay') || 'Direct Play'}</span>
                  <svg class="nav-icon text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="15" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/></svg>
                </div>
                <div class="stat-num metric-glow-violet">{d.directPlayPercent || 0}%<span style="font-size:0.8rem; font-weight:400; margin-left:0.25rem;">DP</span></div>
                <div class="stat-desc">{t('dashboard.directPlayDesc') || 'Taux de lecture native sans ré-encodage'}</div>
              </div>

              <a href="{historyURL()}" data-link class="stat-card-modern" style="text-decoration:none; color:inherit;">
                <div class="stat-header">
                  <span class="stat-title">{t('dashboard.globalTime') || 'Temps de visionnage'}</span>
                  <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div class="stat-num metric-glow-amber">{formatNumber(d.hoursWatched || Math.round((d.durationMs || 0) / 3600000))}h</div>
                  {#if d.hoursGrowth !== undefined && d.hoursGrowth !== 0}
                    <span class="badge {d.hoursGrowth >= 0 ? 'badge-success' : 'badge-danger'}" style="font-size:0.7rem;">
                      {d.hoursGrowth > 0 ? '+' : ''}{d.hoursGrowth.toFixed(1)}%
                    </span>
                  {/if}
                </div>
                <div class="stat-desc">{(d.previousHoursWatched ?? 0) > 0 ? `vs ${d.previousHoursWatched}h période préc.` : 'Total cumulé'}</div>
              </a>

              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">{t('dashboard.activeUsersTitle')}</span>
                  <svg class="nav-icon text-pink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div class="stat-num metric-glow-emerald">{formatNumber(d.currentActiveUsers ?? 0)}</div>
                  {#if d.activeUsersGrowth !== undefined && d.activeUsersGrowth !== 0}
                    <span class="badge {d.activeUsersGrowth >= 0 ? 'badge-success' : 'badge-danger'}" style="font-size:0.7rem;">
                      {d.activeUsersGrowth > 0 ? '+' : ''}{d.activeUsersGrowth.toFixed(1)}%
                    </span>
                  {/if}
                </div>
                <div class="stat-desc">{currentTimeRange !== 'all' && (d.previousActiveUsers ?? 0) > 0 ? (locale === 'en' ? `vs ${d.previousActiveUsers} previous period` : `vs ${d.previousActiveUsers} période préc.`) : (locale === 'en' ? `Out of ${d.totalUsers ?? d.users ?? 0} registered` : `Sur ${d.totalUsers ?? d.users ?? 0} inscrits`)}</div>
              </div>
            </div>
          