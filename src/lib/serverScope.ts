export const GLOBAL_SERVER_SCOPE_COOKIE = "jellytrack_server_scope";
export const GLOBAL_SERVER_SCOPE_STORAGE_KEY = "jellytrack:server-scope";

function uniqueServerIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

export function parseServerScopeParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return uniqueServerIds(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  );
}

export function serializeServerScope(serverIds: string[]): string {
  return uniqueServerIds(serverIds.map((id) => id.trim()).filter((id) => id.length > 0)).join(",");
}

export function decodeServerScopeCookie(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function resolveSelectedServerIds(input: {
  multiServerEnabled: boolean;
  selectableServerIds: string[];
  requestedServersParam?: string | null;
  cookieServersParam?: string | null;
}): {
  selectedServerIds: string[];
  selectedServerIdsParam: string;
  source: "query" | "cookie" | "none";
} {
  if (!input.multiServerEnabled || input.selectableServerIds.length <= 1) {
    return { selectedServerIds: [], selectedServerIdsParam: "", source: "none" };
  }

  const validIds = new Set(input.selectableServerIds);
  const fromQuery = parseServerScopeParam(input.requestedServersParam).filter((id) => validIds.has(id));
  const fromCookie = parseServerScopeParam(decodeServerScopeCookie(input.cookieServersParam)).filter((id) => validIds.has(id));

  const hasQueryParam = typeof input.requestedServersParam === "string";
  const selectedServerIds = hasQueryParam ? fromQuery : fromCookie;

  return {
    selectedServerIds,
    selectedServerIdsParam: serializeServerScope(selectedServerIds),
    source: hasQueryParam ? "query" : selectedServerIds.length > 0 ? "cookie" : "none",
  };
}

export function readPersistedServerScope(): string[] {
  if (typeof window === "undefined") return [];

  try {
    return parseServerScopeParam(window.localStorage.getItem(GLOBAL_SERVER_SCOPE_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeServerScopeCookie(serialized: string): void {
  if (typeof document === "undefined") return;

  if (!serialized) {
    document.cookie = `${GLOBAL_SERVER_SCOPE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    return;
  }

  document.cookie = `${GLOBAL_SERVER_SCOPE_COOKIE}=${encodeURIComponent(serialized)}; path=/; max-age=31536000; samesite=lax`;
}

export function persistGlobalServerScope(serverIds: string[]): void {
  if (typeof window === "undefined") return;

  const serialized = serializeServerScope(serverIds);

  try {
    if (serialized) {
      window.localStorage.setItem(GLOBAL_SERVER_SCOPE_STORAGE_KEY, serialized);
    } else {
      window.localStorage.removeItem(GLOBAL_SERVER_SCOPE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures (private mode, storage disabled, etc.)
  }

  writeServerScopeCookie(serialized);
}
