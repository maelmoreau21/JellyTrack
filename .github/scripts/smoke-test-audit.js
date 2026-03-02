function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runBackupRestoreSimulation() {
  const now = new Date("2026-03-02T12:00:00.000Z");

  const sourceBackup = {
    version: "1.0",
    exportDate: now.toISOString(),
    data: {
      users: [
        {
          id: "u1",
          jellyfinUserId: "j-1",
          username: "alice",
          createdAt: now.toISOString(),
        },
      ],
      media: [
        {
          id: "m1",
          jellyfinMediaId: "jf-m1",
          title: "Demo Movie",
          type: "Movie",
          durationMs: BigInt(3600000),
          createdAt: now.toISOString(),
        },
      ],
      playbackHistory: [
        {
          id: "p1",
          userId: "u1",
          mediaId: "m1",
          startedAt: now.toISOString(),
          endedAt: new Date(now.getTime() + 2700 * 1000).toISOString(),
          durationWatched: 2700,
          playMethod: "DirectPlay",
          clientName: "Web",
          deviceName: "Chrome",
          ipAddress: "192.168.1.10",
          country: "FR",
          city: "Paris",
          audioCodec: "aac",
          audioLanguage: "fre",
          subtitleCodec: "subrip",
          subtitleLanguage: "eng",
          pauseCount: 3,
          audioChanges: 2,
          subtitleChanges: 1,
        },
      ],
      telemetryEvents: [
        {
          id: "t1",
          playbackId: "p1",
          eventType: "pause",
          positionMs: BigInt(120000),
          metadata: { reason: "user" },
          createdAt: now.toISOString(),
        },
      ],
      settings: {
        id: "global",
        monitorIntervalActive: 1000,
        monitorIntervalIdle: 5000,
        defaultLocale: "fr",
        timeFormat: "24h",
      },
    },
  };

  const bigIntReplacer = (_k, v) => (typeof v === "bigint" ? v.toString() : v);
  const exportedJson = JSON.stringify(sourceBackup, bigIntReplacer, 2);
  const parsed = JSON.parse(exportedJson);

  // Simulate /api/backup/import transformations
  for (const m of parsed.data.media || []) {
    if (m.durationMs !== undefined && m.durationMs !== null) {
      m.durationMs = BigInt(m.durationMs);
    }
  }
  for (const h of parsed.data.playbackHistory || []) {
    if (h.startedAt && typeof h.startedAt === "string") h.startedAt = new Date(h.startedAt);
    if (h.endedAt && typeof h.endedAt === "string") h.endedAt = new Date(h.endedAt);
  }
  for (const e of parsed.data.telemetryEvents || []) {
    if (e.positionMs !== undefined && e.positionMs !== null) {
      e.positionMs = BigInt(e.positionMs);
    }
    if (e.createdAt && typeof e.createdAt === "string") e.createdAt = new Date(e.createdAt);
  }

  const importedPlayback = parsed.data.playbackHistory[0];
  const importedTelemetry = parsed.data.telemetryEvents[0];

  assert(importedPlayback.pauseCount === 3, "pauseCount lost during import simulation");
  assert(importedPlayback.audioChanges === 2, "audioChanges lost during import simulation");
  assert(importedPlayback.subtitleChanges === 1, "subtitleChanges lost during import simulation");
  assert(typeof importedTelemetry.positionMs === "bigint", "telemetry positionMs not restored as BigInt");

  // Simulate /api/backup/auto/restore mapping defaults
  const autoMappedPlayback = {
    pauseCount: importedPlayback.pauseCount || 0,
    audioChanges: importedPlayback.audioChanges || 0,
    subtitleChanges: importedPlayback.subtitleChanges || 0,
  };
  assert(autoMappedPlayback.pauseCount === 3, "pauseCount changed during auto-restore mapping");
  assert(autoMappedPlayback.audioChanges === 2, "audioChanges changed during auto-restore mapping");
  assert(autoMappedPlayback.subtitleChanges === 1, "subtitleChanges changed during auto-restore mapping");

  return {
    ok: true,
    telemetryCounters: autoMappedPlayback,
    telemetryPositionType: typeof importedTelemetry.positionMs,
  };
}

function runCompletionKpiSimulation() {
  // Mirrors GranularAnalysis logic: durationSecs = Number(durationMs) / 1000
  const durationMs = BigInt(60 * 60 * 1000); // 1h movie
  const watchedSeconds = 45 * 60; // 45 min watched
  const durationSecs = Number(durationMs) / 1000;
  let completion = (watchedSeconds / durationSecs) * 100;
  if (completion > 100) completion = 100;

  assert(Number.isFinite(completion), "completion KPI is not finite");
  assert(completion === 75, `expected 75, got ${completion}`);

  return {
    ok: true,
    durationSecs,
    watchedSeconds,
    completion,
  };
}

function main() {
  const backup = runBackupRestoreSimulation();
  const kpi = runCompletionKpiSimulation();

  console.log("[PASS] Backup/Restore simulation", backup);
  console.log("[PASS] KPI completion simulation", kpi);
}

main();
