<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import AppShell from '../lib/components/AppShell.svelte';
  import { installViewRenderers } from '../lib/view-renderers';

  let failure = $state('');
  let { children } = $props();

  afterNavigate(navigation => {
    void import('../lib/runtime/application.js')
      .then(({ renderCurrentRoute }) => renderCurrentRoute(navigation))
      .catch((error: unknown) => { failure = error instanceof Error ? error.message : 'Chargement impossible.'; });
  });

  onMount(() => {
    installViewRenderers();
    // SvelteKit owns the persistent shell and compiled page modules. Page
    // controllers keep their historical link handling through Kit navigation.
    void (async () => {
      await import('../lib/pages/navigation.js');
      const { startApplication } = await import('../lib/runtime/application.js');
      startApplication();
    })().catch((error: unknown) => {
      failure = error instanceof Error ? error.message : 'Chargement impossible.';
    });
  });
</script>

<div style="display: contents" data-sveltekit-reload>
  <AppShell />
</div>
{#if failure}<p role="alert">{failure}</p>{/if}
{@render children()}
