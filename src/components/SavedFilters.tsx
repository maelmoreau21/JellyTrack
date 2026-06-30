"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Bookmark, BookmarkPlus, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";

interface SavedFilter {
  name: string;
  url: string;
  createdAt: string;
}

const STORAGE_KEY = "jellytrack-saved-filters";
const MAX_FILTERS = 10;

function loadFilters(): SavedFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFilters(filters: SavedFilter[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
}

export function SavedFilters() {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<SavedFilter[]>(() => loadFilters());
  const [newName, setNewName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showInput, setShowInput] = useState(false);

  const currentUrl = `${pathname}?${searchParams.toString()}`;

  const handleSave = useCallback(() => {
    if (!newName.trim()) return;
    const updated = [
      { name: newName.trim(), url: currentUrl, createdAt: new Date().toISOString() },
      ...filters,
    ].slice(0, MAX_FILTERS);
    saveFilters(updated);
    setFilters(updated);
    setNewName("");
    setShowInput(false);
  }, [newName, currentUrl, filters]);

  const handleDelete = useCallback(
    (index: number) => {
      const updated = filters.filter((_, i) => i !== index);
      saveFilters(updated);
      setFilters(updated);
    },
    [filters]
  );

  const handleLoad = useCallback(
    (url: string) => {
      router.push(url);
      setIsOpen(false);
    },
    [router]
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 bg-card border-border text-sm font-medium"
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("savedFilters")}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 bg-card border-border p-3 space-y-2"
      >
        {filters.length === 0 && !showInput && (
          <p className="text-xs text-muted-foreground text-center py-3">
            {t("noSavedFilters")}
          </p>
        )}

        {filters.map((f, i) => (
          <div
            key={`${f.name}-${i}`}
            className="flex items-center gap-2 group rounded-md hover:bg-muted/50 px-2 py-1.5 transition-colors"
          >
            <button
              onClick={() => handleLoad(f.url)}
              className="flex-1 text-left text-sm font-medium truncate hover:text-primary transition-colors"
              title={f.url}
            >
              {f.name}
            </button>
            <button
              onClick={() => handleDelete(i)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-0.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {showInput ? (
          <div className="flex gap-1.5 pt-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("filterName")}
              className="h-8 text-xs bg-background"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
            />
            <Button size="sm" onClick={handleSave} className="h-8 px-2.5 text-xs">
              {t("save")}
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInput(true)}
            className="w-full h-8 text-xs gap-1.5 text-muted-foreground hover:text-primary"
            disabled={filters.length >= MAX_FILTERS}
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            {t("saveCurrentFilter")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
