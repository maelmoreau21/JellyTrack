<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import NavigationLinks from './NavigationLinks.svelte';
  import type { SidebarConfig, SidebarSearchResults } from '../sidebar-types';
  let { config, icon, logo }: { config: SidebarConfig; icon: (name: string) => string; logo: string } = $props();
  const locales = [['fr','Français'],['en','English'],['de','Deutsch'],['es','Español'],['it','Italiano'],['nl','Nederlands'],['pl','Polski'],['pt-BR','Português (BR)'],['ru','Русский'],['zh','中文']];
  const country = (code: string) => code === 'en' ? 'gb' : code === 'pt-BR' ? 'br' : code === 'zh' ? 'cn' : code;
  let user = $state(untrack(() => config.user())), context = $state(untrack(() => config.context())), locale = $state(untrack(() => config.locale())); let revision = $state(0);
  let dark = $state(false), collapsed = $state(false), languageOpen = $state(false), compactOpen = $state(false);
  let query = $state(''), results = $state<SidebarSearchResults>({}), resultsVisible = $state(false), searching = $state(false);
  let input: HTMLInputElement, languageButton: HTMLButtonElement, languageMenu: HTMLDivElement;
  let generation = 0, timer: ReturnType<typeof setTimeout> | undefined, request: AbortController | undefined;
  const t = (key: string, params?: Record<string,string>) => { revision; return String(config.t(key, params)); };
  const selectedLocale = $derived(locales.find(item => item[0] === locale) || locales[0]);
  const backupTitle = $derived(t('nav.backupServerActive') + ' — ' + t('nav.backupServerDesc',{server:user?.authServerName || ''}));
  const sidebar = () => document.getElementById('app-sidebar')!;
  export function updateTheme() { dark = document.documentElement.classList.contains('dark'); }
  export function updateRoute() {
    const path = location.pathname;
    for (const [name, active] of [['fullscreen',path === '/login' || path.startsWith('/wrapped')],['settings',path.startsWith('/settings')],['admin',path.startsWith('/admin/')],['dashboard',path === '/' || path === '/dashboard']] as const) document.body.classList.toggle('navigation-' + name,active);
    const wrapped = document.getElementById('wrapped-close-btn'); if (wrapped) wrapped.hidden = !path.startsWith('/wrapped');
    document.querySelectorAll<HTMLElement>('[data-nav-route]').forEach(link => {
      const href = link.dataset.navRoute!; const active = path === href || (href !== '/' && path.startsWith(href));
      link.classList.toggle('active',active); if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    });
    collapsed = sidebar().classList.contains('collapsed'); locale = config.locale(); context = config.context();
  }
  export function render() {
    revision++; user = config.user(); context = config.context(); locale = config.locale(); updateTheme();
    const uid = user?.jellyfinUserId && user.jellyfinUserId !== 'local-admin' && !user.jellyfinUserId.startsWith('oidc-') ? user.jellyfinUserId : '';
    const home = user?.isAdmin ? '/' : uid ? '/users/me' : '/media';
    document.querySelectorAll<HTMLAnchorElement>('.brand-link,.mobile-brand-link').forEach(link => { link.href = home; });
    updateRoute(); void tick().then(updateRoute);
  }
  export function closeMobile() {
    const element = sidebar(), wasOpen = element.classList.contains('mobile-open'); element.classList.remove('mobile-open');
    document.getElementById('sidebar-backdrop')?.classList.remove('active'); const button = document.getElementById('mobile-menu-btn'); button?.setAttribute('aria-expanded','false');
    if (wasOpen && element.contains(document.activeElement)) button?.focus();
  }
  export function openMobile() {
    sidebar().classList.add('mobile-open'); document.getElementById('sidebar-backdrop')?.classList.add('active'); document.getElementById('mobile-menu-btn')?.setAttribute('aria-expanded','true'); document.getElementById('sidebar-close-btn')?.focus();
  }
  export function openSearch() {
    if (matchMedia('(max-width: 767px)').matches) openMobile(); compactOpen = true; void tick().then(() => { if (compactOpen) input.focus(); });
  }
  function invalidateSearch() { generation++; clearTimeout(timer); request?.abort(); request = undefined; }
  export function closeSearch(clear = false) { invalidateSearch(); compactOpen = false; resultsVisible = false; if (clear) query = ''; }
  export async function search() {
    invalidateSearch(); const current = generation, value = query.trim(); if (value.length < 2) return;
    request = new AbortController(); searching = true; resultsVisible = true;
    try { const data = await config.getJSON('/api/search?q=' + encodeURIComponent(value), { signal: request.signal }); if (current !== generation) return; results = data; searching = false; resultsVisible = true; }
    catch { if (current === generation) resultsVisible = false; }
  }
  function inputChanged(event: Event) { query = (event.currentTarget as HTMLInputElement).value; invalidateSearch(); if (query.trim().length < 2) { resultsVisible = false; return; } timer = setTimeout(() => { void search(); },300); }
  async function selectLocale(code: string) { languageOpen = false; document.cookie = `locale=${code};path=/;max-age=31536000;SameSite=Lax`; await config.changeLocale(code); render(); }
  function mouseDown(event: MouseEvent) { const target = event.target as Element; if (!target.closest('.nav-language')) languageOpen = false; if (!target.closest('.nav-search')) closeSearch(false); }
  function keyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') { const inLanguage = languageMenu.contains(document.activeElement); languageOpen = false; if (inLanguage) languageButton.focus(); closeSearch(false); closeMobile(); }
    if (event.key === 'Tab' && sidebar().classList.contains('mobile-open')) {
      const controls = Array.from(sidebar().querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),summary')).filter(element => element.getClientRects().length && !element.closest('[hidden]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (!sidebar().contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === '/' && !(event.target as Element).matches('input,textarea,select,[contenteditable]') && config.user()) { event.preventDefault(); openSearch(); }
  }
  onMount(() => {
    const mobileLogo = document.getElementById('mobile-brand-logo'); if (mobileLogo) mobileLogo.innerHTML = logo.replaceAll('nav-jelly-','mobile-jelly-');
    const tooltip = document.createElement('div'); tooltip.id = 'navigation-tooltip'; tooltip.hidden = true; tooltip.setAttribute('role','tooltip'); document.body.appendChild(tooltip);
    const showTooltip = (event: Event) => { const target = (event.target as Element).closest<HTMLElement>('[data-nav-route],#sidebar-search-trigger,#language-trigger,#btn-theme-toggle,#btn-logout,#backup-server-banner'); if (!target || !sidebar().classList.contains('collapsed')) return; const rect = target.getBoundingClientRect(); tooltip.textContent = target.title || target.getAttribute('aria-label'); tooltip.style.left = sidebar().getBoundingClientRect().right + 10 + 'px'; tooltip.style.top = rect.top + rect.height / 2 + 'px'; tooltip.hidden = false; };
    const hideTooltip = () => { tooltip.hidden = true; };
    const mouseOut = (event: MouseEvent) => { if (!(event.target as Element).contains(event.relatedTarget as Node | null)) hideTooltip(); };
    const wrappedClose = () => { const id = location.pathname.split('/')[2]; if (id && config.navigate) config.navigate('/users/' + id); else history.back(); };
    const wrappedButton = document.getElementById('wrapped-close-btn'); wrappedButton?.addEventListener('click',wrappedClose);
    document.addEventListener('mousedown',mouseDown); document.addEventListener('keydown',keyDown); document.addEventListener('mouseover',showTooltip); document.addEventListener('focusin',showTooltip); document.addEventListener('mouseout',mouseOut); document.addEventListener('focusout',hideTooltip); window.addEventListener('resize',updateRoute); render();
    return () => { invalidateSearch(); tooltip.remove(); wrappedButton?.removeEventListener('click',wrappedClose); document.removeEventListener('mousedown',mouseDown); document.removeEventListener('keydown',keyDown); document.removeEventListener('mouseover',showTooltip); document.removeEventListener('focusin',showTooltip); document.removeEventListener('mouseout',mouseOut); document.removeEventListener('focusout',hideTooltip); window.removeEventListener('resize',updateRoute); };
  });
</script>
<div class="sidebar-header"><a data-link class="brand-link" href="/"><span class="historical-logo">{@html logo}</span><span class="brand-title">JellyTrack</span></a><button id="sidebar-collapse-btn" class="sidebar-collapse-btn" type="button" title={t(collapsed?'nav.expandMenu':'nav.collapseMenu')} aria-label={t(collapsed?'nav.expandMenu':'nav.collapseMenu')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button><button id="sidebar-close-btn" type="button" aria-label="Close menu" onclick={closeMobile}>{@html icon('close')}</button></div>
<div class="sidebar-scroll">
  <div id="nav-search" class="nav-search" class:compact-open={compactOpen}><button id="sidebar-search-trigger" type="button" class="compact-search" title={t('search.placeholder')} aria-label={t('search.placeholder')} onclick={() => { compactOpen = !compactOpen; void tick().then(() => { if (compactOpen) input.focus(); }); }}>{@html icon('search')}</button><div class="nav-search-panel"><div class="nav-search-field">{@html icon('search')}<input id="nav-search-input" bind:this={input} bind:value={query} autocomplete="off" type="search" placeholder={t('search.placeholder')} oninput={inputChanged} onfocus={() => { if (query.trim().length >= 2) void search(); }}><button id="nav-search-clear" type="button" aria-label="Clear search" hidden={!query} onclick={() => closeSearch(true)}>✕</button></div><div id="nav-search-results" hidden={!resultsVisible}>
  {#if searching}<p>{t('search.searching')}</p>{:else}{#each ['media','users'] as group}{@const items = results[group as 'media'|'users'] || []}{#if items.length}<div class="search-section">{t(group === 'media' ? 'search.mediaSection' : 'search.usersSection')}</div>{#each items as item}<a data-link href={'/' + group + '/' + encodeURIComponent(String(item.id || item.jellyfinMediaId || item.jellyfinUserId))} onclick={() => closeSearch(true)}><span class={'search-type-icon search-type-' + (group === 'users' ? 'user' : item.type === 'Movie' ? 'movie' : item.type === 'Series' ? 'series' : item.type === 'MusicAlbum' ? 'music' : 'other')}>{@html icon(group === 'users' ? 'searchUser' : item.type === 'Series' ? 'tv' : item.type === 'MusicAlbum' ? 'music' : 'film')}</span><span>{item.title || item.username}{#if item.subtitle}<small>{item.subtitle}</small>{/if}</span></a>{/each}{/if}{/each}{#if !(results.media?.length || results.users?.length)}<p>{t('search.noResults')}</p>{/if}{/if}
  </div></div></div>
  <div id="backup-server-banner" class="backup-server-banner" hidden={!(user?.authServerIsPrimary === false && user.authServerName)} title={backupTitle}>{@html icon('warning')}<div class="backup-server-copy"><strong id="backup-server-title">{t('nav.backupServerActive')}</strong><p id="backup-server-desc">{t('nav.backupServerDesc',{server:user?.authServerName || ''})}</p></div></div>
  <nav id="historical-nav" class="sidebar-nav" aria-label="Navigation"><NavigationLinks {user} {context} {t} {icon}/></nav>
</div>
<div class="sidebar-footer"><div class="nav-language"><button bind:this={languageButton} id="language-trigger" class="nav-footer-control" type="button" aria-label="Language" aria-haspopup="menu" aria-expanded={languageOpen} title={selectedLocale[1]} onclick={() => { languageOpen = !languageOpen; }} onkeydown={async event => { if (event.key === 'ArrowDown') { event.preventDefault(); languageOpen = true; await tick(); languageMenu.querySelector('button')?.focus(); } }}><span class="control-icon language-icon">{#if collapsed}<img class="nav-flag" src={'/assets/flags/' + country(locale) + '.png'} alt="">{:else}{@html icon('globe')}{/if}</span><span class="control-copy"><span class="control-heading">Language</span><span id="language-value"><img class="nav-flag" src={'/assets/flags/' + country(selectedLocale[0]) + '.png'} alt=""> {selectedLocale[1]}</span></span><span class="language-chevron">{@html icon('down')}</span></button><div bind:this={languageMenu} id="language-menu" role="menu" hidden={!languageOpen}><div class="language-menu-heading">Interface</div>{#each locales as [code,label]}<button type="button" role="menuitemradio" aria-checked={code === selectedLocale[0]} data-locale={code} onclick={() => selectLocale(code)}><img class="nav-flag" src={'/assets/flags/' + country(code) + '.png'} alt=""><span>{label}</span>{#if code === selectedLocale[0]}<small>Active</small>{/if}</button>{/each}</div></div>
<button id="btn-theme-toggle" type="button" class="nav-footer-control" title={t(dark?'common.switchToLight':'common.switchToDark')} aria-label={t(dark?'common.switchToLight':'common.switchToDark')}><span id="theme-control-icon" class="control-icon theme-control-icon" class:theme-mode-light={!dark}>{@html icon(dark?'sun':'moon')}</span><span class="control-copy"><span id="theme-control-heading" class="control-heading">{t('common.theme')}</span><span id="theme-control-value">{t(dark?'common.themeDark':'common.themeLight')}</span></span></button>
<button id="btn-logout" type="button" class="nav-footer-control logout-control" title={t('nav.logout')} aria-label={t('nav.logout')}><span class="control-icon">{@html icon('logout')}</span><span id="logout-label" class="control-copy">{t('nav.logout')}</span></button><a href="/about" data-link id="nav-version" class="sidebar-version-link">{collapsed?'v':'JellyTrack v'}{context.appVersion || '3.0.0'}</a></div>


