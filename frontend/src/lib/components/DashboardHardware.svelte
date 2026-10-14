<script lang="ts">
  import type { DashboardHardwareContext } from '../dashboard-status-types';
  let { context }: { context: DashboardHardwareContext } = $props();
  let override = $state<DashboardHardwareContext | undefined>();
  const current = $derived(override ?? context);
  const hw = $derived(current.hardware);
  const t = (key: string) => current.t(key);
  export function update(next: DashboardHardwareContext): void { override = next; }
</script>
{#if hw.cpu}
            <div class="hardware-bar">
              <div class="hardware-card">
                <div class="hardware-icon-box" style="background:rgba(59, 130, 246, 0.1); color:#3b82f6;">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9"/><path d="M15 2v2M9 2v2M20 15h2M20 9h2M9 20v2M15 20v2M2 9h2M2 15h2"/></svg>
                </div>
                <div>
                  <div style="font-size:0.75rem; color:var(--muted-foreground);">{t('hardware.cpuUsage') || 'Processeur (CPU)'}</div>
                  <div class="metric-glow-blue" style="font-size:1.35rem; font-weight:800;">{hw.cpu.usagePercent == null ? 'N/A' : `${hw.cpu.usagePercent}%`}</div>
                </div>
              </div>
              <div class="hardware-card">
                <div class="hardware-icon-box" style="background:rgba(168, 85, 247, 0.1); color:#a855f7;">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M6 8V5M10 8V5M14 8V5M18 8V5"/><rect width="20" height="8" x="2" y="8" rx="2"/></svg>
                </div>
                <div>
                  <div style="font-size:0.75rem; color:var(--muted-foreground);">Mémoire Go (tas alloué)</div>
                  <div class="metric-glow-violet" style="font-size:1.35rem; font-weight:800;">{Number(hw.memory?.allocMb || 0).toFixed(1)} MiB</div>
                </div>
              </div>
              <div class="hardware-card">
                <div class="hardware-icon-box" style="background:rgba(244, 63, 94, 0.1); color:#f43f5e;">
                  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>
                </div>
                <div>
                  <div style="font-size:0.75rem; color:var(--muted-foreground);">{t('hardware.temperature') || 'Température Système'}</div>
                  <div class="metric-glow-amber" style="font-size:1.35rem; font-weight:800;">{hw.temperature && (hw.temperature.main ?? 0) > 0 ? `${hw.temperature.main}°C` : 'N/A'}</div>
                </div>
              </div>
            </div>
          
{/if}
