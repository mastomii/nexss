/**
 * Zod Validation Schemas for NeXSS API
 * 
 * Centralized input validation to prevent injection attacks
 * and ensure data integrity.
 */

import { z } from 'zod';

// ============================================
// COMMON SCHEMAS
// ============================================

// ULID format: 26 characters, base32
export const ulidSchema = z.string()
    .length(26, 'Invalid ID format')
    .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid ID format');

// Email validation
export const emailSchema = z.string()
    .email('Invalid email format')
    .max(255, 'Email too long');

// Username validation
export const usernameSchema = z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens');

// Password validation
export const passwordSchema = z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password too long');

// URL validation (lenient for XSS reporting)
export const urlSchema = z.string()
    .max(2000, 'URL too long')
    .optional();

// Safe text (no null bytes)
export const safeTextSchema = z.string()
    .transform(s => s.replace(/\0/g, ''));

// ============================================
// AUTH SCHEMAS
// ============================================

export const loginSchema = z.object({
    username: z.string().min(1, 'Username is required').max(50),
    password: z.string().min(1, 'Password is required').max(100),
    totpCode: z.string().length(6).regex(/^\d{6}$/).optional(),
});

export const totpSetupSchema = z.object({
    code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be numeric'),
});

export const totpVerifySchema = z.object({
    code: z.string()
        .min(6, 'Code required')
        .max(12, 'Code too long') // Allow backup codes up to 12 chars
        .regex(/^[A-Za-z0-9-]+$/, 'Invalid code format'),
});

// ============================================
// CALLBACK SCHEMAS (XSS Reports)
// ============================================

export const callbackDataSchema = z.object({
    uri: z.string().max(2000).optional(),
    origin: z.string().max(500).optional(),
    referer: z.string().max(2000).optional(),
    'user-agent': z.string().max(1000).optional(),
    ip: z.string().max(100).optional(),
    cookies: z.string().max(100000).optional(), // Cookies can be large
    dom: z.string().max(5000000).optional(), // DOM can be very large (5MB limit)
    screenshot: z.string().max(10000000).optional(), // Base64 screenshot (10MB limit)
    screenshot_error: z.string().max(500).optional(),
    localstorage: z.string().max(1000000).optional(),
    sessionstorage: z.string().max(1000000).optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.string().optional(),
    screenWidth: z.number().int().min(0).max(10000).optional(),
    screenHeight: z.number().int().min(0).max(10000).optional(),
}).passthrough(); // Allow additional fields

// ============================================
// PERSIST SCHEMAS (Persistent Sessions)
// ============================================

// Status enum with permissive handling - accepts any string value from payload
// Using z.string() instead of enum to be fully permissive for XSS payload variations
const persistStatusSchema = z.preprocess(
    (val) => {
        // Handle null, undefined, empty string, or non-string values
        if (val === null || val === undefined || val === '' || typeof val !== 'string') {
            return undefined;
        }
        // Accept any non-empty string status from payload
        return val;
    },
    z.string().max(50).optional()
);

export const persistRequestSchema = z.object({
    rid: ulidSchema,
    response: z.string().max(100000).optional().nullable(),
    encrypted: z.boolean().optional().nullable(),
    nocrypto: z.boolean().optional().nullable(),
    status: persistStatusSchema,
});

export const persistCommandSchema = z.object({
    command: z.string().max(50000), // JS command can be large
});

// ============================================
// TRAFFIC SCHEMAS (Intercepted Traffic)
// ============================================

export const trafficDataSchema = z.object({
    rid: ulidSchema,
    type: z.enum(['fetch', 'xhr', 'form', 'navigation']).optional().nullable(),
    method: z.string().max(10).optional().nullable(),
    url: z.string().max(4000).optional().nullable(),
    reqHeaders: z.string().max(50000).optional().nullable(),
    reqBody: z.string().max(100000).optional().nullable(),
    resHeaders: z.string().max(50000).optional().nullable(),
    resBody: z.string().max(100000).optional().nullable(),
    status: z.number().int().min(0).max(999).nullable().optional(),
    // Support encrypted traffic
    encrypted: z.boolean().optional(),
    data: z.string().max(500000).optional().nullable(), // Encrypted payload
});

// ============================================
// SETTINGS SCHEMAS
// ============================================

export const settingsUpdateSchema = z.object({
    app_name: z.string().min(1).max(100).optional(),
    app_tagline: z.string().max(200).optional(),
    timezone: z.string().max(50).optional(),
    screenshot_enabled: z.enum(['true', 'false']).optional(),
    persistent_enabled: z.enum(['true', 'false']).optional(),
    persistent_key: z.string()
        .refine(val => val === '' || val.length === 64, {
            message: 'Persistent key must be empty or 64 hex characters'
        })
        .refine(val => val === '' || /^[a-fA-F0-9]+$/.test(val), {
            message: 'Persistent key must be hex characters only'
        })
        .optional(),
    advanced_persistent_enabled: z.enum(['true', 'false']).optional(),
    telegram_enabled: z.enum(['true', 'false']).optional(),
    telegram_bot_token: z.string().max(100).optional(),
    telegram_chat_id: z.string().max(50).optional(),
    storage_type: z.enum(['local', 's3']).optional(),
    s3_endpoint: z.string().url().max(500).or(z.literal('')).optional(),
    s3_bucket: z.string().max(100).optional(),
    s3_region: z.string().max(50).optional(),
    s3_access_key: z.string().max(200).optional(),
    s3_secret_key: z.string().max(200).optional(),
    s3_public_url: z.string().url().max(500).or(z.literal('')).optional(),
});

// ============================================
// REPORTS SCHEMAS
// ============================================

export const reportIdSchema = z.object({
    id: ulidSchema,
});

export const bulkReportsSchema = z.object({
    ids: z.array(ulidSchema).min(1).max(100),
    action: z.enum(['delete', 'archive', 'unarchive', 'markRead', 'markUnread']),
});

// ============================================
// USER SCHEMAS
// ============================================

export const userUpdateSchema = z.object({
    username: usernameSchema.optional(),
    email: emailSchema.optional(),
    currentPassword: z.string().max(100).optional(),
    newPassword: passwordSchema.optional(),
}).refine(data => {
    // If changing password, both fields required
    if (data.newPassword && !data.currentPassword) {
        return false;
    }
    return true;
}, {
    message: 'Current password is required to set a new password',
});

// ============================================
// PAGINATION SCHEMAS
// ============================================

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    archived: z.enum(['true', 'false', 'all']).default('false'),
    search: z.string().max(200).optional(),
});

export const trafficPaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ============================================
// PATH ENUMERATION SCHEMAS
// ============================================

export const pathEnumConfigSchema = z.object({
    path: z.string()
        .min(1, 'Path is required')
        .max(2000, 'Path too long')
        .refine(val => val.startsWith('/'), 'Path must start with /'),
    description: z.string().max(500).optional().nullable(),
    active: z.boolean().optional(),
});

export const pathEnumResultSchema = z.object({
    rid: ulidSchema,
    results: z.array(z.object({
        path: z.string().max(2000),
        description: z.string().max(500).optional().nullable(),
        status: z.number().int().min(0).max(999).nullable().optional(),
        size: z.number().int().min(0).nullable().optional(),
        body: z.string().max(50000).optional().nullable(),
        headers: z.string().max(10000).optional().nullable(),
        error: z.string().max(1000).optional().nullable(),
    })).max(50), // Max 50 paths per request
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Safely parse and validate data with Zod schema
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidate<T>(
    schema: z.ZodSchema<T>,
    data: unknown
): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    // Format error message
    const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
    return { success: false, error: errors.join(', ') };
}

/**
 * Validate and throw if invalid (for use in try/catch)
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
}
