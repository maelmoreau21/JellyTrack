import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Purges all dashboard, heatmap, and analytics page caches.
 * Call this after database restores, imports, cleanups, or settings modifications.
 */
export function revalidateDashboardCache() {
  try {
    // Purge the page and layout router caches
    revalidatePath("/", "layout");
    revalidatePath("/settings", "layout");
    revalidatePath("/admin/cleanup", "layout");

    // Purge the unstable_cache datasets
    revalidateTag("JellyTrack-dashboard-v2", "max");
    revalidateTag("JellyTrack-heatmap-v3", "max");
    revalidateTag("JellyTrack-deep-insights-v5", "max");
    revalidateTag("JellyTrack-granular-analysis-v4", "max");
    revalidateTag("JellyTrack-network-analysis-v2", "max");
  } catch (error) {
    console.error("[CacheRevalidation] Failed to clear next cache:", error);
  }
}
