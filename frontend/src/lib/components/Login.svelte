<script lang="ts">
  import { onMount } from 'svelte';
  import type { LoginContext, LoginOptions } from '../login-types';
  let { context }: { context: LoginContext } = $props();
  let options = $state<LoginOptions>({});
  let ready = $state(false);
  let error = $state('');
  let logout = $state(false);
  let autoRedirecting = $state(false);
  let submitting = $state(false);
  let username = $state('');
  let password = $state('');
  let remember = $state(false);
  let serverId = $state('');
  let locale = $state('fr');
  let dark = $state(false);
  let revision = $state(0);
  const languages = [['fr','Français'],['en','English'],['de','Deutsch'],['es','Español'],['it','Italiano'],['nl','Nederlands'],['pl','Polski'],['pt-BR','Português'],['ru','Русский'],['zh','中文']];
  const country = (code: string) => code === 'en' ? 'gb' : code === 'pt-BR' ? 'br' : code === 'zh' ? 'cn' : code;
  let selectedLanguage = $derived(languages.find(([code]) => code === locale) || languages[0]);
  let ssoUrl = $derived('/api/auth/oidc/start' + (serverId ? '?serverId=' + encodeURIComponent(serverId) : ''));
  function t(key: string, fallback: string) { void revision; return context.I18n.t(key) || fallback; }
  async function changeLocale(code: string) {
    await context.I18n.changeLocale(code);
    locale = context.State.locale;
    revision++;
    username = ''; password = ''; remember = false;
  }
  function toggleTheme() {
    context.Theme.toggle(); dark = context.Theme.isDark();
    username = ''; password = ''; remember = false;
  }
  function closePicker(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    const picker = (event.target as HTMLElement)?.closest<HTMLDetailsElement>('.auth-language-picker');
    if (!picker) return;
    picker.open = false; picker.querySelector('summary')?.focus();
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    try {
      await context.Auth.login(username.trim(), password, remember, serverId);
      context.Toast.success(t('login.loginSuccess', 'Connecté avec succès !'));
      document.body.classList.remove('is-auth-page');
      const callback = new URLSearchParams(location.search).get('callbackUrl');
      const target = callback && callback.startsWith('/') && !callback.startsWith('//') && !callback.includes('\\') && !/^\/login(?:[?#]|$)/.test(callback) ? callback : '/';
      context.Router.navigate(target, true, true);
    } catch (failure: unknown) {
      error = failure instanceof Error ? failure.message : t('login.invalidCredentials', 'Identifiants incorrects.');
      username = ''; password = ''; remember = false;
    } finally { submitting = false; }
  }
  onMount(() => {
    locale = context.State.locale;
    dark = context.Theme.isDark();
    context.StreamsPoller.stop();
    document.body.classList.add('is-auth-page');
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      let loaded: LoginOptions = {};
      try { loaded = await context.API.getJSON('/api/auth/options'); } catch { /* Preserve the historical Jellyfin fallback. */ }
      if (disposed) return;
      options = loaded;
      const params = new URLSearchParams(location.search);
      const yes = (key: string) => ['1', 'true'].includes(params.get(key) || '');
      logout = yes('logout');
      const queryError = params.get('error');
      if (queryError) {
        const messages: Record<string, string> = {
          AccessDeniedGroup: t('login.unauthorizedGroup', 'Accès refusé : groupe non autorisé.'),
          AccessDenied: t('login.unauthorizedGroup', 'Accès refusé.'),
          OAuthSignin: t('login.ssoError', 'Erreur lors de la connexion SSO.'),
          OAuthCallback: t('login.ssoError', 'Erreur lors du retour SSO.'),
          OAuthCreateAccount: t('login.ssoError', 'Erreur lors du compte SSO.'),
          CredentialsSignin: t('login.invalidCredentials', 'Identifiants incorrects.')
        };
        error = messages[queryError] || t('login.unexpectedError', "Une erreur inattendue s'est produite.");
      }
      autoRedirecting = !!options.oidc && !!options.autoRedirect && !queryError && !logout && !yes('manual') && !yes('local');
      ready = true;
      if (autoRedirecting) timer = setTimeout(() => { if (!disposed && autoRedirecting) window.location.href = ssoUrl; }, 400);
    })();
    return () => { disposed = true; clearTimeout(timer); document.body.classList.remove('is-auth-page'); };
  });
</script>

<svelte:window onkeydown={closePicker} />

{#if ready}
<div class="auth-wrapper">
  <div class="auth-glow-blob-1"></div><div class="auth-glow-blob-2"></div>
  <div class="auth-card-container">
    <div class="auth-card">
      <div class="auth-card-header">
        <div class="auth-logo-box">
          <svg class="auth-logo-svg" width="52" height="52" viewBox="18 23 64 69" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="jellyGradLogin" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#AA5CC3"/><stop offset="100%" stop-color="#00A4DC"/></linearGradient><mask id="holeMaskLogin"><rect x="0" y="0" width="100" height="100" fill="#ffffff"/><circle cx="50" cy="39" r="10" fill="black"/></mask></defs>
            <path d="M 20 55 A 30 30 0 0 1 80 55 Z" fill="url(#jellyGradLogin)" mask="url(#holeMaskLogin)"/><polygon points="46,32 46,46 58,39" fill="#00A4DC"/><rect x="30" y="60" width="8" height="20" rx="4" fill="url(#jellyGradLogin)"/><rect x="46" y="60" width="8" height="30" rx="4" fill="url(#jellyGradLogin)"/><rect x="62" y="60" width="8" height="15" rx="4" fill="url(#jellyGradLogin)"/>
          </svg>
        </div>
        <div><h1 class="auth-card-title">{t('login.title', 'Connexion JellyTrack')}</h1></div>
      </div>
      {#if autoRedirecting && !error}
        <div class="auth-sso-container"><div class="auth-sso-auto-box">
          <div class="auth-sso-auto-icon-wrap"><div class="auth-sso-ping"></div><div class="auth-sso-icon-box"><svg class="auth-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div></div>
          <div><div class="auth-sso-auto-title">{t('login.autoRedirecting', 'Redirection vers votre fournisseur SSO...')}</div><div class="auth-sso-auto-subtitle">{t('login.autoRedirectHint', 'Connexion automatique via OpenID Connect...')}</div></div>
          <a href={ssoUrl} class="auth-sso-manual-link">{t('login.continueManually', 'Continuer vers le SSO')}</a>
        </div></div>
      {:else}
        <div class="auth-card-body">
          {#if error}<div class="auth-alert-error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>{error}</span></div>{/if}
          {#if logout && !error}<div class="auth-alert-success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>{t('login.loggedOutNotice', 'Vous avez été déconnecté avec succès.')}</span></div>{/if}
          {#if options.oidc}
            <div class="auth-sso-section" style="margin-bottom: 1.25rem;"><a href={ssoUrl} class="auth-sso-primary-btn" id="btn-sso-start"><span>{options.ssoButtonLabel || t('login.signInSso', 'Se connecter avec SSO')}</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a></div>
            {#if options.jellyfin !== false || options.localAdmin}<div class="auth-divider" style="margin-bottom: 1.25rem;"><div class="auth-divider-line"></div><div class="auth-divider-text">{t('common.or', 'OU')}</div><div class="auth-divider-line"></div></div>{/if}
          {/if}
          {#if options.jellyfin !== false || options.localAdmin}
            {#if (options.servers || []).length > 1}<label class="auth-label" for="login-server">Serveur Jellyfin</label><select id="login-server" class="form-input" bind:value={serverId}><option value="">Automatique</option>{#each options.servers || [] as server}<option value={server.id}>{server.name}</option>{/each}</select>{/if}
            <form id="form-login-local" class="auth-form" onsubmit={submit}>
              <div class="auth-input-group"><label class="auth-label" for="login-username">{t('login.username', "Nom d'utilisateur")}</label><div class="auth-input-wrapper"><svg class="auth-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><input type="text" class="auth-input-field" id="login-username" required bind:value={username} autocomplete="username" placeholder={options.jellyfin !== false ? 'Jellyfin' : 'Admin'}></div></div>
              <div class="auth-input-group"><label class="auth-label" for="login-password">{t('login.password', 'Mot de passe')}</label><div class="auth-input-wrapper"><svg class="auth-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><input type="password" class="auth-input-field" id="login-password" required bind:value={password} placeholder="••••••••"></div></div>
              <label class="auth-remember" for="login-remember"><input type="checkbox" id="login-remember" bind:checked={remember}><span>{t('login.rememberMe', 'Se souvenir de moi')}<small>{t('login.rememberMeHint', 'Rester connecté 30 jours sur cet appareil.')}</small></span></label>
              <button type="submit" id="btn-login-submit" class="auth-submit-btn" disabled={submitting} style:opacity={submitting ? '0.6' : undefined} style:cursor={submitting ? 'not-allowed' : undefined}><span id="btn-login-text">{submitting ? t('login.verifying', 'Vérification…') : t('login.signIn', 'Se connecter')}</span><svg id="btn-login-arrow" style:display={submitting ? 'none' : undefined} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
            </form>
          {/if}
        </div>
      {/if}
    </div>
    <div class="auth-controls-container">
      <div class="auth-controls-bottom"><details class="auth-language-picker"><summary aria-label="Langue"><img class="nav-flag" src="/assets/flags/{country(selectedLanguage[0])}.png" alt=""><span>{selectedLanguage[1]}</span>{@html context.icon('down')}</summary><div class="auth-language-options">{#each languages as [code, label]}<button type="button" data-login-locale={code} aria-current={code === locale} onclick={() => changeLocale(code)}><img class="nav-flag" src="/assets/flags/{country(code)}.png" alt=""><span>{label}</span></button>{/each}</div></details></div>
      <button type="button" id="login-theme-card" class="auth-theme-card" aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'} onclick={toggleTheme}><div class="auth-theme-icon-box">{@html context.icon(dark ? 'sun' : 'moon')}</div><div class="auth-theme-text"><div class="auth-theme-label">{t('common.theme', 'THÈME')}</div><div class="auth-theme-value">{dark ? t('common.themeDark', 'Sombre') : t('common.themeLight', 'Clair')}</div></div></button>
    </div>
  </div>
</div>
{/if}
