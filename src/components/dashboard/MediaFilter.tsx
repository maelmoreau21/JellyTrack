"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  { id: 'Movie', i18nKey: 'movies' },
  { id: 'Series', i18nKey: 'series' },
  { id: 'MusicAlbum', i18nKey: 'music' },
  { id: 'Book', i18nKey: 'books' },
];

export function MediaFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tc = useTranslations('common');

  const excludedParam = searchParams.get('excludeTypes');
  const excludedTypes = excludedParam ? excludedParam.split(',') : [];

  const allSelected = excludedTypes.length === 0;

  const toggleCategory = (catId: string) => {
    let newExcluded = [...excludedTypes];
    
    if (allSelected) {
      // If "All" is active, clicking one category means we want to ISOLATE it.
      // So we exclude all others.
      newExcluded = CATEGORIES.map(c => c.id).filter(id => id !== catId);
    } else {
      // Otherwise toggle
      if (newExcluded.includes(catId)) {
        newExcluded = newExcluded.filter(c => c !== catId);
      } else {
        newExcluded.push(catId);
      }
    }
    
    // If we've removed everything from excluded (meaning all are selected), 
    // or if we've excluded everything (should auto-reset to All)
    if (newExcluded.length === CATEGORIES.length) {
      newExcluded = []; // Reset to All
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('type'); // Legacy single-select param safety cleanup
    
    if (newExcluded.length > 0) {
      params.set('excludeTypes', newExcluded.join(','));
    } else {
      params.delete('excludeTypes');
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const selectAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('type');
    params.delete('excludeTypes');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button 
        variant={allSelected ? "default" : "outline"} 
        size="sm" 
        onClick={selectAll}
        className={`rounded-full h-8 px-4 transition-colors ${allSelected ? 'bg-primary text-primary-foreground font-semibold' : 'text-zinc-600 dark:text-zinc-400 font-medium border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
      >
        {tc('all', { defaultMessage: 'Tout' })}
      </Button>
      {CATEGORIES.map(cat => {
        const isSelected = !excludedTypes.includes(cat.id);
        return (
          <Button
            key={cat.id}
            variant={isSelected && !allSelected ? "default" : "outline"}
            size="sm"
            onClick={() => toggleCategory(cat.id)}
            className={`rounded-full h-8 px-4 transition-colors ${isSelected && !allSelected ? 'bg-primary text-primary-foreground font-semibold' : 'text-zinc-600 dark:text-zinc-400 font-medium border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
          >
            {tc(cat.i18nKey)}
          </Button>
        );
      })}
    </div>
  );
}
