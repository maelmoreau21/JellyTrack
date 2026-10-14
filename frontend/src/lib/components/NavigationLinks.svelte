<script lang="ts">
  import type { NavigationContext } from '../migration-bridge';
  let { user, context, t, icon }: NavigationContext = $props();
  const uid = $derived(user?.jellyfinUserId && user.jellyfinUserId !== 'local-admin' && !user.jellyfinUserId.startsWith('oidc-') ? user.jellyfinUserId : '');
  const items = $derived.by(() => {
    const links: [string, string, string][] = user ? [['myProfile', '/users/me', 'user']] : [];
    if ((context.multiServer || user?.role === 'server_admin') && user?.jellyfinUserId && user.jellyfinUserId !== 'local-admin') links.push(['myAccounts', '/accounts', 'users']);
    if (user?.isAdmin) {
      links.push(['dashboard','/','dashboard'], ['recentlyAdded','/recent','sparkles'], ['library','/media','film'], ['users','/users','users'], ['logHealth','/admin/health','health'], ['logs','/logs','logs'], ['settings','/settings','settings']);
      if (context.multiServer) links.push(['serverCompare','/admin/server-compare','compare']);
    } else if (user) {
      links.push(['library','/media','film'], ['recentlyAdded','/recent','sparkles']);
      if (uid && context.wrappedVisible) links.push(['myWrapped','/wrapped/me?combined=1','gift']);
    }
    return links;
  });
</script>

{#each items as [key, href, glyph] (key)}
  <a {href} data-link data-nav-route={href} title={String(t('nav.' + key))} aria-label={String(t('nav.' + key))}>
    <!-- Icons are trusted static Lucide paths bundled in the repository. -->
    {@html icon(glyph)}<span>{String(t('nav.' + key))}</span>
  </a>
{/each}
