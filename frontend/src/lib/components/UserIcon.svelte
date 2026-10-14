<script lang="ts">
 import { userIcons } from '../users-icons';
 let { name, className = '' }: { name: string; className?: string } = $props();
</script>
<svg class="users-icon {className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html userIcons[name] || ''}</svg>
