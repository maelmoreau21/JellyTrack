<script lang="ts">
  import { onMount } from 'svelte';
  import AppShell from '../lib/components/AppShell.svelte';
  import { installMigrationBridge } from '../lib/migration-bridge';

  let failure = $state('');
  let { children } = $props();

  function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Chargement impossible : ${src}`));
      document.head.appendChild(script);
    });
  }

  onMount(() => {
    installMigrationBridge();
    // The persistent layout mounts once. The legacy router owns navigation until
    // individual pages are converted; SvelteKit must not intercept its links.
    void (async () => {
      await loadScript('/assets/navigation.js');
      await loadScript('/assets/app.js');
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
