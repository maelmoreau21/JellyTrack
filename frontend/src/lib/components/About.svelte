<script lang="ts">
  import type { AboutContext } from '../view-renderers';
  import AboutIcon from './AboutIcon.svelte';
  let { i18n, locale, version }: AboutContext = $props();
  const text = (key: string, params: Record<string, string> = {}) => String(i18n.t('about.' + key, params));
  const copy = (fr: string, en: string) => locale.startsWith('fr') ? fr : en;
  const features = $derived(i18n.t('about.featuresList'));
  const stack = $derived([
    ['server', 'Go', '1.27', copy('Serveur HTTP natif et binaire autonome', 'Native HTTP server and standalone binary')],
    ['palette', 'HTML / JavaScript', '', copy('Interface embarquée, sans framework au runtime', 'Embedded interface without a runtime framework')],
    ['database', 'SQLite / PostgreSQL', '', copy('Stockage persistant et migrations SQL', 'Persistent storage and SQL migrations')],
    ['chart', 'Chart.js', '4.5.1', copy('Bibliothèque de graphiques interactifs', 'Interactive chart library')],
    ['shield', 'Go OIDC / Sessions', '3.21.0', copy('Authentification Jellyfin et OpenID Connect', 'Jellyfin and OpenID Connect authentication')],
    ['clock', 'Go Scheduler', '', text('techCron')]
  ]);
</script>

<div class="about-historical">
  <header class="about-historical-heading">
    <div class="about-historical-brand"><img src="/assets/logo.svg" alt="Logo" width="48" height="48"><h1>JellyTrack</h1></div>
    <p>{text('description')}</p><div class="about-historical-version">{text('version', { version: version || '3.0.0' })}</div>
  </header>
  <section class="about-historical-card">
    <header><h2 class="about-heart"><AboutIcon name="heart" /><span>{text('features')}</span></h2></header>
    <div class="about-historical-content"><ul class="about-historical-features">
      {#each Array.isArray(features) ? features : [] as feature}<li><span aria-hidden="true">•</span>{String(feature)}</li>{/each}
    </ul></div>
  </section>
  <section class="about-historical-card">
    <header><h2 class="about-server"><AboutIcon name="server" /><span>{text('technologies')}</span></h2></header>
    <div class="about-historical-content"><div class="about-historical-stack">
      {#each stack as [glyph, name, installed, description]}
        <article><AboutIcon name={glyph} /><div><div class="about-historical-tech-name"><strong>{name}</strong>{#if installed}<small>v{installed}</small>{/if}</div><p>{description}</p></div></article>
      {/each}
    </div></div>
  </section>
  <section class="about-historical-card">
    <header><h2><AboutIcon name="branch" /><span>{text('linksCredits')}</span></h2></header>
    <div class="about-historical-content"><div class="about-historical-links">
      <a href="https://github.com/maelmoreau21/JellyTrack" target="_blank" rel="noopener noreferrer"><AboutIcon name="branch" />{text('githubSource')}<AboutIcon name="external" /></a>
      <a href="https://jellyfin.org" target="_blank" rel="noopener noreferrer"><AboutIcon name="play" />{text('jellyfinLink')}<AboutIcon name="external" /></a>
    </div><p class="about-historical-credit">{text('openSourceNote')}</p></div>
  </section>
  <details class="about-historical-extras"><summary>{String(i18n.t('nav.goExtras'))}</summary><ul>
    <li>{copy('Exécution autonome : aucun service Node.js ni gestionnaire npm requis au runtime.', 'Standalone execution: no Node.js service or npm manager required at runtime.')}</li>
    <li>{copy('Choix du stockage SQLite ou PostgreSQL, avec migrations automatiques.', 'SQLite or PostgreSQL storage with automatic migrations.')}</li>
    <li>{copy('Sessions sécurisées, protections CSRF et SSRF, et OpenID Connect.', 'Secure sessions, CSRF and SSRF protections, and OpenID Connect.')}</li>
    <li>{copy('Dix langues disponibles : FR, EN, DE, ES, IT, NL, PL, PT-BR, RU et ZH.', 'Ten available languages: FR, EN, DE, ES, IT, NL, PL, PT-BR, RU and ZH.')}</li>
  </ul></details>
</div>
