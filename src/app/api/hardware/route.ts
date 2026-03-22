import { NextResponse } from "next/server";
import si from "systeminformation";
import { requireAdmin, isAuthError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;
    try {
        const [cpuLoad, mem, temp] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.cpuTemperature()
        ]);

        const cpuUsage = cpuLoad.currentLoad.toFixed(1);
        const memUsageInfo = ((mem.active / mem.total) * 100).toFixed(1);
        const memTotalGb = (mem.total / (1024 ** 3)).toFixed(1);
        const memUsedGb = (mem.active / (1024 ** 3)).toFixed(1);

        let cpuTemp = temp.main;
        // Sometimes temp.main is null on unsupported VMs, fallback or 0
        if (cpuTemp === null || cpuTemp === undefined) cpuTemp = -1;

        return NextResponse.json({
            cpu: {
                usagePercent: parseFloat(cpuUsage)
            },
            memory: {
                usagePercent: parseFloat(memUsageInfo),
                usedGb: parseFloat(memUsedGb),
                totalGb: parseFloat(memTotalGb)
            },
            temperature: {
                main: cpuTemp
            }
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Hardware API] Error:", e);
        return NextResponse.json({ error: msg || "Cannot fetch hardware stats" }, { status: 500 });
    }
}
