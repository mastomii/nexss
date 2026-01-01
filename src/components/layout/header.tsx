'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Menu, Moon, User, LogOut, ChevronDown, Settings, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useSWR from 'swr';

interface HeaderProps {
    setSidebarOpen: (open: boolean) => void;
    sidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean) => void;
}

interface UserProfile {
    id: string;
    username: string;
    email: string;
    rank: number;
}

const fetcher = (url: string) => fetch(url).then(res => res.ok ? res.json() : null);

export function Header({ setSidebarOpen, sidebarCollapsed, setSidebarCollapsed }: HeaderProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    
    // Use SWR for data fetching - avoids setState in effect warning
    const { data } = useSWR<{ user: UserProfile }>('/api/user', fetcher);
    const profile = data?.user || null;

    // Simple breadcrumb logic
    const getPageName = () => {
        const path = pathname.split('/')[1];
        if (!path || path === 'dashboard') return 'Admin Dashboard';
        return path.charAt(0).toUpperCase() + path.slice(1);
    };

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
        router.refresh();
    };

    return (
        <header className="sticky top-0 z-40 h-14 bg-[#09090b] flex items-center justify-between px-4 lg:px-6 border-b border-[#1f1f22]">
            {/* Left: Mobile Toggle + Desktop Collapse Toggle + Breadcrumb */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarOpen(true)}
                    className="lg:hidden text-white h-8 w-8"
                >
                    <Menu className="h-5 w-5" />
                </Button>

                {/* Desktop Sidebar Collapse Toggle */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="hidden lg:flex text-muted-foreground hover:text-white h-8 w-8"
                    title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {sidebarCollapsed ? (
                        <PanelLeft className="h-5 w-5" />
                    ) : (
                        <PanelLeftClose className="h-5 w-5" />
                    )}
                </Button>

                <div className="hidden md:flex items-center text-sm font-medium text-muted-foreground">
                    <span className="text-muted-foreground/50 mr-1.5">Pages</span> /
                    <span className="text-white ml-1.5">{getPageName()}</span>
                </div>
            </div>

            {/* Right: Dark Mode Toggle & Profile with Logout */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-[#18181c] rounded p-0.5 border border-[#27272a]">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#27272a]">
                        <Moon className="h-3 w-3 text-white" />
                        <span className="text-xs font-medium text-white">Dark</span>
                    </div>
                </div>

                {/* User Profile with Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setUserMenuOpen(!userMenuOpen)}
                        className="flex items-center gap-2 p-1 rounded hover:bg-white/5 transition-colors"
                    >
                        <div className="h-8 w-8 rounded bg-gradient-to-r from-purple-500 to-pink-500 p-[1.5px]">
                            <div className="h-full w-full rounded bg-[#18181c] flex items-center justify-center overflow-hidden">
                                {profile?.username ? (
                                    <span className="text-xs font-bold text-white">{profile.username.charAt(0).toUpperCase()}</span>
                                ) : (
                                    <User className="h-4 w-4 text-white" />
                                )}
                            </div>
                        </div>
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>

                    {/* Dropdown Menu */}
                    {userMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                            <div className="absolute right-0 top-full mt-2 w-48 bg-[#18181c] border border-[#27272a] rounded-lg shadow-xl z-50 overflow-hidden">
                                <div className="px-3 py-2 border-b border-[#27272a]">
                                    <p className="text-sm font-medium text-white">{profile?.username || 'User'}</p>
                                    <p className="text-xs text-muted-foreground">{profile?.rank === 3 ? 'Administrator' : 'User'}</p>
                                </div>
                                <Link
                                    href="/profile"
                                    onClick={() => setUserMenuOpen(false)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors"
                                >
                                    <Settings className="h-4 w-4" />
                                    <span>User Settings</span>
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <LogOut className="h-4 w-4" />
                                    <span>Logout</span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
