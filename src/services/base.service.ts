/**
 * Base Service Layer for NeXSS
 * 
 * Provides common functionality for all services including:
 * - Standardized error handling
 * - Response formatting
 * - Logging utilities
 */

import { NextResponse } from 'next/server';

// ============================================
// RESULT TYPES
// ============================================

export type ServiceResult<T> = 
    | { success: true; data: T }
    | { success: false; error: string; code: number };

// ============================================
// ERROR CODES
// ============================================

export const ErrorCodes = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    BAD_REQUEST: 400,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
} as const;

// ============================================
// SERVICE HELPERS
// ============================================

/**
 * Create a success result
 */
export function success<T>(data: T): ServiceResult<T> {
    return { success: true, data };
}

/**
 * Create an error result
 */
export function error(message: string, code: number = ErrorCodes.INTERNAL_ERROR): ServiceResult<never> {
    return { success: false, error: message, code };
}

/**
 * Create standard errors
 */
export const Errors = {
    unauthorized: () => error('Unauthorized', ErrorCodes.UNAUTHORIZED),
    forbidden: (message = 'Forbidden') => error(message, ErrorCodes.FORBIDDEN),
    notFound: (resource = 'Resource') => error(`${resource} not found`, ErrorCodes.NOT_FOUND),
    badRequest: (message: string) => error(message, ErrorCodes.BAD_REQUEST),
    conflict: (message: string) => error(message, ErrorCodes.CONFLICT),
    internal: (message = 'Internal server error') => error(message, ErrorCodes.INTERNAL_ERROR),
} as const;

// ============================================
// RESPONSE HELPERS
// ============================================

/**
 * Convert ServiceResult to NextResponse
 */
export function toResponse<T>(result: ServiceResult<T>): NextResponse {
    if (result.success) {
        return NextResponse.json(result.data);
    }
    return NextResponse.json({ error: result.error }, { status: result.code });
}

/**
 * Convert ServiceResult to NextResponse with CORS headers
 */
export function toResponseWithCORS<T>(
    result: ServiceResult<T>,
    corsHeaders: Record<string, string>
): NextResponse {
    if (result.success) {
        return NextResponse.json(result.data, { headers: corsHeaders });
    }
    return NextResponse.json(
        { error: result.error },
        { status: result.code, headers: corsHeaders }
    );
}

// ============================================
// LOGGING UTILITIES
// ============================================

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Service logger with consistent formatting
 */
export function log(service: string, level: LogLevel, message: string, data?: unknown) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${service}]`;
    
    switch (level) {
        case 'info':
            console.log(prefix, message, data ?? '');
            break;
        case 'warn':
            console.warn(prefix, message, data ?? '');
            break;
        case 'error':
            console.error(prefix, message, data ?? '');
            break;
        case 'debug':
            if (process.env.NODE_ENV !== 'production') {
                console.log(prefix, '[DEBUG]', message, data ?? '');
            }
            break;
    }
}

/**
 * Create a logger for a specific service
 */
export function createLogger(service: string) {
    return {
        info: (message: string, data?: unknown) => log(service, 'info', message, data),
        warn: (message: string, data?: unknown) => log(service, 'warn', message, data),
        error: (message: string, data?: unknown) => log(service, 'error', message, data),
        debug: (message: string, data?: unknown) => log(service, 'debug', message, data),
    };
}

// ============================================
// WRAPPER FOR SAFE EXECUTION
// ============================================

/**
 * Wrap async service method with error handling
 */
export async function safeExecute<T>(
    serviceName: string,
    operation: string,
    fn: () => Promise<ServiceResult<T>>
): Promise<ServiceResult<T>> {
    const logger = createLogger(serviceName);
    
    try {
        return await fn();
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error(`${operation} failed:`, err);
        return Errors.internal(errorMessage);
    }
}
