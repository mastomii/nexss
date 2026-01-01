'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Crosshair,
    FileText,
    Settings,
    LogOut,
    X,
    User,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/lib/settings-context';

export interface SidebarProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
}

// Menu groups
const menuGroups = [
    {
        label: 'Overview',
        items: [
            { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        ]
    },
    {
        label: 'XSS Tools',
        items: [
            { href: '/payloads', label: 'Payloads', icon: Crosshair },
            { href: '/reports', label: 'Reports', icon: FileText },
        ]
    },
    {
        label: 'Account',
        items: [
            { href: '/profile', label: 'Profile', icon: User },
            { href: '/settings', label: 'Settings', icon: Settings },
        ]
    },
];

export function Sidebar({ sidebarOpen, setSidebarOpen, collapsed, setCollapsed }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { appName } = useSettings();

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
        router.refresh();
    };

    const NavItem = ({ item }: { item: { href: string; label: string; icon: any } }) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;

        return (
            <Link
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                title={collapsed ? item.label : undefined}
                className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-all duration-200",
                    collapsed && "justify-center px-2",
                    isActive
                        ? "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                        : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
            >
                <Icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-white" : "text-muted-foreground")} />
                {!collapsed && <span>{item.label}</span>}
            </Link>
        );
    };

    return (
        <>
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 bg-[#09090b] border-r border-[#1f1f22] transform transition-all duration-200 ease-in-out flex flex-col",
                    collapsed ? "w-16" : "w-56",
                    sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
                {/* Logo Area */}
                <div className="h-14 flex items-center px-4 justify-between">
                    <div className={cn("flex items-center", collapsed && "w-full justify-center")}>
                        {collapsed ? (
                            <Image
                                src="/nexss-favicon.png"
                                alt={appName}
                                width={32}
                                height={32}
                                className="h-8 w-8"
                                priority
                            />
                        ) : (
                            <Image
                                src="/nexss-logo-horizontal.png"
                                alt={appName}
                                width={140}
                                height={32}
                                className="h-8 w-auto"
                                priority
                            />
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden text-muted-foreground h-8 w-8"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Navigation Content */}
                <div className="flex-1 px-3 py-4 overflow-y-auto space-y-5 scrollbar-none">
                    {menuGroups.map((group) => (
                        <div key={group.label}>
                            {!collapsed && (
                                <p className="px-3 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider mb-2">
                                    {group.label}
                                </p>
                            )}
                            <div className="space-y-1">
                                {group.items.map((item) => (
                                    <NavItem key={item.href} item={item} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Collapse Toggle Button - Desktop Only */}
                <div className="hidden lg:flex p-3 border-t border-[#1f1f22]">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCollapsed(!collapsed)}
                        className={cn(
                            "w-full text-muted-foreground hover:text-white hover:bg-white/5",
                            collapsed && "px-0 justify-center"
                        )}
                    >
                        {collapsed ? (
                            <ChevronRight className="h-4 w-4" />
                        ) : (
                            <>
                                <ChevronLeft className="h-4 w-4 mr-2" />
                                <span>Collapse</span>
                            </>
                        )}
                    </Button>
                </div>
            </aside>
        </>
    );
}
