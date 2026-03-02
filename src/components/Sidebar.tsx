'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
    Info
} from "lucide-react";
import { LogoutButton } from "./LogoutButton";
import { SearchBar } from "./SearchBar";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useTranslations } from 'next-intl';

const adminNavigationKeys = [
    { key: 'dashboard', href: '/', icon: LayoutDashboard },
    { key: 'recentlyAdded', href: '/recent', icon: Sparkles },
    { key: 'library', href: '/media', icon: Film },
    { key: 'logs', href: '/logs', icon: ScrollText },
    { key: 'users', href: '/users', icon: Users },
    { key: 'cleanup', href: '/admin/cleanup', icon: Eraser },
    { key: 'settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const t = useTranslations('nav');

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
            { name: t('myWrapped'), href: `/wrapped/${jellyfinUserId || ''}`, icon: Gift },
        ];

    return (
        <div className="flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-950/50 backdrop-blur-xl">
            <div className="flex h-16 shrink-0 items-center px-6">
                <Link href={isAdmin ? "/" : `/users/${jellyfinUserId || ''}`} className="text-xl font-bold tracking-tight text-primary flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <PlayCircle className="w-6 h-6 text-primary" />
                    <span>JellyTulli</span>
                </Link>
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
                                className={`group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${isActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-50"
                                    }`}
                            >
                                <item.icon
                                    className={`mr-3 h-5 w-5 shrink-0 transition-colors ${isActive ? "text-primary" : "text-zinc-500 group-hover:text-zinc-300"
                                        }`}
                                    aria-hidden="true"
                                />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="border-t border-zinc-800 p-4 space-y-3">
                <LanguageSwitcher />
                <LogoutButton className="w-full justify-start text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50" />
                <div className="text-center">
                    <Link href="/about" className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">
                        JellyTulli v{process.env.APP_VERSION || '1.0.0'}
                    </Link>
                </div>
            </div>
        </div>
    );
}
