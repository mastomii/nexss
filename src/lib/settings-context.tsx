'use client';

import { createContext, useContext, ReactNode, useCallback } from 'react';
import useSWR from 'swr';

interface SettingsContextType {
    timezone: string;
    appName: string;
    formatDate: (date: Date | string) => string;
    formatDateTime: (date: Date | string) => string;
    refreshSettings: () => Promise<void>;
}

interface SettingsResponse {
    settings: {
        timezone?: string;
        app_name?: string;
    };
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const fetcher = (url: string) => fetch(url).then(res => res.ok ? res.json() : null);

export function SettingsProvider({ children }: { children: ReactNode }) {
    // Use SWR for data fetching - avoids setState in effect warning
    const { data, mutate } = useSWR<SettingsResponse>('/api/settings', fetcher);
    
    const timezone = data?.settings?.timezone || 'UTC';
    const appName = data?.settings?.app_name || 'NeXSS';

    const formatDate = useCallback((date: Date | string): string => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: timezone,
        });
    }, [timezone]);

    const formatDateTime = useCallback((date: Date | string): string => {
        const d = new Date(date);
        return d.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: timezone,
            hour12: false,
        });
    }, [timezone]);

    const refreshSettings = useCallback(async () => {
        await mutate();
    }, [mutate]);

    return (
        <SettingsContext.Provider value={{ timezone, appName, formatDate, formatDateTime, refreshSettings }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
