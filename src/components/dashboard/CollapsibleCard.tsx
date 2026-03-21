"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface CollapsibleCardProps {
    storageKey: string;
    title: string;
    description?: string;
    defaultOpen?: boolean;
    className?: string;
    headerClassName?: string;
    contentClassName?: string;
    children: React.ReactNode;
}

export function CollapsibleCard({
    storageKey,
    title,
    description,
    defaultOpen = true,
    className = "",
    headerClassName = "",
    contentClassName = "",
    children,
}: CollapsibleCardProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [mounted, setMounted] = useState(false);

    // Initialize mount state and read persisted open state from localStorage
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        setMounted(true);
        try {
            const stored = localStorage.getItem(`card-${storageKey}`);
            if (stored !== null) setIsOpen(stored === "1");
        } catch {}
    }, [storageKey]);

    const toggle = useCallback(() => {
        setIsOpen((prev) => {
            const next = !prev;
            try { localStorage.setItem(`card-${storageKey}`, next ? "1" : "0"); } catch {}
            return next;
        });
    }, [storageKey]);

    const showContent = !mounted || isOpen;

    return (
        <Card className={`bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50 backdrop-blur-sm ${className}`}>
            <CardHeader
                className={`cursor-pointer select-none group ${headerClassName}`}
                onClick={toggle}
            >
                <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                        <CardTitle>{title}</CardTitle>
                        {description && <CardDescription>{description}</CardDescription>}
                    </div>
                    <ChevronDown
                        className={`w-4 h-4 shrink-0 ml-2 text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200 ${
                            showContent ? "rotate-0" : "-rotate-90"
                        }`}
                    />
                </div>
            </CardHeader>
            <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    showContent ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                }`}
            >
                <CardContent className={contentClassName}>
                    {children}
                </CardContent>
            </div>
        </Card>
    );
}
