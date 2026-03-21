import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/auth";
import { ZAPPING_CONDITION } from "@/lib/statsUtils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.toLowerCase() || "";
    const sort = searchParams.get("sort") || "date_desc";
    const typeFilter = searchParams.get("type") || "";
    const hideZapped = searchParams.get("hideZapped") !== 'false';
    const clientStr = searchParams.get("client") || "";
    const audioStr = searchParams.get("audio") || "";
    const subStr = searchParams.get("subtitle") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    const conditions: any[] = [];
    if (hideZapped) conditions.push(ZAPPING_CONDITION);

    if (query) {
        conditions.push({
            OR: [
                { user: { username: { contains: query, mode: "insensitive" } } },
                { media: { title: { contains: query, mode: "insensitive" } } },
                { ipAddress: { contains: query, mode: "insensitive" } },
                { clientName: { contains: query, mode: "insensitive" } },
            ]
        });
    }

    if (typeFilter) conditions.push({ media: { type: typeFilter } });
    if (clientStr) conditions.push({ clientName: { contains: clientStr, mode: "insensitive" } });
    if (audioStr) conditions.push({ OR: [{audioCodec: { contains: audioStr, mode: "insensitive" }}, {audioLanguage: { contains: audioStr, mode: "insensitive" }}] });
    if (subStr) conditions.push({ OR: [{subtitleCodec: { contains: subStr, mode: "insensitive" }}, {subtitleLanguage: { contains: subStr, mode: "insensitive" }}] });

    if (dateFrom || dateTo) {
        const dateFilter: any = {};
        if (dateFrom) {
            const fd = new Date(dateFrom);
            if (!isNaN(fd.getTime())) dateFilter.gte = fd;
        }
        if (dateTo) {
            const td = new Date(dateTo);
            td.setHours(23, 59, 59, 999);
            if (!isNaN(td.getTime())) dateFilter.lte = td;
        }
        if (Object.keys(dateFilter).length > 0) {
            conditions.push({ startedAt: dateFilter });
        }
    }

    const whereClause = conditions.length > 0 ? { AND: conditions } : {};

    let orderBy: any = { startedAt: "desc" };
    if (sort === "date_asc") orderBy = { startedAt: "asc" };
    else if (sort === "duration_desc") orderBy = { durationWatched: "desc" };
    else if (sort === "duration_asc") orderBy = { durationWatched: "asc" };

    const logs = await prisma.playbackHistory.findMany({
        where: whereClause,
        include: {
            user: { select: { username: true } },
            media: { select: { type: true, title: true } }
        },
        orderBy,
    });

    let csvContent = "Id,Date,User,Media Title,Media Type,Client,Device,IP Address,Country,Play Method,Duration (s),Audio Language,Subtitle Codec\n";

    logs.forEach((log) => {
        const row = [
            log.id,
            log.startedAt.toISOString(),
            log.user?.username || 'Unknown',
            `"${(log.media?.title || 'Unknown').replace(/"/g, '""')}"`,
            log.media?.type || 'Unknown',
            `"${(log.clientName || '').replace(/"/g, '""')}"`,
            `"${(log.deviceName || '').replace(/"/g, '""')}"`,
            log.ipAddress || '',
            log.country || '',
            log.playMethod || '',
            log.durationWatched,
            log.audioLanguage || '',
            log.subtitleCodec || ''
        ];
        csvContent += row.join(",") + "\n";
    });

    return new NextResponse(csvContent, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="jellytrack_logs_export.csv"`
        }
    });
}
