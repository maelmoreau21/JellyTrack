"use client";

import { useState } from 'react';
import Image from 'next/image';
import { Film } from 'lucide-react';

interface FallbackImageProps {
    src: string;
    alt: string;
    className?: string;
    fill?: boolean;
    width?: number;
    height?: number;
    unoptimized?: boolean;
    sizes?: string;
    loading?: "lazy" | "eager";
    priority?: boolean;
}

export function FallbackImage({ src, alt, className, fill, width, height, unoptimized = true, sizes, loading = "lazy", priority = false }: FallbackImageProps) {
    const [error, setError] = useState(!src || src.includes('undefined'));

    if (error) {
        return (
            <div className={`flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800/80 ${fill ? 'absolute inset-0' : ''} ${className || ''}`}
                 style={!fill && width && height ? { width, height } : undefined}>
                <Film className="w-8 h-8 text-zinc-600" />
            </div>
        );
    }

    return (
        <Image
            src={src}
            alt={alt}
            className={className}
            fill={fill}
            width={!fill ? width : undefined}
            height={!fill ? height : undefined}
            unoptimized={unoptimized}
            sizes={fill ? (sizes || "(max-width: 768px) 40vw, 180px") : sizes}
            loading={priority ? undefined : loading}
            priority={priority}
            onError={() => setError(true)}
        />
    );
}
