import { NextResponse } from "next/server";
import { getPredictions } from "@/lib/predictions";
import valkey from "@/lib/valkey";
import { requireAdmin, isAuthError } from "@/lib/auth";

const CACHE_KEY = "jellytrack:predictions";
const CACHE_TTL = 3600; // 1 hour

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    // Try cache first
    const cached = await valkey.get(CACHE_KEY).catch(() => null);
    if (cached) {
      try {
        return NextResponse.json(JSON.parse(cached));
      } catch { /* fall through */ }
    }

    const data = await getPredictions();
    
    // Cache result
    await valkey.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(data)).catch(() => {});

    return NextResponse.json(data);
  } catch (err) {
    console.error("[predictions API] error:", err);
    return NextResponse.json({ trendingMedia: [], peakPredictions: [] });
  }
}
