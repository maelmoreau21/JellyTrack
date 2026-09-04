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

function redactSsoSettings(ssoSettings: unknown): unknown {
  if (!isRecord(ssoSettings)) return ssoSettings;
  const redacted = { ...ssoSettings };
  if ("clientSecret" in redacted) {
    redacted.clientSecret = "";
  }
  if (isRecord(redacted.dbConfig) && "clientSecret" in redacted.dbConfig) {
    redacted.dbConfig = { ...(redacted.dbConfig as RecordLike), clientSecret: "" };
  }
  return redacted;
}

function redactSettings(settings: unknown): unknown {
  if (!isRecord(settings)) return settings;
  const redacted = { ...settings };
  delete redacted.pluginApiKey;
  delete redacted.pluginPreviousApiKey;
  if ("ssoSettings" in redacted) {
    redacted.ssoSettings = redactSsoSettings(redacted.ssoSettings);
  }
  return redacted;
}

export function redactBackupData<T extends RecordLike>(data: T): T {
  return {
    ...data,
    servers: Array.isArray(data.servers) ? data.servers.map(redactServer) : data.servers,
    settings: redactSettings(data.settings),
  };
}
