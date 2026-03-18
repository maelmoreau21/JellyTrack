"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Check, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

interface LibraryFilterProps {
  libraries: string[];
}

export function LibraryFilter({ libraries }: LibraryFilterProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const t = useTranslations('dashboard');

  const excludedParam = searchParams.get('excludeLibs');
  const initialExcluded = excludedParam ? excludedParam.split(',') : [];
  
  // Local state to track selections synchronously and avoid searchParams Next.js update delay
  const [localExcluded, setLocalExcluded] = useState<string[]>(initialExcluded);

  // Sync state if URL changes externally
  useEffect(() => {
    setLocalExcluded(excludedParam ? excludedParam.split(',') : []);
  }, [excludedParam]);

  const toggleLibrary = (lib: string) => {
    setLocalExcluded((prev) => {
      const isExcluded = prev.includes(lib);
      const newExcluded = isExcluded ? prev.filter(l => l !== lib) : [...prev, lib];
      
      const params = new URLSearchParams(searchParams.toString());
      if (newExcluded.length > 0) {
        params.set('excludeLibs', newExcluded.join(','));
      } else {
        params.delete('excludeLibs');
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
      
      return newExcluded;
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 shadow-sm rounded-full dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hidden sm:flex">
          <Filter className="h-4 w-4" />
          <span className="text-sm font-medium">
            {localExcluded.length > 0 ? `${localExcluded.length} ${t('excluded', { defaultMessage: 'Exclus' })}` : t('allLibraries', { defaultMessage: 'Toutes les biblis' })}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0 rounded-xl overflow-hidden shadow-lg border-zinc-200 dark:border-zinc-800" align="end">
        <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800/80">
          <h4 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">{t('filterLibraries', { defaultMessage: 'Filtrer les bibliothèques' })}</h4>
          <p className="text-xs text-zinc-500 mt-0.5">{t('uncheckToHide', { defaultMessage: 'Décochez pour masquer du Dashboard' })}</p>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2 flex flex-col gap-1">
          {libraries.length === 0 && (
            <div className="p-2 text-xs text-zinc-500 text-center">{t('noLibraries', { defaultMessage: 'Aucune bibliothèque' })}</div>
          )}
          {libraries.map((lib) => {
            const isVisible = !localExcluded.includes(lib);
            return (
              <button
                key={lib}
                onClick={() => toggleLibrary(lib)}
                className="flex items-center justify-between w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors group"
              >
                <span className={`font-medium truncate ${!isVisible ? 'text-zinc-400 dark:text-zinc-500 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {lib}
                </span>
                <div className={`flex items-center justify-center w-5 h-5 rounded-md border transition-colors ${isVisible ? 'bg-primary border-primary text-white' : 'border-zinc-300 dark:border-zinc-700'}`}>
                  {isVisible && <Check className="w-3.5 h-3.5" />}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
