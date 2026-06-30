type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function redactServer(server: unknown): unknown {
  if (!isRecord(server)) return server;
  const redacted = { ...server };
  delete redacted.jellyfinApiKey;
  return redacted;
}

function redactSettings(settings: unknown): unknown {
  if (!isRecord(settings)) return settings;
  const redacted = { ...settings };
  delete redacted.pluginApiKey;
  delete redacted.pluginPreviousApiKey;
  return redacted;
}

export function redactBackupData<T extends RecordLike>(data: T): T {
  return {
    ...data,
    servers: Array.isArray(data.servers) ? data.servers.map(redactServer) : data.servers,
    settings: redactSettings(data.settings),
  };
}
