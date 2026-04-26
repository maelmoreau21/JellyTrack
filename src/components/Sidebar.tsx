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
    GitCompareArrows,
    AlertTriangle
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
            <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border bg-sidebar px-5">
                <Link href={isAdmin ? "/" : `/users/${jellyfinUserId || ''}`} className="flex items-center gap-2 text-lg font-semibold tracking-tight text-sidebar-foreground transition-opacity hover:opacity-90">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent overflow-hidden shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-8 h-8">
                            <defs>
                                <linearGradient id="jellyGradSidebar" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#AA5CC3" />
                                    <stop offset="100%" stopColor="#00A4DC" />
                                </linearGradient>
                                <mask id="holeMaskSidebar">
                                    <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
                                    <circle cx="50" cy="39" r="10" fill="#000000" />
                                </mask>
                            </defs>
                            <path d="M 20 55 A 30 30 0 0 1 80 55 Z" fill="url(#jellyGradSidebar)" mask="url(#holeMaskSidebar)" />
                            <polygon points="46,32 46,46 58,39" fill="#00A4DC" />
                            <rect x="30" y="60" width="8" height="20" rx="4" fill="url(#jellyGradSidebar)" />
                            <rect x="46" y="60" width="8" height="30" rx="4" fill="url(#jellyGradSidebar)" />
                            <rect x="62" y="60" width="8" height="15" rx="4" fill="url(#jellyGradSidebar)" />
                        </svg>
                    </div>
                    <span>JellyTrack</span>
                </Link>
                {/* Close button — mobile only */}
                <button
                    onClick={() => setMobileOpen(false)}
                    className="ml-auto p-1 text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground md:hidden"
                    aria-label="Close menu"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
                <div className="mb-4">
                    <SearchBar />
                </div>

                {!authServerIsPrimary && authServerName && (
                    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                        <div className="flex items-center gap-2 font-semibold text-amber-300">
                            <AlertTriangle className="h-4 w-4" />
                            Serveur de secours actif
                        </div>
                        <p className="mt-1 text-amber-100/90">
                            Connecté sur {authServerName}. Le serveur principal est indisponible.
                        </p>
                    </div>
                )}

                <nav className="flex-1 space-y-1.5">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href || (pathname?.startsWith(item.href) && item.href !== '/');
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`group flex items-center rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                                    ? "border-sidebar-primary/40 bg-sidebar-primary/15 text-sidebar-primary"
                                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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

            <div className="border-t border-sidebar-border bg-sidebar p-4 space-y-3">
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
            <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center border-b border-sidebar-border bg-sidebar px-4 md:hidden">
                <button
                    onClick={() => setMobileOpen(true)}
                    className="p-1.5 text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
                    aria-label="Open menu"
                >
                    <Menu className="w-6 h-6" />
                </button>
                <Link href={isAdmin ? "/" : `/users/${jellyfinUserId || ''}`} className="ml-3 text-lg font-bold tracking-tight text-primary flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-8 h-8">
                        <defs>
                            <linearGradient id="jellyGradMobile" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#AA5CC3" />
                                <stop offset="100%" stopColor="#00A4DC" />
                            </linearGradient>
                            <mask id="holeMaskMobile">
                                <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
                                <circle cx="50" cy="39" r="10" fill="#000000" />
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

            {/* Sidebar — desktop: always visible, mobile: slide-over */}
            <div
                className={`
                    fixed top-0 left-0 z-50 flex h-screen w-[86vw] max-w-72 flex-col border-r border-sidebar-border bg-sidebar shadow-xl md:w-64 md:shadow-none
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
