/**
 * API Client Helper for NeXSS
 * 
 * Provides helper functions for making authenticated API requests
 * with automatic CSRF token handling.
 */

/**
 * Get CSRF token from cookie
 */
function getCSRFToken(): string | null {
    if (typeof document === 'undefined') return null;
    
    const match = document.cookie.match(/(?:^|;\s*)nexss_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Make an API request with CSRF token included for state-changing methods
 */
export async function apiRequest(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    
    // Add CSRF token for state-changing requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        const csrfToken = getCSRFToken();
        if (csrfToken) {
            headers.set('X-CSRF-Token', csrfToken);
        }
    }
    
    // Add Content-Type if not set and body is provided
    if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    
    return fetch(url, {
        ...options,
        headers,
    });
}

/**
 * Make a GET request
 */
export function apiGet(url: string): Promise<Response> {
    return apiRequest(url, { method: 'GET' });
}

/**
 * Make a POST request with JSON body
 */
export function apiPost(url: string, data?: unknown): Promise<Response> {
    return apiRequest(url, {
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined,
    });
}

/**
 * Make a PUT request with JSON body
 */
export function apiPut(url: string, data: unknown): Promise<Response> {
    return apiRequest(url, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

/**
 * Make a PATCH request with JSON body
 */
export function apiPatch(url: string, data: unknown): Promise<Response> {
    return apiRequest(url, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
}

/**
 * Make a DELETE request
 */
export function apiDelete(url: string, data?: unknown): Promise<Response> {
    return apiRequest(url, {
        method: 'DELETE',
        body: data ? JSON.stringify(data) : undefined,
    });
}
