import { NextRequest, NextResponse } from 'next/server';
import { createToken, logAction } from '@/lib/auth';
import { query, queryOne, User, generateId } from '@/lib/db';
import { getClientIP } from '@/lib/utils';
import { verifyToken, decryptSecret, verifyBackupCode } from '@/lib/totp';
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rate-limit';

interface User2FA extends User {
    totp_secret: string | null;
    totp_enabled: boolean;
    backup_codes: string | null;
}

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// POST - Verify 2FA during login
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, token, isBackupCode } = body;

        if (!userId || !token) {
            return NextResponse.json(
                { error: 'User ID and token are required' },
                { status: 400 }
            );
        }

        // Rate limit per userId to prevent brute-force on 6-digit TOTP codes
        // Use strict limit: 5 attempts per 5 minutes per user
        const rateLimitResult = checkRateLimit(`2fa:${userId}`, 'default');
        if (!rateLimitResult.allowed) {
            return rateLimitExceededResponse(rateLimitResult);
        }

        // Get user with 2FA data
        const user = await queryOne<User2FA>(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );

        if (!user || !user.totp_enabled || !user.totp_secret) {
            return NextResponse.json(
                { error: 'Invalid request' },
                { status: 400 }
            );
        }

        const ip = getClientIP(request);
        const userAgent = request.headers.get('user-agent') || '';
        let isValid = false;

        if (isBackupCode) {
            // Verify backup code
            if (!user.backup_codes) {
                return NextResponse.json(
                    { error: 'No backup codes available' },
                    { status: 400 }
                );
            }

            const hashedCodes: string[] = JSON.parse(user.backup_codes);
            const result = await verifyBackupCode(token, hashedCodes);

            if (result.valid) {
                isValid = true;
                // Remove used backup code
                hashedCodes.splice(result.index, 1);
                await query(
                    'UPDATE users SET backup_codes = $1, updated_at = NOW() WHERE id = $2',
                    [JSON.stringify(hashedCodes), userId]
                );
                await logAction(userId, '2fa_backup_code_used', `Backup code used. ${hashedCodes.length} remaining.`, ip);
            }
        } else {
            // Verify TOTP token
            const secret = decryptSecret(user.totp_secret);
            isValid = verifyToken(token, secret);
        }

        if (!isValid) {
            await logAction(userId, '2fa_verify_failed', 'Invalid 2FA code during login', ip);
            return NextResponse.json(
                { error: 'Invalid verification code' },
                { status: 401 }
            );
        }

        // Create session token
        const jwtToken = await createToken({
            userId: user.id,
            username: user.username,
            rank: user.rank,
        });

        // Store session in database (use ON CONFLICT to handle duplicate requests)
        const sessionId = generateId();
        const expiresAt = new Date(Date.now() + SESSION_DURATION);
        await query(
            `INSERT INTO user_sessions (id, user_id, token, ip_address, user_agent, expires_at) 
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (token) DO UPDATE SET 
                ip_address = EXCLUDED.ip_address,
                user_agent = EXCLUDED.user_agent,
                expires_at = EXCLUDED.expires_at`,
            [sessionId, user.id, jwtToken, ip, userAgent, expiresAt]
        );

        await logAction(userId, 'login_2fa', 'User logged in with 2FA', ip);

        // Create response with cookie
        const response = NextResponse.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                rank: user.rank,
            },
        });

        // Set HTTP-only cookie for session
        response.cookies.set('nexss_session', jwtToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60, // 7 days
            path: '/',
        });

        return response;
    } catch (error) {
        console.error('[2FA Login Verify] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
