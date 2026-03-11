"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return (
            <button className="p-2 rounded-lg bg-zinc-800/50 text-zinc-400" aria-label="Toggle theme">
                <Moon className="w-4 h-4" />
            </button>
        );
    }

    const isDark = theme === "dark";

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`
                p-2 rounded-lg transition-all duration-300
                ${isDark
                    ? "bg-zinc-800/50 hover:bg-zinc-700/60 text-amber-400 hover:text-amber-300"
                    : "bg-zinc-200/80 hover:bg-zinc-300/80 text-indigo-600 hover:text-indigo-500"
                }
            `}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Mode clair" : "Mode sombre"}
        >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
    );
}
