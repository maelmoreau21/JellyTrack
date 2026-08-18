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
    Eraser,
    UserCircle,
    Gift,
    Sparkles,
    Menu,
    X,
    HeartPulse,
    GitCompareArrows,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
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
    { key: 'users', href: '/users', icon: Users },
    { key: 'cleanup', href: '/admin/cleanup', icon: Eraser },
    { key: 'logHealth', href: '/admin/health', icon: HeartPulse },
    { key: 'logs', href: '/logs', icon: ScrollText },
    { key: 'settings', href: '/settings/plugin', icon: Settings },
    { key: 'serverCompare', href: '/admin/server-compare', icon: GitCompareArrows },
];

export function Sidebar({ isWrappedVisible }: { isWrappedVisible?: boolean }) {
    const pathname = usePathname();
    const { data: session } = useSession();
    const t = useTranslations('nav');
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Initialize collapsed state from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('jellytrack_sidebar_collapsed');
            if (saved === 'true') {
                setIsCollapsed(true);
            }
        } catch {
            // Ignore localStorage errors
        }
        setMounted(true);
    }, []);

    const toggleCollapse = () => {
        setIsCollapsed(prev => {
            const next = !prev;
            try {
                localStorage.setItem('jellytrack_sidebar_collapsed', String(next));
            } catch {
                // Ignore localStorage errors
            }
            return next;
        });
    };

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
    const authServerName = (session?.user as any)?.authServerName as string | undefined;
    const authServerIsPrimary = (session?.user as any)?.authServerIsPrimary !== false;

    // Determine JellyTrack mode (default to 'single') and build navigation based on role
    const jellytrackMode = (process.env.JELLYTRACK_MODE || 'single').toLowerCase();
    const isMultiServer = jellytrackMode === 'multi';

    const adminNavItems = isMultiServer
        ? adminNavigationKeys
        : adminNavigationKeys.filter(item => item.key !== 'serverCompare');

    const navigation = isAdmin
        ? adminNavItems.map(item => ({ name: t(item.key as any), href: item.href, icon: item.icon }))
        : [
            { name: t('myProfile'), href: `/users/${jellyfinUserId || ''}`, icon: UserCircle },
            // Only show wrapped if globally visible AND active
            ...(isWrappedVisible ? [{ name: t('myWrapped'), href: `/wrapped/${jellyfinUserId || ''}`, icon: Gift }] : []),
        ];

    const sidebarContent = (
        <>
            {/* Header */}
            {isCollapsed ? (
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar/80 backdrop-blur-xl px-2.5">
                    <Link
                        href={isAdmin ? "/" : `/users/${jellyfinUserId || ''}`}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent overflow-hidden shadow-sm transition-opacity hover:opacity-90"
                        title="JellyTrack"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="18 23 64 69" className="w-6 h-6">
                            <defs>
                                <linearGradient id="jellyGradSidebarCompact" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#AA5CC3" />
                                    <stop offset="100%" stopColor="#00A4DC" />
                                </linearGradient>
                                <mask id="holeMaskSidebarCompact">
                                    <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
                                    <circle cx="50" cy="39" r="10" fill="black" />
                                </mask>
                            </defs>
                            <path d="M 20 55 A 30 30 0 0 1 80 55 Z" fill="url(#jellyGradSidebarCompact)" mask="url(#holeMaskSidebarCompact)" />
                            <polygon points="46,32 46,46 58,39" fill="#00A4DC" />
                            <rect x="30" y="60" width="8" height="20" rx="4" fill="url(#jellyGradSidebarCompact)" />
                            <rect x="46" y="60" width="8" height="30" rx="4" fill="url(#jellyGradSidebarCompact)" />
                            <rect x="62" y="60" width="8" height="15" rx="4" fill="url(#jellyGradSidebarCompact)" />
                        </svg>
                    </Link>
                    <button
                        type="button"
                        onClick={toggleCollapse}
                        className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors"
                        title={t('expandMenu')}
                        aria-label={t('expandMenu')}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    {/* Close button — mobile only */}
                    <button
                        onClick={() => setMobileOpen(false)}
                        className="p-1 text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground md:hidden"
                        aria-label="Close menu"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            ) : (
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar/80 backdrop-blur-xl px-4">
                    <Link
                        href={isAdmin ? "/" : `/users/${jellyfinUserId || ''}`}
                        className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-sidebar-foreground transition-opacity hover:opacity-90 min-w-0"
                    >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent overflow-hidden shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="18 23 64 69" className="w-7 h-7">
                                <defs>
                                    <linearGradient id="jellyGradSidebar" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#AA5CC3" />
                                        <stop offset="100%" stopColor="#00A4DC" />
                                    </linearGradient>
                                    <mask id="holeMaskSidebar">
                                        <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
                                        <circle cx="50" cy="39" r="10" fill="black" />
                                    </mask>
                                </defs>
                                <path d="M 20 55 A 30 30 0 0 1 80 55 Z" fill="url(#jellyGradSidebar)" mask="url(#holeMaskSidebar)" />
                                <polygon points="46,32 46,46 58,39" fill="#00A4DC" />
                                <rect x="30" y="60" width="8" height="20" rx="4" fill="url(#jellyGradSidebar)" />
                                <rect x="46" y="60" width="8" height="30" rx="4" fill="url(#jellyGradSidebar)" />
                                <rect x="62" y="60" width="8" height="15" rx="4" fill="url(#jellyGradSidebar)" />
                            </svg>
                        </div>
                        <span className="truncate">JellyTrack</span>
                    </Link>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={toggleCollapse}
                            className="hidden md:flex p-1.5 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors"
                            title={t('collapseMenu')}
                            aria-label={t('collapseMenu')}
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        {/* Close button — mobile only */}
                        <button
                            onClick={() => setMobileOpen(false)}
                            className="p-1 text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground md:hidden"
                            aria-label="Close menu"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Navigation & Search Body */}
            <div className={`flex flex-1 flex-col overflow-y-auto overflow-x-hidden ${isCollapsed ? 'px-2 py-4' : 'px-4 py-4'}`}>
                <div className="mb-4">
                    <SearchBar compact={isCollapsed} />
                </div>

                {!authServerIsPrimary && authServerName && (
                    isCollapsed ? (
                        <div className="relative group flex justify-center mb-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-300">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div className="pointer-events-none absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 hidden w-48 rounded-lg bg-zinc-900 p-2.5 text-xs font-medium text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-900 group-hover:block">
                                <div className="font-semibold text-amber-400 dark:text-amber-600">{t('backupServerActive')}</div>
                                <div className="mt-1 text-[11px] opacity-90">{t('backupServerDesc', { server: authServerName })}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                            <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-4 w-4" />
                                {t('backupServerActive')}
                            </div>
                            <p className="mt-1 text-amber-700/90 dark:text-amber-100/90">
                                {t('backupServerDesc', { server: authServerName })}
                            </p>
                        </div>
                    )
                )}

                <nav className="flex-1 space-y-1.5">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href || (pathname?.startsWith(item.href) && item.href !== '/');
                        if (isCollapsed) {
                            return (
                                <div key={item.name} className="relative group flex justify-center w-full">
                                    <Link
                                        href={item.href}
                                        className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-200 ${isActive
                                            ? "border-sidebar-primary/40 bg-sidebar-primary/15 text-sidebar-primary shadow-sm ring-1 ring-sidebar-primary/30"
                                            : "border-transparent text-sidebar-foreground/65 hover:border-sidebar-border hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
                                            }`}
                                        aria-label={item.name}
                                    >
                                        <item.icon
                                            className={`h-5 w-5 shrink-0 transition-colors ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-primary"}`}
                                            aria-hidden="true"
                                        />
                                    </Link>
                                    <div className="pointer-events-none absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 hidden rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900 group-hover:block whitespace-nowrap animate-in fade-in-0 zoom-in-95 duration-150">
                                        {item.name}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`group flex items-center rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
                                    ? "border-sidebar-primary/40 bg-sidebar-primary/15 text-sidebar-primary shadow-sm"
                                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground hover:translate-x-0.5"
                                    }`}
                            >
                                <item.icon
                                    className={`mr-3 h-5 w-5 shrink-0 transition-colors ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-primary"
                                        }`}
                                    aria-hidden="true"
                                />
                                <span className="truncate">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Footer */}
            {isCollapsed ? (
                <div className="border-t border-sidebar-border bg-sidebar/80 backdrop-blur-xl p-2 space-y-2 flex flex-col items-center">
                    <LanguageSwitcher compact={true} />
                    <ThemeToggle compact={true} />
                    <LogoutButton compact={true} />
                    <div className="text-center pt-1">
                        <Link href="/about" title={`JellyTrack v${process.env.APP_VERSION || '1.0.0'}`} className="text-[10px] text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors">
                            v{process.env.APP_VERSION || '1.0'}
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="border-t border-sidebar-border bg-sidebar/80 backdrop-blur-xl p-4 space-y-3">
                    <LanguageSwitcher />
                    <ThemeToggle />
                    <LogoutButton />
                    <div className="text-center">
                        <Link href="/about" className="text-[11px] text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors">
                            JellyTrack v{process.env.APP_VERSION || '1.0.0'}
                        </Link>
                    </div>
                </div>
            )}
        </>
    );

    return (
        <>
            {/* Mobile header bar */}
            <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center border-b border-sidebar-border bg-sidebar/90 backdrop-blur-xl px-4 md:hidden">
                <button
                    onClick={() => setMobileOpen(true)}
                    className="p-1.5 text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
                    aria-label="Open menu"
                >
                    <Menu className="w-6 h-6" />
                </button>
                <Link href={isAdmin ? "/" : `/users/${jellyfinUserId || ''}`} className="ml-3 text-lg font-bold tracking-tight text-primary flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="18 23 64 69" className="w-8 h-8">
                        <defs>
                            <linearGradient id="jellyGradMobile" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#AA5CC3" />
                                <stop offset="100%" stopColor="#00A4DC" />
                            </linearGradient>
                            <mask id="holeMaskMobile">
                                <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
                                <circle cx="50" cy="39" r="10" fill="black" />
                            </mask>
                        </defs>
                        <path d="M 20 55 A 30 30 0 0 1 80 55 Z" fill="url(#jellyGradMobile)" mask="url(#holeMaskMobile)" />
                        <polygon points="46,32 46,46 58,39" fill="#00A4DC" />
                        <rect x="30" y="60" width="8" height="20" rx="4" fill="url(#jellyGradMobile)" />
                        <rect x="46" y="60" width="8" height="30" rx="4" fill="url(#jellyGradMobile)" />
                        <rect x="62" y="60" width="8" height="15" rx="4" fill="url(#jellyGradMobile)" />
                    </svg>
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

            {/* Sidebar — desktop: collapsible, mobile: slide-over */}
            <div
                className={`
                    fixed top-0 left-0 z-50 flex h-screen flex-col border-r border-sidebar-border bg-sidebar/70 backdrop-blur-xl shadow-xl md:shadow-none
                    transition-all duration-300 ease-in-out
                    md:sticky md:translate-x-0
                    ${mobileOpen ? 'w-[86vw] max-w-72 translate-x-0' : '-translate-x-full md:translate-x-0'}
                    ${isCollapsed ? 'md:w-20' : 'md:w-64'}
                `}
            >
                {sidebarContent}
            </div>
        </>
    );
}
