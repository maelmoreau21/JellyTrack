<script lang="ts">
  import type { DashboardHealthContext } from '../dashboard-status-types';
  let { context }: { context: DashboardHealthContext } = $props();
  let override = $state<DashboardHealthContext | undefined>();
  const current = $derived(override ?? context);
  const health = $derived(current.health);
  const isErr = $derived(health.status?.monitor?.status === 'error');
  const never = $derived(current.t('common.never') || (current.locale === 'en' ? 'Never' : 'Jamais'));
  const lastPoll = $derived(current.timeAgo(health.status?.monitor?.lastPollAt) || never);
  const lastSync = $derived(current.timeAgo(health.status?.sync?.lastSuccessAt) || never);
  const lastBackup = $derived(current.timeAgo(health.status?.backup?.lastSuccessAt) || never);
  const counts = $derived(health.counts || { activeStreams: 0, openPlaybackOrphans: 0, dbStreamsWithoutValkey: 0 });
  const excludedCount = $derived((health.excludedLibraries || []).length);
  const t = (key: string) => current.t(key);
  export function update(next: DashboardHealthContext): void { override = next; }
</script>
            <div class="system-health-bar">
              <div class="app-chip {isErr ? 'app-chip-error' : 'app-chip-success'}">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span>{t('dashboard.monitor')} {isErr ? t('dashboard.monitorError') : t('dashboard.monitorActive')}</span>
              </div>
              <div class="app-chip">
                <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>{t('dashboard.lastPoll')}: {lastPoll}</span>
              </div>
              <div class="app-chip">
                <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                <span>{t('dashboard.lastSync')}: {lastSync}</span>
              </div>
              <div class="app-chip">
                <svg class="nav-icon text-emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                <span>{t('dashboard.lastBackup')}: {lastBackup}</span>
              </div>
            </div>

            <div class={health.isValkeyEnabled === false ? "stat-grid" : "stat-grid-4"} style="margin-bottom:1rem;">
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">{t('dashboard.activeStreams') || 'Flux actifs'}</span>
                  {@html current.icon("checkCircle")}
                </div>
                <div class="stat-num metric-glow-emerald">{counts.activeStreams}</div>
                <div class="stat-desc">Sessions suivies</div>
              </div>
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">{t('dashboard.openPlaybackOrphans') || 'Lectures orphelines ouvertes'}</span>
                  <svg class="nav-icon text-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="stat-num metric-glow-amber">{counts.openPlaybackOrphans}</div>
                <div class="stat-desc">Playback sans fermeture</div>
              </div>{#if health.isValkeyEnabled !== false}
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">{t('dashboard.dbWithoutValkey') || 'Flux DB sans cache'}</span>
                  <svg class="nav-icon text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div class="stat-num metric-glow-cyan">{counts.dbStreamsWithoutValkey}</div>
                <div class="stat-desc">Fallback base de données</div>
              </div>
              {/if}
              <div class="stat-card-modern">
                <div class="stat-header">
                  <span class="stat-title">{t('dashboard.excludedLibraries') || 'Bibliothèques exclues'}</span>
                  <svg class="nav-icon text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 3 18 18M4 7h3m4 0h9M4 12h16M4 17h11"/></svg>
                </div>
                <div class="stat-num metric-glow-violet">{excludedCount}</div>
                <div class="stat-desc">Filtres actifs</div>
              </div>
            </div>
