'use client';

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Film, Tv, Music, User, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type MediaResult = { jellyfinMediaId: string; title: string; type: string; parentId: string | null; subtitle?: string | null };

type UserResult = { jellyfinUserId: string; username: string };

function getTypeIcon(type: string) {
  switch (type) {
    case "Movie": return <Film className="w-4 h-4 text-blue-400" />;
    case "Series": return <Tv className="w-4 h-4 text-green-400" />;
    case "MusicAlbum": return <Music className="w-4 h-4 text-yellow-400" />;
    default: return <Film className="w-4 h-4 text-muted-foreground" />;
  }
}

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('search');
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ media: MediaResult[]; users: UserResult[] }>({ media: [], users: [] });
  const [isOpen, setIsOpen] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const compactInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults({ media: [], users: [] });
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setIsOpen(true);
      }
    } catch {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, fetchResults]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setCompactOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (compactOpen && compactInputRef.current) {
      compactInputRef.current.focus();
    }
  }, [compactOpen]);

  const close = () => {
    setQuery("");
    setIsOpen(false);
    setCompactOpen(false);
    setResults({ media: [], users: [] });
  };

  const hasResults = results.media.length > 0 || results.users.length > 0;

  if (compact) {
    return (
      <div ref={containerRef} className="relative flex justify-center">
        <button
          type="button"
          onClick={() => setCompactOpen(!compactOpen)}
          className="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent/80 text-sidebar-foreground/70 transition-all hover:border-sidebar-primary/40 hover:bg-sidebar-primary/15 hover:text-sidebar-primary shadow-sm"
          aria-label={t('placeholder')}
          title={t('placeholder')}
        >
          <Search className="h-4 w-4" />
          <div className="pointer-events-none absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 hidden rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900 group-hover:block whitespace-nowrap">
            {t('placeholder')}
          </div>
        </button>

        {compactOpen && (
          <div className="fixed left-[76px] top-16 z-[70] w-80 overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar/95 p-3 shadow-2xl backdrop-blur-2xl animate-in fade-in-0 zoom-in-95 duration-150">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/50" />
              <input
                ref={compactInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('placeholder')}
                className="w-full app-surface-soft rounded-lg pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
              />
              {query ? (
                <button onClick={close} className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={() => setCompactOpen(false)} className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="mt-2 max-h-[350px] overflow-y-auto">
              {isLoading && (
                <div className="px-3 py-2 text-xs text-muted-foreground">{t('searching')}</div>
              )}

              {!isLoading && !hasResults && query.length >= 2 && (
                <div className="px-3 py-4 text-center text-muted-foreground text-sm">{t('noResults')}</div>
              )}

              {results.media.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('mediaSection')}
                  </div>
                  {results.media.map((m) => (
                    <Link
                      key={m.jellyfinMediaId}
                      href={`/media/${m.jellyfinMediaId}`}
                      onClick={close}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-muted transition-colors"
                    >
                      {getTypeIcon(m.type)}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground truncate">{m.title}</span>
                        {m.subtitle && (
                          <span className="text-[11px] text-muted-foreground truncate">{m.subtitle}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {results.users.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('usersSection')}
                  </div>
                  {results.users.map((u) => (
                    <Link
                      key={u.jellyfinUserId}
                      href={`/users/${u.jellyfinUserId}`}
                      onClick={close}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-muted transition-colors"
                    >
                      <User className="w-4 h-4 text-purple-400" />
                      <span className="text-sm text-foreground truncate">{u.username}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (hasResults) setIsOpen(true); }}
          placeholder={t('placeholder')}
          className="w-full app-surface-soft rounded-lg pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
        />
        {query && (
          <button onClick={close} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 dark:hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 app-surface border border-border rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
          {isLoading && (
            <div className="px-4 py-3 text-xs text-muted-foreground">{t('searching')}</div>
          )}

          {!isLoading && !hasResults && query.length >= 2 && (
            <div className="px-4 py-6 text-center text-muted-foreground text-sm">{t('noResults')}</div>
          )}

          {results.media.length > 0 && (
            <div>
              <div className="app-surface-nested px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('mediaSection')}
              </div>
              {results.media.map((m) => (
                <Link
                  key={m.jellyfinMediaId}
                  href={`/media/${m.jellyfinMediaId}`}
                  onClick={close}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors"
                >
                  {getTypeIcon(m.type)}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground truncate">{m.title}</span>
                    {m.subtitle && (
                      <span className="text-[11px] text-muted-foreground truncate">{m.subtitle}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {results.users.length > 0 && (
            <div>
              <div className="app-surface-nested px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('usersSection')}
              </div>
              {results.users.map((u) => (
                <Link
                  key={u.jellyfinUserId}
                  href={`/users/${u.jellyfinUserId}`}
                  onClick={close}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted transition-colors"
                >
                  <User className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-foreground truncate">{u.username}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
