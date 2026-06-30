"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Filter, Film, Tv, Music, Search as SearchIcon, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function AllMediaControls() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tc = useTranslations('common');
  
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  
  const excludedParam = searchParams.get('excludeTypes');
  const excludedTypes = excludedParam ? excludedParam.split(',') : [];

  const categories = [
    { id: 'all', label: tc('all') || 'All', icon: Filter },
    { id: 'Movie', label: tc('movies') || 'Movies', icon: Film },
    { id: 'Series', label: tc('series') || 'Series', icon: Tv },
    { id: 'MusicAlbum', label: tc('music') || 'Music', icon: Music },
  ];

  const allSelected = excludedTypes.length === 0;

  const toggleType = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('type'); // Cleanup legacy parameter
    params.delete('page');

    if (id === 'all') {
      params.delete('excludeTypes');
    } else {
      let currentExcluded = [...excludedTypes];
      if (allSelected) {
        currentExcluded = categories.filter(c => c.id !== 'all' && c.id !== id).map(c => c.id);
      } else {
        if (currentExcluded.includes(id)) {
          currentExcluded = currentExcluded.filter(x => x !== id);
        } else {
          currentExcluded.push(id);
        }
      }

      if (currentExcluded.length === 0 || currentExcluded.length >= categories.length - 1) {
        params.delete('excludeTypes');
      } else {
        params.set('excludeTypes', currentExcluded.join(','));
      }
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const currentQ = params.get('q') || '';
      
      const trimmedQuery = query.trim();
      if (trimmedQuery !== currentQ) {
        params.delete('page');
        if (trimmedQuery && trimmedQuery.length >= 2) {
          params.set('q', trimmedQuery);
        } else {
          params.delete('q');
        }
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }
    }, 400); // Debounce duration
    return () => clearTimeout(timeoutId);
  }, [query, searchParams, pathname, router]);

  const clearQuery = () => {
    setQuery('');
  };

  return (
    <div className="mb-6">
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="app-surface-soft flex items-center gap-1.5 p-1.5 rounded-xl border backdrop-blur-sm transition-all overflow-x-auto scrollbar-hide w-full md:w-auto">
          {categories.map(cat => {
            const isActive = cat.id === 'all' ? allSelected : !excludedTypes.includes(cat.id);
            const Icon = cat.icon as any;
            return (
              <button 
                key={cat.id} 
                onClick={() => toggleType(cat.id)} 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 whitespace-nowrap border ${isActive ? 'bg-card dark:bg-[var(--surface-nested)] text-primary border-border shadow-sm' : 'bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground'}`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'text-zinc-500 opacity-60'}`} />
                <span className="hidden sm:inline">{cat.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 w-full">
          <Input 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            placeholder={tc('searchPlaceholder') || 'Search...'} 
            className="app-field w-full pl-9 pr-10 focus-visible:ring-1 focus-visible:ring-primary/50 text-base md:text-sm shadow-sm"
          />
          <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          {query && (
            <button type="button" onClick={clearQuery} className="app-surface-soft absolute right-2 top-2 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-full">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
