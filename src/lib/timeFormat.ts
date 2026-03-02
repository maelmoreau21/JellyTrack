"use client";

import { createContext, createElement, useContext, useState, useEffect, ReactNode } from "react";

type TimeFormat = "12h" | "24h";

interface TimeFormatContextValue {
    timeFormat: TimeFormat;
    setTimeFormat: (format: TimeFormat) => void;
    formatTime: (date: Date | string, options?: { showSeconds?: boolean }) => string;
    formatDateTime: (date: Date | string) => string;
}

const TimeFormatContext = createContext<TimeFormatContextValue | null>(null);

/**
 * Format a time string respecting the 12h/24h preference.
 */
function formatTimeValue(date: Date, format: TimeFormat, showSeconds = false): string {
    if (format === "12h") {
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12;
        if (hours === 0) hours = 12;
        if (showSeconds) {
            const seconds = date.getSeconds().toString().padStart(2, "0");
            return `${hours}:${minutes}:${seconds} ${ampm}`;
        }
        return `${hours}:${minutes} ${ampm}`;
    }
    // 24h format
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    if (showSeconds) {
        const seconds = date.getSeconds().toString().padStart(2, "0");
        return `${hours}:${minutes}:${seconds}`;
    }
    return `${hours}:${minutes}`;
}

function formatDateTimeValue(date: Date, format: TimeFormat): string {
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    const time = formatTimeValue(date, format);
    return `${day}/${month}/${year} ${time}`;
}

export function TimeFormatProvider({ children, initialFormat = "24h" }: { children: ReactNode; initialFormat?: TimeFormat }) {
    const [timeFormat, setTimeFormat] = useState<TimeFormat>(initialFormat);

    // Fetch the setting from the API on mount
    useEffect(() => {
        fetch("/api/settings")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data?.timeFormat === "12h" || data?.timeFormat === "24h") {
                    setTimeFormat(data.timeFormat);
                }
            })
            .catch(() => {}); // silently fail
    }, []);

    const formatTime = (date: Date | string, options?: { showSeconds?: boolean }) => {
        const d = typeof date === "string" ? new Date(date) : date;
        return formatTimeValue(d, timeFormat, options?.showSeconds);
    };

    const formatDateTime = (date: Date | string) => {
        const d = typeof date === "string" ? new Date(date) : date;
        return formatDateTimeValue(d, timeFormat);
    };

    return createElement(
        TimeFormatContext.Provider,
        { value: { timeFormat, setTimeFormat, formatTime, formatDateTime } },
        children
    );
}

/**
 * Hook to access time format utilities.
 * Must be used within a TimeFormatProvider.
 */
export function useTimeFormat() {
    const ctx = useContext(TimeFormatContext);
    if (!ctx) {
        // Fallback: return 24h format functions if used outside provider
        return {
            timeFormat: "24h" as TimeFormat,
            setTimeFormat: () => {},
            formatTime: (date: Date | string, options?: { showSeconds?: boolean }) => {
                const d = typeof date === "string" ? new Date(date) : date;
                return formatTimeValue(d, "24h", options?.showSeconds);
            },
            formatDateTime: (date: Date | string) => {
                const d = typeof date === "string" ? new Date(date) : date;
                return formatDateTimeValue(d, "24h");
            },
        };
    }
    return ctx;
}

/**
 * Server-side helper: format time for server components.
 * Reads timeFormat from database settings.
 */
export async function getTimeFormat(): Promise<TimeFormat> {
    try {
        const { default: prisma } = await import("@/lib/prisma");
        const settings = await (prisma as any).globalSettings.findUnique({
            where: { id: "global" },
        });
        const tf = settings?.timeFormat;
        return tf === "12h" || tf === "24h" ? tf : "24h";
    } catch {
        return "24h";
    }
}

export function serverFormatTime(date: Date, format: TimeFormat, showSeconds = false): string {
    return formatTimeValue(date, format, showSeconds);
}

export function serverFormatDateTime(date: Date, format: TimeFormat): string {
    return formatDateTimeValue(date, format);
}
