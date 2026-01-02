'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { SettingsProvider } from '@/lib/settings-context';
import { SWRProvider } from '@/lib/swr-provider';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        // Initialize from localStorage on first render (client-side only)
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('sidebarCollapsed');
            return saved !== null ? JSON.parse(saved) : false;
        }
        return false;
    });

    // Sync collapse state to localStorage when it changes
    const handleSetCollapsed = useCallback((collapsed: boolean | ((prev: boolean) => boolean)) => {
        setSidebarCollapsed((prev: boolean) => {
            const newValue = typeof collapsed === 'function' ? collapsed(prev) : collapsed;
            localStorage.setItem('sidebarCollapsed', JSON.stringify(newValue));
            return newValue;
        });
    }, []);

    // Hydration fix: re-read localStorage after mount
    useEffect(() => {
        const saved = localStorage.getItem('sidebarCollapsed');
        if (saved !== null) {
            const parsed = JSON.parse(saved);
            if (parsed !== sidebarCollapsed) {
                setSidebarCollapsed(parsed);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <SWRProvider>
            <SettingsProvider>
                <div className="min-h-screen bg-muted/40">
                    <Sidebar 
                        sidebarOpen={sidebarOpen} 
                        setSidebarOpen={setSidebarOpen}
                        collapsed={sidebarCollapsed}
                        setCollapsed={handleSetCollapsed}
                    />

                    <div className={`${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'} flex flex-col min-h-screen transition-all duration-200`}>
                        <Header 
                            setSidebarOpen={setSidebarOpen}
                            sidebarCollapsed={sidebarCollapsed}
                            setSidebarCollapsed={handleSetCollapsed}
                        />

                        <main className="flex-1 p-3 lg:p-6 overflow-auto">
                            <div className="mx-auto max-w-7xl animate-fade-in">
                                {children}
                            </div>
                        </main>
                    </div>
                </div>
            </SettingsProvider>
        </SWRProvider>
    );
}
