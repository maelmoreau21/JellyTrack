/* Settings hierarchy and forms restored from main; backend remains the Go API. */
(function () {
  'use strict';
  const RESOLUTIONS = { '480p': [792, 528], '720p': [1408, 792], '1080p': [2112, 1188], '4K': [4224, 2376] };
  const RULE_TYPES = ['default', 'movies', 'tvshows', 'music', 'books', 'homevideos'];
  const TELEMETRY = [
    ['playingIntervalSeconds', 'telemetryPlayingInterval', 1, 5], ['pausedIntervalSeconds', 'telemetryPausedInterval', 5, 30],
    ['staleSessionTimeoutSeconds', 'telemetryStaleSession', 30, 90], ['mergeWindowSeconds', 'telemetryMergeWindow', 0, 300],
    ['seekThresholdSeconds', 'telemetrySeekThreshold', 5, 20], ['retryQueueSize', 'telemetryRetryQueueSize', 10, 500],
    ['retryFlushBatchSize', 'telemetryRetryFlushBatchSize', 1, 50]
  ];
  const TRACKING = ['trackPauseResume', 'trackSeek', 'trackAudioSubtitleChanges', 'trackSessionEnded'];
  const PLANNINGS = [
    ['recentSyncEveryHours', 'recentSync', 'schedulerRecentIntervalHint', 1, 24, 1, 6],
    ['fullSyncEveryHours', 'fullSync', 'schedulerFullIntervalHint', 24, 168, 24, 48],
    ['integrityCheckEveryHours', 'integrityCheckTask', 'schedulerIntegrityIntervalHint', 1, 168, 1, 6],
    ['backupEveryHours', 'backupTask', 'schedulerBackupIntervalHint', 1, 168, 1, 24]
  ];
  const SMART = [['ipAttemptThreshold', 'ipAttemptThresholdLabel', 1, 10000, 50], ['ipWindowMinutes', 'ipWindowMinutesLabel', 5, 10080, 60], ['newCountryGraceMinutes', 'newCountryGraceMinutesLabel', 1, 1440, 120]];
  const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const copy = value => JSON.parse(JSON.stringify(value));
  const normalizeRule = (rule, music = false) => {
    const base = { completionEnabled: true, abandonedThreshold: music ? 12 : 10, partialThreshold: music ? 30 : 20, completedThreshold: music ? 60 : 80, ...object(rule) };
    base.completedThreshold = clamp(base.completedThreshold, 1, 100, 80);
    base.partialThreshold = Math.max(1, Math.min(clamp(base.partialThreshold, 0, 100, 20), base.completedThreshold - 1));
    base.abandonedThreshold = Math.max(0, Math.min(clamp(base.abandonedThreshold, 0, 100, 10), base.partialThreshold - 1));
    return base;
  };
  window.JellyTrackSettings = {
    async mount(ctx, subpage = 'jellyfin') {
      if (subpage === 'dataBackups') {
        window.JellyTrackUI.backups(ctx.main, { ...ctx,
          tabs: window.JellyTrackNavigation.settingsTabs('/settings/dataBackups'),
          icon: name => window.JellyTrackNavigation.icon(name)
        });
        return;
      }
      const { main, api, utils, i18n, signal, user, navigate } = ctx;
      if (!user?.isAdmin) { navigate('/login'); return; }
      if (subpage === 'analytics') { navigate('/media/analysis', true); return; }
      if (['overview', 'network'].includes(subpage)) { navigate('/settings/jellyfin', true); return; }
      if (['go-overview', 'go-network'].includes(subpage)) { await ctx.legacy(subpage.slice(3)); return; }
      if (subpage === 'sso') { navigate('/settings/jellyfin', true); return; }
      if (subpage === 'plugin') subpage = 'jellyfin';
      if (['jellyfin', 'media', 'plugin/security'].includes(subpage)) {
        await window.JellyTrackUI.settings(main, { ...ctx, page: subpage,
          tabs: window.JellyTrackNavigation.settingsTabs('/settings/' + subpage)
        });
        return;
      }
      const esc = value => utils.escapeHtml(String(value ?? ''));
      const t = (key, values = {}) => i18n.t(key, values) || key.split('.').pop();
      const s = (key, values) => t('settings.' + key, values);
      const sec = key => t('securitySettings.' + key);
      const extra = (key, fr, en) => i18n.t('settings.'+key) || (document.documentElement.lang==='fr'?fr:en);
      main.innerHTML = `<section class="jt-settings settings-route-${subpage.replaceAll('/','-')}">${window.JellyTrackNavigation.settingsTabs('/settings/' + subpage)}<div class="settings-body" aria-busy="true"><div class="settings-loading" role="status">${esc(t('common.loading'))}</div></div></section>`;
      const root = main.firstElementChild;
      const body = root.querySelector('.settings-body');
      const alive = () => main.contains(root) && !signal?.aborted;
      let model = {}, serversData = {}, overview = {}, smart = {}, backups = [], feedback = null, busy = false, generation = 0;
      let editing = null, adding = false, importFile = null;
      const pluginSecrets = new Map();
      const visibility = new Set();
      const scopeKey = (serverId, libraryName) => `srvlib|${serverId}|${encodeURIComponent(libraryName)}`;
      const date = value => { try { return value ? new Date(value).toLocaleString(i18n.locale || document.documentElement.lang || undefined) : '—'; } catch { return '—'; } };
      const badge = (label, tone = '') => `<span class="settings-badge ${tone}">${esc(label)}</span>`;
      const symbolPaths = {
        eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
        copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
        refresh:'<path d="M3 11a9 9 0 0 1 15-6l3 3M21 3v5h-5M21 13a9 9 0 0 1-15 6l-3-3M3 21v-5h5"/>',
        upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
        clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
        edit:'<path d="m16 3 5 5M3 21l5-1L21 7a2 2 0 0 0-5-5L3 15Z"/>',plus:'<path d="M12 5v14M5 12h14"/>',
        play:'<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4Z"/>',
        plug:'<path d="M12 22v-5M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0V7Z"/>',
        film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 7h4M3 12h4M3 17h4M17 7h4M17 12h4M17 17h4"/>'
      };
      const symbol = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbolPaths[name]||''}</svg>`;
      const btn = (label, action, extra = '', style = 'secondary') => {
        const glyph={eye:'eye','copy-url':'copy','plugin-copy':'copy','plugin-regenerate':'refresh','edit-server':'edit','add-toggle':'plus','run-task':'play',refresh:'refresh'}[action];
        return `<button type="button" class="btn btn-${style}" data-action="${action}" ${extra}>${glyph?symbol(glyph):''}${action==='eye'?'':esc(label)}</button>`;
      };
      const save = label => `<div class="settings-footer"><button type="submit" class="btn btn-primary" ${busy ? 'disabled' : ''}>${esc(busy ? t('common.saving') : label || s('saveSettings'))}</button></div>`;
      const notice = () => feedback ? `<div class="settings-message ${feedback.error ? 'error' : 'success'}" role="${feedback.error ? 'alert' : 'status'}"><span>${esc(feedback.text)}</span>${btn('×', 'dismiss', 'aria-label="' + esc(t('common.close')) + '"')}</div>` : '';
      const card = (title, description, content, extra = '', headerActions = '') => {
        const icons = new Map([[s('jellyfinServersTitle'),'plug'],[s('mediaSettings'),'film'],[s('dataBackups'),'database']]);
        if(title===s('dataBackups')) {const toolbar=content.match(/^<div class="settings-toolbar">[\s\S]*?<\/div>/);if(toolbar){headerActions=toolbar[0];content=content.slice(toolbar[0].length);}}
        const glyph=icons.get(title);
        return `<article class="settings-card ${extra}"><header class="settings-card-header"><div><h2>${glyph?['plug','film','copy'].includes(glyph)?symbol(glyph):window.JellyTrackNavigation.icon(glyph):''}${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div>${headerActions}</header><div class="settings-card-content">${content}</div></article>`;
      };
      const section = (title, description, content) => `<section class="settings-section"><h3>${esc(title)}</h3>${description ? `<p class="settings-help">${esc(description)}</p>` : ''}${content}</section>`;
      const input = (name, label, value, options = {}) => {
        const { type = 'text', hint = '', locked = false, disabled = false, min, max, step, placeholder = '', required = false, secret = false, readOnly = false, maxlength }  = options;
        return `<label class="settings-field"><span>${esc(label)}${locked ? badge(t('ssoSettings.dockerEnvLocked'), 'warning') : ''}</span><div class="settings-input-wrap"><input class="form-input" name="${esc(name)}" value="${esc(value)}" type="${secret && visibility.has(name) ? 'text' : type}" ${locked || disabled ? 'disabled' : ''} ${readOnly ? 'readonly' : ''} ${required ? 'required' : ''} ${maxlength != null ? `maxlength="${maxlength}"` : ''} ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} ${step != null ? `step="${step}"` : ''} placeholder="${esc(placeholder)}">${secret ? btn(visibility.has(name) ? '◉' : '◎', 'eye', `data-name="${esc(name)}" aria-label="${esc(s('clickToShow'))}" aria-pressed="${visibility.has(name)}"`) : ''}</div>${hint ? `<small class="settings-help">${esc(hint)}</small>` : ''}</label>`;
      };
      const toggle = (name, label, checked, hint = '', locked = false) => `<label class="settings-switch-row"><span><strong>${esc(label)}</strong>${hint ? `<small class="settings-help">${esc(hint)}</small>` : ''}${locked ? badge(t('ssoSettings.dockerEnvLocked'), 'warning') : ''}</span><input class="settings-switch" type="checkbox" role="switch" name="${esc(name)}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}></label>`;
      const select = (name, label, value, entries, hint = '') => `<label class="settings-field"><span>${esc(label)}</span><select class="form-input" name="${name}">${entries.map(([v, text]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>${hint ? `<small class="settings-help">${esc(hint)}</small>` : ''}</label>`;
      const serverStatus = server => badge(s(['online','connected'].includes(server.connectionState) ? 'jellyfinConnected' : server.hasApiKey === false ? 'missingApiKey' : 'jellyfinOffline'), ['online','connected'].includes(server.connectionState) ? 'success' : server.hasApiKey === false ? 'neutral' : 'error');
      const connectionText = server => ['Jellyfin connecté.','Jellyfin indisponible.','Clé API non configurée.'].includes(server.connectionMessage)||!server.connectionMessage ? s(['online','connected'].includes(server.connectionState)?'jellyfinConnected':server.hasApiKey===false?'missingApiKey':'jellyfinOffline') : server.connectionMessage;
      const get = url => api.getJSON(url);
      const contains = (actual, expected) => Array.isArray(expected) ? Array.isArray(actual) && JSON.stringify([...actual].sort())===JSON.stringify([...expected].sort()) : expected && typeof expected==='object' ? Object.entries(expected).every(([key,value])=>contains(actual?.[key],value)) : actual===expected;
      const verify = (actual, expected) => {if(!contains(actual,expected))throw new Error(extra('saveReadbackError',"L'enregistrement n'a pas été confirmé après relecture. Actualisez les réglages.",'The saved values could not be confirmed. Refresh the settings.'));};
      const write = async (url, payload, method = 'POST') => {
        const response = await api.request(url, { method, body: payload });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.error || data.message || `${t('common.networkError')} (HTTP ${response.status})`);
        return data;
      };
      const taskRequests = new Set();
      async function taskWrite(url, payload) {
        if(taskRequests.has(url))throw new Error(extra('taskAlreadyRunning','Cette tâche est déjà en cours.','This task is already running.'));
        taskRequests.add(url);
        const controller=new AbortController();let timer;
        try {
          return await Promise.race([
            (async()=>{const response=await api.request(url,{method:'POST',body:payload,signal:controller.signal});const data=await response.json();if(!response.ok||data.success===false)throw new Error(data.error||data.message||`${t('common.networkError')} (HTTP ${response.status})`);return data;})(),
            new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error(extra('taskTimedOut',"Le délai de réponse est dépassé. Vérifiez les journaux avant de relancer la tâche.",'The response timed out. Check the logs before restarting the task.')));},31*60*1000);})
          ]);
        } finally {clearTimeout(timer);taskRequests.delete(url);}
      }
      async function runTask(button,output,url,payload) {
        if(button.disabled)return;
        const original=button.innerHTML;button.disabled=true;button.textContent=t('common.running');button.setAttribute('aria-busy','true');
        try {const response=await taskWrite(url,payload);if(alive()&&output.isConnected)renderTaskResult(output,response);}
        catch(error){if(alive()&&output.isConnected){output.textContent=error.message||t('common.networkError');output.setAttribute('role','alert');}}
        finally {button.disabled=false;button.innerHTML=original;button.removeAttribute('aria-busy');}
      }
      const showError = error => { if (alive()) { feedback = { text: error.message || t('common.networkError'), error: true }; updateFeedback(); } };
      const updateFeedback = () => {
        let el = body.querySelector('.settings-feedback');
        if (!el) { el = document.createElement('div'); el.className = 'settings-feedback'; body.prepend(el); }
        el.innerHTML = notice();
      };
      async function load() {
        const current = ++generation;
        const jobs = subpage === 'jellyfin' ? [get('/api/settings/jellyfin-servers'), get('/api/settings')] : subpage === 'dataBackups' ? [get('/api/backup/auto')] : subpage === 'plugin/security' ? [get('/api/settings'), get('/api/admin/security/overview'), get('/api/admin/security/smart-settings')] : subpage === 'media' ? [get('/api/settings'), get('/api/settings/jellyfin-servers')] : [get('/api/settings')];
        const data = await Promise.all(jobs);
        if (!alive() || current !== generation) return;
        if (subpage === 'jellyfin') { serversData = data[0]; model = data[1]; }
        else if (subpage === 'dataBackups') backups = (data[0].backups || []).sort((a, b) => new Date(b.date) - new Date(a.date));
        else { model = data[0]; if (subpage === 'media') serversData = data[1]; if (subpage === 'plugin/security') { overview = data[1]; smart = data[2].thresholds || {}; } }
        model = copy(model);
        render();
      }
      async function action(button, fn, success) {
        if (busy) return;
        busy = true; button.disabled = true;
        body.setAttribute('aria-busy', 'true');
        try { const result=await fn(); if (!alive() || result===false) return; feedback = { text: success || s('savedSuccess') }; }
        catch (error) { showError(error); }
        finally { busy = false; if (alive()) { button.disabled = false; body.querySelectorAll('button[type="submit"]').forEach(el=>el.disabled=false);body.querySelectorAll('form[data-form="server"],form[data-form="add-server"]').forEach(validateServerForm); body.removeAttribute('aria-busy'); updateFeedback(); } }
      }
      function renderNotifications() {
        return card(s('notifications'),s('notificationsDesc'),`<form data-form="notifications">${toggle('discordAlertsEnabled',s('enableDiscord'),model.discordAlertsEnabled,s('enableDiscordDesc'))}<div class="settings-notification-fields" ${model.discordAlertsEnabled?'':'hidden'}>${input('discordWebhookUrl',s('discordWebhookUrl'),model.discordWebhookUrl||'',{type:'url',placeholder:'https://discord.com/api/webhooks/…'})}${select('discordAlertCondition',s('notifConditions'),model.discordAlertCondition||'ALL',[['ALL',s('notifAll')],['TRANSCODE_ONLY',s('notifTranscode')],['NEW_IP_ONLY',s('notifNewIp')]])}${input('maxConcurrentTranscodes',s('maxConcurrentTranscodesTitle'),model.maxConcurrentTranscodes??0,{type:'number',min:0,hint:s('maxConcurrentTranscodesDesc')})}</div>${save()}</form>`);
      }
      function renderScheduler() {
        const intervals = {...Object.fromEntries(PLANNINGS.map(([key,,,,,,value])=>[key,value])),...object(model.resolutionThresholds?.schedulerIntervals),...object(model.schedulerIntervals)};
        const tasks = [
          ['recentSync','recentSyncDesc','/api/sync',{mode:'recent'},intervals.recentSyncEveryHours,'sky'],
          ['fullSync','fullSyncDesc','/api/sync',{mode:'full'},intervals.fullSyncEveryHours,'violet'],
          ['integrityCheckTask','integrityCheckTaskDesc','/api/admin/integrity-cleanup',{},intervals.integrityCheckEveryHours,'emerald'],
          ['backupTask','backupTaskDesc','/api/backup/auto/trigger',{},intervals.backupEveryHours,'amber'],
          ['consolidateHistoryTask','consolidateHistoryTaskDesc','/api/admin/consolidate-history',{},null,'purple'],
        ];
        const taskCard = card(s('taskScheduler'),s('taskSchedulerDesc'),`<div class="settings-tasks">${tasks.map(([title,desc,url,payload,hours,color],index)=>`<div class="settings-task ${color}"><div><h3>${index<2?symbol('refresh'):index===3?symbol('save'):window.JellyTrackNavigation.icon(index===2?'shield':'layers')}${esc(s(title))}</h3><p class="settings-help">${esc(s(desc))}</p><small>${symbol('clock')}${esc(hours===0?s('manualOnly'):hours?s('schedulerEveryHours',{hours}):s('dailyAtTime',{time:'03:45 UTC'}))}</small><div class="settings-task-feedback" data-task-feedback="${index}" role="status"></div></div>${btn(t('common.run'),'run-task',`data-index="${index}" data-url="${url}" data-payload="${esc(JSON.stringify(payload))}"`)}</div>`).join('')}</div>`);
        const schedules = card(s('saveSchedules'),s('schedulerSchedulesDesc')+' '+s('schedulerSchedulesExample'),`<form data-form="schedules"><div class="settings-planning-rows">${PLANNINGS.map(([key,title,hint,min,max,step])=>`<label class="settings-planning-row"><span><strong>${esc(s(title))}</strong><small class="settings-help">${esc(s(hint))}</small></span><span class="settings-planning-value"><input class="form-input" type="number" name="${key}" min="${min}" max="${max}" step="${step}" value="${intervals[key]}" aria-label="${esc(s(title))}"> h</span></label>`).join('')}</div>${save(s('saveSchedules'))}</form>`);
        const wrapped = card(s('wrappedPeriod'),s('wrappedPeriodDesc'),`<form data-form="wrapped">${toggle('wrappedPeriodEnabled',s('autoAvailability'),model.wrappedPeriodEnabled!==false,s('autoAvailabilityDesc'))}<div class="settings-grid two settings-wrapped-fields" ${model.wrappedPeriodEnabled===false?'hidden':''}>${['Start','End'].map(position=>`<fieldset class="settings-nested"><legend>${esc(s('wrapped'+position))}</legend><div class="settings-grid two">${input('wrapped'+position+'Month',s('month'),model['wrapped'+position+'Month']||(position==='Start'?12:1),{type:'number',min:1,max:12})}${input('wrapped'+position+'Day',s('day'),model['wrapped'+position+'Day']||(position==='Start'?1:31),{type:'number',min:1,max:31})}</div></fieldset>`).join('')}</div>${toggle('wrappedVisible',s('wrappedVisibilityLabel'),model.wrappedVisible!==false,s('wrappedVisibilityDesc'))}${save()}</form>`);
        return subpage==='scheduler/tasks'?taskCard:subpage==='scheduler/schedules'?schedules:taskCard+schedules+wrapped;
      }
      function renderBackups() {
        const size = backup => Number(backup.sizeMb ?? Number(backup.size||0)/1048576);
        return card(s('dataBackups'),s('dataBackupsDesc'),`<p class="settings-help">L’export standard omet les clés : les connexions devront être réassociées après restauration. L’export complet chiffré conserve les secrets enregistrés.</p><div class="settings-toolbar">${btn(s('backupNow'),'backup-now','','primary')}${btn("Export complet chiffré","backup-full")}<a class="btn btn-secondary" href="/api/backup/export">${esc(s('exportBackup'))}</a></div><div class="settings-summary"><div><small>${esc(s('backupsCount'))}</small><strong>${backups.length}</strong></div><div><small>${esc(s('totalSize'))}</small><strong>${backups.reduce((total,v)=>total+size(v),0).toFixed(2)} <span>${esc(t('common.mb'))}</span></strong></div><div><small>${esc(s('latestBackup'))}</small><strong>${symbol('clock')}${backups.length?esc(date(backups[0].date)):'—'}</strong></div></div>${section(s('backupHistory'),s('backupHistoryDesc'),`<div class="settings-table-scroll"><table class="settings-table"><thead><tr>${[s('day'),s('backupType'),t('common.mb'),s('file'),s('actions')].map(label=>`<th scope="col">${esc(label)}</th>`).join('')}</tr></thead><tbody>${backups.map(backup=>`<tr><td>${esc(date(backup.date))}</td><td>${badge(s(backup.type==='auto'||backup.name.startsWith('JellyTrack-auto-')?'backupAuto':'backupManual'))}</td><td>${size(backup).toFixed(2)}</td><td class="settings-filename">${esc(backup.name)}</td><td><div class="settings-toolbar"><a class="btn btn-secondary" target="_blank" rel="noopener" href="/api/backup/auto/download?fileName=${encodeURIComponent(backup.name)}">${esc(s('downloadBackup'))}</a>${btn(t('common.restore'),'backup-restore',`data-name="${esc(backup.name)}"`)}${btn(t('common.delete'),'backup-delete',`data-name="${esc(backup.name)}"`,'danger')}</div></td></tr>`).join('')||`<tr><td colspan="5">${esc(s('noAutoBackups'))}</td></tr>`}</tbody></table></div>`)}<section class="settings-nested settings-import"><h3>${symbol('upload')}${esc(s('importBackup'))}</h3><p class="settings-help">${esc(s('importBackupDesc'))}</p><form data-form="import"><label class="settings-field"><span>${esc(s('importBackup'))}</span><input type="file" class="form-input" name="backupFile" accept=".zip,.jtb,application/zip,application/octet-stream" required></label>${save(s('importBackup')).replace('btn btn-primary', 'btn btn-primary settings-import-submit').replace('>'+esc(s('importBackup')), '>'+symbol('upload')+esc(s('importBackup')))}</form></section><p class="settings-help">${esc(s('backupManagementDesc'))}</p>`, 'settings-backups');
      }
      function render() {
        if (!alive()) return;
        const page = subpage==='notifications'?renderNotifications():subpage.startsWith('scheduler')?renderScheduler():subpage==='dataBackups'?renderBackups():'';
        body.innerHTML = `<div class="settings-feedback">${notice()}</div>${page}`;
        body.querySelectorAll('.settings-notification-fields[hidden] input,.settings-notification-fields[hidden] select').forEach(el=>el.disabled=true);
        body.querySelectorAll('form[data-form="server"],form[data-form="add-server"]').forEach(validateServerForm);
        body.removeAttribute('aria-busy');
      }
      const fieldValues = form => Object.fromEntries([...form.elements].filter(el=>el.name).map(el=>[el.name,el.type==='checkbox'?el.checked:el.value]));
      function validateServerForm(form) {const values=fieldValues(form);form.querySelector('button[type="submit"]').disabled=busy||!values.name?.trim()||!values.url?.trim()||(form.dataset.form==='add-server'&&!values.apiKey?.trim());}
      const listenOptions = signal ? {signal} : undefined;
      root.addEventListener('input',event=>{const form=event.target.closest('form');if(['server','add-server'].includes(form?.dataset.form))validateServerForm(form);},listenOptions);
      root.addEventListener('change', event => {
        const field=event.target, form=field.closest('form');
        if(field.name==='backupFile') importFile=field.files[0]||null;
        if(field.name==='discordAlertsEnabled') {const fields=form.querySelector('.settings-notification-fields');fields.hidden=!field.checked;fields.querySelectorAll('input,select').forEach(el=>el.disabled=!field.checked);}
        if(field.name==='wrappedPeriodEnabled') form.querySelector('.settings-wrapped-fields').hidden=!field.checked;
        if(field.name.startsWith('rule-')&&field.name.endsWith('completionEnabled')) field.closest('fieldset').querySelectorAll('input[type="number"]').forEach(input=>input.disabled=!field.checked);
        if(form?.dataset.form==='server'&&editing) Object.assign(editing,fieldValues(form));
      },listenOptions);
      root.addEventListener('click', async event => {
        const button=event.target.closest('[data-action]'); if(!button||!root.contains(button)) return;
        const name=button.dataset.action;
        if(name==='dismiss') {feedback=null;updateFeedback();return;}
        if(name==='eye') {
          const field=body.querySelector(`input[name="${CSS.escape(button.dataset.name)}"]`);
          if(visibility.has(button.dataset.name))visibility.delete(button.dataset.name);else visibility.add(button.dataset.name);
          field.type=visibility.has(button.dataset.name)?'text':'password';button.setAttribute('aria-pressed',String(visibility.has(button.dataset.name)));return;
        }
        if(name==='edit-server'){ const server=serversData.servers.find(v=>v.id===button.dataset.id); editing={...server,apiKey:''};render();return;}
        if(name==='cancel-server'){editing=null;render();return;}
        if(name==='delete-server'){
          const server=serversData.servers.find(value=>value.id===button.dataset.id);
          if(!server||server.isPrimary)return;
          if(!window.confirm(extra('confirmDeleteServer','Supprimer ce serveur ? Les statistiques historiques seront conservées.','Delete this server? Historical statistics will be preserved.')))return;
          await action(button,async()=>{await write('/api/settings/jellyfin-servers/'+encodeURIComponent(server.id),undefined,'DELETE');serversData=await get('/api/settings/jellyfin-servers');if(serversData.servers.some(value=>value.id===server.id))throw new Error(t('common.saveError'));render();},s('deleted'));return;
        }
        if(name==='add-toggle'){adding=!adding;render();return;}
        if(name==='exclude'||name==='remove-exclusion'){
          const excluded=new Set(model.excludedLibraries||[]);excluded.has(button.dataset.key)?excluded.delete(button.dataset.key):excluded.add(button.dataset.key);model.excludedLibraries=[...excluded];
          // Keep unsaved numeric/rule changes when exclusion buttons rerender their region.
          const form=button.closest('form');if(form)captureMedia(fieldValues(form));render();return;
        }
        if(name==='preset'){
          model.pluginTelemetrySettings={precisionProfile:button.dataset.value,...Object.fromEntries(TELEMETRY.map(([key,,,value])=>[key,value])),...Object.fromEntries(TRACKING.map(key=>[key,true]))};
          Object.assign(model.pluginTelemetrySettings,button.dataset.value==='balanced'?{playingIntervalSeconds:15,pausedIntervalSeconds:60,staleSessionTimeoutSeconds:180}:button.dataset.value==='minimal'?{playingIntervalSeconds:30,pausedIntervalSeconds:120,staleSessionTimeoutSeconds:300,retryQueueSize:250,retryFlushBatchSize:25}:{});render();return;
        }
        if(name==='copy-url') { await action(button,async()=>{await clipboard(button.dataset.value);copied(button,s('urlCopied'),1800);},s('urlCopied'));return; }
        if(name==='plugin-copy'||name==='plugin-regenerate'){
          await action(button,async()=>{
            const server=serversData.servers.find(v=>v.id===button.dataset.id);
            const response=await write('/api/settings/jellyfin-servers/plugin-key',{id:server.id,jellyfinServerId:server.jellyfinServerId,regenerate:name==='plugin-regenerate'});
            if(!response.pluginApiKey)throw new Error(s('pluginKeyFetchError'));
            pluginSecrets.set(server.id,response.pluginApiKey);visibility.add('plugin-key-'+server.id);
            if(name==='plugin-copy')await clipboard(response.pluginApiKey);
            serversData=await get('/api/settings/jellyfin-servers');render();
            if(name==='plugin-copy')copied(body.querySelector(`[data-action="plugin-copy"][data-id="${CSS.escape(server.id)}"]`),s('keyCopied'),1800);
          },s(name==='plugin-copy'?'keyCopied':'serverPluginKeyDerived'));return;
        }
        if(name==='refresh'||name==='cancel'){await action(button,async()=>{await load();feedback=null;return false;});return;}
        if(name==='backup-full'){await action(button,async()=>{const response=await api.request('/api/backup/export/full',{method:'POST'});const objectURL=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=objectURL;link.download='JellyTrack-complete.jtb';link.click();setTimeout(()=>URL.revokeObjectURL(objectURL),1000);},'Export complet chiffré généré');return;}
        if(name==='backup-now'){await action(button,async()=>{const result=await write('/api/backup/auto/trigger',{});if(result.success!==true)throw new Error(s('backupError'));await load();},s('backingUp'));return;}
        if(name==='backup-delete'||name==='backup-restore'){
          if(!window.confirm(s(name==='backup-delete'?'confirmDeleteBackup':'confirmRestoreBackup')))return;
          await action(button,async()=>{await write('/api/backup/auto/'+(name==='backup-delete'?'delete':'restore'),{fileName:button.dataset.name});if(name==='backup-delete')await load();else scheduleReload();},s(name==='backup-delete'?'deleted':'restoreSuccess'));return;
        }
        if(name==='run-task'){
          const output=body.querySelector(`[data-task-feedback="${button.dataset.index}"]`);
          await runTask(button,output,button.dataset.url,JSON.parse(button.dataset.payload));return;
        }
      },listenOptions);
      function renderTaskResult(output,response){
        output.textContent=response.message||t('common.success');output.setAttribute('role','status');
        if(response.backupURL?.startsWith('/api/admin/library-repair-backup/')){const link=document.createElement('a');link.href=response.backupURL;link.className='btn btn-secondary btn-sm';link.textContent=s('downloadRepairBackup');link.setAttribute('download','');output.append(document.createElement('br'),link);}
        const examples=response.preview?.samples||response.unresolvedSamples;
        if(examples?.length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Médias non identifiés : exemples';details.append(summary);const list=document.createElement('ul');for(const item of examples){const li=document.createElement('li');li.textContent=`${item.title} — ${item.reason} (${item.remoteId})`;list.append(li);}details.append(list);output.append(details);}

      }
      function captureMedia(values) {
        const resolution={...object(model.resolutionThresholds)};
        const rules={...object(resolution.completionRules),libraries:{...object(resolution.completionRules?.libraries)}};
        RULE_TYPES.forEach(type=>{
          const previous=type==='default'?rules.default:rules.libraries[type];
          const rule={...normalizeRule(previous,type==='music'),completionEnabled:!!values['rule-'+type+'-completionEnabled']};
          ['abandonedThreshold','partialThreshold','completedThreshold'].forEach(key=>{rule[key]=Number(values['rule-'+type+'-'+key]);});
          if(type==='default')rules.default=normalizeRule(rule);else rules.libraries[type]=normalizeRule(rule,type==='music');
        });
        Object.entries(RESOLUTIONS).forEach(([key,defaults])=>{
          resolution[key]={...object(resolution[key])};['maxW','maxH'].forEach((field,index)=>{const number=Number(values['res-'+key+'-'+field]);resolution[key][field]=Number.isFinite(number)&&number>0?number:defaults[index];});
        });
        resolution.showLibraryMediaBadges=!!values.showLibraryMediaBadges;resolution.completionRules=rules;model.resolutionThresholds=resolution;
        return {resolutionThresholds:resolution,excludedLibraries:model.excludedLibraries||[]};
      }
      root.addEventListener('submit',async event=>{
        const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();
        const values=fieldValues(form), type=form.dataset.form, button=form.querySelector('[type="submit"]');
        await action(button,async()=>{
          if(type==='server'||type==='add-server'){
            const payload={name:values.name.trim(),url:values.url.trim(),allowAuthFallback:!!values.allowAuthFallback};
            if(!/^https?:\/\//i.test(payload.url))throw new Error(s('serverUrlLabel')+' : HTTP(S)');
            if(type==='server')payload.id=values.id;
            if(values.apiKey?.trim())payload.apiKey=values.apiKey.trim();
            const response=await write('/api/settings/jellyfin-servers',payload,type==='server'?'PATCH':'POST');
            serversData=await get('/api/settings/jellyfin-servers');
            const persisted=(serversData.servers||[]).find(server=>type==='server'?server.id===payload.id:server.id===(response.id||response.server?.id)||(server.name===payload.name&&server.url===payload.url));
            if(!persisted)throw new Error(s('serverUpdateError'));
            verify(persisted,{name:payload.name,url:payload.url});editing=null;adding=false;render();return;
          }

          if(type==='import'){
            if(!importFile||!/\.(zip|jtb)$/i.test(importFile.name))throw new Error(s('invalidBackup'));
            if(importFile.size>100*1024*1024)throw new Error(s('invalidBackup')+' (100 '+t('common.mb')+')');
            if(!window.confirm(s('confirmRestoreBackup')))return false;
            const response=await api.request('/api/backup/import',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:await importFile.arrayBuffer()});
            const data=await response.json().catch(()=>({}));if(!response.ok||data.success===false)throw new Error(data.error||data.message||(response.status===413?'100 '+t('common.mb'):s('invalidBackup')));
            scheduleReload();return;
          }
          let payload={};
          if(type==='media')payload=captureMedia(values);
          if(type==='notifications')payload={discordAlertsEnabled:values.discordAlertsEnabled,discordWebhookUrl:values.discordWebhookUrl.trim(),discordAlertCondition:values.discordAlertCondition,maxConcurrentTranscodes:Number(values.maxConcurrentTranscodes)};
          if(type==='locale')payload={defaultLocale:values.defaultLocale,timeFormat:values.timeFormat,ssoButtonLabel:values.ssoButtonLabel.trim()};
          if(type==='sessions')payload={authRememberThirtyDaysEnabled:values.authRememberThirtyDaysEnabled};
          if(type==='telemetry')payload={pluginTelemetrySettings:{...object(model.pluginTelemetrySettings),precisionProfile:values.precisionProfile,...Object.fromEntries(TELEMETRY.map(([key,,min,value])=>[key,Math.max(min,Math.round(Number(values[key])||value))])),...Object.fromEntries(TRACKING.map(key=>[key,values[key]]))}};
          if(type==='smart'){
            const thresholds=Object.fromEntries(SMART.map(([key,,min,max,value])=>[key,clamp(values[key],min,max,value)]));
            await write('/api/admin/security/smart-settings',{thresholds},'PATCH');await load();verify(smart,thresholds);return;
          }
          if(type==='schedules'){
            const intervals={...object(model.schedulerIntervals),...Object.fromEntries(PLANNINGS.map(([key,,,min,max,step,value])=>[key,clamp(values[key],min,max,value)]))};
            if(intervals.fullSyncEveryHours%24!==0)intervals.fullSyncEveryHours=48;payload={schedulerIntervals:intervals};
          }
          if(type==='wrapped')payload={wrappedVisible:values.wrappedVisible,wrappedPeriodEnabled:values.wrappedPeriodEnabled,...Object.fromEntries(['Start','End'].flatMap(pos=>[['Month',12],['Day',31]].map(([field,max])=>{const key='wrapped'+pos+field;return [key,clamp(values[key],1,max,1)];})))};
          await write('/api/settings',payload);await load();verify({...model,ssoButtonLabel:model.resolutionThresholds?.ssoButtonLabel || ""},payload);
        },type==='telemetry'?s('telemetrySaved'):type==='smart'?sec('smartThresholdsSaved'):type==='schedules'?s('cronSaved'):type==='import'?s('restoreSuccess'):undefined);
      },listenOptions);
      async function clipboard(text) {
        try { await navigator.clipboard.writeText(text); }
        catch {const textarea=document.createElement('textarea');textarea.value=text;textarea.style.position='fixed';textarea.style.opacity='0';document.body.append(textarea);textarea.select();const ok=document.execCommand('copy');textarea.remove();if(!ok)throw new Error(s('copyKeyError'));}
      }
      function scheduleReload(){const timer=setTimeout(()=>{if(alive())location.reload();},1200);ctx.cleanup?.(()=>clearTimeout(timer));}
      function copied(button,label,delay){if(!button)return;const original=button.textContent;button.textContent=label;const timer=setTimeout(()=>{if(alive()&&root.contains(button))button.textContent=original;},delay);ctx.cleanup?.(()=>clearTimeout(timer));}
      try{await load();}catch(error){if(alive()){body.innerHTML=`<div class="settings-feedback"></div>${btn(t('common.retry'),'refresh')}`;body.removeAttribute('aria-busy');showError(error);}}
    }
  };
})();

export {};
