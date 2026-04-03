'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import {
    LayoutDashboard,
    Film,
    ScrollText,
    Users,
    Settings,
    PlayCircle,
    Eraser,
    UserCircle,
    Gift,
    Sparkles,
    Menu,
    X,
    HeartPulse,
    GitCompareArrows
} from "lucide-react";
import { LogoutButton } from "./LogoutButton";
import { SearchBar } from "./SearchBar";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useTranslations } from 'next-intl';

const adminNavigationKeys = [
    { key: 'dashboard', href: '/', icon: LayoutDashboard },
    { key: 'recentlyAdded', href: '/recent', icon: Sparkles },
    { key: 'library', href: '/media', icon: Film },
    { key: 'logs', href: '/logs', icon: ScrollText },
    { key: 'logHealth', href: '/admin/health', icon: HeartPulse },
    { key: 'serverCompare', href: '/admin/server-compare', icon: GitCompareArrows },
    { key: 'users', href: '/users', icon: Users },
    { key: 'cleanup', href: '/admin/cleanup', icon: Eraser },
    { key: 'settings', href: '/settings', icon: Settings },
];

export function Sidebar({ isWrappedVisible }: { isWrappedVisible?: boolean }) {
    const pathname = usePathname();
    const { data: session } = useSession();
    const t = useTranslations('nav');
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close mobile sidebar on route change. Defer the update to avoid
    // synchronous setState inside an effect which can cause cascading renders.
    useEffect(() => {
        const t = setTimeout(() => setMobileOpen(false), 0);
        return () => clearTimeout(t);
    }, [pathname]);

    // Hide sidebar on login page only (Wrapped uses fullscreen overlay)
    if (pathname === '/login' || pathname?.startsWith('/wrapped')) {
        return null;
    }

    const isAdmin = session?.user?.isAdmin === true;
    const jellyfinUserId = (session?.user as any)?.jellyfinUserId as string | undefined;

    // Build navigation based on role
    const navigation = isAdmin
        ? adminNavigationKeys.map(item => ({ name: t(item.key as any), href: item.href, icon: item.icon }))
        : [
            { name: t('myProfile'), href: `/users/${jellyfinUserId || ''}`, icon: UserCircle },
            // Only show wrapped if globally visible AND active
            ...(isWrappedVisible ? [{ name: t('myWrapped'), href: `/wrapped/${jellyfinUserId || ''}`, icon: Gift }] : []),
        ];

    const sidebarContent = (
        <>
            <div className="flex h-16 shrink-0 items-center px-6 border-b border-sidebar-border bg-sidebar/50 backdrop-blur-xl">
                <Link href={isAdmin ? "/" : `/users/${jellyfinUserId || ''}`} className="text-xl font-bold tracking-tight text-sidebar-foreground flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary/10 ring-1 ring-sidebar-border">
                        <PlayCircle className="w-5 h-5 text-sidebar-primary" />
                    </div>
                    <span>JellyTrack</span>
                </Link>
                {/* Close button — mobile only */}
                <button
                    onClick={() => setMobileOpen(false)}
                    className="ml-auto md:hidden p-1 text-zinc-400 hover:text-zinc-200"
                    aria-label="Close menu"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
                <div className="mb-4">
                    <SearchBar />
                </div>
                <nav className="flex-1 space-y-1.5">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href || (pathname?.startsWith(item.href) && item.href !== '/');
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${isActive
                                    ? "bg-sidebar-primary/10 text-sidebar-primary ring-1 ring-sidebar-primary/20"
                                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                    }`}
                            >
                                <item.icon
                                    className={`mr-3 h-5 w-5 shrink-0 transition-colors ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-primary"
                                        }`}
                                    aria-hidden="true"
                                />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="border-t border-sidebar-border p-4 space-y-3 bg-sidebar/30">
                <LanguageSwitcher />
                <ThemeToggle />
                <LogoutButton className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" />
                <div className="text-center">
                    <Link href="/about" className="text-[11px] text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors">
                        JellyTrack v{process.env.APP_VERSION || '1.0.0'}
                    </Link>
                </div>
            </div>
        </>
    );

    return (
        <>
            {/* Mobile header bar */}
            <div className="fixed top-0 left-0 right-0 z-40 flex md:hidden items-center h-14 px-4 border-b border-sidebar-border bg-sidebar/95 backdrop-blur-xl">
                <button
                    onClick={() => setMobileOpen(true)}
                    className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                    aria-label="Open menu"
                >
                    <Menu className="w-6 h-6" />
                </button>
                <Link href={isAdmin ? "/" : `/users/${jellyfinUserId || ''}`} className="ml-3 text-lg font-bold tracking-tight text-primary flex items-center gap-2">
                    <PlayCircle className="w-5 h-5 text-primary" />
                    <span>JellyTrack</span>
                </Link>
            </div>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 md:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar — desktop: always visible, mobile: slide-over */}
            <div
                className={`
                    fixed top-0 left-0 z-50 h-screen w-[86vw] max-w-72 md:w-64 flex flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl shadow-2xl md:shadow-none
                    transition-transform duration-200 ease-in-out
                    md:sticky md:translate-x-0
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
            >
                {sidebarContent}
            </div>
        </>
    );
}
