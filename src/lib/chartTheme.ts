// Dynamic chart theme derived from CSS variables in globals.css
export const chartPalette = [
    "#38bdf8",
    "#22c55e",
    "#f59e0b",
    "#a855f7",
    "#f97316",
    "#14b8a6",
    "#f43f5e",
    "#818cf8",
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
