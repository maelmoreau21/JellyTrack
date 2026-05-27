"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Server } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import {
  parseServerScopeParam,
  persistGlobalServerScope,
  readPersistedServerScope,
  serializeServerScope,
} from "@/lib/serverScope";

type ServerOption = {
  id: string;
  name: string;
};

export function ServerFilter({
  servers,
  enabled,
  showOutsideDashboard = false,
}: {
  servers: ServerOption[];
  enabled: boolean;
  showOutsideDashboard?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tc = useTranslations("common");
  const searchParamsString = searchParams.toString();

  const selectedRaw = searchParams.get("servers");
  const selected = useMemo(() => parseServerScopeParam(selectedRaw), [selectedRaw]);
  const validIds = useMemo(() => new Set(servers.map((s) => s.id)), [servers]);
  const selectedValid = useMemo(
    () => selected.filter((id) => validIds.has(id)),
    [selected, validIds]
  );
  const selectedValidKey = selectedValid.join(",");

  const allSelected = selectedValid.length === 0;

  useEffect(() => {
    if (!enabled || servers.length <= 1) return;

    // If URL has no explicit scope, try restoring from local persisted scope.
    if (selectedRaw === null) {
      const restored = readPersistedServerScope().filter((id) => validIds.has(id));
      if (restored.length > 0) {
        const params = new URLSearchParams(searchParamsString);
        params.set("servers", serializeServerScope(restored));
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        return;
      }
    }

    persistGlobalServerScope(selectedValid);
  }, [
    enabled,
    pathname,
    router,
    searchParamsString,
    selectedRaw,
    selectedValidKey,
    servers.length,
    validIds,
  ]);

  const update = (next: string[]) => {
    const params = new URLSearchParams(searchParamsString);
    const serialized = serializeServerScope(next);
    if (!serialized) {
      params.delete("servers");
    } else {
      params.set("servers", serialized);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const toggleServer = (id: string) => {
    if (allSelected) {
      update([id]);
      return;
    }
    const has = selectedValid.includes(id);
    const next = has ? selectedValid.filter((v) => v !== id) : [...selectedValid, id];
    update(next);
  };

  if (!enabled || servers.length <= 1) return null;
  if (!showOutsideDashboard && pathname !== "/") return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 app-surface-soft p-1.5 rounded-xl border border-border/40 backdrop-blur-md transition-all hover:bg-slate-900/5 dark:hover:bg-white/5 group">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5 px-1">
          <button
            onClick={() => update([])}
            className={`
              flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 whitespace-nowrap border
              ${allSelected
                ? "app-surface text-primary border-border shadow-sm"
                : "bg-transparent text-muted-foreground border-transparent hover:bg-slate-900/5 dark:hover:bg-white/5 hover:text-foreground"
              }
            `}
          >
            <Filter className={`w-3.5 h-3.5 ${allSelected ? "text-primary" : "text-zinc-500 opacity-60"}`} />
            {tc("all") || "All"}
          </button>

          {servers.map((server) => {
            const isActive = allSelected ? true : selectedValid.includes(server.id);
            return (
              <button
                key={server.id}
                onClick={() => toggleServer(server.id)}
                className={`
                  flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 whitespace-nowrap border
                  ${isActive
                    ? "app-surface text-primary border-border shadow-sm"
                    : "bg-transparent text-muted-foreground border-transparent hover:bg-slate-900/5 dark:hover:bg-white/5 hover:text-foreground"
                  }
                `}
              >
                <Server className={`w-3.5 h-3.5 ${isActive ? "text-primary" : "text-zinc-500 opacity-60"}`} />
                {server.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
