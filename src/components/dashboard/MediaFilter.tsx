"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Filter, Film, Tv, Music, BookOpen } from "lucide-react";

export function MediaFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tc = useTranslations('common');
  const td = useTranslations('dashboard');

  const excludedParam = searchParams.get('excludeTypes');
  const excludedTypes = excludedParam ? excludedParam.split(',') : [];

  const categories = [
    { id: 'all', label: tc('all') || 'All', icon: Filter },
    { id: 'Movie', label: tc('movies') || 'Movies', icon: Film },
    { id: 'Series', label: tc('series') || 'Series', icon: Tv },
    { id: 'MusicAlbum', label: tc('music') || 'Music', icon: Music },
    { id: 'Book', label: tc('books') || 'Books', icon: BookOpen },
  ];

  const allSelected = excludedTypes.length === 0;

  const toggleType = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('type'); // Cleanup legacy

    if (id === 'all') {
      params.delete('excludeTypes');
    } else {
      let currentExcluded = [...excludedTypes];
      if (allSelected) {
        // If all were selected, starting to filter means excluding everything else
        currentExcluded = categories
          .filter(c => c.id !== 'all' && c.id !== id)
          .map(c => c.id);
      } else {
        // Toggle the category
        // Note: in excludedTypes, if it IS there, it's hidden. If NOT there, it's visible.
        // So clicking it when visible (isActive=true) means we want to hide it (add to excluded).
        if (currentExcluded.includes(id)) {
          // It was hidden, now make it visible
          currentExcluded = currentExcluded.filter(x => x !== id);
        } else {
          // It was visible, now hide it
          currentExcluded.push(id);
        }
      }

      // If we've hidden everything except one, or if nothing is hidden, reset to All
      if (currentExcluded.length === 0 || currentExcluded.length >= categories.length - 1) {
        params.delete('excludeTypes');
      } else {
        params.set('excludeTypes', currentExcluded.join(','));
      }
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (pathname !== '/') return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 app-surface-soft p-1.5 rounded-xl border border-border/40 backdrop-blur-md transition-all hover:bg-black/5 dark:hover:bg-white/5 group">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5 px-1">
          {categories.map((cat) => {
            // An item is active if it's NOT in the excluded list, or if 'all' is selected
            const isActive = cat.id === 'all' ? allSelected : !excludedTypes.includes(cat.id);
            const Icon = cat.icon;

            return (
              <button
                key={cat.id}
                onClick={() => toggleType(cat.id)}
                className={`
                  flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 whitespace-nowrap border
                  ${isActive 
                    ? 'app-surface text-primary border-border shadow-sm' 
                    : 'bg-transparent text-muted-foreground border-transparent hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground'
                  }
                `}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'text-zinc-500 opacity-60'}`} />
                {cat.label}
              </button>
            );
          })}
        </div>
        
        {/* helper text removed per UX request */}
      </div>
    </div>
  );
}
