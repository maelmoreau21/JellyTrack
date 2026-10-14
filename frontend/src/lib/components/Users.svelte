<script lang="ts">
 import { onMount, tick, untrack } from 'svelte';
 import type { UsersContext, UserSummary } from '../users-types';
 import UserIcon from './UserIcon.svelte';
 let { context }: { context: UsersContext } = $props();
 const signal = untrack(() => context.State.pageController.signal);
 const now = Date.now(), pageSize = 25;
 let disposed = false;
 let users = $state<UserSummary[]>([]), search = $state(''), filterType = $state('all'), page = $state(1);
 let loading = $state(true), busy = $state(false), deleting = $state(false), error = $state(''), actionError = $state('');
 let selected = $state<UserSummary | null>(null), deleteError = $state('');
 let pruneResult = $state<{ totalPruned?: number; prunedUsers?: string[] } | null>(null);
 let modal: HTMLDialogElement;
 const alive = () => !disposed && !signal.aborted;
 const t = (key: string, fallback: string) => context.I18n.t(key) || fallback;
 const title = $derived(t('users.title', 'Utilisateurs'));
 const filtered = $derived(users.filter(u => {
  const query = search.toLowerCase().trim();
  if (query && !u.username.toLowerCase().includes(query) && !u.favoriteClient.toLowerCase().includes(query)) return false;
  const elapsed = now - (u.lastActive ? new Date(u.lastActive).getTime() : 0);
  if (filterType === 'inactive30') return !u.lastActive || elapsed > 30 * 86400000;
  if (filterType === 'inactive90') return !u.lastActive || elapsed > 90 * 86400000;
  if (filterType === 'transcoders') return u.transcodeRatio >= 40 && u.sessionsCount >= 3;
  if (filterType === 'never') return u.sessionsCount === 0 || !u.lastActive;
  return true;
 }));
 const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
 const currentPage = $derived(Math.min(page, totalPages));
 const rows = $derived(filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize));
 function initials(u: UserSummary) { return u.username.split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() || '').join('') || u.username.slice(0, 2).toUpperCase(); }
 function lastActive(value: string | null) { return value ? new Date(value).toLocaleDateString(context.State.locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Jamais'; }
 function imageError(event: Event) { const image = event.currentTarget as HTMLImageElement; image.hidden = true; image.parentElement?.classList.add('users-avatar-fallback'); }
 async function load() {
  const items: Partial<UserSummary>[] = []; let offset = 0;
  while (true) {
   const data = await context.API.getJSON(`/api/users?${new URLSearchParams(location.search)}&limit=200&offset=${offset}`);
   if (!alive()) return;
   const batch = Array.isArray(data.items) ? data.items : Array.isArray(data.users) ? data.users : [];
   items.push(...batch); offset += batch.length;
   if (batch.length < 200 || (Number.isFinite(Number(data.total)) && offset >= Number(data.total))) break;
  }
  users = items.map(u => ({
   id: String(u.id || ''), serverId: String(u.serverId || ''), jellyfinUserId: String(u.jellyfinUserId || ''), username: String(u.username || 'Utilisateur inconnu'),
   totalHours: Number.isFinite(Number(u.totalHours)) ? Number(Number(u.totalHours).toFixed(1)) : 0,
   sessionsCount: Number(u.sessionsCount) || 0, lastActive: u.lastActive && Number.isFinite(new Date(u.lastActive).getTime()) ? u.lastActive : null,
   favoriteClient: String(u.favoriteClient || 'Inconnu'), transcodeCount: Number(u.transcodeCount) || 0,
   directPlayCount: Number(u.directPlayCount) || 0, transcodeRatio: Math.max(0, Math.min(100, Math.round(Number(u.transcodeRatio) || 0)))
  })).sort((a,b) => b.totalHours - a.totalHours);
  loading = false; error = '';
 }
 async function retry() {
  loading = true; error = '';
  try { await load(); } catch (err) { if (alive()) { loading = false; error = err instanceof Error ? err.message : 'Erreur de chargement'; } }
 }
 async function openDelete(user: UserSummary) { selected = user; pruneResult = null; deleteError = ''; actionError = ''; await tick(); if (alive() && !modal.open) modal.showModal(); }
 async function confirmDelete() {
  if (deleting || !selected) return; deleting = true;
  try { await context.API.delete(`/api/admin/users/${encodeURIComponent(selected.id)}`); if (!alive()) return; modal.close(); await load(); }
  catch (err) { if (alive()) deleteError = err instanceof Error ? err.message : 'Erreur lors de la suppression'; }
  finally { if (alive()) deleting = false; }
 }
 async function prune() {
  if (busy) return; busy = true; actionError = '';
  try {
   const data = await context.API.postJSON('/api/admin/users/sync-deleted', {}); if (!alive()) return;
   pruneResult = data.result || data; selected = null; await tick(); if (!modal.open) modal.showModal(); await load();
  } catch (err) { if (alive()) actionError = err instanceof Error ? err.message : 'Erreur lors de la synchronisation'; }
  finally { if (alive()) busy = false; }
 }
 function closeModal() { if (!deleting) modal.close(); }
 function backdrop(event: MouseEvent) { if (!deleting && event.target === modal) { const rect = modal.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close(); } }
 function csvCell(value: unknown) { const raw = value == null ? '' : String(value), safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? "'" + raw : raw, escaped = safe.replace(/"/g, '""'); return /[",\r\n]/.test(escaped) ? '"' + escaped + '"' : escaped; }
 function download(contents: string, type: string, extension: string) {
  const url = URL.createObjectURL(new Blob([contents], { type })); const link = document.createElement('a'); link.href = url; link.download = `jellytrack_users_${new Date().toISOString().slice(0,10)}.${extension}`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
 }
 function exportCSV() {
  const headers = ['Rank','Username','JellyfinUserId','TotalHours','SessionsCount','TranscodeCount','DirectPlayCount','TranscodeRatioPct','FavoriteClient','LastActive'];
  const values = filtered.map((u,i) => [i+1,u.username,u.jellyfinUserId,u.totalHours,u.sessionsCount,u.transcodeCount,u.directPlayCount,`${u.transcodeRatio}%`,u.favoriteClient,u.lastActive || 'Never']);
  download([headers.join(','),...values.map(row => row.map(csvCell).join(','))].join('\n'),'text/csv;charset=utf-8;','csv');
 }
 onMount(() => { if (!context.State.user?.isAdmin) { void context.Router.navigate('/login'); return; } void retry(); return () => { disposed = true; if (modal.open) modal.close(); }; });
</script>

<section class="users-reference" aria-label={title}>
 <div class="users-toolbar"><div class="users-search"><UserIcon name="search"/><input id="users-search" type="search" placeholder="Filtrer par nom ou client..." aria-label="Filtrer par nom ou client" autocomplete="off" disabled={loading || !!error} bind:value={search} oninput={() => page = 1}></div><div class="users-actions">
  <button type="button" class="users-button users-prune" id="users-prune" title="Détecter et supprimer les utilisateurs qui n'existent plus dans Jellyfin" disabled={loading || !!error || busy} onclick={prune}><UserIcon name={busy ? 'loader' : 'refresh'} className={busy ? 'users-spin' : ''}/><span>Purger supprimés</span></button>
  <button type="button" class="users-button" id="users-export-csv" disabled={loading || !!error} onclick={exportCSV}><UserIcon name="download"/><span>Export CSV</span></button><button type="button" class="users-button" id="users-export-json" disabled={loading || !!error} onclick={() => download(JSON.stringify(filtered,null,2),'application/json','json')}><UserIcon name="download"/><span>Export JSON</span></button>
 </div></div>
 <div class="users-filters" role="group" aria-label="Filtres utilisateurs"><span class="users-filter-label"><UserIcon name="filter"/> Filtres :</span>
  {#each [['all','',`Tous (${users.length})`],['inactive30','moon','Inactifs > 30 jours'],['inactive90','userX','Inactifs > 90 jours'],['transcoders','flame','Gros Transcodeurs (≥40%)'],['never','','Sans activité (0h)']] as [value,glyph,label]}<button type="button" class="users-filter {filterType === value ? 'is-active' : ''}" data-filter={value} aria-pressed={filterType === value} disabled={loading || !!error} onclick={() => { filterType = value; page = 1; }}>{#if glyph}<UserIcon name={glyph}/>{/if}{label}</button>{/each}
 </div>
 <div id="users-action-error" class="users-action-error" role="alert" hidden={!actionError}>{actionError}</div>
 <div class="users-table-card"><header class="users-card-header"><div><h1><UserIcon name="users"/>{title}</h1><p id="users-count" aria-live="polite">{loading ? 'Chargement des utilisateurs…' : error ? 'Impossible de charger les utilisateurs' : `${filtered.length} utilisateur${filtered.length > 1 ? 's' : ''} trouvé${filtered.length > 1 ? 's' : ''}`}</p></div></header>
  <div class="users-card-content"><div class="users-table-scroll"><table class="users-table" aria-label={title}><thead><tr><th scope="col" class="users-rank">#</th><th scope="col">{t('users.colUser','Utilisateur')}</th><th scope="col" class="users-right">Temps regardé</th><th scope="col" class="users-right">Sessions</th><th scope="col" class="users-center">Mode de flux</th><th scope="col">Client favori</th><th scope="col" class="users-right">{t('users.colLastActive','Dernière Act.')}</th><th scope="col" class="users-right users-actions-column">Actions</th></tr></thead>
   <tbody id="users-body" aria-busy={loading}>
    {#if loading}{#each Array(8) as _}<tr class="users-loading-row"><td colspan="8"><div class="skeleton"></div></td></tr>{/each}
    {:else if error}<tr><td colspan="8" class="users-empty"><span role="alert">{error}</span><button type="button" class="users-button" id="users-retry" onclick={retry}>Réessayer</button></td></tr>
    {:else}{#each rows as u,index}<tr>
     <td class="users-rank">{(currentPage-1)*pageSize+index+1}</td><td><div class="users-identity"><a class="users-profile-link" href={'/users/'+encodeURIComponent(u.id)+(u.serverId?'?serverId='+encodeURIComponent(u.serverId):'')} data-link><span class="users-avatar"><span>{initials(u)}</span><img src={'/api/jellyfin/user-image?userId='+encodeURIComponent(u.jellyfinUserId||u.id)+'&fallback=none'+(u.serverId?'&serverId='+encodeURIComponent(u.serverId):'')} alt={u.username} width="28" height="28" loading="lazy" onerror={imageError}></span><span>{u.username}</span></a>{#if u.jellyfinUserId.startsWith('oidc-')}<span class="users-orphan">SSO Orphelin</span>{/if}</div></td>
     <td class="users-right users-hours"><strong>{u.totalHours}</strong> h</td><td class="users-right users-muted">{u.sessionsCount}</td><td class="users-center">{#if u.sessionsCount > 0}<div class="users-stream-mode"><span class="users-direct" title="DirectPlay">{100-u.transcodeRatio}% DP</span><span class="users-muted">/</span><span class={u.transcodeRatio>=50?'users-transcode':'users-muted'} title="Transcode">{u.transcodeRatio}% TC</span></div>{:else}<span class="users-muted users-small">-</span>{/if}</td>
     <td><span class="users-client"><UserIcon name="monitor"/><span title={u.favoriteClient}>{u.favoriteClient}</span></span></td><td class="users-right users-last-active">{#if u.lastActive}{lastActive(u.lastActive)}{:else}<span class="users-never">Jamais</span>{/if}</td><td class="users-right"><button type="button" class="users-delete" data-user-id={u.id} title="Supprimer cet utilisateur de JellyTrack" aria-label={'Supprimer '+u.username+' de JellyTrack'} onclick={() => openDelete(u)}><UserIcon name="trash"/></button></td>
    </tr>{:else}<tr><td colspan="8" class="users-empty">Aucun utilisateur ne correspond à ce filtre.</td></tr>{/each}{/if}
   </tbody></table></div>
   <div id="users-pagination" class:users-pagination={!loading && !error} hidden={loading || !!error || totalPages<=1}>{#if !loading && !error}<div>Page <strong>{currentPage}</strong> sur <strong>{totalPages}</strong> ({filtered.length} total)</div><div class="users-pagination-actions"><button type="button" class="users-button" id="users-previous" disabled={currentPage<=1} onclick={() => page=Math.max(1,currentPage-1)}><UserIcon name="left"/>{t('common.previous','Précédent')}</button><button type="button" class="users-button" id="users-next" disabled={currentPage>=totalPages} onclick={() => page=Math.min(totalPages,currentPage+1)}>{t('common.next','Suivant')}<UserIcon name="right"/></button></div>{/if}</div>
  </div>
 </div>
 <dialog class="users-dialog" aria-labelledby="users-dialog-title" bind:this={modal} oncancel={event => { if(deleting)event.preventDefault(); }} onclick={backdrop}><button type="button" class="users-dialog-close" aria-label="Fermer" disabled={deleting} onclick={closeModal}><UserIcon name="close"/></button><div id="users-dialog-content">
  {#if selected}<header><h2 id="users-dialog-title" class="users-danger"><UserIcon name="trash"/>Supprimer l'utilisateur de JellyTrack</h2><p>Êtes-vous certain de vouloir supprimer <strong>{selected.username}</strong> de JellyTrack ?</p></header><div class="users-dialog-body"><p>Cette action supprimera définitivement tout l'historique de lecture, les flux en direct et les données associées à cet utilisateur dans JellyTrack.</p><div class="users-warning">⚠️ Si cet utilisateur existe encore dans Jellyfin, il sera automatiquement recréé lors de la prochaine synchronisation. Supprimez-le d'abord de Jellyfin si vous souhaitez le retirer définitivement.</div><p class="users-danger users-small" id="users-delete-error" role="alert" hidden={!deleteError}>{deleteError}</p></div><footer><button type="button" class="users-button" data-dialog-close disabled={deleting} onclick={closeModal}>Annuler</button><button type="button" class="users-button users-button-danger" id="users-confirm-delete" disabled={deleting} onclick={confirmDelete}><UserIcon name={deleting?'loader':'trash'} className={deleting?'users-spin':''}/><span>{deleting?'Suppression…':'Supprimer définitivement'}</span></button></footer>
  {:else if pruneResult}<header><h2 id="users-dialog-title"><UserIcon name="check" className="users-green"/>Nettoyage des utilisateurs Jellyfin</h2><p>Synchronisation avec vos serveurs Jellyfin terminée.</p></header><div class="users-dialog-body">{#if Number(pruneResult.totalPruned)>0}<p class="users-green">{pruneResult.totalPruned} utilisateur{Number(pruneResult.totalPruned)>1?'s':''} supprimé{Number(pruneResult.totalPruned)>1?'s':''} de JellyTrack car absent{Number(pruneResult.totalPruned)>1?'s':''} de Jellyfin :</p><ul class="users-pruned-list">{#each pruneResult.prunedUsers||[] as name}<li>{name}</li>{/each}</ul>{:else}<p class="users-small">Aucun utilisateur orphelin trouvé. Tous les utilisateurs présents dans JellyTrack existent bien sur vos serveurs Jellyfin.</p>{/if}</div><footer><button type="button" class="users-button users-button-primary" data-dialog-close onclick={closeModal}>Fermer</button></footer>{/if}
 </div></dialog>
</section>
