<script lang="ts">
  import { onMount } from 'svelte';
  import type { BackupContext, BackupEntry } from '../backup-types';
  import type { ApiRequestOptions } from '../runtime/api';

  let { context }: { context: BackupContext } = $props();
  let backups = $state<BackupEntry[]>([]);
  let loading = $state(true);
  let busy = $state(false);
  let failedLoad = $state(false);
  let feedback = $state<{ text: string; error?: boolean } | null>(null);
  let files = $state<FileList>();
  let disposed = false;
  let generation = 0;
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  const downloadTimers = new Map<ReturnType<typeof setTimeout>, string>();
  const alive = () => !disposed && !context.signal?.aborted;
  const t = (key: string) => context.i18n.t(key) || key.split('.').pop() || key;
  const s = (key: string) => t('settings.' + key);
  const size = (backup: BackupEntry) => Number(backup.sizeMb ?? Number(backup.size || 0) / 1048576);
  const totalSize = $derived(backups.reduce((total, entry) => total + size(entry), 0).toFixed(2));
  const date = (value: string) => {
    try { return value ? new Date(value).toLocaleString(context.i18n.locale || document.documentElement.lang || undefined) : '—'; }
    catch { return '—'; }
  };

  async function load() {
    const current = ++generation;
    const data = await context.api.getJSON('/api/backup/auto');
    if (!alive() || current !== generation) return;
    backups = [...(data.backups || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    failedLoad = false;
    loading = false;
  }
  async function write(url: string, body?: ApiRequestOptions['body']) {
    const response = await context.api.request(url, { method: 'POST', body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error || data.message || s('invalidBackup'));
    return data;
  }
  async function action(operation: () => Promise<unknown>, success?: string) {
    if (busy || !alive()) return;
    busy = true;
    try {
      const result = await operation();
      if (alive() && result !== false) feedback = { text: success || s('savedSuccess') };
    } catch (error) {
      if (alive()) feedback = { text: error instanceof Error ? error.message : t('common.networkError'), error: true };
    } finally { if (alive()) busy = false; }
  }
  function scheduleReload() {
    reloadTimer = setTimeout(() => { if (alive()) location.reload(); }, 1200);
  }
  async function trigger() {
    await action(async () => {
      const result = await write('/api/backup/auto/trigger', {});
      if (result.success !== true) throw new Error(s('backupError'));
      await load();
    }, s('backingUp'));
  }
  async function fullExport() {
    await action(async () => {
      const response = await context.api.request('/api/backup/export/full', { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || s('backupError'));
      }
      const blob = await response.blob();
      if (!alive()) return false;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'JellyTrack-complete.jtb'; link.click();
      const timer = setTimeout(() => { URL.revokeObjectURL(url); downloadTimers.delete(timer); }, 1000);
      downloadTimers.set(timer, url);
    }, 'Export complet chiffré généré');
  }
  async function manage(name: string, restore: boolean) {
    if (busy || !window.confirm(s(restore ? 'confirmRestoreBackup' : 'confirmDeleteBackup'))) return;
    await action(async () => {
      await write('/api/backup/auto/' + (restore ? 'restore' : 'delete'), { fileName: name });
      if (restore) scheduleReload(); else await load();
    }, s(restore ? 'restoreSuccess' : 'deleted'));
  }
  async function importBackup(event: SubmitEvent) {
    event.preventDefault();
    await action(async () => {
      const file = files?.[0];
      if (!file || !/\.(zip|jtb)$/i.test(file.name)) throw new Error(s('invalidBackup'));
      if (file.size > 100 * 1024 * 1024) throw new Error(s('invalidBackup') + ' (100 ' + t('common.mb') + ')');
      if (!window.confirm(s('confirmRestoreBackup'))) return false;
      const response = await context.api.request('/api/backup/import', {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await file.arrayBuffer()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || data.message || (response.status === 413 ? '100 ' + t('common.mb') : s('invalidBackup')));
      scheduleReload();
    });
  }
  onMount(() => {
    if (!context.user?.isAdmin) { void context.navigate('/login'); return; }
    void load().catch(error => {
      if (alive()) { loading = false; failedLoad = true; feedback = { text: error.message || t('common.networkError'), error: true }; }
    });
    return () => {
      disposed = true; clearTimeout(reloadTimer);
      for (const [timer, url] of downloadTimers) { clearTimeout(timer); URL.revokeObjectURL(url); }
    };
  });
</script>

<section class="jt-settings settings-route-dataBackups">
  {@html context.tabs}
  <div class="settings-body" aria-busy={loading || busy ? 'true' : undefined}>
    {#if loading}
      <div class="settings-loading" role="status">{t('common.loading')}</div>
    {:else}
      <div class="settings-feedback">
        {#if feedback}
          <div class="settings-message {feedback.error ? 'error' : 'success'}" role={feedback.error ? 'alert' : 'status'}>
            <span>{feedback.text}</span><button type="button" class="btn btn-secondary" data-action="dismiss" aria-label={t('common.close')} onclick={() => feedback = null}>×</button>
          </div>
        {/if}
      </div>
      {#if failedLoad}
        <button type="button" class="btn btn-secondary" data-action="refresh" disabled={busy} onclick={() => action(load)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 0 1 15-6l3 3M21 3v5h-5M21 13a9 9 0 0 1-15 6l-3-3M3 21v-5h5"/></svg>{t('common.retry')}
        </button>
      {:else}
        <article class="settings-card settings-backups">
          <header class="settings-card-header"><div><h2>{@html context.icon('database')}{s('dataBackups')}</h2><p>{s('dataBackupsDesc')}</p></div></header>
          <div class="settings-card-content">
            <p class="settings-help">L’export standard omet les clés : les connexions devront être réassociées après restauration. L’export complet chiffré conserve les secrets enregistrés.</p>
            <div class="settings-toolbar">
              <button type="button" class="btn btn-primary" data-action="backup-now" disabled={busy} onclick={trigger}>{s('backupNow')}</button>
              <button type="button" class="btn btn-secondary" data-action="backup-full" disabled={busy} onclick={fullExport}>Export complet chiffré</button>
              <a class="btn btn-secondary" href="/api/backup/export">{s('exportBackup')}</a>
            </div>
            <div class="settings-summary">
              <div><small>{s('backupsCount')}</small><strong>{backups.length}</strong></div>
              <div><small>{s('totalSize')}</small><strong>{totalSize} <span>{t('common.mb')}</span></strong></div>
              <div><small>{s('latestBackup')}</small><strong><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>{backups.length ? date(backups[0].date) : '—'}</strong></div>
            </div>
            <section class="settings-section"><h3>{s('backupHistory')}</h3><p class="settings-help">{s('backupHistoryDesc')}</p>
              <div class="settings-table-scroll"><table class="settings-table">
                <thead><tr>{#each [s('day'), s('backupType'), t('common.mb'), s('file'), s('actions')] as label}<th scope="col">{label}</th>{/each}</tr></thead>
                <tbody>{#each backups as backup}
                  <tr><td>{date(backup.date)}</td><td><span class="settings-badge ">{s(backup.type === 'auto' || backup.name.startsWith('JellyTrack-auto-') ? 'backupAuto' : 'backupManual')}</span></td><td>{size(backup).toFixed(2)}</td><td class="settings-filename">{backup.name}</td>
                    <td><div class="settings-toolbar"><a class="btn btn-secondary" target="_blank" rel="noopener" href={'/api/backup/auto/download?fileName=' + encodeURIComponent(backup.name)}>{s('downloadBackup')}</a><button type="button" class="btn btn-secondary" data-action="backup-restore" data-name={backup.name} disabled={busy} onclick={() => manage(backup.name, true)}>{t('common.restore')}</button><button type="button" class="btn btn-danger" data-action="backup-delete" data-name={backup.name} disabled={busy} onclick={() => manage(backup.name, false)}>{t('common.delete')}</button></div></td>
                  </tr>
                {:else}<tr><td colspan="5">{s('noAutoBackups')}</td></tr>{/each}</tbody>
              </table></div>
            </section>
            <section class="settings-nested settings-import"><h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>{s('importBackup')}</h3><p class="settings-help">{s('importBackupDesc')}</p>
              <form data-form="import" onsubmit={importBackup}><label class="settings-field"><span>{s('importBackup')}</span><input type="file" class="form-input" name="backupFile" accept=".zip,.jtb,application/zip,application/octet-stream" required bind:files></label><div class="settings-footer"><button type="submit" class="btn btn-primary settings-import-submit" disabled={busy}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>{busy ? t('common.saving') : s('importBackup')}</button></div></form>
            </section>
            <p class="settings-help">{s('backupManagementDesc')}</p>
          </div>
        </article>
      {/if}
    {/if}
  </div>
</section>
