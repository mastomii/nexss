import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';
import { checkRateLimit, getClientIPFromRequest, rateLimitExceededResponse } from '@/lib/rate-limit';
import { pathEnumResultSchema, safeValidate } from '@/lib/validations';
import { PathEnumerationService } from '@/services';

function jsonResponse(data: unknown, status = 200) {
    return NextResponse.json(data, {
        status,
        headers: corsHeaders,
    });
}

// POST - Receive enumeration results from XSS payload
export async function POST(request: NextRequest) {
    try {
        // Rate limiting
        const clientIP = getClientIPFromRequest(request);
        const rateLimitResult = checkRateLimit(clientIP, 'callback');

        if (!rateLimitResult.allowed) {
            return rateLimitExceededResponse(rateLimitResult);
        }

        const body = await request.json();

        // Validate input
        const validation = safeValidate(pathEnumResultSchema, body);
        if (!validation.success) {
            console.warn('[PathEnum] Validation warning:', validation.error);
            return jsonResponse({ error: 'Invalid data' }, 400);
        }

        const { rid, results } = validation.data;

        // Save results
        const saveResult = await PathEnumerationService.saveResults(
            rid,
            results.map(r => ({
                path: r.path,
                description: r.description,
                status_code: r.status,
                response_size: r.size,
                response_body: r.body,
                response_headers: r.headers,
                error_message: r.error,
            }))
        );

        if (!saveResult.success) {
            return jsonResponse({ error: 'Failed to save results' }, 500);
        }

        return jsonResponse({ status: 'success', saved: saveResult.data.saved });
    } catch (error) {
        console.error('[PathEnum] Error:', error);
        return jsonResponse({ error: 'Internal server error' }, 500);
    }
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
    const headers: Record<string, string> = { ...corsHeaders };
    if (request.headers.get('Access-Control-Request-Private-Network')) {
        headers['Access-Control-Allow-Private-Network'] = 'true';
    }
    return new NextResponse(null, { status: 204, headers });
}
