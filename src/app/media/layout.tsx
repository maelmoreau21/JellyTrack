"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

export default function MediaLayout({ children }: { children: React.ReactNode }) {
    const t = useTranslations('media');
    const pathname = usePathname();

    const tabs = [
        { href: '/media/all', key: 'allMedia' },
        { href: '/media/popular', key: 'popularTab' },
        { href: '/media/analysis', key: 'deepAnalysisTitle' },
        { href: '/media/collections', key: 'libraries' },
    ];

    return (
        <div className="flex-col md:flex">
            <div className="flex-1 p-4 md:p-8 pt-4 md:pt-6 w-full">
                <div className="w-full">
                    <main className="space-y-4 md:space-y-6 max-w-[1400px] mx-auto w-full">
                        <nav className="flex gap-2 overflow-auto pb-4 border-b border-border/70">
                            {tabs.map(tab => {
                                const active = pathname?.startsWith(tab.href);
                                return (
                                    <Link
                                        key={tab.href}
                                        href={tab.href}
                                        className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors border ${active ? 'bg-primary/15 text-primary shadow-sm border-primary/30' : 'text-muted-foreground border-transparent hover:bg-muted hover:text-foreground hover:border-border'}`}
                                    >
                                        {tab.key === 'popularTab' ? (t.has('popularTab') ? t('popularTab') : 'Top Contenus') : t(tab.key)}
                                    </Link>
                                );
                            })}
                        </nav>
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
