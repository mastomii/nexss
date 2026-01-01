/**
 * CSRF Protection for NeXSS
 * 
 * Implements Double Submit Cookie pattern for CSRF protection.
 * - Generates secure CSRF token on login
 * - Validates token on state-changing requests (POST, PUT, DELETE, PATCH)
 * - Token passed via X-CSRF-Token header or _csrf body field
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CSRF_COOKIE_NAME = 'nexss_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generate a secure CSRF token
 */
export function generateCSRFToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Set CSRF cookie in response
 */
export function setCSRFCookie(response: NextResponse, token: string): void {
    response.cookies.set(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Must be readable by JS to send in header
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60, // 7 days (same as session)
        path: '/',
    });
}

/**
 * Get CSRF token from request (cookie)
 */
export function getCSRFTokenFromCookie(request: NextRequest): string | null {
    return request.cookies.get(CSRF_COOKIE_NAME)?.value || null;
}

/**
 * Get CSRF token from request header or body
 */
export function getCSRFTokenFromRequest(request: NextRequest, body?: Record<string, unknown>): string | null {
    // First check header
    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    if (headerToken) return headerToken;
    
    // Then check body (for form submissions)
    if (body && typeof body._csrf === 'string') {
        return body._csrf;
    }
    
    return null;
}

/**
 * Validate CSRF token
 * Compares token from header/body with cookie token using timing-safe comparison
 */
export function validateCSRFToken(cookieToken: string | null, requestToken: string | null): boolean {
    if (!cookieToken || !requestToken) {
        return false;
    }
    
    // Use timing-safe comparison
    try {
        return crypto.timingSafeEqual(
            Buffer.from(cookieToken),
            Buffer.from(requestToken)
        );
    } catch {
        return false;
    }
}

/**
 * Check if request method requires CSRF validation
 */
export function requiresCSRFValidation(method: string): boolean {
    const statefulMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    return statefulMethods.includes(method.toUpperCase());
}

/**
 * Paths that should skip CSRF validation (public endpoints)
 */
const CSRF_EXEMPT_PATHS = [
    '/api/callback',        // XSS callback - public, CORS-enabled
    '/api/persist',         // Persistent session - public, CORS-enabled  
    '/api/traffic',         // Traffic interception - public, CORS-enabled
    '/api/auth/login',      // Login - no session yet
    '/api/auth/2fa/verify', // 2FA verification - part of login flow
    '/api/setup',           // DB setup - happens before auth is possible
];

/**
 * Check if path is exempt from CSRF validation
 */
export function isCSRFExempt(pathname: string): boolean {
    return CSRF_EXEMPT_PATHS.some(path => pathname.startsWith(path));
}

/**
 * CSRF middleware helper - call this in authenticated API routes
 * Returns error response if CSRF validation fails, null if valid
 */
export function validateCSRF(request: NextRequest, body?: Record<string, unknown>): NextResponse | null {
    // Skip for exempt paths
    if (isCSRFExempt(request.nextUrl.pathname)) {
        return null;
    }
    
    // Skip for non-stateful methods
    if (!requiresCSRFValidation(request.method)) {
        return null;
    }
    
    const cookieToken = getCSRFTokenFromCookie(request);
    const requestToken = getCSRFTokenFromRequest(request, body);
    
    if (!validateCSRFToken(cookieToken, requestToken)) {
        return NextResponse.json(
            { error: 'Invalid or missing CSRF token' },
            { status: 403 }
        );
    }
    
    return null;
}

/**
 * Add CSRF token to response on login
 * Call this after successful authentication
 */
export function addCSRFToLoginResponse(response: NextResponse): string {
    const token = generateCSRFToken();
    setCSRFCookie(response, token);
    return token;
}
