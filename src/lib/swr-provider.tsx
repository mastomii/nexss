'use client';

/**
 * SWR Provider for NeXSS
 * 
 * Provides global SWR configuration to all components
 */

import { SWRConfig } from 'swr';
import { swrConfig } from './swr';
import { ReactNode } from 'react';

interface SWRProviderProps {
    children: ReactNode;
}

export function SWRProvider({ children }: SWRProviderProps) {
    return (
        <SWRConfig value={swrConfig}>
            {children}
        </SWRConfig>
    );
}
