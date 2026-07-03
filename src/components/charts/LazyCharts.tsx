"use client";

/**
 * Lazy-loaded chart wrappers for the Dashboard.
 * 
 * Recharts is a heavy library (~200KB gzipped). By using next/dynamic with ssr: false,
 * these charts are loaded AFTER the initial HTML renders, making the page interactive faster.
 * The user sees animated skeleton placeholders while charts load in the background.
 */

import React from "react";
import dynamic from "next/dynamic";
import ErrorBoundary from "@/components/ErrorBoundary";

const ChartSkeleton = ({ height = 300 }: { height?: number }) => (
    <div
        className="animate-pulse bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg w-full"
        style={{ height }}
    />
);

function withErrorBoundary<P extends object>(
    Component: React.ComponentType<P>,
    name: string
) {
    return function WrappedComponent(props: P) {
        return (
            <ErrorBoundary name={name}>
                <Component {...props} />
            </ErrorBoundary>
        );
    };
}

// --- Dashboard Overview Charts ---

const RawComposedTrendChart = dynamic(
    () => import("@/components/charts/ComposedTrendChart").then((m) => ({ default: m.ComposedTrendChart })),
    { ssr: false, loading: () => <ChartSkeleton height={400} /> }
);
export const LazyComposedTrendChart = withErrorBoundary(RawComposedTrendChart, "Trend Chart");

const RawCategoryPieChart = dynamic(
    () => import("@/components/charts/CategoryPieChart").then((m) => ({ default: m.CategoryPieChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyCategoryPieChart = withErrorBoundary(RawCategoryPieChart, "Category Distribution");

const RawLibraryDailyPlaysChart = dynamic(
    () => import("@/components/charts/LibraryDailyPlaysChart").then((m) => ({ default: m.LibraryDailyPlaysChart })),
    { ssr: false, loading: () => <ChartSkeleton height={350} /> }
);
export const LazyLibraryDailyPlaysChart = withErrorBoundary(RawLibraryDailyPlaysChart, "Library Daily Plays");

const RawActivityByHourChart = dynamic(
    () => import("@/components/charts/ActivityByHourChart").then((m) => ({ default: m.ActivityByHourChart })),
    { ssr: false, loading: () => <ChartSkeleton height={250} /> }
);
export const LazyActivityByHourChart = withErrorBoundary(RawActivityByHourChart, "Hourly Activity");

const RawDayOfWeekChart = dynamic(
    () => import("@/components/charts/DayOfWeekChart").then((m) => ({ default: m.DayOfWeekChart })),
    { ssr: false, loading: () => <ChartSkeleton height={250} /> }
);
export const LazyDayOfWeekChart = withErrorBoundary(RawDayOfWeekChart, "Day of Week Activity");

const RawMonthlyWatchTimeChart = dynamic(
    () => import("@/components/charts/MonthlyWatchTimeChart").then((m) => ({ default: m.MonthlyWatchTimeChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyMonthlyWatchTimeChart = withErrorBoundary(RawMonthlyWatchTimeChart, "Monthly Watch Time");

const RawCompletionRatioChart = dynamic(
    () => import("@/components/charts/CompletionRatioChart").then((m) => ({ default: m.CompletionRatioChart })),
    { ssr: false, loading: () => <ChartSkeleton height={280} /> }
);
export const LazyCompletionRatioChart = withErrorBoundary(RawCompletionRatioChart, "Completion Ratio");

const RawClientCategoryChart = dynamic(
    () => import("@/components/charts/ClientCategoryChart").then((m) => ({ default: m.ClientCategoryChart })),
    { ssr: false, loading: () => <ChartSkeleton height={280} /> }
);
export const LazyClientCategoryChart = withErrorBoundary(RawClientCategoryChart, "Client Category");

const RawPlatformDistributionChart = dynamic(
    () => import("@/components/charts/PlatformDistributionChart").then((m) => ({ default: m.PlatformDistributionChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyPlatformDistributionChart = withErrorBoundary(RawPlatformDistributionChart, "Platform Distribution");


// --- User Profile / Deep Insights / Granular Analysis Charts ---

const RawUserActivityChart = dynamic(
    () => import("@/components/charts/UserActivityChart").then((m) => ({ default: m.UserActivityChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyUserActivityChart = withErrorBoundary(RawUserActivityChart, "User Activity");

const RawTranscodeHourlyChart = dynamic(
    () => import("@/components/charts/TranscodeHourlyChart").then((m) => ({ default: m.TranscodeHourlyChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyTranscodeHourlyChart = withErrorBoundary(RawTranscodeHourlyChart, "Transcode Hourly");

const RawStreamProportionsChart = dynamic(
    () => import("@/components/charts/StreamProportionsChart").then((m) => ({ default: m.StreamProportionsChart })),
    { ssr: false, loading: () => <ChartSkeleton height={280} /> }
);
export const LazyStreamProportionsChart = withErrorBoundary(RawStreamProportionsChart, "Stream Proportions");

const RawStandardBarChart = dynamic(
    () => import("@/components/charts/StandardMetricsCharts").then((m) => ({ default: m.StandardBarChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyStandardBarChart = withErrorBoundary(RawStandardBarChart, "Standard Bar Chart");

const RawStandardAreaChart = dynamic(
    () => import("@/components/charts/StandardMetricsCharts").then((m) => ({ default: m.StandardAreaChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyStandardAreaChart = withErrorBoundary(RawStandardAreaChart, "Standard Area Chart");

const RawStandardPieChart = dynamic(
    () => import("@/components/charts/StandardMetricsCharts").then((m) => ({ default: m.StandardPieChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyStandardPieChart = withErrorBoundary(RawStandardPieChart, "Standard Pie Chart");

const RawStackedBarChart = dynamic(
    () => import("@/components/charts/StackedMetricsCharts").then((m) => ({ default: m.StackedBarChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyStackedBarChart = withErrorBoundary(RawStackedBarChart, "Stacked Bar Chart");

const RawGenreDistributionChart = dynamic(
    () => import("@/components/charts/GenreDistributionChart").then((m) => ({ default: m.GenreDistributionChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyGenreDistributionChart = withErrorBoundary(RawGenreDistributionChart, "Genre Distribution");

const RawVolumeAreaChart = dynamic(
    () => import("@/components/charts/VolumeAreaChart").then((m) => ({ default: m.VolumeAreaChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyVolumeAreaChart = withErrorBoundary(RawVolumeAreaChart, "Volume Area Chart");

const RawDrillDownPieChart = dynamic(
    () => import("@/components/charts/DrillDownChart").then((m) => ({ default: m.DrillDownPieChart })),
    { ssr: false, loading: () => <ChartSkeleton height={300} /> }
);
export const LazyDrillDownPieChart = withErrorBoundary(RawDrillDownPieChart, "Drill Down Pie Chart");
