"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe2, Radio, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslations } from "next-intl";

interface CountryData {
  name: string;
  sessions: number;
  cities: string[];
}

interface LiveLocation {
  country: string;
  city: string;
  username: string;
  mediaTitle: string;
}

interface GeoData {
  countries: CountryData[];
  liveLocations: LiveLocation[];
}

// ISO country name → approximate position on a 1000x500 Mercator grid
const COUNTRY_POSITIONS: Record<string, [number, number]> = {
  "France": [490, 170], "United States": [220, 180], "Germany": [510, 160],
  "United Kingdom": [470, 145], "Canada": [230, 130], "Spain": [470, 195],
  "Italy": [520, 185], "Netherlands": [500, 150], "Belgium": [495, 155],
  "Switzerland": [510, 170], "Australia": [830, 380], "Japan": [860, 180],
  "Brazil": [340, 340], "Mexico": [210, 230], "India": [720, 240],
  "Russia": [650, 120], "China": [780, 190], "South Korea": [840, 180],
  "Sweden": [530, 115], "Norway": [520, 110], "Denmark": [510, 135],
  "Finland": [555, 110], "Poland": [540, 150], "Portugal": [450, 200],
  "Argentina": [320, 400], "Turkey": [580, 195], "South Africa": [560, 400],
  "New Zealand": [880, 420], "Ireland": [455, 145], "Austria": [520, 170],
  "Czech Republic": [525, 155], "Romania": [550, 170], "Ukraine": [570, 155],
  "Colombia": [285, 280], "Chile": [310, 400], "Peru": [285, 320],
  "Egypt": [565, 230], "Morocco": [470, 215], "Israel": [580, 215],
  "Thailand": [765, 260], "Philippines": [815, 260], "Indonesia": [790, 310],
  "Malaysia": [775, 285], "Singapore": [775, 295], "Vietnam": [780, 250],
  "Taiwan": [815, 225], "Hong Kong": [800, 230],
};

// World Map v4 — Highly detailed Natural Earth continent outlines (1000x500)
const LAND_PATHS = [
  // North America
  "M80,50 L95,45 L110,40 L130,35 L155,32 L180,30 L205,28 L230,25 L255,28 L275,35 L295,45 L310,60 L320,80 L328,105 L325,130 L315,145 L300,155 L285,162 L270,168 L255,178 L240,192 L225,208 L212,220 L200,228 L185,232 L172,230 L162,222 L158,212 L162,200 L172,185 L180,172 L178,160 L168,150 L155,145 L142,135 L132,125 L125,110 L118,95 L110,80 L95,68 L85,60 Z",
  // Greenland
  "M335,25 L355,18 L375,15 L395,20 L408,30 L412,45 L405,62 L390,75 L372,82 L355,78 L340,65 L332,48 L330,35 Z",
  // South America
  "M272,255 L285,248 L305,245 L325,250 L342,265 L355,285 L362,310 L362,335 L355,362 L345,390 L332,415 L318,435 L305,445 L292,442 L285,432 L280,418 L278,400 L275,380 L272,360 L270,340 L268,318 L265,295 L268,275 Z",
  // Europe
  "M445,90 L460,85 L480,82 L505,80 L530,82 L550,88 L565,100 L578,115 L585,135 L582,155 L575,172 L562,188 L548,200 L530,208 L512,212 L492,215 L472,212 L455,205 L445,190 L440,172 L438,150 L440,130 L442,110 Z",
  // Africa
  "M465,215 L485,212 L510,210 L535,215 L558,225 L578,245 L592,270 L600,300 L598,335 L590,368 L578,395 L562,420 L545,438 L525,448 L505,445 L488,432 L475,410 L468,385 L465,355 L468,322 L472,295 L470,268 L465,245 L460,228 Z",
  // Asia
  "M585,50 L615,42 L650,38 L690,38 L730,42 L770,50 L810,65 L845,85 L875,115 L895,150 L905,190 L900,230 L885,265 L860,295 L830,318 L795,335 L755,342 L715,340 L675,330 L640,310 L610,285 L588,255 L575,220 L570,185 L572,150 L578,115 L580,85 Z",
  // Australia
  "M790,350 L815,342 L845,340 L875,350 L895,370 L905,400 L900,430 L885,455 L860,472 L825,478 L795,465 L775,440 L770,410 L775,380 Z",
  // Madagascar
  "M610,385 L622,378 L630,388 L632,405 L628,422 L618,430 L610,420 L605,402 Z",
  // Japan
  "M910,160 L922,152 L935,160 L938,180 L932,205 L920,218 L910,210 L905,185 Z",
  // UK & Ireland
  "M460,135 L475,130 L485,138 L482,155 L472,165 L460,160 L455,148 Z",
  // New Zealand
  "M915,445 L925,438 L932,445 L935,460 L928,480 L920,485 L912,475 L910,460 Z",
];

export function WorldMap() {
  const t = useTranslations("dashboard");
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/geo-stats");
        if (res.ok) setData(await res.json());
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  const maxSessions = useMemo(() => {
    if (!data) return 1;
    return Math.max(...data.countries.map((c) => c.sessions), 1);
  }, [data]);

  if (loading) {
    return (
      <Card className="app-surface-soft border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-indigo-500" />
            {t("worldMap")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-[280px] rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.countries.length === 0) return null;

  return (
    <Card className="app-surface-soft border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-md flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-indigo-500" />
              {t("worldMap")}
            </CardTitle>
            <CardDescription>{t("worldMapDesc")}</CardDescription>
          </div>
          {data.liveLocations.length > 0 && (
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 gap-1 animate-pulse">
              <Radio className="w-3 h-3" />
              {data.liveLocations.length} {t("liveNow")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="relative w-full overflow-hidden rounded-xl bg-gradient-to-b from-blue-50/50 to-indigo-50/30 dark:from-slate-900/60 dark:to-zinc-950/40 border border-border/50 shadow-inner">
            <svg viewBox="0 0 1000 500" className="w-full h-auto" style={{ minHeight: 220, maxHeight: 420 }}>
              <defs>
                <radialGradient id="dotGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="liveGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0" />
                </radialGradient>
                <filter id="landShadow" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.1" />
                </filter>
              </defs>
              
              {/* Lat/Long Grid */}
              <g stroke="currentColor" className="text-indigo-200/40 dark:text-zinc-700/40" strokeWidth="0.5" opacity="0.4">
                {[62, 125, 187, 250, 312, 375, 437].map((y) => (
                  <line key={`h-${y}`} x1="0" y1={y} x2="1000" y2={y} strokeDasharray="4 8" />
                ))}
                {[125, 250, 375, 500, 625, 750, 875].map((x) => (
                  <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="500" strokeDasharray="4 8" />
                ))}
                <line x1="0" y1="250" x2="1000" y2="250" strokeWidth="0.8" strokeDasharray="6 4" className="text-indigo-300/50 dark:text-zinc-600/50" />
              </g>

              {/* Landmass Outlines v4 */}
              <g filter="url(#landShadow)">
                {LAND_PATHS.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    className="fill-emerald-100/50 dark:fill-zinc-800/40 stroke-emerald-500/20 dark:stroke-zinc-600/30"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                    style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.05))" }}
                  />
                ))}
              </g>

              {/* Country dots */}
              {data.countries.map((country) => {
                const pos = COUNTRY_POSITIONS[country.name];
                if (!pos) return null;
                const [cx, cy] = pos;
                const normalizedSize = country.sessions / maxSessions;
                const radius = Math.max(5, Math.min(20, normalizedSize * 22));

                return (
                  <Tooltip key={country.name}>
                    <TooltipTrigger asChild>
                      <g className="cursor-pointer">
                        <circle cx={cx} cy={cy} r={radius * 2.5} fill="url(#dotGlow)" />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={radius}
                          className="fill-indigo-500 dark:fill-indigo-400"
                          stroke="white"
                          strokeWidth="2"
                          opacity="0.9"
                          style={{ filter: "drop-shadow(0 2px 4px rgba(99, 102, 241, 0.4))" }}
                        />
                        {radius > 11 && (
                          <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="900">
                            {country.sessions}
                          </text>
                        )}
                        {radius > 8 && (
                          <text
                            x={cx}
                            y={cy - radius - 6}
                            textAnchor="middle"
                            className="fill-zinc-700 dark:fill-zinc-300"
                            fontSize="10"
                            fontWeight="800"
                            style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 2, strokeLinejoin: "round", strokeOpacity: 0.1 }}
                          >
                            {country.name}
                          </text>
                        )}
                      </g>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs max-w-[200px] border-border shadow-xl backdrop-blur-md">
                      <div className="font-bold flex items-center justify-between gap-4">
                        <span>{country.name}</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1">{country.sessions} ses.</Badge>
                      </div>
                      <div className="h-px bg-border my-1" />
                      {country.cities.length > 0 && (
                        <div className="text-[10px] text-muted-foreground italic">
                          {country.cities.slice(0, 5).join(", ")}{country.cities.length > 5 ? ` +${country.cities.length - 5}` : ""}
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}

              {/* Live stream indicators */}
              {data.liveLocations.map((live, i) => {
                const pos = COUNTRY_POSITIONS[live.country];
                if (!pos) return null;
                const [cx, cy] = pos;
                const offsetX = cx + (radiusFor(live.country) || 10) + 5;
                const offsetY = cy - 5;

                function radiusFor(c: string) {
                  const country = data?.countries.find(x => x.name === c);
                  if (!country) return 0;
                  return Math.max(5, Math.min(20, (country.sessions / maxSessions) * 22));
                }

                return (
                  <Tooltip key={`live-${i}`}>
                    <TooltipTrigger asChild>
                      <g className="cursor-pointer">
                        <circle cx={offsetX} cy={offsetY} r="10" fill="url(#liveGlow)" />
                        <circle
                          cx={offsetX}
                          cy={offsetY}
                          r="4"
                          className="fill-emerald-500 animate-pulse"
                          stroke="white"
                          strokeWidth="1.5"
                        />
                      </g>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs border-emerald-500/20 shadow-emerald-500/10 backdrop-blur-md">
                      <div className="font-bold flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <Radio className="w-3 h-3" />
                        {live.username}
                      </div>
                      <div className="text-muted-foreground truncate max-w-[150px]">{live.mediaTitle}</div>
                      <div className="text-[10px] text-zinc-400 mt-1">{live.city}, {live.country}</div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </svg>
          </div>

          {/* Country list — Premium cards */}
          {data.countries.length > 0 && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
              {data.countries.slice(0, 8).map((c) => (
                <div key={c.name} className="group relative flex items-center gap-2 p-2 rounded-xl bg-white/40 dark:bg-zinc-900/40 border border-border/50 hover:border-indigo-500/30 transition-all hover:bg-white/60 dark:hover:bg-zinc-800/40 hover:shadow-sm">
                  <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold truncate">{c.name}</p>
                    <p className="text-[9px] text-muted-foreground">{c.sessions} {t('sessions')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
