<script lang="ts">
  import type { DashboardLiveContext, DashboardLiveStream } from '../dashboard-live-types';
  let { context }: { context: DashboardLiveContext } = $props();
  let override = $state<DashboardLiveContext | undefined>();
  const current = $derived(override ?? context);
  const colors = ['#a855f7', '#3b82f6', '#10b981', '#f97316', '#ec4899', '#06b6d4', '#eab308'];
  const t = (key: string) => current.t(key);
  const progress = (s: DashboardLiveStream) => Math.round(Math.min(100, Math.max(0, s.progressPercent || 0)));
  const mediaURL = (s: DashboardLiveStream) => `/media/${encodeURIComponent(s.mediaId || s.itemId || '')}?serverId=${encodeURIComponent(s.serverId || '')}`;
  function posterURL(s: DashboardLiveStream): string {
    const posterId = s.posterItemId || s.itemId;
    const params = new URLSearchParams({ itemId: posterId || '', type: 'Primary', maxWidth: '240' });
    if (s.serverId) params.set('serverId', s.serverId);
    if (s.itemId && s.itemId !== posterId) params.set('fallbackId', s.itemId);
    return `/api/jellyfin/image?${params.toString()}`;
  }
  const posterShape = (s: DashboardLiveStream) => ['Audio', 'Track', 'MusicAlbum'].includes(s.mediaType || '') ? 'square' : s.mediaType === 'Episode' ? 'wide' : '';
  const audioSub = (s: DashboardLiveStream) => [
    s.audioCodec ? `🔊 ${s.audioCodec.toUpperCase()}${s.audioLanguage ? ` (${s.audioLanguage})` : ''}` : '',
    s.subtitleCodec ? `💬 ${s.subtitleCodec.toUpperCase()}${s.subtitleLanguage ? ` (${s.subtitleLanguage})` : ''}` : '',
  ].filter(Boolean).join(' • ');
  export function update(next: DashboardLiveContext): void { override = next; }
</script>

{#if current.streams.length === 0}
  <div class="empty-state text-muted-foreground" style="padding:1.5rem;">{t('dashboard.noLiveStreams') || 'Aucun flux actif pour le moment.'}</div>
{:else if current.streams.length >= 3 && !current.forceCardsView}
  <div style="display:flex; flex-direction:column; gap:0.6rem;">
    {#each current.streams as s, idx}
      {@const c = colors[idx % colors.length]}
      {@const pct = progress(s)}
      <div class="live-stream-timeline-row">
        <div class="gantt-avatar" style="background:{c}22; color:{c};">{(s.user || s.username || '?').charAt(0).toUpperCase()}</div>{#if current.multiServer}<span class="badge badge-info">{s.serverName || s.serverId} · {s.serverStatus || 'unknown'}</span>{/if}
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; min-width:0;">
              <span style="font-size:0.82rem; font-weight:700; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{s.user || s.username || 'Utilisateur'}</span>
              {#if s.itemId}
                <a href={mediaURL(s)} style="font-size:0.75rem; color:var(--muted-foreground); text-decoration:none; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" class="hover:underline">{s.mediaTitle || 'Média'}</a>
              {:else}
                <span style="font-size:0.75rem; color:var(--muted-foreground); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{s.mediaTitle || 'Média'}</span>
              {/if}
            </div>
            <div style="display:flex; align-items:center; gap:0.4rem; flex-shrink:0;">
              <span class="badge {s.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}" style="font-size:0.68rem; padding:0.15rem 0.45rem;">{s.playMethod === 'DirectPlay' ? 'DP' : (s.playMethod || t('common.unknown'))}</span>
              {#if s.isPaused}<span style="font-size:0.75rem; color:#f59e0b;">⏸</span>{/if}
              <span style="font-size:0.75rem; color:var(--muted-foreground);">{pct}%</span>
              <button class="btn btn-secondary btn-sm" style="padding:0.2rem 0.45rem; font-size:0.72rem;" data-stream-action="message" data-session-id={s.sessionId} data-server-id={s.serverId || ''} data-user-name={s.user || s.username || ''} data-media-title={s.mediaTitle || ''} title="Envoyer un message">💬</button>
              {#if current.isAdmin}<button class="btn btn-danger btn-sm" style="padding:0.2rem 0.45rem; font-size:0.72rem;" data-stream-action="kill" data-session-id={s.sessionId} data-server-id={s.serverId || ''} data-media-title={s.mediaTitle || ''} title="Couper le flux">✕</button>{/if}
            </div>
          </div>
          <div class="gantt-track"><div class="gantt-fill" style="width:{pct}%; background:{s.isPaused ? '#f59e0b' : c};"></div></div>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div style="display:flex; flex-direction:column; gap:0.75rem;">
    {#each current.streams as s}
      {@const pct = progress(s)}
      {@const audio = audioSub(s)}
      <div class="stream-card">
        <a href={mediaURL(s)} data-link class="stream-poster-thumb {posterShape(s)}">
          {#if s.posterItemId || s.itemId}<img src={posterURL(s)} style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" data-hide-on-error alt={s.mediaTitle || ''}>{/if}
        </a>
        <div class="stream-info">
          <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
            <a href={mediaURL(s)} data-link class="stream-title">{s.mediaTitle || t('common.unknownMedia')}</a>{#if current.multiServer}<span class="badge badge-info">{s.serverName || s.serverId} · {s.serverStatus || 'unknown'}</span>{/if}
            {#if s.versionName}<span class="badge badge-info" style="font-size:0.65rem;">{s.versionName}</span>{/if}
            {#if s.isPaused}<span class="badge badge-warning" style="font-size:0.65rem;">⏸ En pause</span>{/if}
          </div>
          {#if s.seriesName || s.seasonName}<div style="font-size:0.75rem; color:var(--muted-foreground);">{s.seriesName || ''} {s.seasonName || ''}</div>{/if}
          <div class="stream-details">
            <span>👤 {s.user || s.username || 'Utilisateur'}</span>
            <span>📱 {s.device || s.clientName || 'Lecteur'}</span>
            {#if s.city || s.country}<span>📍 {s.city || ''}{s.country ? `, ${s.country}` : ''}</span>{/if}
            <span class="badge {s.playMethod === 'DirectPlay' ? 'badge-success' : 'badge-warning'}">{s.playMethod || 'Stream'}</span>
          </div>
          {#if audio}<div style="font-size:0.72rem; color:var(--muted-foreground); margin-top:0.15rem;">{audio}</div>{/if}
          <div class="stream-progress-bar"><div class="stream-progress-fill" style="width: {pct}%;"></div></div>
        </div>
        <div style="display:flex; flex-direction:column; gap:0.35rem; align-items:flex-end;">
          <button class="btn btn-secondary btn-sm" data-stream-action="message" data-session-id={s.sessionId} data-server-id={s.serverId || ''} data-user-name={s.user || s.username || ''} data-media-title={s.mediaTitle || ''} title="Envoyer un pop-up à l'écran">💬 Message</button>
          {#if current.isAdmin}<button class="btn btn-danger btn-sm" data-stream-action="kill" data-session-id={s.sessionId} data-server-id={s.serverId || ''} data-media-title={s.mediaTitle || ''} title="Couper la session">{t('dashboard.killStream') || 'Arrêter'}</button>{/if}
        </div>
      </div>
    {/each}
  </div>
{/if}
