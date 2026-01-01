'use client';

import { useState, useEffect } from 'react';
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
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Persist collapse state in localStorage
    useEffect(() => {
        const saved = localStorage.getItem('sidebarCollapsed');
        if (saved !== null) {
            setSidebarCollapsed(JSON.parse(saved));
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed));
    }, [sidebarCollapsed]);

    return (
        <SWRProvider>
            <SettingsProvider>
                <div className="min-h-screen bg-muted/40">
                    <Sidebar 
                        sidebarOpen={sidebarOpen} 
                        setSidebarOpen={setSidebarOpen}
                        collapsed={sidebarCollapsed}
                        setCollapsed={setSidebarCollapsed}
                    />

                    <div className={`${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-56'} flex flex-col min-h-screen transition-all duration-200`}>
                        <Header 
                            setSidebarOpen={setSidebarOpen}
                            sidebarCollapsed={sidebarCollapsed}
                            setSidebarCollapsed={setSidebarCollapsed}
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
