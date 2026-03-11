'use client';

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Film, Tv, Music, User, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type MediaResult = { jellyfinMediaId: string; title: string; type: string; parentId: string | null };
type UserResult = { jellyfinUserId: string; username: string };

function getTypeIcon(type: string) {
  switch (type) {
    case "Movie": return <Film className="w-4 h-4 text-blue-400" />;
    case "Series": return <Tv className="w-4 h-4 text-green-400" />;
    case "MusicAlbum": return <Music className="w-4 h-4 text-yellow-400" />;
    default: return <Film className="w-4 h-4 text-zinc-400" />;
  }
}

export function SearchBar() {
  const t = useTranslations('search');
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ media: MediaResult[]; users: UserResult[] }>({ media: [], users: [] });
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const close = () => {
    setQuery("");
    setIsOpen(false);
    setResults({ media: [], users: [] });
  };

  const hasResults = results.media.length > 0 || results.users.length > 0;

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
          className="w-full bg-zinc-100/60 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/50 rounded-lg pl-9 pr-8 py-2 text-sm text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
        />
        {query && (
          <button onClick={close} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
          {isLoading && (
            <div className="px-4 py-3 text-xs text-zinc-500">{t('searching')}</div>
          )}

          {!isLoading && !hasResults && query.length >= 2 && (
            <div className="px-4 py-6 text-center text-zinc-500 text-sm">{t('noResults')}</div>
          )}

          {results.media.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-200/50 dark:bg-zinc-800/50">
                {t('mediaSection')}
              </div>
              {results.media.map((m) => (
                <Link
                  key={m.jellyfinMediaId}
                  href={`/media/${m.jellyfinMediaId}`}
                  onClick={close}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors"
                >
                  {getTypeIcon(m.type)}
                  <span className="text-sm text-zinc-700 dark:text-zinc-200 truncate">{m.title}</span>
                </Link>
              ))}
            </div>
          )}

          {results.users.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-200/50 dark:bg-zinc-800/50">
                {t('usersSection')}
              </div>
              {results.users.map((u) => (
                <Link
                  key={u.jellyfinUserId}
                  href={`/users/${u.jellyfinUserId}`}
                  onClick={close}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors"
                >
                  <User className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-200 truncate">{u.username}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
