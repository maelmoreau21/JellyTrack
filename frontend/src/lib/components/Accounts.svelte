<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { AccountContext, AccountEntry } from '../account-types';
  let { context }: { context: AccountContext } = $props();
  let accounts = $state<AccountEntry[]>([]);
  let status = $state('');
  let details = $state('');
  let code = $state('');
  let showCode = $state(false);
  let input = $state('');
  let submitting = $state(false);
  let proving = $state(false);
  let syncing = $state(false);
  let unlinking = $state<Record<string, boolean>>({});
  let disposed = false;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const signal = untrack(() => context.State.pageController.signal);
  const alive = () => !disposed && !signal.aborted;
  const multiServer = $derived(context.State.navigation.multiServer);
  const serverAdmin = $derived(context.State.user?.role === 'server_admin');

  async function run(operation: () => Promise<void>) {
    status = '';
    try { await operation(); }
    catch (error) { if (alive()) status = error instanceof Error ? error.message : String(error); }
  }
  async function load() {
    const data = await context.API.getJSON('/api/me/accounts');
    if (alive()) accounts = data.accounts || [];
  }
  async function unlink(id: string) {
    if (unlinking[id]) return;
    unlinking = { ...unlinking, [id]: true };
    await run(async () => {
      const response = await context.API.request('/api/me/accounts/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Erreur lors de la dissociation.'); }
      await load();
      if (alive()) status = 'Compte dissocié. Le prochain Wrapped utilisera les associations restantes.';
    });
    if (alive()) unlinking = { ...unlinking, [id]: false };
  }
  async function proof() {
    if (proving) return;
    proving = true;
    await run(async () => {
      const data = await context.API.postJSON('/api/me/accounts/proof', {});
      if (!alive()) return;
      showCode = true; code = data.code || '';
      status = 'Code personnel valable cinq minutes, utilisable une seule fois. Ne le partagez pas.';
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(() => { if (alive()) { code = ''; status = 'Code expiré.'; } }, (data.expiresIn || 0) * 1000);
    });
    if (alive()) proving = false;
  }
  async function link(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    await run(async () => {
      await context.API.postJSON('/api/me/accounts/link', { code: input.trim() });
      if (!alive()) return;
      input = ''; await load();
      if (alive()) status = 'Compte associé. Aucun droit supplémentaire accordé.';
    });
    if (alive()) submitting = false;
  }
  async function sync() {
    if (syncing) return;
    syncing = true;
    await run(async () => {
      await context.API.postJSON('/api/me/server/sync', {});
      if (alive()) status = 'Synchronisation terminée.';
    });
    if (alive()) syncing = false;
  }
  onMount(() => {
    void (async () => {
      if (serverAdmin) {
        try {
          const data = await context.API.getJSON('/api/me/server');
          if (alive()) details = (data.servers || []).map(s => s.name + ' : ' + s.users + ' utilisateurs, ' + s.media + ' médias, ' + s.plays + ' lectures').join('; ');
        } catch (error) { if (alive()) details = error instanceof Error ? error.message : String(error); }
      }
      if (multiServer && alive()) { submitting = true; await run(load); if (alive()) submitting = false; }
    })();
    return () => { disposed = true; clearTimeout(expiryTimer); };
  });
</script>

<section class="card">
  <h1>Mes comptes Jellyfin</h1>
  {#if multiServer}
    <p>Combinez vos statistiques personnelles. Les droits de chaque compte restent séparés.</p>
    <details style="margin: 1rem 0;"><summary>Comment associer un autre compte ?</summary><ol style="padding-left: 1.5rem;"><li>Connectez-vous au second compte dans une fenêtre privée, puis ouvrez Mes comptes et générez un code.</li><li>Revenez dans cette fenêtre et saisissez ce code. Les deux connexions doivent dater de moins de dix minutes.</li></ol></details>
    <div style="margin: 1rem 0;">
      {#each accounts as account}
        <p style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;"><span>{account.username + ' — ' + account.serverName + (account.current ? ' (session courante)' : '')}</span>{#if accounts.length > 1}<button class="btn btn-secondary" disabled={unlinking[account.id]} onclick={() => unlink(account.id)}>Dissocier</button>{/if}</p>
      {/each}
    </div>
    <button class="btn btn-secondary" disabled={proving} onclick={proof}>Générer un code pour ce compte</button>
    <output style="overflow-wrap: anywhere; display: block; margin: 1rem 0;" hidden={!showCode}>{code}</output>
    <form style="display: grid; gap: 0.75rem; margin: 1rem 0;" onsubmit={link}><label>Code du compte à associer <input class="form-input" required autocomplete="off" maxlength="43" bind:value={input}></label><button class="btn btn-primary" disabled={submitting}>Associer mon compte</button></form>
    <a class="btn btn-secondary" href="/wrapped/me?combined=1" data-link>Mon Wrapped multi-serveur privé</a>
  {:else}
    <p>L’association de comptes est disponible uniquement lorsque plusieurs serveurs Jellyfin sont configurés.</p>
  {/if}
  <p role="status">{status}</p>
  {#if serverAdmin}
    <section><h2>Administration de mon serveur</h2><p>{details}</p><button class="btn btn-secondary" disabled={syncing} onclick={sync}>Synchroniser mon serveur</button></section>
  {/if}
</section>
