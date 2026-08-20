"use client";

import { MediaHeaderNav } from "@/components/media/MediaHeaderNav";

export default function MediaLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex-col md:flex">
            <div className="flex-1 p-4 md:p-8 pt-4 md:pt-6 w-full">
                <div className="w-full">
                    <main className="space-y-4 md:space-y-6 max-w-[1400px] mx-auto w-full">
                        <MediaHeaderNav />
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
