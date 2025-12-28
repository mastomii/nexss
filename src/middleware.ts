import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { corsHeaders } from '@/lib/cors';

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'fallback-secret-change-me'
);

// Routes that don't require authentication
const publicRoutes = [
    '/login',
    '/setup',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/2fa/verify', // 2FA verification during login (before session is created)
    '/api/callback',
    '/api/persist', // POST only (XSS payload polling) - GET/PUT protected in route
    '/api/setup/health',
    '/api/setup/sync',
];

// Routes that should be completely public (no redirect) - XSS payload endpoints
const publicApiRoutes = [
    '/api/callback',
    '/api/persist',
    '/api/traffic',
    '/api/setup/health',
    '/api/setup/sync',
];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Check if this is a public API route (for payload)
    const isPublicApiRoute = publicApiRoutes.some(route => pathname.startsWith(route));

    // Handle CORS preflight (OPTIONS) for payload APIs - MUST respond before any other checks
    if (request.method === 'OPTIONS' && isPublicApiRoute) {
        return new NextResponse(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    // Allow public API routes - add CORS headers to response
    if (isPublicApiRoute) {
        const response = NextResponse.next();
        // Add CORS headers to ALL responses from public API routes
        Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
        });
        return response;
    }

    // Root path serves XSS payload - public with CORS
    if (pathname === '/') {
        const response = NextResponse.next();
        Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
        });
        return response;
    }

    // Allow public routes
    if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
        return NextResponse.next();
    }

    // Allow static files and Next.js internals
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    // Check if DATABASE_URL is configured (basic check in middleware)
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || databaseUrl.trim() === '') {
        // Redirect to setup page if DATABASE_URL is not set
        if (!pathname.startsWith('/setup') && !pathname.startsWith('/api/')) {
            return NextResponse.redirect(new URL('/setup', request.url));
        }
    }

    // Check for session cookie
    const token = request.cookies.get('nexss_session')?.value;

    if (!token) {
        // No token - redirect to login for pages, return 401 for API
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Verify JWT token
    try {
        await jwtVerify(token, JWT_SECRET);
        return NextResponse.next();
    } catch {
        // Invalid token - clear cookie and redirect
        const response = pathname.startsWith('/api/')
            ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            : NextResponse.redirect(new URL('/login', request.url));

        response.cookies.set('nexss_session', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/',
        });

        return response;
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
