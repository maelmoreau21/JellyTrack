/* Historic main administration: shared cleanup, health tabs, plugin and scope. */
(function () {
  "use strict";
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  const number = (value) =>
    Number.isFinite(Number(value)) ? Number(value) : 0;
  const bytes = (value) => {
    let n = number(value),
      i = 0;
    if (n <= 0) return "0 B";
    while (n >= 1024 && i < 4) {
      n /= 1024;
      i++;
    }
    return (
      n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2) +
      " " +
      ["B", "KB", "MB", "GB", "TB"][i]
    );
  };
  const normalized = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  const icon = (name) => {
    const extra = {
      drive:
        '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/><path d="M6 16h.01M10 16h.01"/>',
      radioTower:
        '<path d="m16 3 3 3a8 8 0 0 1 0 12l-3 3M8 3 5 6a8 8 0 0 0 0 12l3 3M12 12v10m-4 0 4-10 4 10"/><circle cx="12" cy="8" r="2"/>',
      shieldCheck:
        '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6c3 0 5.5-1.3 8-4 2.5 2.7 5 4 8 4z"/><path d="m9 12 2 2 4-4"/>',
    };
    return extra[name]
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${extra[name]}</svg>`
      : window.JellyTrackNavigation?.icon(name) || "";
  };
  const badge = (value, kind = "") =>
    `<span class="ar-badge ${kind}">${esc(value)}</span>`;
  const card = (title, value, help, kind = "") =>
    `<article class="ar-metric ${kind}"><div class="ar-metric-head"><h3>${esc(title)}</h3>${icon(kind === "ar-green" || kind === "ar-red" ? "shield" : kind === "ar-cyan" ? "drive" : kind === "ar-amber" ? "heartCrack" : "radioTower")}</div><div class="ar-metric-body"><strong>${kind === "ar-green" ? icon("shieldCheck") : ""}${esc(value)}</strong><p>${esc(help || "")}</p></div></article>`;
  const cleanupCard = (title, value, name, kind = "") =>
    `<article class="ar-cleanup-metric ${kind}"><span class="ar-cleanup-icon">${icon(name)}</span><div><h3>${esc(title)}</h3><strong>${esc(value)}</strong></div></article>`;
  const table = (headers, rows, empty) =>
    rows.length
      ? `<div class="ar-table-scroll"><table class="ar-table"><thead><tr>${headers.map((s) => `<th>${esc(s)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`
      : `<div class="ar-empty">${icon("shield")}<p>${esc(empty)}</p></div>`;
  const button = (action, label, extra = "") =>
    `<button type="button" class="btn btn-secondary btn-sm" data-ar-action="${action}" ${extra}>${esc(label)}</button>`;
  const tabs = (items, selected, kind) =>
    `<div class="ar-tabs" role="tablist" aria-label="${kind === "health" ? "Health" : "Cleanup"}">${items.map(([key, label, count]) => `<button role="tab" type="button" id="ar-${kind}-${key}" aria-controls="ar-${kind}-panel" aria-selected="${selected === key}" tabindex="${selected === key ? "0" : "-1"}" data-ar-tab="${kind}:${key}">${icon(key === "cleanup" ? "eraser" : key === "security" ? "shieldAlert" : key === "logs" ? "activity" : key === "ghosts" ? "ghost" : key === "abandoned" ? "heartCrack" : "layers")}${esc(label)}${count > 0 || kind === "cleanup" ? badge(count) : ""}</button>`).join("")}</div>`;
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.JellyTrackAdmin = {
    mount(ctx, subpage) {
      if (subpage === "log-health" || subpage === "plugin-health") {
        ctx.navigate("/admin/health", true);
        return;
      }
      if (subpage === "log-diagnostics") subpage = "log-health";
      if (subpage === "plugin-diagnostics") subpage = "plugin-health";
      const { main, api, i18n, signal } = ctx;
      if (!ctx.user?.isAdmin) {
        ctx.navigate(
          ctx.user?.jellyfinUserId
            ? "/users/" + encodeURIComponent(ctx.user.jellyfinUserId)
            : "/login",
          true,
        );
        return;
      }
      const locale = document.documentElement.lang || "fr",
        fr = locale.startsWith("fr");
      const text = (key, fallback, params = {}) =>
        i18n.t(key, params, fallback);
      const c = (key, fallback, params) =>
        text("cleanup." + key, fallback, params);
      const p = (key, fallback, params) =>
        text("pluginHealth." + key, fallback, params);
      const d = (key, fallback, params) =>
        text("dashboard." + key, fallback, params);
      const common = (key, fallback) => text("common." + key, fallback);
      const date = (value) =>
        value
          ? new Date(value.replace(" ", "T")).toLocaleString(locale)
          : d("never", fr ? "Jamais" : "Never");
      const clock = (value) =>
        new Date(value.replace(" ", "T")).toLocaleTimeString(locale, {
          hour: "2-digit",
          minute: "2-digit",
        });
      const relative = (value) => {
        if (!value) return "—";
        const delta =
          (new Date(value.replace(" ", "T")).getTime() - Date.now()) / 86400000;
        return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
          Math.round(delta),
          "day",
        );
      };
      const bitrate = (value) =>
        value == null
          ? "—"
          : number(value) >= 1000
            ? (number(value) / 1000).toFixed(1) + " Mbps"
            : Math.round(number(value)) + " kbps";
      const seconds = (value) =>
        value == null ? "N/A" : number(value).toFixed(1) + " s";
      const state = {
        health: null,
        cleanup: null,
        plugin: null,
        compare: null,
        error: "",
        loading: true,
        pluginLoading: false,
        pluginError: "",
        pluginAction: "",
        tab: new URLSearchParams(location.search).get("tab") || "cleanup",
        nested:
          new URLSearchParams(location.search).get("cleanupTab") || "ghosts",
        query: "",
        period: "30d",
        size: 25,
        types: { ghosts: "all", abandoned: "all", duplicates: "all" },
        pages: { ghosts: 1, abandoned: 1, duplicates: 1 },
        sort: "completion",
        smart: false,
        dismissed: false,
        closures: 5,
        thresholds: {
          gapWarningSec: 600,
          gapCriticalSec: 900,
          jitterWarningSec: 180,
          jitterCriticalSec: 300,
        },
      };
      if (!["cleanup", "security", "logs"].includes(state.tab))
        state.tab = "cleanup";
      if (!["ghosts", "abandoned", "duplicates"].includes(state.nested))
        state.nested = "ghosts";
      try {
        const saved = JSON.parse(
          localStorage.getItem("plugin-health-thresholds-v2"),
        );
        if (saved) Object.assign(state.thresholds, saved);
      } catch {}
      let chart = null,
        dialog = null;
      ctx.cleanup?.(() => {
        chart?.destroy();
        dialog?.remove();
      });
      const alive = () => !signal.aborted;
      const toast = (message, error = false) => {
        if (ctx.toast) {
          const method = error ? "error" : "success";
          ctx.toast[method]?.(message);
        } else console[error ? "error" : "info"](message);
      };
      const pageHeader = (title, help, name = "health") =>
        `<header class="ar-header"><span class="ar-header-icon">${icon(name)}</span><div><h1>${esc(title)}</h1>${help ? `<p>${esc(help)}</p>` : ""}</div></header>`;
      const suggestions = () =>
        state.cleanup?.staleMoviesRecommendation?.media || [];
      const base = (kind) =>
        state.cleanup?.[
          {
            ghosts: "ghostMedia",
            abandoned: "abandonedMedia",
            duplicates: "duplicateMedia",
          }[kind]
        ] || [];
      const filtered = (kind, withType = true, withSmart = true) => {
        let rows = base(kind).filter(
          (m) =>
            normalized(m.title).includes(normalized(state.query)) &&
            (!withType ||
              state.types[kind] === "all" ||
              m.type === state.types[kind]),
        );
        if (kind !== "duplicates" && state.period !== "all") {
          const days = number(state.period.replace("d", ""));
          rows = rows.filter((m) => {
            const value =
              kind === "ghosts" ? m.dateAdded || m.createdAt : m.lastPlayed;
            return (
              value &&
              Date.now() - new Date(value.replace(" ", "T")).getTime() <=
                days * 86400000
            );
          });
        }
        if (kind === "ghosts" && state.smart && withSmart) {
          const ids = new Set(suggestions().map((m) => m.id));
          rows = rows.filter((m) => ids.has(m.id));
        }
        if (kind === "abandoned")
          rows.sort((a, b) =>
            state.sort === "completion"
              ? number(a.maxCompletion) - number(b.maxCompletion)
              : new Date(b.lastPlayed) - new Date(a.lastPlayed),
          );
        return rows;
      };
      function cleanupHTML() {
        const kind = state.nested,
          rows = filtered(kind),
          totalPages = Math.max(1, Math.ceil(rows.length / state.size));
        state.pages[kind] = Math.min(state.pages[kind], totalPages);
        const page = state.pages[kind],
          shown = rows.slice((page - 1) * state.size, page * state.size);
        const rec = suggestions();
        const titles = {
          ghosts: c("ghostMedia", "Médias Fantômes"),
          abandoned: c("abandonedMedia", "Médias Abandonnés"),
          duplicates: fr ? "Doublons Détectés" : "Duplicates Detected",
        };
        const descriptions = {
          ghosts: c("ghostDesc", ""),
          abandoned: c("abandonedDesc", ""),
          duplicates: fr
            ? "Médias présents en plusieurs exemplaires ou différentes résolutions (ex: 1080p et 4K) sur vos serveurs."
            : "Media present in multiple copies or different resolutions (e.g. 1080p and 4K) on your servers.",
        };
        const filterOptions =
          kind === "ghosts"
            ? [
                ["all", "allFilter"],
                ["Movie", "moviesFilter"],
                ["Series", "seriesFilter"],
                ["MusicAlbum", "albumsFilter"],
              ]
            : kind === "abandoned"
              ? [
                  ["all", "allFilter"],
                  ["Movie", "moviesFilter"],
                  ["Episode", "episodesFilter"],
                  ["Audio", "musicFilter"],
                ]
              : [
                  ["all", "allFilter"],
                  ["Movie", "moviesFilter"],
                  ["Series", "seriesFilter"],
                ];
        const mediaType = (m) =>
          badge(
            c(
              {
                Movie: "movieType",
                Series: "seriesType",
                MusicAlbum: "albumType",
                Episode: "episodeType",
                Audio: "trackType",
              }[m.type] || "colType",
              m.type,
            ),
          );
        const titlesCells = (m) =>
          `<td class="ar-media-title">${icon(m.type === "Series" || m.type === "Episode" ? "tv" : m.type === "Audio" || m.type === "MusicAlbum" ? "music" : "film")}<span>${esc(m.title)}${kind === "duplicates" ? `<small>${esc(m.duplicateGroup)}</small>` : ""}</span></td><td>${mediaType(m)}</td>`;
        const headers = [c("colTitle", "Titre"), c("colType", "Type")];
        if (kind === "ghosts") headers.push(c("colAdded", "Ajouté"));
        else if (kind === "abandoned")
          headers.push(
            c("colMaxCompletion", "Complétion Max"),
            c("colLastAttempt", "Dernière Tentative"),
          );
        else
          headers.push(
            fr ? "Résolution" : "Resolution",
            fr ? "Bibliothèque" : "Library",
            fr ? "Taille" : "Size",
          );
        const content = shown.map((m) => {
          let cells = titlesCells(m);
          if (kind === "ghosts")
            cells += `<td title="${esc(date(m.dateAdded || m.createdAt))}">${esc(relative(m.dateAdded || m.createdAt))}</td>`;
          else if (kind === "abandoned") {
            const completion = number(m.maxCompletion);
            cells += `<td><div class="ar-progress"><span style="width:${Math.min(100, Math.max(0, completion))}%"></span></div><small>${Math.round(completion)}% · ${esc(c(completion < 10 ? "skipped" : completion < 25 ? "tried" : completion < 50 ? "halfWay" : "almost", ""))}</small></td><td title="${esc(date(m.lastPlayed))}">${esc(relative(m.lastPlayed))}</td>`;
          } else
            cells += `<td>${esc(m.resolution || (fr ? "Inconnue" : "Unknown"))}</td><td>${esc(m.libraryName || "—")}</td><td>${esc(bytes(m.size))}</td>`;
          return `<tr>${cells}</tr>`;
        });
        return `<div class="ar-cleanup-metrics">${cleanupCard(fr ? "Espace récupérable estimé" : "Estimated reclaimable space", bytes(state.cleanup.totalRecoverableSizeBytes), "drive", "ar-cleanup-estimate")}${cleanupCard(c("ghostMedia", ""), filtered("ghosts", false, false).length, "ghost", "ar-red")}${cleanupCard(c("abandonedMedia", ""), filtered("abandoned", false, false).length, "heartCrack", "ar-amber")}${cleanupCard(fr ? "Doublons détectés" : "Duplicates detected", filtered("duplicates", false, false).length, "copy", "ar-cyan")}</div>
      ${tabs(
        [
          [
            "ghosts",
            c("ghostMedia", ""),
            filtered("ghosts", false, false).length,
          ],
          [
            "abandoned",
            c("abandonedMedia", ""),
            filtered("abandoned", false, false).length,
          ],
          [
            "duplicates",
            fr ? "Doublons" : "Duplicates",
            filtered("duplicates", false, false).length,
          ],
        ],
        kind,
        "cleanup",
      )}
      <div id="ar-cleanup-panel" role="tabpanel" aria-labelledby="ar-cleanup-${kind}">
      ${rec.length && !state.dismissed ? `<aside class="ar-recommendation"><div>${icon("sparkles")}<h3>${esc(c("staleMoviesRecommendationTitle", "Suggestion automatique"))}</h3><p>${esc(c("staleMoviesRecommendationDesc", "", { count: rec.length, size: bytes(state.cleanup.staleMoviesRecommendation.totalSizeBytes) }))}</p></div><div class="ar-actions">${button("smart-review", c("reviewStaleMoviesAction", "Examiner la sélection"))}${button("smart-delete", c("deleteStaleMoviesAction", "Supprimer maintenant"))}${button("smart-dismiss", c("dismissSuggestionAction", "Ignorer"))}</div></aside>` : ""}
      ${state.smart ? `<div class="ar-smart">${esc(c("staleMoviesFilterActive", "Filtre smart actif : films anciens jamais vus"))}${button("smart-close", common("close", "Fermer"))}</div>` : ""}
      <div class="ar-toolbar"><label class="ar-search">${icon("search")}<input data-ar-field="query" aria-label="${esc(common("search", "Rechercher"))}" type="search" value="${esc(state.query)}" placeholder="${esc(common("searchPlaceholder", "Rechercher..."))}"></label><label><span>${esc(fr ? "Période" : "Period")}</span><select data-ar-field="period">${[
        ["all", text("timeRange.allTime", "Tout le temps")],
        ["30d", text("timeRange.last30d", "30 jours")],
        ["90d", fr ? "90 jours" : "90 days"],
        ["180d", fr ? "180 jours" : "180 days"],
        ["365d", fr ? "365 jours" : "365 days"],
      ]
        .map(
          ([v, label]) =>
            `<option value="${v}" ${state.period === v ? "selected" : ""}>${esc(label)}</option>`,
        )
        .join(
          "",
        )}</select></label><label><span>${esc(fr ? "Par page" : "Per page")}</span><select data-ar-field="size">${[25, 50, 100].map((v) => `<option ${state.size === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>${button("export-csv", "CSV")}${button("export-json", "JSON")}</div>
      <section class="ar-panel"><header><h2>${esc(titles[kind])}</h2><p>${esc(descriptions[kind])}</p></header><div class="ar-filter-row"><div class="ar-type-filters">${filterOptions.map(([v, key]) => `<button type="button" data-ar-type="${v}" aria-pressed="${state.types[kind] === v}">${esc(c(key, v))} ${badge(v === "all" ? filtered(kind, false, false).length : filtered(kind, false, false).filter((m) => m.type === v).length)}</button>`).join("")}</div>${kind === "abandoned" ? `<label>${esc(c("sortBy", "Trier par"))}<select data-ar-field="sort"><option value="completion" ${state.sort === "completion" ? "selected" : ""}>${esc(c("sortByCompletion", "Complétion"))}</option><option value="last" ${state.sort === "last" ? "selected" : ""}>${esc(c("sortByLastAttempt", "Dernière tentative"))}</option></select></label>` : ""}</div>
      ${table(headers, content, kind === "ghosts" ? c(state.smart ? "noSuggestedStaleMovies" : "noGhosts", "") : kind === "abandoned" ? c("noAbandoned", "") : fr ? "Aucun doublon détecté. Votre médiathèque est parfaitement organisée !" : "No duplicates detected. Your media library is perfectly organized!")}
      <footer class="ar-pagination"><span>${rows.length ? (page - 1) * state.size + 1 : 0}–${Math.min(page * state.size, rows.length)} / ${rows.length}</span><div>${button("previous", common("previous", "Précédent"), page === 1 ? "disabled" : "")}<span>${esc(common("page", "Page"))} ${page} / ${totalPages}</span>${button("next", common("next", "Suivant"), page === totalPages ? "disabled" : "")}</div></footer></section></div>`;
      }
      function pluginHTML(embedded) {
        const data = state.plugin,
          loading = state.pluginLoading,
          busy = state.pluginAction;
        const controls = `<div class="ar-actions">${button("plugin-refresh", p("refresh", "Rafraîchir"), loading ? "disabled" : "")}${button("plugin-test", p(busy === "test_connection" ? "testing" : "testConnection", "Tester la connexion"), busy || loading ? "disabled" : "")}${button("plugin-heartbeat", p(busy === "force_heartbeat" ? "sending" : "forceHeartbeat", "Forcer un heartbeat"), busy || loading ? "disabled" : "")}${embedded ? "" : button("plugin-export", p("exportDiagnosticJson", "Exporter JSON diagnostic"), !data ? "disabled" : "")}</div>`;
        if (!data)
          return (
            controls +
            `<div class="ar-empty" role="${state.pluginError ? "alert" : "status"}">${esc(state.pluginError || common("loading", "Chargement..."))}</div>`
          );
        const connection = data.plugin || {},
          hb = data.heartbeat || {},
          ing = data.ingestion || {},
          streams = data.streams || {};
        const line = (label, value) =>
          `<div class="ar-detail"><span>${esc(label)}</span><span>${value}</span></div>`;
        const severity = (value, warning, critical) =>
          value == null
            ? badge(p("stateUnknown", "N/A"))
            : number(value) >= critical
              ? badge(p("stateCritical", "Critique"), "ar-red")
              : number(value) >= warning
                ? badge(p("stateWarning", "Avertissement"), "ar-amber")
                : badge(p("stateOk", "OK"), "ar-green");
        const group = (title, html) =>
          `<article class="ar-plugin-card"><h3>${esc(title)}</h3>${html}</article>`;
        let html =
          controls +
          (state.pluginError
            ? `<p class="ar-error" role="alert">${esc(state.pluginError)}</p>`
            : "") +
          `<div class="ar-plugin-metrics">
      ${group(p("connection", "Connexion"), line(p("status", "Statut"), badge(p(connection.connected ? "online" : "offline", connection.connected ? "En ligne" : "Hors ligne"), connection.connected ? "ar-green" : "ar-red")) + line(p("lastSeen", "Dernière activité"), esc(date(connection.lastSeen))) + line(p("server", "Serveur"), esc(connection.serverName || "—")) + line("Jellyfin", esc(connection.jellyfinVersion || "—")) + line("Plugin", `${esc(connection.version || "—")} ${badge(connection.version?.startsWith("2.") ? "v2 OK" : p("upgradeRequired", "Mise à jour requise"), connection.version?.startsWith("2.") ? "ar-green" : "ar-amber")}`) + line(p("schemaVersion", "Schema"), esc(connection.schemaVersion || "—")))}
      ${group(p("heartbeatJitter", "Jitter heartbeat"), line(p("p50Interval", "Intervalle P50"), esc(seconds(hb.intervalP50Sec))) + line(p("p95Interval", "Intervalle P95"), esc(seconds(hb.intervalP95Sec))) + line(p("p95Jitter", "Jitter P95"), `${esc(seconds(hb.jitterP95Sec))} ${severity(hb.jitterP95Sec, state.thresholds.jitterWarningSec, state.thresholds.jitterCriticalSec)}`) + line(p("gapNow", "Écart actuel"), `${esc(seconds(hb.gapSec))} ${severity(hb.gapSec, state.thresholds.gapWarningSec, state.thresholds.gapCriticalSec)}`))}
      ${group(p("ingestionReliability", "Fiabilité d’ingestion"), line(p("successRate24h", "Taux de succès (24h)"), ing.successRate24h == null ? "N/A" : number(ing.successRate24h).toFixed(1) + "%") + line(p("failures24h", "Échecs (24h)"), esc(ing.failureCount24h ?? "—")) + line(p("unauthorized", "Non autorisé"), esc(ing.unauthorized24h ?? "—")) + line(p("rateLimited", "Limite de débit"), esc(ing.rateLimited24h ?? "—")))}
      ${group(p("liveStreamHealth", "Santé des flux en direct"), line(p("activeStreams", "Flux actifs"), esc(streams.active ?? "—")) + line(p("transcodes", "Transcodages"), esc(streams.transcodes ?? "—")) + line(p("staleStreams", "Flux inactifs"), esc(streams.stale ?? "—")) + line(p("avgBitrate", "Débit moyen"), esc(bitrate(streams.avgBitrateKbps))))}</div>`;
        if (!embedded) {
          html += `<section class="ar-panel"><header><h2>${esc(p("heartbeatIntervals24h", "Intervalles heartbeat (24h)"))}</h2><p>${esc(p("heartbeatIntervals24hDesc", ""))}</p></header>${(hb.intervalSeries24h || []).length ? '<div class="ar-chart"><canvas id="ar-heartbeat-chart"></canvas></div>' : `<div class="ar-empty">${esc(p("noHeartbeatIntervals", "Pas assez d’échantillons heartbeat pour tracer le graphe."))}</div>`}<details><summary>${esc(fr ? "Échantillons" : "Samples")}</summary>${table(
            [
              fr ? "Quand" : "When",
              p("p50Interval", "Intervalle"),
              p("p95Jitter", "Jitter"),
            ],
            (hb.intervalSeries24h || []).map(
              (row) =>
                `<tr><td>${esc(date(row.timestamp))}</td><td>${esc(seconds(row.intervalSec))}</td><td>${esc(seconds(row.jitterSec))}</td></tr>`,
            ),
            common("noData", "Aucune donnée"),
          )}</details></section>
      <section class="ar-panel"><header><h2>${esc(p("alertThresholds", "Seuils d’alerte"))}</h2><p>${esc(fr ? "Ces seuils sont enregistrés localement dans ce navigateur." : "These thresholds are saved locally in this browser.")}</p></header><div class="ar-thresholds">${[
        ["gapWarningSec", p("gapWarningSec", "Gap warning (s)")],
        ["gapCriticalSec", p("gapCriticalSec", "Gap critical (s)")],
        ["jitterWarningSec", p("jitterWarningSec", "Jitter warning (s)")],
        ["jitterCriticalSec", p("jitterCriticalSec", "Jitter critical (s)")],
      ]
        .map(
          ([key, label]) =>
            `<label>${esc(label)}<input data-ar-threshold="${key}" type="number" min="${key.startsWith("gap") ? "1" : ".1"}" step="${key.startsWith("gap") ? "1" : ".1"}" value="${number(state.thresholds[key])}"></label>`,
        )
        .join(
          "",
        )}${button("threshold-reset", p("resetThresholds", "Réinitialiser"))}</div></section>
      <section class="ar-panel"><header><h2>${esc(p("recentIngestFailures", "Derniers échecs d’ingestion"))}</h2></header>${table(
        [fr ? "Quand" : "When", "Action", "IP"],
        (data.recentFailures || []).map(
          (row) =>
            `<tr><td>${esc(date(row.createdAt))}</td><td>${esc(row.action)}</td><td>${esc(row.ipAddress || "—")}</td></tr>`,
        ),
        p("noRecentFailuresDetected", "Aucun échec récent"),
      )}</section>
      <section class="ar-panel"><header><h2>${esc(p("pluginReportedMetrics", "Télémétrie du plugin"))}</h2><p>${esc(p("pluginReportedMetricsDesc", ""))}</p></header><div class="ar-plugin-metrics">${Object.entries(
        data.pluginReportedMetrics || {},
      )
        .filter(([key]) => key !== "note")
        .map(([key, value]) =>
          group(
            p(
              key === "coalescedProgressEvents" ? "progressCoalesces" : key,
              key,
            ),
            esc(value ?? "N/A"),
          ),
        )
        .join(
          "",
        )}${group(p("precisionProfile", "Profil"), esc(data.telemetrySettings?.precisionProfile || "N/A"))}${group(p("playbackIntervals", "Lecture / pause"), `${esc(seconds(data.telemetrySettings?.playingIntervalSeconds))} / ${esc(seconds(data.telemetrySettings?.pausedIntervalSeconds))}`)}</div><p class="ar-muted">${esc(p(Object.values(data.pluginReportedMetrics || {}).some((value) => typeof value === "number") ? "pluginMetricsLive" : "pluginMetricsUnavailable", ""))}</p></section>`;
        }
        return html;
      }
      function securityHTML() {
        const alerts = state.health.securityAlerts || [];
        return `<section class="ar-panel"><header><h2>${esc(fr ? "Détection d’Anomalies & Partage de Compte" : "Security Anomalies & Account Sharing")}</h2>${badge(alerts.length ? `${alerts.length} ${fr ? "alertes actives" : "active alerts"}` : fr ? "Aucune anomalie détectée" : "No anomalies detected", alerts.length ? "ar-amber" : "ar-green")}</header>${alerts.length ? `<div class="ar-alert-grid">${alerts.map((a) => `<article class="ar-alert ${a.severity === "critical" ? "ar-red" : "ar-amber"}">${icon(a.type === "account_sharing" ? "users" : "warning")}<h3>${esc(a.title)}</h3><p>${esc(a.description)}</p><small>${esc(clock(a.timestamp))}</small></article>`).join("")}</div>` : `<div class="ar-empty ar-green">${icon("shield")}<h3>${esc(fr ? "Toutes les lectures sont sécurisées" : "All playback sessions normal")}</h3><p>${esc(fr ? "Aucun comportement suspect (partage de compte, crash de fichier) n’a été détecté récemment sur votre serveur." : "No suspicious behavior (account sharing, file crashes) was detected recently on your server.")}</p></div>`}</section><section class="ar-section"><h2>${icon("activity")}${esc(fr ? "Santé du Plugin Jellyfin" : "Jellyfin Plugin Health")}</h2>${pluginHTML(true)}</section>`;
      }
      const status = (value) =>
        d(
          value === "error"
            ? "monitorStatusError"
            : value === "ok"
              ? "monitorStatusOk"
              : value === "running"
                ? "running"
                : "idle",
          value || "idle",
        );
      function logsHTML() {
        const data = state.health,
          monitor = data.status?.monitor || {},
          counts = data.counts || {},
          timeline = data.anomalyTimeline || [],
          hasAnomaly = timeline.some((row) =>
            ["cleanupOps", "monitorErrors", "syncErrors", "backupErrors"].some(
              (key) => number(row[key]) > 0,
            ),
          );
        return `<div class="ar-metrics ${data.isValkeyEnabled === false ? "ar-two" : ""}">${card(d("monitor", "Moniteur"), status(monitor.status), `${d("lastPoll", "Dernier poll")} : ${date(monitor.lastPollAt)}`)}${card(d("openPlaybackOrphans", "Lectures orphelines ouvertes"), counts.openPlaybackOrphans ?? 0, d("playbackHistoryNote", ""), "ar-amber")}${data.isValkeyEnabled === false ? "" : card(d("dbWithoutValkey", "Flux DB sans Valkey"), counts.dbStreamsWithoutValkey ?? 0, "") + card(d("valkeyOrphan", "Clés Valkey orphelines"), counts.valkeyOrphans ?? 0, "")}</div>
      <section class="ar-panel"><header><h2>${esc(d("anomalyChartsTitle", "Évolution des anomalies (14 jours)"))}</h2><p>${esc(d("anomalyChartsDesc", "Erreurs et opérations de nettoyage au cours des 14 derniers jours."))}</p></header>${hasAnomaly ? '<div class="ar-chart"><canvas id="ar-anomaly-chart"></canvas></div>' : `<div class="ar-empty ar-green">${icon("shield")}<h3>${esc(d("noAnomalyTitle", "Aucune anomalie détectée"))}</h3></div>`}</section>
      <div class="ar-log-grid"><section class="ar-panel"><header><h2>${esc(d("orphanPlaybacksTitle", "Lectures orphelines en cours"))}</h2><p>${esc(d("orphanPlaybacksDesc", ""))}</p></header><div class="ar-event-list">${(data.orphanPlaybacks || []).map((row) => `<article class="ar-event"><strong>${esc(row.mediaTitle)}</strong><p>${esc(row.username)} · ${esc(row.library)}</p><small>${esc(date(row.startedAt))} · ${Math.round(number(row.durationWatched) / 60)} min</small></article>`).join("") || `<p class="ar-muted">${esc(d("noOrphanPlaybacks", "Aucune lecture orpheline."))}</p>`}</div></section>
      <section class="ar-panel"><header><h2>${esc(d("recentClosuresTitle", "Fermetures auto récentes"))}</h2><p>${esc(d("recentClosuresDesc", ""))}</p><label>${esc(fr ? "Afficher" : "Show")} <select data-ar-field="closures">${[5, 10, 20].map((n) => `<option ${state.closures === n ? "selected" : ""}>${n}</option>`).join("")}</select></label></header><div class="ar-event-list">${
        (data.recentEvents || [])
          .slice(0, state.closures)
          .map(
            (row) =>
              `<article class="ar-event">${icon(row.source === "backup" ? "database" : row.source === "sync" ? "compare" : "activity")}<strong>${esc(row.message)}</strong><p>${badge(row.source)} ${esc(row.kind)}</p>${row.details ? `<details><summary>${esc(fr ? "Détails" : "Details")}</summary><pre>${esc(JSON.stringify(row.details, null, 2))}</pre></details>` : ""}<small>${esc(date(row.createdAt))}</small></article>`,
          )
          .join("") ||
        `<p class="ar-muted">${esc(d("noRecentClosures", "Aucune fermeture récente."))}</p>`
      }</div></section>
      <section class="ar-panel"><header><h2>${esc(d("excludedLibraries", "Bibliothèques exclues"))}</h2></header><div class="ar-actions">${(data.excludedLibraries || []).map((s) => badge(s, "ar-red")).join("") || `<p class="ar-muted">${esc(d("noExcludedLibraries", "Aucune bibliothèque exclue."))}</p>`}</div></section></div>`;
      }
      function healthHTML() {
        const alerts = state.health.securityAlerts || [],
          data = state.cleanup || {},
          monitor = state.health.status?.monitor || {};
        return (
          pageHeader(
            fr ? "Santé & Hygiène du Serveur" : "Server Health & Hygiene",
            fr
              ? "Diagnostics système, détection d’anomalies et optimisation du stockage"
              : "System diagnostics, anomaly detection, and storage optimization",
          ) +
          `<div class="ar-metrics">${card(fr ? "Sécurité & Anomalies" : "Security", alerts.length ? alerts.length + " " + (fr ? "alerte(s)" : "alerts") : fr ? "Optimal" : "Healthy", alerts.length ? (fr ? "Comportements suspects" : "Suspect activity") : fr ? "Aucun partage suspect" : "No active threats", alerts.length ? "ar-red" : "ar-green")}${card(fr ? "Espace Récupérable" : "Reclaimable Space", bytes(data.totalRecoverableSizeBytes), `${base("ghosts").length} ${fr ? "médias fantômes" : "ghost media"}`, "ar-cyan")}${card(fr ? "Médias Inachevés" : "Abandoned Media", base("abandoned").length, base("duplicates").length ? `${base("duplicates").length} ${fr ? "doublons" : "duplicates"}` : fr ? "Abandonnés < 25%" : "Abandoned < 25%", "ar-amber")}${card(fr ? "Moniteur de Flux" : "Monitor Status", status(monitor.status), `${state.health.counts?.openPlaybackOrphans || 0} ${fr ? "lectures orphelines" : "orphan playbacks"}`)}</div>${tabs(
            [
              [
                "cleanup",
                fr ? "Nettoyage & Stockage" : "Media Cleanup",
                base("ghosts").length,
              ],
              [
                "security",
                fr ? "Sécurité & Anomalies" : "Security & Alerts",
                alerts.length,
              ],
              ["logs", fr ? "Moteur & Logs" : "Logs & Engine", 0],
            ],
            state.tab,
            "health",
          )}<div id="ar-health-panel" role="tabpanel" aria-labelledby="ar-health-${state.tab}">${state.tab === "cleanup" ? `<section class="ar-section"><h2>${icon("sparkles")}${esc(fr ? "Nettoyage Intelligent & Optimisation" : "Smart Media Cleanup & Hygiene")}</h2><p class="ar-muted">${esc(fr ? "Détectez et supprimez les fichiers jamais visionnés, abandonnés ou en doublon pour libérer de l’espace disque." : "Find and delete unplayed, abandoned, or duplicate media to reclaim disk space.")}</p>${cleanupHTML()}</section>` : state.tab === "security" ? securityHTML() : logsHTML()}</div>`
        );
      }
      function inventoryHTML() {
        const data = state.compare?.inventory || [];
        return `<details class="ar-go-extras"><summary>${esc(fr ? "Inventaire des serveurs Go" : "Go server inventory")}</summary><div class="ar-panel">${table(
          [
            fr ? "Serveur" : "Server",
            "URL",
            common("active", "Actif"),
            fr ? "Médias" : "Media",
            fr ? "Utilisateurs" : "Users",
            fr ? "Lectures (total)" : "Plays (all time)",
            fr ? "Flux actifs" : "Active streams",
            fr ? "Heures (total)" : "Watch hours (all time)",
          ],
          data.map(
            (s) =>
              `<tr><td>${esc(s.name)}</td><td>${esc(s.url)}</td><td>${badge(s.isActive ? common("active", "Actif") : fr ? "Inactif" : "Inactive", s.isActive ? "ar-green" : "")}</td><td>${number(s.mediaCount)}</td><td>${number(s.userCount)}</td><td>${number(s.playsCount)}</td><td>${number(s.activeStreams)}</td><td>${(number(s.totalWatchMs) / 3600000).toFixed(1)}</td></tr>`,
          ),
          common("noData", "Aucune donnée"),
        )}</div></details>`;
      }
      function compareHTML() {
        const data = state.compare,
          title = d(
            "multiServerComparator.title",
            "Comparateur multi-serveurs",
          );
        if (!data.multiServerEnabled)
          return `<section class="ar-panel"><header><h1>${esc(title)}</h1><p>${esc(d("multiServerComparator.disabled", fr ? "Le comparateur est disponible en mode multi-serveurs avec au moins deux serveurs." : "The comparator is available in multi-server mode with at least two servers."))}</p></header></section>`;
        const selected = data.selectedServerIds || [],
          totals = data.totals || {},
          max = Math.max(
            1,
            ...data.servers.map((s) => number(s.activeStreams)),
          );
        return (
          pageHeader(
            title,
            d(
              "multiServerComparator.desc",
              "Comparez la charge et la santé de vos serveurs.",
            ),
            "compare",
          ) +
          `<div class="ar-scope"><span>${esc(d("serverScope", "Scope"))}</span><button data-ar-server="all" aria-pressed="${!selected.length}">${esc(common("all", "Tous"))}</button>${data.selectableServers.map((s) => `<button data-ar-server="${esc(s.id)}" aria-pressed="${selected.includes(s.id)}">${esc(s.name)}</button>`).join("")}</div><div class="ar-metrics">${card("Active streams", totals.activeStreams || 0, "Across " + data.servers.length + " server(s)")}${card("Plays (24h)", totals.plays24h || 0, number(totals.watchHours24h).toFixed(1) + " watch hours")}${card("Plugin errors (24h)", totals.pluginErrors24h || 0, "Security and ingest validation failures")}${card("Scope", selected.join(",") || "all servers", "URL/global selection fingerprint")}</div><section class="ar-panel"><header><h2>Server ranking</h2><p>${esc("Higher score means more steady activity with fewer stale sessions and lower transcode pressure.")}</p></header>${table(
            [
              "Server",
              "Active",
              "Transcodes",
              "Avg bitrate",
              "Plays (24h)",
              "Heartbeat",
              "Score",
            ],
            data.servers.map((s) => {
              const gap = s.heartbeatGapSec,
                age =
                  gap == null
                    ? "N/A"
                    : gap < 60
                      ? gap + "s"
                      : gap < 3600
                        ? Math.floor(gap / 60) + "m"
                        : Math.floor(gap / 3600) + "h",
                load = Math.round((number(s.activeStreams) / max) * 100);
              return `<tr><td><strong>${esc(s.name)}</strong><div class="ar-progress"><span style="width:${load}%"></span></div><small>Load index ${load}%</small></td><td>${number(s.activeStreams)}</td><td>${number(s.transcodes)}${s.staleStreams > 0 ? `<small>${s.staleStreams} stale</small>` : ""}</td><td>${esc(bitrate(s.avgBitrateKbps))}</td><td>${number(s.plays24h)}<small>${number(s.watchHours24h).toFixed(1)}h</small></td><td>${badge(gap == null ? "N/A" : gap <= 120 ? "healthy" : gap <= 600 ? "degraded" : "stale", gap == null ? "" : gap <= 120 ? "ar-green" : gap <= 600 ? "ar-amber" : "ar-red")}<small>${esc(age)}</small></td><td><strong>${number(s.healthScore)}</strong></td></tr>`;
            }),
            common("noData", "Aucune donnée"),
          )}</section>`
        );
      }
      function draw() {
        if (!alive()) return;
        const focusedTab = main.contains(document.activeElement)
          ? document.activeElement?.dataset.arTab
          : null;
        chart?.destroy();
        chart = null;
        main.innerHTML = `<div class="admin-recovery ${subpage === "server-compare" ? "ar-compare" : ""}">${state.loading ? `<div class="ar-loading" role="status">${esc(common("loading", "Chargement..."))}</div>` : state.error ? `<div class="ar-error" role="alert">${esc(state.error)} ${button("retry", common("refresh", "Actualiser"))}</div>` : subpage === "cleanup" ? pageHeader(c("title", "Assistant de Nettoyage"), "", "eraser") + cleanupHTML() + `<details class="ar-go-extras"><summary>${esc(fr ? "Maintenance supplémentaire Go" : "Additional Go maintenance")}</summary><p><a href="/admin/maintenance" data-link>${esc(fr ? "Nettoyage des utilisateurs et intégrité" : "User cleanup and integrity")}</a></p></details>` : subpage === "plugin-health" ? pageHeader(p("title", "Centre de santé du plugin"), p("description", "")) + pluginHTML(false) : subpage === "server-compare" ? compareHTML() + inventoryHTML() : healthHTML()}</div>`;
        if (focusedTab)
          main.querySelector(`[data-ar-tab="${focusedTab}"]`)?.focus();
        if (
          !state.loading &&
          !state.error &&
          state.tab === "logs" &&
          subpage === "health" &&
          document.getElementById("ar-anomaly-chart") &&
          window.Chart
        ) {
          const list = state.health.anomalyTimeline || [];
          chart = new Chart(document.getElementById("ar-anomaly-chart"), {
            type: "line",
            data: {
              labels: list.map((x) => x.day),
              datasets: [
                ["cleanupOps", d("cleanupOps", "Nettoyage"), "#10b981"],
                ["monitorErrors", d("monitorErrors", "Moniteur"), "#0ea5e9"],
                ["syncErrors", d("syncErrors", "Sync"), "#f59e0b"],
                ["backupErrors", d("backupErrors", "Sauvegarde"), "#ef4444"],
              ].map(([key, label, color]) => ({
                label,
                data: list.map((x) => number(x[key])),
                borderColor: color,
                backgroundColor: color + "29",
                fill: true,
                tension: 0.35,
                pointRadius: 0,
              })),
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
              plugins: { legend: { position: "bottom" } },
            },
          });
        }
        if (
          !state.loading &&
          !state.error &&
          subpage === "plugin-health" &&
          document.getElementById("ar-heartbeat-chart") &&
          window.Chart
        ) {
          const list = state.plugin?.heartbeat?.intervalSeries24h || [];
          chart = new Chart(document.getElementById("ar-heartbeat-chart"), {
            type: "line",
            data: {
              labels: list.map((row) =>
                new Date(row.timestamp.replace(" ", "T")).toLocaleTimeString(
                  locale,
                  { hour: "2-digit", minute: "2-digit" },
                ),
              ),
              datasets: [
                ["intervalSec", p("intervalSeries", "Intervalle"), "#0ea5e9"],
                ["jitterSec", p("jitterSeries", "Jitter"), "#f59e0b"],
              ].map(([key, label, color]) => ({
                label,
                data: list.map((row) => number(row[key])),
                borderColor: color,
                backgroundColor: color + "29",
                fill: true,
                tension: 0.35,
                pointRadius: 0,
              })),
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              scales: { y: { beginAtZero: true } },
              plugins: { legend: { position: "bottom" } },
            },
          });
        }
      }
      async function load() {
        state.loading = true;
        state.error = "";
        draw();
        try {
          if (subpage === "cleanup")
            state.cleanup = await api.getJSON("/api/admin/cleanup");
          else if (subpage === "server-compare") {
            let query = location.search;
            if (!new URLSearchParams(query).has("servers")) {
              try {
                const saved = localStorage.getItem("jellytrack:server-scope");
                if (saved) {
                  const params = new URLSearchParams(query);
                  params.set("servers", saved);
                  query = "?" + params;
                }
              } catch {}
            }
            state.compare = await api.getJSON(
              "/api/admin/server-compare" + query,
            );
          } else if (subpage === "plugin-health")
            state.plugin = await api.getJSON("/api/admin/plugin/health");
          else {
            const [health, cleanup] = await Promise.all([
              api.getJSON("/api/admin/health"),
              api.getJSON("/api/admin/cleanup"),
            ]);
            state.health = health;
            state.cleanup = cleanup;
            if (state.tab === "security") await loadPlugin(false);
          }
        } catch (error) {
          if (error.name !== "AbortError") state.error = error.message;
        } finally {
          state.loading = false;
          draw();
        }
      }
      async function loadPlugin(render = true) {
        state.pluginLoading = true;
        state.pluginError = "";
        if (render) draw();
        try {
          state.plugin = await api.getJSON("/api/admin/plugin/health");
        } catch (error) {
          if (error.name !== "AbortError") state.pluginError = error.message;
        } finally {
          state.pluginLoading = false;
          if (render) draw();
        }
      }
      function updateTab(kind, value) {
        if (kind === "health") state.tab = value;
        else state.nested = value;
        const params = new URLSearchParams(location.search);
        params.set(kind === "health" ? "tab" : "cleanupTab", value);
        history.pushState({}, "", location.pathname + "?" + params);
        draw();
        main.querySelector(`#ar-${kind}-${value}`)?.focus();
        if (kind === "health" && value === "security" && !state.plugin)
          loadPlugin();
      }
      function exportCleanup(format) {
        const rows = filtered(state.nested),
          day = new Date().toISOString().slice(0, 10),
          name = `jellytrack_${state.nested}_${day}.${format}`;
        if (format === "json") {
          download(name, JSON.stringify(rows, null, 2), "application/json");
          return;
        }
        const mappings =
          state.nested === "ghosts"
            ? [
                ["Title", "title"],
                ["Type", "type"],
                ["JellyfinId", "jellyfinMediaId"],
                ["Size", "size"],
                ["DateAdded", "dateAdded"],
              ]
            : state.nested === "abandoned"
              ? [
                  ["Title", "title"],
                  ["Type", "type"],
                  ["JellyfinId", "jellyfinMediaId"],
                  ["MaxCompletionPct", "maxCompletion"],
                  ["LastPlayed", "lastPlayed"],
                ]
              : [
                  ["Title", "title"],
                  ["Type", "type"],
                  ["JellyfinId", "jellyfinMediaId"],
                  ["Resolution", "resolution"],
                  ["Library", "libraryName"],
                  ["Size", "size"],
                ];
        const cell = (value) => {
          let s = String(value ?? "");
          if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        };
        download(
          name,
          [
            mappings.map(([label]) => cell(label)).join(","),
            ...rows.map((row) =>
              mappings
                .map(([, key]) =>
                  cell(
                    key === "dateAdded"
                      ? row.dateAdded || row.createdAt
                      : row[key],
                  ),
                )
                .join(","),
            ),
          ].join("\r\n"),
          "text/csv;charset=utf-8",
        );
      }
      function openDelete() {
        const selected = suggestions();
        if (!selected.length) return;
        dialog = document.createElement("dialog");
        dialog.className = "ar-delete-dialog";
        let busy = false;
        const total = selected.reduce((n, m) => n + number(m.size), 0),
          word = c("deleteConfirmWord", "SUPPRIMER");
        dialog.innerHTML = `<form><header><h2>${esc(c("deleteDialogTitle", "", { count: selected.length }))}</h2><p>${esc(c("deleteDialogDescription", "", { size: bytes(total) }))}</p></header><div class="ar-event-list">${selected.map((m) => `<article class="ar-event"><strong>${esc(m.title)}</strong><small>${esc(relative(m.dateAdded || m.createdAt))} · ${esc(bytes(m.size))}</small></article>`).join("")}</div><p class="ar-warning">${esc(c("deleteDialogWarning", "Action irréversible."))}</p><label>${esc(c("deleteDialogConfirmInputLabel", "", { word }))}<input name="confirmation" autocomplete="off"></label><p class="ar-error" role="alert" hidden></p><footer>${button("cancel", common("cancel", "Annuler"))}<button type="submit" class="btn btn-danger" disabled>${esc(c("deleteDialogConfirmButton", "Confirmer la suppression"))}</button></footer></form>`;
        document.body.append(dialog);
        const form = dialog.querySelector("form"),
          input = form.elements.confirmation,
          submit = form.querySelector("[type=submit]"),
          cancel = form.querySelector("[data-ar-action=cancel]"),
          errorEl = form.querySelector(".ar-error");
        dialog.addEventListener("cancel", (e) => {
          if (busy) e.preventDefault();
        });
        dialog.addEventListener("close", () => {
          dialog?.remove();
          dialog = null;
        });
        cancel.onclick = () => {
          if (!busy) dialog.close();
        };
        input.oninput = () => {
          submit.disabled =
            busy ||
            input.value.trim().toLocaleUpperCase() !==
              word.trim().toLocaleUpperCase();
        };
        form.onsubmit = async (e) => {
          e.preventDefault();
          if (busy || submit.disabled) return;
          busy = true;
          submit.disabled = cancel.disabled = input.disabled = true;
          submit.textContent = c(
            "deleteDialogDeleting",
            "Suppression en cours...",
          );
          errorEl.hidden = true;
          try {
            const result = await api.postJSON(
              "/api/admin/cleanup/delete-stale-movies",
              { mediaIds: selected.map((m) => m.id), confirmation: "DELETE" },
            );
            if (result.deletedCount > 0)
              toast(
                c("deleteToastSuccess", "", { count: result.deletedCount }),
              );
            else toast(c("deleteToastNoop", "Aucun film supprimé."), true);
            if (result.failed?.length)
              toast(
                c("deleteToastPartialError", "", {
                  count: result.failed.length,
                }),
                true,
              );
            busy = false;
            dialog.close();
            await load();
          } catch (error) {
            busy = false;
            input.disabled = cancel.disabled = false;
            submit.disabled = false;
            submit.textContent = c(
              "deleteDialogConfirmButton",
              "Confirmer la suppression",
            );
            errorEl.textContent = error.message;
            errorEl.hidden = false;
          }
        };
        dialog.showModal();
        input.focus();
      }
      main.addEventListener(
        "keydown",
        (e) => {
          const current = e.target.closest("[role=tab]");
          if (
            !current ||
            !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
          )
            return;
          e.preventDefault();
          const list = [
            ...current.parentElement.querySelectorAll("[role=tab]"),
          ];
          let index = list.indexOf(current);
          index =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? list.length - 1
                : (index + (e.key === "ArrowRight" ? 1 : -1) + list.length) %
                  list.length;
          const [kind, value] = list[index].dataset.arTab.split(":");
          updateTab(kind, value);
        },
        { signal },
      );
      main.addEventListener(
        "click",
        async (e) => {
          const tab = e.target.closest("[data-ar-tab]");
          if (tab) {
            const [kind, value] = tab.dataset.arTab.split(":");
            updateTab(kind, value);
            return;
          }
          const type = e.target.closest("[data-ar-type]");
          if (type) {
            state.types[state.nested] = type.dataset.arType;
            state.pages[state.nested] = 1;
            draw();
            return;
          }
          const server = e.target.closest("[data-ar-server]");
          if (server) {
            const params = new URLSearchParams(location.search),
              id = server.dataset.arServer,
              current = state.compare.selectedServerIds || [];
            const selected =
              id === "all"
                ? []
                : current.includes(id)
                  ? current.filter((v) => v !== id)
                  : [...current, id];
            params.set("servers", selected.join(","));
            try {
              if (selected.length)
                localStorage.setItem(
                  "jellytrack:server-scope",
                  selected.join(","),
                );
              else localStorage.removeItem("jellytrack:server-scope");
            } catch {}
            document.cookie = `jellytrack_server_scope=${encodeURIComponent(selected.join(","))}; path=/; max-age=31536000; samesite=lax`;
            ctx.navigate(location.pathname + "?" + params);
            return;
          }
          const action = e.target.closest("[data-ar-action]")?.dataset.arAction;
          if (!action) return;
          if (action === "retry") {
            load();
            return;
          }
          if (action === "previous" || action === "next") {
            state.pages[state.nested] += action === "next" ? 1 : -1;
            draw();
            return;
          }
          if (action === "export-csv" || action === "export-json") {
            exportCleanup(action.slice(7));
            return;
          }
          if (action === "smart-review") {
            state.nested = "ghosts";
            state.period = "all";
            state.types.ghosts = "Movie";
            state.smart = true;
            state.pages.ghosts = 1;
            draw();
            return;
          }
          if (action === "smart-dismiss") {
            state.dismissed = true;
            draw();
            return;
          }
          if (action === "smart-close") {
            state.smart = false;
            draw();
            return;
          }
          if (action === "smart-delete") {
            openDelete();
            return;
          }
          if (action === "plugin-refresh") {
            loadPlugin();
            return;
          }
          if (action === "plugin-export") {
            download(
              "jellytrack_plugin_health_" +
                new Date().toISOString().slice(0, 10) +
                ".json",
              JSON.stringify(state.plugin, null, 2),
              "application/json",
            );
            return;
          }
          if (action === "threshold-reset") {
            state.thresholds = {
              ...(state.plugin?.thresholdDefaults || {
                gapWarningSec: 600,
                gapCriticalSec: 900,
                jitterWarningSec: 180,
                jitterCriticalSec: 300,
              }),
            };
            try {
              localStorage.setItem(
                "plugin-health-thresholds-v2",
                JSON.stringify(state.thresholds),
              );
            } catch {}
            draw();
            return;
          }
          if (action === "plugin-test" || action === "plugin-heartbeat") {
            const request = {
              action:
                action === "plugin-test"
                  ? "test_connection"
                  : "force_heartbeat",
            };
            if (action === "plugin-heartbeat") {
              const key = prompt(
                p("forceHeartbeat", "Forcer un heartbeat") + " - API key",
              );
              if (key === null) return;
              if (!key.trim()) {
                toast(p("actionFailed", "Clé API requise."), true);
                return;
              }
              request.apiKey = key.trim();
            }
            state.pluginAction = request.action;
            state.pluginError = "";
            draw();
            try {
              const result = await api.postJSON(
                "/api/admin/plugin/health",
                request,
              );
              if (!result.ok)
                throw new Error(
                  result.response?.error || `HTTP ${result.status}`,
                );
              toast(
                p(
                  action === "plugin-test"
                    ? "connectionTestCompleted"
                    : "manualHeartbeatSent",
                  fr
                    ? "Action réussie en {latency} ms"
                    : "Action completed in {latency} ms",
                  { latency: result.latencyMs },
                ),
              );
              await loadPlugin(false);
            } catch (error) {
              state.pluginError = error.message;
              toast(error.message, true);
            } finally {
              state.pluginAction = "";
              draw();
            }
          }
        },
        { signal },
      );
      main.addEventListener(
        "input",
        (e) => {
          if (e.target.dataset.arField !== "query") return;
          const input = e.target,
            pos = input.selectionStart;
          state.query = input.value;
          state.pages.ghosts =
            state.pages.abandoned =
            state.pages.duplicates =
              1;
          draw();
          const fresh = main.querySelector("[data-ar-field=query]");
          fresh.focus();
          if (pos != null) fresh.setSelectionRange?.(pos, pos);
        },
        { signal },
      );
      main.addEventListener(
        "change",
        (e) => {
          const key = e.target.dataset.arField;
          if (key && key !== "query") {
            state[key] = ["size", "closures"].includes(key)
              ? number(e.target.value)
              : e.target.value;
            if (["period", "size"].includes(key))
              state.pages.ghosts =
                state.pages.abandoned =
                state.pages.duplicates =
                  1;
            if (key === "sort") state.pages.abandoned = 1;
            draw();
          }
          const threshold = e.target.dataset.arThreshold;
          if (threshold) {
            let value = number(e.target.value);
            state.thresholds[threshold] = Math.max(
              threshold.startsWith("gap") ? 1 : 0.1,
              value,
            );
            state.thresholds.gapCriticalSec = Math.max(
              number(state.thresholds.gapCriticalSec),
              number(state.thresholds.gapWarningSec) + 1,
            );
            state.thresholds.jitterCriticalSec = Math.max(
              number(state.thresholds.jitterCriticalSec),
              number(state.thresholds.jitterWarningSec) + 0.1,
            );
            try {
              localStorage.setItem(
                "plugin-health-thresholds-v2",
                JSON.stringify(state.thresholds),
              );
            } catch {}
            draw();
          }
        },
        { signal },
      );
      if (subpage === "maintenance") {
        ctx.legacy.cleanup();
        return;
      }
      if (subpage === "system-health") {
        ctx.legacy.health("system");
        return;
      }
      if (subpage === "log-health") {
        ctx.legacy.health("logs");
        return;
      }
      load();
    },
  };
})();
