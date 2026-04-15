"use client";

import { useEffect, useState } from "react";
import { Cpu, MemoryStick, Thermometer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslations } from "next-intl";

interface HardwareStats {
    cpu: { usagePercent: number };
    memory: { usagePercent: number; usedGb: number; totalGb: number };
    temperature: { main: number };
}

export function HardwareMonitor() {
    const t = useTranslations('hardware');
    const [stats, setStats] = useState<HardwareStats | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch("/api/hardware");
                if (res.ok) {
                    setStats(await res.json());
                }
            } catch (_e) {
                // Background error on edge devices, ignore gracefully
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 5000); // Polling every 5s
        return () => clearInterval(interval);
    }, []);

    if (!stats) {
        return null;
    }

    return (
        <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="app-surface-soft shadow-sm ring-1 ring-border/5">
                <CardContent className="p-4 flex flex-row items-center gap-4">
                    <div className="p-2.5 bg-blue-500/10 rounded-lg">
                        <Cpu className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-zinc-400">{t('cpuUsage')}</p>
                        <p className="text-xl font-bold">{stats.cpu.usagePercent}%</p>
                    </div>
                </CardContent>
            </Card>

            <Card className="app-surface-soft shadow-sm ring-1 ring-border/5">
                <CardContent className="p-4 flex flex-row items-center gap-4">
                    <div className="p-2.5 bg-purple-500/10 rounded-lg">
                        <MemoryStick className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-zinc-400">{t('ram', { total: stats.memory.totalGb })}</p>
                        <p className="text-xl font-bold">{stats.memory.usagePercent}%</p>
                    </div>
                </CardContent>
            </Card>

            <Card className="app-surface-soft shadow-sm ring-1 ring-border/5">
                <CardContent className="p-4 flex flex-row items-center gap-4">
                    <div className="p-2.5 bg-rose-500/10 rounded-lg">
                        <Thermometer className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-zinc-400">{t('temperature')}</p>
                        <p className="text-xl font-bold">
                            {stats.temperature.main > 0 ? `${stats.temperature.main}°C` : 'N/A'}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
