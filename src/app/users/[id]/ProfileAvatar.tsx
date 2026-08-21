"use client";

import { useState } from "react";
import Image from "next/image";

interface ProfileAvatarProps {
    jellyfinUserId: string;
    username: string;
    size?: number;
}

export function ProfileAvatar({ jellyfinUserId, username, size = 72 }: ProfileAvatarProps) {
    const [imgError, setImgError] = useState(false);

    const initials = username
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || "")
        .join("") || username.slice(0, 2).toUpperCase();

    if (imgError) {
        return (
            <div
                className="rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center font-bold text-primary shrink-0"
                style={{ width: size, height: size, fontSize: size * 0.35 }}
            >
                {initials}
            </div>
        );
    }

    return (
        <div
            className="relative rounded-full overflow-hidden border-2 border-primary/20 bg-muted shrink-0"
            style={{ width: size, height: size }}
        >
            <Image
                src={`/api/jellyfin/user-image?userId=${encodeURIComponent(jellyfinUserId)}`}
                alt={username}
                fill
                className="object-cover"
                onError={() => setImgError(true)}
                unoptimized
            />
        </div>
    );
}