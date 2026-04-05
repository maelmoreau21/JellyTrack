"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface CollapsibleCardProps {
    storageKey?: string;
    title: string;
    description?: string;
    defaultOpen?: boolean;
    className?: string;
    headerClassName?: string;
    contentClassName?: string;
    children: React.ReactNode;
}

/**
 * @deprecated The collapsible functionality has been removed per user request. 
 * This now renders as a standard Card but keeps the same props for compatibility.
 */
export function CollapsibleCard({
    title,
    description,
    className = "",
    headerClassName = "",
    contentClassName = "",
    children,
}: CollapsibleCardProps) {
    return (
        <Card className={`app-surface-soft border-border backdrop-blur-sm ${className}`}>
            <CardHeader className={headerClassName}>
                <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                        <CardTitle>{title}</CardTitle>
                        {description && <CardDescription>{description}</CardDescription>}
                    </div>
                </div>
            </CardHeader>
            <CardContent className={contentClassName}>
                {children}
            </CardContent>
        </Card>
    );
}
