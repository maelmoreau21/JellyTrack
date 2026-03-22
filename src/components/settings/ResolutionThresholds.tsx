"use client";

import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";

type Threshold = { maxW: number; maxH: number };
type Thresholds = Record<string, Threshold>;

const DEFAULT_THRESHOLDS: Thresholds = {
  "480p": { maxW: 792, maxH: 528 },
  "720p": { maxW: 1408, maxH: 792 },
  "1080p": { maxW: 2112, maxH: 1188 },
  "4K": { maxW: 4224, maxH: 2376 }
};

interface ResolutionThresholdsProps {
  value: Thresholds | null;
  onChange: (value: Thresholds) => void;
}

export function ResolutionThresholds({ value, onChange }: ResolutionThresholdsProps) {
  const t = useTranslations("settings");
  const thresholds = value || DEFAULT_THRESHOLDS;

  const handleChange = (key: string, field: "maxW" | "maxH", val: string) => {
    const num = parseInt(val) || 0;
    onChange({
      ...thresholds,
      [key]: {
        ...thresholds[key],
        [field]: num
      }
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Object.entries(DEFAULT_THRESHOLDS).map(([key, def]) => {
        const current = thresholds[key] || def;
        return (
          <div key={key} className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{t(`resThreshold${key}`)}</h4>
              <span className="text-xs text-zinc-400 font-mono uppercase">{key}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">{t("maxWidth")}</label>
                <Input 
                  type="number" 
                  value={current.maxW} 
                  onChange={(e) => handleChange(key, "maxW", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">{t("maxHeight")}</label>
                <Input 
                  type="number" 
                  value={current.maxH} 
                  onChange={(e) => handleChange(key, "maxH", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
