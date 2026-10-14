<script lang="ts">
  import { paths } from '../about-icons';
  let { name }: { name: string } = $props();
</script>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html paths[name] || ''}</svg>
