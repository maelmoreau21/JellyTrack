"use client";

import React, { useRef, useEffect, useState } from "react";
import { ResponsiveContainer as RechartsResponsiveContainer } from "recharts";

type Props = {
    minHeight?: number;
};

export default function ResponsiveContainerGuard({ children, minHeight = 200 }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [hasSize, setHasSize] = useState(false);
    const minH = typeof props.minHeight === "number"
        ? props.minHeight
        : (typeof props.height === "number" ? props.height : 300);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        let raf: number | null = null;
        const update = () => {
            const rect = el.getBoundingClientRect();
            setHasSize(rect.width > 0 && rect.height > 0);
        };

        if (typeof ResizeObserver === "undefined") {
            update();
            return;
        }

        // Run an initial update so placeholder/minHeight is taken into account
        update();
        const ro = new ResizeObserver(() => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(update);
        });
        ro.observe(el);
        return () => {
            ro.disconnect();
            if (raf) cancelAnimationFrame(raf);
        };
    }, [minH]);

    const containerStyle: React.CSSProperties = {
        width: "100%",
        minHeight: minH,
    };

    const placeholderStyle: React.CSSProperties = {
        width: "100%",
        height: minH,
    };

    return (
        <div ref={containerRef} style={containerStyle}>
            {hasSize ? (
                <RechartsResponsiveContainer {...props} />
            ) : (
                <div style={placeholderStyle} />
            )}
        </div>
    );
}
