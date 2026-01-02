/**
 * Shared CORS headers for XSS listener endpoints
 * Must allow everything for blind XSS to work properly
 * 
 * Note: Access-Control-Allow-Credentials is set to 'false' because 
 * credentials cannot be used with wildcard origin per CORS spec.
 * XSS payloads don't need credentials - they send data via POST body.
 */
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Credentials': 'false', // Cannot use with wildcard origin
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Expose-Headers': '*',
} as const;

export type CorsHeaders = typeof corsHeaders;
