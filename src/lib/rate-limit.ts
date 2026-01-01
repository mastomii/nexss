/**
 * Rate Limiter for NeXSS
 * 
 * Smart rate limiting with different limits per endpoint type:
 * - callback: More restrictive (prevent spam reports)
 * - persist: Less restrictive (continuous polling needed for persistent sessions)
 * - traffic: Moderate (frequent but not as critical)
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}

// In-memory store for rate limits
// In production, consider Redis for distributed rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 60000; // 1 minute
let lastCleanup = Date.now();

function cleanupOldEntries() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    
    lastCleanup = now;
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetTime < now) {
            rateLimitStore.delete(key);
        }
    }
}

// Rate limit configurations per endpoint type
export const RATE_LIMIT_CONFIG = {
    // Callback endpoint: 30 requests per minute per IP
    // This is for XSS triggers - shouldn't be too frequent
    callback: {
        maxRequests: 30,
        windowMs: 60000, // 1 minute
    },
    // Persist endpoint: 100 requests per minute per IP
    // Polling every 3 seconds = 20 req/min per session, allow multiple sessions
    persist: {
        maxRequests: 100,
        windowMs: 60000, // 1 minute
    },
    // Traffic endpoint: 200 requests per minute per IP
    // Can have many traffic events from active browsing
    traffic: {
        maxRequests: 200,
        windowMs: 60000, // 1 minute
    },
    // Default/strict: 20 requests per minute
    default: {
        maxRequests: 20,
        windowMs: 60000, // 1 minute
    },
} as const;

export type RateLimitType = keyof typeof RATE_LIMIT_CONFIG;

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number; // milliseconds until reset
    limit: number;
}

/**
 * Check rate limit for a given identifier and endpoint type
 * @param identifier - Unique identifier (usually IP address or IP:reportId)
 * @param type - Endpoint type for appropriate limits
 * @returns RateLimitResult with allowed status and metadata
 */
export function checkRateLimit(
    identifier: string,
    type: RateLimitType = 'default'
): RateLimitResult {
    cleanupOldEntries();
    
    const config = RATE_LIMIT_CONFIG[type];
    const key = `${type}:${identifier}`;
    const now = Date.now();
    
    let entry = rateLimitStore.get(key);
    
    // If no entry or window expired, create new entry
    if (!entry || entry.resetTime < now) {
        entry = {
            count: 1,
            resetTime: now + config.windowMs,
        };
        rateLimitStore.set(key, entry);
        
        return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetIn: config.windowMs,
            limit: config.maxRequests,
        };
    }
    
    // Check if over limit
    if (entry.count >= config.maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetIn: entry.resetTime - now,
            limit: config.maxRequests,
        };
    }
    
    // Increment and allow
    entry.count++;
    
    return {
        allowed: true,
        remaining: config.maxRequests - entry.count,
        resetIn: entry.resetTime - now,
        limit: config.maxRequests,
    };
}

/**
 * Get client IP from request headers
 * Supports various proxy headers
 */
export function getClientIPFromRequest(request: Request): string {
    const headers = request.headers;
    
    // Cloudflare
    const cfIP = headers.get('cf-connecting-ip');
    if (cfIP) return cfIP;
    
    // Standard proxy headers
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    
    const realIP = headers.get('x-real-ip');
    if (realIP) return realIP;
    
    // Vercel
    const vercelIP = headers.get('x-vercel-forwarded-for');
    if (vercelIP) return vercelIP.split(',')[0].trim();
    
    return 'unknown';
}

/**
 * Create rate limit headers for response
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetIn / 1000)),
    };
}

/**
 * Helper to create rate limit error response
 */
export function rateLimitExceededResponse(result: RateLimitResult): Response {
    return new Response(
        JSON.stringify({
            error: 'Too many requests',
            retryAfter: Math.ceil(result.resetIn / 1000),
        }),
        {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': String(Math.ceil(result.resetIn / 1000)),
                ...createRateLimitHeaders(result),
            },
        }
    );
}
