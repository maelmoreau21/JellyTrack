// Dynamic chart theme derived from CSS variables in globals.css
export const chartPalette = [
    "var(--chart-soft-1, #38bdf8)",
    "var(--chart-soft-2, #22c55e)",
    "var(--chart-soft-3, #f59e0b)",
    "var(--chart-soft-4, #a855f7)",
    "var(--chart-soft-5, #f97316)",
    "var(--chart-soft-6, #14b8a6)",
    "var(--chart-soft-7, #f43f5e)",
    "var(--chart-soft-8, #818cf8)",
];

// Re-evaluate these at runtime if possible, or use CSS variable strings for Recharts components
export const chartAxisColor = "var(--chart-axis-color)";
export const chartGridColor = "var(--chart-grid-color)";

export const chartTooltipStyle = {
    background: "var(--chart-tooltip-bg)",
    border: "var(--chart-tooltip-border)",
    borderRadius: "var(--chart-tooltip-radius)",
    boxShadow: "var(--chart-tooltip-box-shadow)",
    backdropFilter: "var(--chart-tooltip-backdrop)",
};
export const chartLabelStyle = { color: "var(--chart-label-color)" };
export const chartItemStyle = { color: "var(--chart-item-color)" };
