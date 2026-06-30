import "server-only";
import { ensureMasterServer } from "@/lib/serverRegistry";
import { resolveSelectedServerIds, serializeServerScope } from "@/lib/serverScope";

// Server-only resolver that can touch Prisma-backed server registry data.
export async function resolveSelectedServerIdsAsync(input: {
  multiServerEnabled: boolean;
  selectableServerIds: string[];
  requestedServersParam?: string | null;
  cookieServersParam?: string | null;
}): Promise<{
  selectedServerIds: string[];
  selectedServerIdsParam: string;
  source: "query" | "cookie" | "none";
}> {
  const base = resolveSelectedServerIds(input);

  if (input.multiServerEnabled || base.selectedServerIds.length > 0) {
    return base;
  }

  try {
    const master = await ensureMasterServer();
    const id = master?.id ? String(master.id) : "";
    if (id) {
      const serialized = serializeServerScope([id]);
      return { selectedServerIds: [id], selectedServerIdsParam: serialized, source: "none" };
    }
  } catch {
    // Best effort only: keep previous behavior if the database is unavailable.
  }

  return base;
}
