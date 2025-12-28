import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, generateId, Setting } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { corsHeaders } from '@/lib/cors';
import crypto from 'crypto';

interface InterceptedTraffic {
    id: string;
    report_id: string;
    traffic_type: string;
    method: string | null;
    url: string | null;
    request_headers: string | null;
    request_body: string | null;
    response_headers: string | null;
    response_body: string | null;
    status_code: number | null;
    captured_at: string;
}

// AES-256-CBC decryption (matches client encryption)
function decryptAES(encrypted: string, key: string): string | null {
    try {
        const keyBuffer = Buffer.from(key, 'hex');
        const iv = Buffer.from(encrypted.substring(0, 32), 'hex');
        const encryptedData = Buffer.from(encrypted.substring(32), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    } catch {
        return null;
    }
}

async function getSetting(key: string, defaultValue: string): Promise<string> {
    try {
        const setting = await queryOne<Setting>(
            'SELECT value FROM settings WHERE key = $1',
            [key]
        );
        return setting?.value || defaultValue;
    } catch {
        return defaultValue;
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

// POST - Receive intercepted traffic from XSS payload (public, CORS enabled)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        let { rid, type, method, url, reqHeaders, reqBody, resHeaders, resBody, status, encrypted, data } = body;

        // Handle encrypted payload
        if (encrypted && data) {
            const persistentKey = await getSetting('persistent_key', '');
            if (persistentKey && persistentKey.length === 64) {
                const decrypted = decryptAES(data, persistentKey);
                if (decrypted) {
                    try {
                        const parsed = JSON.parse(decrypted);
                        type = parsed.type;
                        method = parsed.method;
                        url = parsed.url;
                        reqHeaders = parsed.reqHeaders;
                        reqBody = parsed.reqBody;
                        resHeaders = parsed.resHeaders;
                        resBody = parsed.resBody;
                        status = parsed.status;
                    } catch {
                        return NextResponse.json(
                            { error: 'Invalid encrypted payload' },
                            { status: 400, headers: corsHeaders }
                        );
                    }
                } else {
                    return NextResponse.json(
                        { error: 'Decryption failed' },
                        { status: 400, headers: corsHeaders }
                    );
                }
            }
        }

        if (!rid || !type) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Limit body sizes to prevent abuse (50KB each)
        const MAX_BODY_SIZE = 50 * 1024;
        const truncatedReqBody = reqBody ? String(reqBody).substring(0, MAX_BODY_SIZE) : null;
        const truncatedResBody = resBody ? String(resBody).substring(0, MAX_BODY_SIZE) : null;
        const truncatedReqHeaders = reqHeaders ? String(reqHeaders).substring(0, 10000) : null;
        const truncatedResHeaders = resHeaders ? String(resHeaders).substring(0, 10000) : null;

        await query(
            `INSERT INTO intercepted_traffic 
             (id, report_id, traffic_type, method, url, request_headers, request_body, response_headers, response_body, status_code)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                generateId(),
                rid,
                type,
                method || null,
                url ? String(url).substring(0, 2000) : null,
                truncatedReqHeaders,
                truncatedReqBody,
                truncatedResHeaders,
                truncatedResBody,
                status || null
            ]
        );

        return NextResponse.json({ ok: true }, { headers: corsHeaders });
    } catch (error) {
        console.error('[Traffic] Error:', error);
        return NextResponse.json(
            { error: 'Internal error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

// GET - Retrieve traffic for a report (authenticated)
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(request.url);
        const reportId = url.searchParams.get('report_id');

        if (!reportId) {
            return NextResponse.json({ error: 'Missing report_id' }, { status: 400 });
        }

        const traffic = await query<InterceptedTraffic>(
            `SELECT * FROM intercepted_traffic 
             WHERE report_id = $1 
             ORDER BY captured_at DESC 
             LIMIT 200`,
            [reportId]
        );

        // Get count for UI
        const countResult = await query<{ count: string }>(
            'SELECT COUNT(*) as count FROM intercepted_traffic WHERE report_id = $1',
            [reportId]
        );
        const totalCount = parseInt(countResult[0]?.count || '0', 10);

        return NextResponse.json({
            traffic,
            totalCount,
            hasMore: totalCount > 200
        });
    } catch (error) {
        console.error('[Traffic] GET error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
