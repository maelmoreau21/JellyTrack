"use client";

import { useState, useEffect, ReactNode } from "react";
import { ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface DraggableDashboardProps {
    blocks: ReactNode[];
}

export function DraggableDashboard({ blocks }: DraggableDashboardProps) {
    const t = useTranslations('draggable');
    const [order, setOrder] = useState<number[]>([]);
    const [isEditMode, setIsEditMode] = useState(false);

    // Initialize order from localStorage (client-only). Suppress setState-in-effect lint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        const saved = localStorage.getItem("JellyTrack-dashboard-order");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length === blocks.length) {
                    setOrder(parsed);
                    return;
                }
            } catch { }
        }
        // Initial / Fallback: Sequential order
        setOrder(blocks.map((_, i) => i));
    }, [blocks.length]);

    const moveBlock = (index: number, direction: 'up' | 'down') => {
        const newOrder = [...order];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;

        if (swapIndex >= 0 && swapIndex < newOrder.length) {
            const temp = newOrder[index];
            newOrder[index] = newOrder[swapIndex];
            newOrder[swapIndex] = temp;
            setOrder(newOrder);
            localStorage.setItem("JellyTrack-dashboard-order", JSON.stringify(newOrder));
        }
    };

    if (order.length === 0) {
        // Prevent hydration layout shift
        return (
            <div className="space-y-6 opacity-0">
                {blocks.map((b, i) => <div key={i}>{b}</div>)}
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            <div className="flex justify-end mb-4">
                <Button
                    variant={isEditMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsEditMode(!isEditMode)}
                    className="gap-2 shadow-sm"
                >
                    <GripVertical className="w-4 h-4" />
                    {isEditMode ? t('finishEdit') : t('editOrder')}
                </Button>
            </div>

            {order.map((blockIndex, visualIndex) => (
                <div key={blockIndex} className={`relative transition-all duration-300 ${isEditMode ? 'ring-1 ring-zinc-300 dark:ring-zinc-700 rounded-xl p-4 bg-zinc-100/40 dark:bg-zinc-900/40 ml-12' : ''}`}>
                    {isEditMode && (
                        <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-50">
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-full opacity-80 hover:opacity-100 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                                onClick={() => moveBlock(visualIndex, 'up')}
                                disabled={visualIndex === 0}
                            >
                                <ArrowUp className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-full opacity-80 hover:opacity-100 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                                onClick={() => moveBlock(visualIndex, 'down')}
                                disabled={visualIndex === order.length - 1}
                            >
                                <ArrowDown className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                    {blocks[blockIndex]}
                </div>
            ))}
        </div>
    );
}
