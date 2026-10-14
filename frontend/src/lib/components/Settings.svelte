<script lang="ts">
  import { onMount } from 'svelte';
  import type { SettingsContext } from '../settings-types';
  let { context }: { context: SettingsContext } = $props();
  // The settings API deliberately carries extension keys: preserve them on edits.
  let model = $state<Record<string, any>>({});
  let serversData = $state<Record<string, any>>({});
  let overview = $state<Record<string, any>>({});
  let smart = $state<Record<string, any>>({});
  let loading = $state(true), busy = $state(false), failed = $state(false);
  let feedback = $state<{ text: string; error?: boolean } | null>(null);
  let editing = $state<Record<string, any> | null>(null), adding = $state(false);
  let visible = $state<Record<string, boolean>>({});
  let secrets = $state<Record<string, string>>({});
  let revision = $state(0);
  let disposed = false;
  const alive = () => !disposed && !context.signal?.aborted;
  const t = (key: string, values?: Record<string, string>) => context.i18n.t(key, values) || key.split('.').pop() || key;
  const s = (key: string, values?: Record<string, string>) => t('settings.' + key, values);
  const sec = (key: string) => t('securitySettings.' + key);
  const extra = (fr: string, en: string) => document.documentElement.lang === 'fr' ? fr : en;
  const resolutions: Record<string, number[]> = { '480p':[792,528], '720p':[1408,792], '1080p':[2112,1188], '4K':[4224,2376] };
  const ruleTypes = ['default','movies','tvshows','music','books','homevideos'];
  const telemetryFields: [string,string,number,number][] = [
    ['playingIntervalSeconds','telemetryPlayingInterval',1,5], ['pausedIntervalSeconds','telemetryPausedInterval',5,30],
    ['staleSessionTimeoutSeconds','telemetryStaleSession',30,90], ['mergeWindowSeconds','telemetryMergeWindow',0,300],
    ['seekThresholdSeconds','telemetrySeekThreshold',5,20], ['retryQueueSize','telemetryRetryQueueSize',10,500], ['retryFlushBatchSize','telemetryRetryFlushBatchSize',1,50]
  ];
  const tracking = ['trackPauseResume','trackSeek','trackAudioSubtitleChanges','trackSessionEnded'];
  const smartFields: [string,string,number,number,number][] = [['ipAttemptThreshold','ipAttemptThresholdLabel',1,10000,50],['ipWindowMinutes','ipWindowMinutesLabel',5,10080,60],['newCountryGraceMinutes','newCountryGraceMinutesLabel',1,1440,120]];
  const clamp = (value: unknown, min: number, max: number, fallback: number) => Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Math.round(Number(value)))) : fallback;
  const normalizeRule = (value: Record<string, any> = {}, music = false): Record<string, any> => {
    const rule = { completionEnabled:true, abandonedThreshold:music?12:10, partialThreshold:music?30:20, completedThreshold:music?60:80, ...value };
    rule.completedThreshold=clamp(rule.completedThreshold,1,100,80);
    rule.partialThreshold=Math.max(1,Math.min(clamp(rule.partialThreshold,0,100,20),rule.completedThreshold-1));
    rule.abandonedThreshold=Math.max(0,Math.min(clamp(rule.abandonedThreshold,0,100,10),rule.partialThreshold-1));
    return rule;
  };
  const scopeKey = (id: string, name: string) => `srvlib|${id}|${encodeURIComponent(name)}`;
  const servers = $derived(serversData.servers || []);
  const resolution = $derived(model.resolutionThresholds || {});
  const scopes = $derived([...new Map<string, Record<string, any>>((model.availableLibraryScopes || []).filter((v: any)=>v.serverId&&v.libraryName).map((v: any)=>[scopeKey(v.serverId,v.libraryName),{...v,key:scopeKey(v.serverId,v.libraryName)}] as [string,Record<string, any>])).values()]);
  const groups = $derived([...new Set(scopes.map(v=>v.serverId))].map(id=>({id,server:servers.find((v: any)=>v.id===id||v.jellyfinServerId===id),scopes:scopes.filter(v=>v.serverId===id).sort((a,b)=>a.libraryName.localeCompare(b.libraryName))})));
  const orphaned = $derived((model.excludedLibraries || []).filter((key: string)=>!scopes.some(v=>v.key===key)));
  const telemetry = $derived({ precisionProfile:'very_precise', ...Object.fromEntries(telemetryFields.map(([key,,,value])=>[key,value])), ...Object.fromEntries(tracking.map(key=>[key,true])), ...model.pluginTelemetrySettings });
  const plugin = $derived(overview.plugin || {});
  const online = (server: any) => ['online','connected'].includes(server.connectionState);
  const status = (server: any) => s(online(server)?'jellyfinConnected':server.hasApiKey===false?'missingApiKey':'jellyfinOffline');
  const date = (value: string) => value ? new Date(value).toLocaleString(context.i18n.locale || undefined) : '—';
  function values(form: HTMLFormElement): Record<string, any> {
    return Object.fromEntries(Array.from(form.elements).filter((el): el is HTMLInputElement|HTMLSelectElement => el instanceof HTMLInputElement || el instanceof HTMLSelectElement).filter(el=>el.name).map(el=>[el.name,el instanceof HTMLInputElement&&el.type==='checkbox'?el.checked:el.value]));
  }
  function contains(actual: any, expected: any): boolean {
    if(Array.isArray(expected)) return Array.isArray(actual)&&JSON.stringify([...actual].sort())===JSON.stringify([...expected].sort());
    return expected&&typeof expected==='object' ? Object.entries(expected).every(([key,value])=>contains(actual?.[key],value)) : actual===expected;
  }
  async function write(url: string, body?: Record<string, any>, method='POST') {
    const response=await context.api.request(url,{method,body});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.success===false)throw new Error(data.error||data.message||`${t('common.networkError')} (HTTP ${response.status})`);
    return data;
  }
  async function load() {
    const urls=context.page==='plugin/security'?['/api/settings','/api/admin/security/overview','/api/admin/security/smart-settings']:['/api/settings','/api/settings/jellyfin-servers'];
    const data=await Promise.all(urls.map(url=>context.api.getJSON(url)));
    if(!alive())return;
    model=data[0];
    if(context.page==='plugin/security'){overview=data[1];smart=data[2].thresholds||{};}else serversData=data[1];
    if(context.page==='media'){
      const excluded=new Set<string>(model.excludedLibraries||[]);
      const normalize=(value: string)=>value.trim().toLowerCase().replace(/\s+/g,' ');
      for(const key of [...excluded])if(!key.startsWith('srvlib|')){
        const matches=(model.availableLibraryScopes||[]).filter((v: any)=>v.serverId&&v.libraryName&&normalize(v.libraryName)===normalize(key));
        if(matches.length){excluded.delete(key);matches.forEach((v: any)=>excluded.add(scopeKey(v.serverId,v.libraryName)));}
      }
      model.excludedLibraries=[...excluded];
    }
    failed=false;loading=false;revision++;
  }
  async function action(operation: ()=>Promise<unknown>, message?: string) {
    if(busy||!alive())return;
    busy=true;feedback=null;
    try{await operation();if(alive())feedback={text:message||s('savedSuccess')};}
    catch(error){if(alive())feedback={error:true,text:error instanceof Error?error.message:t('common.networkError')};}
    finally{if(alive())busy=false;}
  }
  async function refresh(){await action(load);}
  async function saveSettings(payload: Record<string, any>){
    await write('/api/settings',payload);await load();
    if(!contains({...model,ssoButtonLabel:model.resolutionThresholds?.ssoButtonLabel||''},payload))throw new Error(extra('Enregistrement non confirmé. Actualisez les réglages.','Saved values could not be confirmed. Refresh the settings.'));
  }
  async function submit(event: SubmitEvent, kind: string) {
    event.preventDefault();const data=values(event.currentTarget as HTMLFormElement);
    await action(async()=>{
      if(kind==='server'||kind==='add-server'){
        const payload: Record<string, any>={name:data.name.trim(),url:data.url.trim(),allowAuthFallback:!!data.allowAuthFallback};
        if(!/^https?:\/\//i.test(payload.url))throw new Error(s('serverUrlLabel')+' : HTTP(S)');
        if(kind==='server')payload.id=editing?.id;
        if(data.apiKey?.trim())payload.apiKey=data.apiKey.trim();
        const response=await write('/api/settings/jellyfin-servers',payload,kind==='server'?'PATCH':'POST');
        await load();
        const saved=servers.find((v: any)=>kind==='server'?v.id===payload.id:v.id===(response.id||response.server?.id)||(v.name===payload.name&&v.url===payload.url));
        if(!saved||!contains(saved,{name:payload.name,url:payload.url}))throw new Error(s('serverUpdateError'));
        editing=null;adding=false;return;
      }
      if(kind==='locale'){await saveSettings({defaultLocale:data.defaultLocale,timeFormat:data.timeFormat,ssoButtonLabel:data.ssoButtonLabel.trim()});return;}
      if(kind==='sessions'){await saveSettings({authRememberThirtyDaysEnabled:!!data.authRememberThirtyDaysEnabled,ssoButtonLabel:data.ssoButtonLabel.trim()});return;}
      if(kind==='smart'){
        const thresholds=Object.fromEntries(smartFields.map(([key,,min,max,fallback])=>[key,clamp(data[key],min,max,fallback)]));
        await write('/api/admin/security/smart-settings',{thresholds},'PATCH');await load();
        if(!contains(smart,thresholds))throw new Error(t('common.saveError'));return;
      }
      if(kind==='telemetry'){
        await saveSettings({pluginTelemetrySettings:{...model.pluginTelemetrySettings,precisionProfile:telemetry.precisionProfile,...Object.fromEntries(telemetryFields.map(([key,,min,fallback])=>[key,clamp(data[key],min,Number.MAX_SAFE_INTEGER,fallback)])),...Object.fromEntries(tracking.map(key=>[key,!!data[key]]))}});return;
      }
      if(kind==='media'){
        const thresholds={...resolution,showLibraryMediaBadges:!!data.showLibraryMediaBadges};
        const rules={...resolution.completionRules,libraries:{...resolution.completionRules?.libraries}};
        for(const type of ruleTypes){
          const rule: Record<string, any>={...normalizeRule(type==='default'?rules.default:rules.libraries[type],type==='music'),completionEnabled:!!data[`rule-${type}-completionEnabled`]};
          for(const key of ['abandonedThreshold','partialThreshold','completedThreshold'])rule[key]=Number(data[`rule-${type}-${key}`]);
          if(type==='default')rules.default=normalizeRule(rule);else rules.libraries[type]=normalizeRule(rule,type==='music');
        }
        for(const [key,defaults] of Object.entries(resolutions))thresholds[key]={...resolution[key],...Object.fromEntries(['maxW','maxH'].map((field,i)=>[field,Number(data[`res-${key}-${field}`])>0?Number(data[`res-${key}-${field}`]):defaults[i]]))};
        thresholds.completionRules=rules;
        await saveSettings({resolutionThresholds:thresholds,excludedLibraries:model.excludedLibraries||[]});
      }
    },kind==='telemetry'?s('telemetrySaved'):kind==='smart'?sec('smartThresholdsSaved'):undefined);
  }
  function exclude(key: string){const set=new Set<string>(model.excludedLibraries||[]);set.has(key)?set.delete(key):set.add(key);model.excludedLibraries=[...set];}
  function preset(value: string){
    model.pluginTelemetrySettings={...model.pluginTelemetrySettings,precisionProfile:value,...Object.fromEntries(telemetryFields.map(([key,,,fallback])=>[key,fallback])),...Object.fromEntries(tracking.map(key=>[key,true])),...(value==='balanced'?{playingIntervalSeconds:15,pausedIntervalSeconds:60,staleSessionTimeoutSeconds:180}:value==='minimal'?{playingIntervalSeconds:30,pausedIntervalSeconds:120,staleSessionTimeoutSeconds:300,retryQueueSize:250,retryFlushBatchSize:25}:{})};revision++;
  }
  async function copy(text: string){
    if(navigator.clipboard){await navigator.clipboard.writeText(text);return;}
    const field=document.createElement('textarea');field.value=text;field.style.position='fixed';field.style.opacity='0';document.body.append(field);
    try{field.select();if(!document.execCommand('copy'))throw new Error(s('copyKeyError'));}finally{field.remove();}
  }
  async function pluginKey(server: any, regenerate: boolean){
    await action(async()=>{const result=await write('/api/settings/jellyfin-servers/plugin-key',{id:server.id,jellyfinServerId:server.jellyfinServerId,regenerate});
      if(!result.pluginApiKey)throw new Error(s('pluginKeyFetchError'));
      if(!alive())return;secrets[server.id]=result.pluginApiKey;visible['plugin-key-'+server.id]=true;
      if(!regenerate)await copy(result.pluginApiKey);await load();
    },s(regenerate?'serverPluginKeyDerived':'keyCopied'));
  }
  async function deleteServer(server: any){
    if(server.isPrimary||!confirm(extra('Supprimer ce serveur ? Les statistiques historiques seront conservées.','Delete this server? Historical statistics will be preserved.')))return;
    await action(async()=>{await write('/api/settings/jellyfin-servers/'+encodeURIComponent(server.id),undefined,'DELETE');await load();if(servers.some((v: any)=>v.id===server.id))throw new Error(t('common.saveError'));},s('deleted'));
  }
  onMount(()=>{
    if(!context.user?.isAdmin){context.navigate('/login');return;}
    void load().catch(error=>{if(alive()){loading=false;failed=true;feedback={error:true,text:error.message};}});
    return()=>{disposed=true;};
  });
</script>

{#snippet field(name: string, label: string, value: any, type='text', readonly=false, hint='', required=false, min?: number, max?: number)}
  <label class="settings-field"><span>{label}</span><div class="settings-input-wrap">
    <input class="form-input" {name} {value} type={type==='password'&&visible[name]?'text':type} {readonly} {required} {min} {max} maxlength={name==='ssoButtonLabel'?80:undefined} disabled={busy} />
    {#if type==='password'}<button type="button" class="btn btn-secondary settings-eye" aria-label={s('clickToShow')} aria-pressed={!!visible[name]} onclick={()=>visible[name]=!visible[name]} disabled={busy}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button>{/if}
  </div>{#if hint}<small class="settings-help">{hint}</small>{/if}</label>
{/snippet}
{#snippet toggle(name: string, label: string, checked: boolean, hint='')}
  <label class="settings-switch-row"><span><strong>{label}</strong>{#if hint}<small class="settings-help">{hint}</small>{/if}</span><input class="settings-switch" type="checkbox" role="switch" {name} {checked} disabled={busy}/></label>
{/snippet}
{#snippet save(label=s('saveSettings'))}<div class="settings-footer"><button type="submit" class="btn btn-primary" disabled={busy}>{busy?t('common.saving'):label}</button></div>{/snippet}
{#snippet badge(label: string, tone='')}<span class="settings-badge {tone}">{label}</span>{/snippet}
{#snippet serverForm(server: Record<string, any> | null)}
  <form data-form={server?'server':'add-server'} onsubmit={event=>submit(event,server?'server':'add-server')}>
    <div class="settings-server-grid">{@render field('name',s('serverNameLabel'),server?.name||'','text',false,'',true)}{@render field('url',s('serverUrlLabel'),server?.url||'','url',false,'',true)}{@render field('apiKey',s('serverApiKeyLabel'),'','password',false,s('serverApiKeyHint'),!server)}</div>
    {#if !server?.isPrimary}{@render toggle('allowAuthFallback',s('allowAuthFallback'),server?.allowAuthFallback??true)}{/if}
    <div class="settings-footer"><button type="button" class="btn btn-secondary" disabled={busy} onclick={()=>{editing=null;adding=false;}}>{s('cancel')}</button><button type="submit" class="btn btn-primary" disabled={busy}>{s(server?'saveServer':'addThisServer')}</button></div>
  </form>
{/snippet}

<section class="jt-settings settings-modern settings-route-{context.page.replaceAll('/','-')}">
  {@html context.tabs}
  <div class="settings-body" aria-busy={loading||busy}>
    <header class="settings-page-heading"><div><p class="settings-eyebrow">{t('nav.settings')}</p><h1>{context.page==='jellyfin'?s('jellyfinServersTitle'):context.page==='media'?s('mediaSettings'):sec('securityCenterTitle')}</h1><p class="settings-help">{context.page==='jellyfin'?s('jellyfinServersDesc'):context.page==='media'?s('mediaSettingsDesc'):sec('securityCenterDesc')}</p></div><button type="button" class="btn btn-secondary" onclick={refresh} disabled={loading||busy}>{sec('refresh')}</button></header>
    {#if feedback}<div class="settings-message {feedback.error?'error':'success'}" role={feedback.error?'alert':'status'}><span>{feedback.text}</span><button type="button" class="btn btn-secondary" aria-label={t('common.close')} onclick={()=>feedback=null}>×</button></div>{/if}
    {#if loading}<div class="settings-loading" role="status">{t('common.loading')}</div>{:else if failed}<button type="button" class="btn btn-secondary" onclick={refresh} disabled={busy}>{t('common.retry')}</button>
    {:else if context.page==='jellyfin'}
      <div class="settings-summary"><div><small>{s('jellyfinServersTitle')}</small><strong>{servers.length}</strong></div><div><small>{s('jellyfinConnected')}</small><strong>{servers.filter(online).length} / {servers.length}</strong></div><div><small>{s('pluginUrlLabel')}</small><strong class="settings-endpoint">{location.origin+(serversData.pluginEndpointPath||'/api/plugin/events')}</strong></div></div>
      {#each servers as server (server.id)}
        <article class="settings-card settings-server-card"><header class="settings-card-header"><div><h2>{server.name}</h2><div class="settings-badges">{@render badge(s(server.isPrimary?'primaryServerLabel':'secondaryServerLabel'),server.isPrimary?'primary':'')}{@render badge(status(server),online(server)?'success':server.hasApiKey===false?'neutral':'error')}{@render badge(s(server.hasPluginKey?serversData.pluginConnected?'pluginConnected':'pluginReady':'pluginNotConfigured'),server.hasPluginKey?serversData.pluginConnected?'success':'warning':'error')}{#if server.version}{@render badge('Jellyfin '+server.version,server.isLegacy?'warning':'neutral')}{/if}</div></div><div class="settings-toolbar"><button type="button" class="btn btn-secondary" disabled={busy} onclick={()=>editing=editing?.id===server.id?null:{...server}}>{s(editing?.id===server.id?'cancel':'editServer')}</button>{#if !server.isPrimary}<button type="button" class="btn btn-danger" disabled={busy} onclick={()=>deleteServer(server)}>{t('common.delete')}</button>{/if}</div></header>
          <div class="settings-card-content">{#if editing?.id===server.id}{@render serverForm(editing)}{:else}<div class="settings-connection-details"><div><small>{s('serverUrlLabel')}</small><a href={server.url} target="_blank" rel="noopener noreferrer">{server.url}</a></div><div><small>{s('serverApiKeyLabel')}</small><strong>{server.apiKeyMasked||(server.hasApiKey?'••••••••':s('notConfigured'))}</strong></div></div>{/if}
            <details class="settings-plugin-panel"><summary>{s('pluginConnectionFor',{name:server.name})}<span class="settings-help">{s('pluginUrlLabel')} · {s('serverPluginKeyLabel')}</span></summary><div class="settings-plugin-content">{#if serversData.pluginLastSeen}<p class="settings-help">{s('lastHeartbeat',{date:date(serversData.pluginLastSeen)})}{#if serversData.pluginVersion} · Plugin v{serversData.pluginVersion}{/if}</p>{/if}<div class="settings-copy-field">{@render field('plugin-url-'+server.id,s('pluginUrlLabel'),location.origin+(serversData.pluginEndpointPath||'/api/plugin/events'),'text',true)}<button type="button" class="btn btn-secondary" disabled={busy} onclick={()=>action(()=>copy(location.origin+(serversData.pluginEndpointPath||'/api/plugin/events')),s('urlCopied'))}>{s('copyUrl')}</button></div><div class="settings-copy-field">{@render field('plugin-key-'+server.id,s('serverPluginKeyLabel'),secrets[server.id]||server.pluginApiKey||server.pluginKeyMasked||(server.hasPluginKey?'••••••••':''),'password',true)}<button type="button" class="btn btn-secondary" disabled={busy} onclick={()=>pluginKey(server,false)}>{s('copyKey')}</button></div><button type="button" class="btn btn-secondary" disabled={busy} onclick={()=>pluginKey(server,true)}>{s('deriveServerKey')}</button></div></details>
          </div></article>
      {:else}<div class="settings-note">{s('noServersConfigured')}</div>{/each}
      <article class="settings-card"><header class="settings-card-header"><div><h2>{s('addServer')}</h2><p>{s('addServerPermanentDesc')}</p></div><button type="button" class="btn btn-primary" disabled={busy} onclick={()=>adding=!adding}>{s(adding?'hideAddForm':'addServer')}</button></header>{#if adding}<div class="settings-card-content">{@render serverForm(null)}</div>{/if}</article>
      <details class="settings-extra"><summary>{t('nav.general')}</summary>{#key revision}<form data-form="locale" onsubmit={event=>submit(event,'locale')}><div class="settings-grid two"><label class="settings-field"><span>{extra('Langue par défaut','Default language')}</span><select class="form-input" name="defaultLocale" value={model.defaultLocale||'fr'} disabled={busy}>{#each ['fr','en','de','es','it','nl','pl','pt-BR','ru','zh'] as locale}<option value={locale}>{locale}</option>{/each}</select></label><label class="settings-field"><span>{extra("Format de l'heure",'Time format')}</span><select class="form-input" name="timeFormat" value={model.timeFormat||'24h'} disabled={busy}><option>24h</option><option>12h</option></select></label></div>{@render field('ssoButtonLabel',extra('Texte du bouton de connexion SSO','SSO sign-in button label'),resolution.ssoButtonLabel||'')}{@render save()}</form>{/key}<div class="settings-footer"><a class="btn btn-secondary" href="/settings/go-overview" data-link>{s('overviewTitle')}</a><a class="btn btn-secondary" href="/settings/go-network" data-link>{t('dashboard.networkTab')}</a></div></details>
    {:else if context.page==='media'}
      {#key revision}<form data-form="media" onsubmit={event=>submit(event,'media')}>
        <article class="settings-card"><header class="settings-card-header"><div><h2>{s('excludedLibrariesTitle')}</h2><p>{s('excludedLibrariesDesc')}</p></div></header><div class="settings-card-content"><p class="settings-help">{s('serverScopeHint')}</p><div class="settings-library-groups">{#each groups as group}<section class="settings-library-group" aria-label={group.server?.name||group.id}><header><h3>{group.server?.name||group.id}</h3><p class="settings-help settings-library-url">{group.server?.url||group.id}</p>{#if group.server}{@render badge(status(group.server),online(group.server)?'success':'warning')}{/if}</header><div class="settings-library-buttons">{#each group.scopes as library}<button type="button" class="settings-library" class:excluded={(model.excludedLibraries||[]).includes(library.key)} aria-pressed={(model.excludedLibraries||[]).includes(library.key)} disabled={busy} onclick={()=>exclude(library.key)}><strong>{library.libraryName}</strong><small>{s((model.excludedLibraries||[]).includes(library.key)?'libraryExcludedState':'libraryActiveState')}</small></button>{/each}</div></section>{:else}<p class="settings-help">{s('noLibrariesFound')} {s('noLibrariesFoundHint')}</p>{/each}</div>{#if orphaned.length}<details class="settings-extra"><summary>{s('legacyRulesTitle')} ({orphaned.length})</summary><p class="settings-help">{s('legacyRulesDesc')}</p><div class="settings-library-buttons">{#each orphaned as key}<button type="button" class="settings-library excluded" disabled={busy} onclick={()=>exclude(key)} aria-label={s('removeExclusionLabel')+' '+key}>{key} ×</button>{/each}</div></details>{/if}{@render toggle('showLibraryMediaBadges',s('libraryBadgesToggleTitle'),resolution.showLibraryMediaBadges!==false,s('libraryBadgesToggleDesc'))}<div class="settings-note">{s('syncRequired')}</div></div></article>
        <article class="settings-card"><header class="settings-card-header"><div><h2>{s('libraryRules')}</h2><p>{s('completionRulesHint')}</p></div></header><div class="settings-card-content settings-rule-grid">{#each ruleTypes as type}{@const rule=normalizeRule(type==='default'?resolution.completionRules?.default:resolution.completionRules?.libraries?.[type],type==='music')}<fieldset class="settings-rule"><legend>{type==='default'?s('completionRulesDefault'):t('common.'+type)}</legend>{@render toggle('rule-'+type+'-completionEnabled',extra('Détection de complétion','Completion detection'),rule.completionEnabled)}<div class="settings-grid three">{#each [['abandonedThreshold','abandoned'],['partialThreshold','partial'],['completedThreshold','completed']] as [key,label]}{@render field('rule-'+type+'-'+key,s(label)+' (%)',rule[key],'number',false,'',false,0,100)}{/each}</div></fieldset>{/each}</div></article>
        <details class="settings-extra"><summary>{s('resolutionThresholds')}</summary><p class="settings-help">{s('resolutionThresholdsDesc')}</p><div class="settings-grid two">{#each Object.entries(resolutions) as [key,defaults]}<fieldset class="settings-nested"><legend>{key}</legend><div class="settings-grid two">{@render field('res-'+key+'-maxW',s('maxWidth'),resolution[key]?.maxW??defaults[0],'number',false,'',false,1)}{@render field('res-'+key+'-maxH',s('maxHeight'),resolution[key]?.maxH??defaults[1],'number',false,'',false,1)}</div></fieldset>{/each}</div></details><div class="settings-footer settings-save-bar"><button type="button" class="btn btn-secondary" disabled={busy} onclick={refresh}>{s('cancel')}</button><button type="submit" class="btn btn-primary" disabled={busy}>{busy?t('common.saving'):s('saveSettings')}</button></div>
      </form>{/key}
    {:else}
      <article class="settings-card"><header class="settings-card-header"><div><h2>{sec('pluginStateTitle')}</h2><p>{sec('pluginStateDesc')}</p></div>{@render badge(sec(plugin.connected?'online':'offline'),plugin.connected?'success':'warning')}</header><div class="settings-card-content"><dl class="settings-plugin-status">{#each [['serverLabel',plugin.serverName||'—'],['versionLabel',plugin.version||'—'],['lastPingLabel',date(plugin.lastSeen)]] as [key,value]}<div><dt>{sec(key)}</dt><dd>{value}</dd></div>{/each}</dl></div></article>
      <article class="settings-card settings-telemetry"><header class="settings-card-header"><div><h2>{s('pluginTelemetryTitle')}</h2><p>{s('pluginTelemetryDesc')}</p></div></header><div class="settings-card-content"><div class="settings-presets" aria-label={s('pluginTelemetryTitle')}>{#each [['very_precise','telemetryPresetVeryPrecise'],['balanced','telemetryPresetBalanced'],['minimal','telemetryPresetMinimal']] as [value,key]}<button type="button" class="btn btn-secondary" class:active={telemetry.precisionProfile===value} aria-pressed={telemetry.precisionProfile===value} disabled={busy} onclick={()=>preset(value)}>{s(key)}</button>{/each}</div>{#key revision}<form data-form="telemetry" onsubmit={event=>submit(event,'telemetry')}><div class="settings-grid three">{#each telemetryFields as [key,label,min]}{@render field(key,s(label),telemetry[key],'number',false,'',false,min)}{/each}</div><div class="settings-grid two">{#each tracking as key}{@render toggle(key,s('telemetry'+key[0].toUpperCase()+key.slice(1)),telemetry[key])}{/each}</div>{@render save(s('telemetrySave'))}</form>{/key}</div></article>
      <div class="settings-security-grid"><article class="settings-card"><header class="settings-card-header"><div><h2>{sec('smartThresholdsTitle')}</h2><p>{sec('smartThresholdsDesc')}</p></div></header><div class="settings-card-content">{#key revision}<form data-form="smart" onsubmit={event=>submit(event,'smart')}>{#each smartFields as [key,label,min,max,fallback]}{@render field(key,sec(label),smart[key]??fallback,'number',false,'',false,min,max)}{/each}{@render save(sec('save'))}</form>{/key}</div></article><article class="settings-card"><header class="settings-card-header"><div><h2>{s('authSecurity')}</h2></div></header><div class="settings-card-content">{#key revision}<form data-form="sessions" onsubmit={event=>submit(event,'sessions')}>{@render toggle('authRememberThirtyDaysEnabled',sec('authSessionsRememberThirtyDays'),model.authRememberThirtyDaysEnabled,sec(model.authRememberThirtyDaysEnabled?'authSessionsRememberThirtyDaysOn':'authSessionsRememberThirtyDaysOff'))}{@render field('ssoButtonLabel',extra('Texte du bouton de connexion SSO','SSO sign-in button label'),resolution.ssoButtonLabel||'')}{@render save()}</form>{/key}</div></article></div>
    {/if}
  </div>
</section>
