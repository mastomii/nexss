/**
 * SWR Configuration and Hooks for NeXSS
 * 
 * Centralized data fetching with automatic caching, revalidation,
 * and error handling using SWR.
 */

import useSWR, { SWRConfiguration, mutate } from 'swr';
import useSWRMutation from 'swr/mutation';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './api-client';

// ============================================
// TYPES
// ============================================

export interface Report {
    id: string;
    uri: string | null;
    origin: string | null;
    referer: string | null;
    user_agent: string | null;
    ip: string | null;
    triggered_at: string;
    archived: boolean;
    read: boolean;
    cookies: string | null;
    data?: ReportData | null;
}

export interface ReportData {
    id: string;
    report_id: string;
    dom: string | null;
    screenshot: string | null;
    screenshot_storage: string | null;
    screenshot_error: string | null;
    localstorage: string | null;
    sessionstorage: string | null;
    extra: Record<string, unknown> | null;
    compressed: boolean;
    created_at: string;
}

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface ReportListResponse {
    reports: Report[];
    pagination: Pagination;
}

export interface DashboardStats {
    total_reports: number;
    unread_count: number;
    reports_today: number;
    reports_this_week: number;
    latest_reports: Report[];
}

export interface UserProfile {
    id: string;
    username: string;
    email: string;
    rank: number;
    totp_enabled: boolean;
    created_at: string;
}

export interface Settings {
    [key: string]: string;
}

// ============================================
// FETCHER
// ============================================

/**
 * Default fetcher using apiGet
 */
async function fetcher<T>(url: string): Promise<T> {
    const response = await apiGet(url);
    if (!response.ok) {
        const error = new Error('An error occurred while fetching the data.');
        const errorData = await response.json().catch(() => ({}));
        (error as Error & { status: number; info: unknown }).status = response.status;
        (error as Error & { status: number; info: unknown }).info = errorData;
        throw error;
    }
    return response.json();
}

// ============================================
// SWR CONFIGURATION
// ============================================

export const swrConfig: SWRConfiguration = {
    fetcher,
    revalidateOnFocus: false, // Don't refetch on window focus
    revalidateOnReconnect: true, // Refetch on reconnect
    errorRetryCount: 3,
    errorRetryInterval: 1000,
    dedupingInterval: 2000, // Dedupe requests within 2s
};

// ============================================
// REPORTS HOOKS
// ============================================

interface UseReportsOptions {
    page?: number;
    limit?: number;
    archived?: boolean;
    search?: string;
}

/**
 * Hook for fetching paginated reports
 */
export function useReports(options: UseReportsOptions = {}) {
    const { page = 1, limit = 50, archived = false, search = '' } = options;
    
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        archived: String(archived),
        ...(search && { search }),
    });

    const { data, error, isLoading, isValidating, mutate } = useSWR<ReportListResponse>(
        `/api/reports?${params}`,
        swrConfig
    );

    return {
        reports: data?.reports ?? [],
        pagination: data?.pagination,
        isLoading,
        isValidating,
        isError: !!error,
        error,
        mutate,
    };
}

/**
 * Hook for fetching a single report with full data
 */
export function useReport(id: string | null) {
    const { data, error, isLoading, mutate } = useSWR<{ report: Report }>(
        id ? `/api/reports/${id}` : null,
        swrConfig
    );

    return {
        report: data?.report,
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

/**
 * Hook for archiving/unarchiving a report
 */
export function useArchiveReport() {
    return useSWRMutation(
        '/api/reports',
        async (url, { arg }: { arg: { id: string; archived: boolean } }) => {
            const response = await apiPatch(`/api/reports/${arg.id}`, { archived: arg.archived });
            if (!response.ok) throw new Error('Failed to archive report');
            return response.json();
        }
    );
}

/**
 * Hook for deleting a report
 */
export function useDeleteReport() {
    return useSWRMutation(
        '/api/reports',
        async (url, { arg }: { arg: { id: string } }) => {
            const response = await apiDelete(`/api/reports/${arg.id}`);
            if (!response.ok) throw new Error('Failed to delete report');
            return response.json();
        }
    );
}

/**
 * Hook for bulk operations on reports
 */
export function useBulkReportAction() {
    return useSWRMutation(
        '/api/reports/bulk',
        async (url, { arg }: { arg: { ids: string[]; action: 'archive' | 'unarchive' | 'delete' } }) => {
            if (arg.action === 'delete') {
                const response = await apiDelete('/api/reports/bulk', { ids: arg.ids });
                if (!response.ok) throw new Error('Failed to delete reports');
                return response.json();
            } else {
                const response = await apiPatch('/api/reports/bulk', {
                    ids: arg.ids,
                    archived: arg.action === 'archive',
                });
                if (!response.ok) throw new Error('Failed to update reports');
                return response.json();
            }
        }
    );
}

// ============================================
// DASHBOARD HOOKS
// ============================================

/**
 * Hook for fetching dashboard statistics
 */
export function useDashboard() {
    const { data, error, isLoading, mutate } = useSWR<DashboardStats>(
        '/api/dashboard',
        swrConfig
    );

    return {
        stats: data,
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

// ============================================
// USER HOOKS
// ============================================

/**
 * Hook for fetching current user profile
 */
export function useUser() {
    const { data, error, isLoading, mutate } = useSWR<{ user: UserProfile }>(
        '/api/user',
        swrConfig
    );

    return {
        user: data?.user,
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

/**
 * Hook for updating user profile
 */
export function useUpdateProfile() {
    return useSWRMutation(
        '/api/user',
        async (url, { arg }: { arg: { email?: string; currentPassword?: string; newPassword?: string } }) => {
            const response = await apiPut('/api/user', arg);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to update profile');
            }
            return response.json();
        }
    );
}

// ============================================
// SETTINGS HOOKS
// ============================================

/**
 * Hook for fetching settings
 */
export function useSettings() {
    const { data, error, isLoading, mutate } = useSWR<{ settings: Settings }>(
        '/api/settings',
        swrConfig
    );

    return {
        settings: data?.settings ?? {},
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

/**
 * Hook for updating settings
 */
export function useUpdateSettings() {
    return useSWRMutation(
        '/api/settings',
        async (url, { arg }: { arg: { settings: Partial<Settings> } }) => {
            const response = await apiPut('/api/settings', arg);
            if (!response.ok) throw new Error('Failed to update settings');
            return response.json();
        }
    );
}

/**
 * Hook for testing storage connection
 */
export function useTestStorage() {
    return useSWRMutation(
        '/api/settings/test',
        async (url, { arg }: { arg: { action: string; config: Record<string, string> } }) => {
            const response = await apiPost('/api/settings', arg);
            if (!response.ok) throw new Error('Failed to test connection');
            return response.json();
        }
    );
}

// ============================================
// PERSISTENT SESSION HOOKS
// ============================================

interface SessionStatus {
    connected: boolean;
    lastSeen?: string;
    diffSeconds?: number;
    lastResponse?: string;
    lastResponseAt?: string;
    encrypted?: boolean;
    sessionStatus?: string;
    terminated?: boolean;
    popupBlocked?: boolean;
}

/**
 * Hook for fetching persistent session status
 */
export function useSessionStatus(reportId: string | null, refreshInterval = 3000) {
    const { data, error, isLoading, mutate } = useSWR<SessionStatus>(
        reportId ? `/api/persist?report_id=${reportId}` : null,
        {
            ...swrConfig,
            refreshInterval: refreshInterval, // Poll every 3s
            revalidateOnFocus: true,
        }
    );

    return {
        session: data,
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

/**
 * Hook for sending command to persistent session
 */
export function useSendCommand() {
    return useSWRMutation(
        '/api/persist',
        async (url, { arg }: { arg: { report_id: string; command: string } }) => {
            const response = await apiPut('/api/persist', arg);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to send command');
            }
            return response.json();
        }
    );
}

// ============================================
// TRAFFIC HOOKS
// ============================================

interface TrafficEntry {
    id: string;
    report_id: string;
    type: string;
    method: string;
    url: string;
    req_headers: string | null;
    req_body: string | null;
    res_headers: string | null;
    res_body: string | null;
    status: number | null;
    captured_at: string;
}

interface TrafficResponse {
    traffic: TrafficEntry[];
    pagination: Pagination;
}

/**
 * Hook for fetching intercepted traffic
 */
export function useTraffic(reportId: string | null, page = 1, limit = 20) {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });

    const { data, error, isLoading, mutate } = useSWR<TrafficResponse>(
        reportId ? `/api/traffic?report_id=${reportId}&${params}` : null,
        {
            ...swrConfig,
            refreshInterval: 5000, // Poll every 5s for new traffic
        }
    );

    return {
        traffic: data?.traffic ?? [],
        pagination: data?.pagination,
        isLoading,
        isError: !!error,
        error,
        mutate,
    };
}

// ============================================
// CACHE UTILITIES
// ============================================

/**
 * Invalidate all reports cache
 */
export function invalidateReports() {
    mutate((key) => typeof key === 'string' && key.startsWith('/api/reports'));
}

/**
 * Invalidate dashboard cache
 */
export function invalidateDashboard() {
    mutate('/api/dashboard');
}

/**
 * Invalidate settings cache
 */
export function invalidateSettings() {
    mutate('/api/settings');
}

/**
 * Invalidate user cache
 */
export function invalidateUser() {
    mutate('/api/user');
}

/**
 * Global cache invalidation
 */
export function invalidateAll() {
    mutate(() => true);
}

// ============================================
// PREFETCH UTILITIES
// ============================================

/**
 * Prefetch a report detail for instant navigation
 */
export function prefetchReport(id: string) {
    mutate(`/api/reports/${id}`, fetcher(`/api/reports/${id}`), { revalidate: false });
}

/**
 * Prefetch dashboard data
 */
export function prefetchDashboard() {
    mutate('/api/dashboard', fetcher('/api/dashboard'), { revalidate: false });
}
