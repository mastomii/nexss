/**
 * Shared CORS headers for XSS listener endpoints
 * Must allow everything for blind XSS to work properly
 */
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Expose-Headers': '*',
} as const;

export type CorsHeaders = typeof corsHeaders;
