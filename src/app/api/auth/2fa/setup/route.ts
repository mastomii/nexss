import { NextResponse } from 'next/server';
import { getSession, logAction } from '@/lib/auth';
import { query, queryOne, User } from '@/lib/db';
import { getClientIP } from '@/lib/utils';
import {
    generateSecret,
    generateOtpauthUri,
    generateQRCode,
    verifyToken,
    encryptSecret,
    generateBackupCodes,
    hashBackupCodes,
} from '@/lib/totp';
import { NextRequest } from 'next/server';

interface User2FA extends User {
    totp_secret: string | null;
    totp_enabled: boolean;
    backup_codes: string | null;
}

// GET - Initialize 2FA setup (generate secret and QR code)
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if 2FA is already enabled
        const user = await queryOne<User2FA>(
            'SELECT totp_enabled FROM users WHERE id = $1',
            [session.userId]
        );

        if (user?.totp_enabled) {
            return NextResponse.json(
                { error: '2FA is already enabled' },
                { status: 400 }
            );
        }

        // Generate new secret
        const secret = generateSecret();
        const otpauthUri = generateOtpauthUri(secret, session.username);
        const qrCode = await generateQRCode(otpauthUri);

        // Store the secret temporarily (encrypted) - not enabled yet
        const encryptedSecret = encryptSecret(secret);
        await query(
            'UPDATE users SET totp_secret = $1, updated_at = NOW() WHERE id = $2',
            [encryptedSecret, session.userId]
        );

        const ip = getClientIP(request);
        await logAction(session.userId, '2fa_setup_initiated', 'Started 2FA setup', ip);

        return NextResponse.json({
            secret, // Show secret for manual entry
            qrCode, // Base64 QR code image
            otpauthUri, // For advanced users
        });
    } catch (error) {
        console.error('[2FA Setup] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// POST - Verify and enable 2FA
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { token } = body;

        if (!token || token.length !== 6) {
            return NextResponse.json(
                { error: 'Invalid token format' },
                { status: 400 }
            );
        }

        // Get user's pending secret
        const user = await queryOne<User2FA>(
            'SELECT id, totp_secret, totp_enabled FROM users WHERE id = $1',
            [session.userId]
        );

        if (!user || !user.totp_secret) {
            return NextResponse.json(
                { error: 'No 2FA setup in progress' },
                { status: 400 }
            );
        }

        if (user.totp_enabled) {
            return NextResponse.json(
                { error: '2FA is already enabled' },
                { status: 400 }
            );
        }

        // Decrypt and verify the token
        const { decryptSecret } = await import('@/lib/totp');
        const secret = decryptSecret(user.totp_secret);
        const isValid = verifyToken(token, secret);

        if (!isValid) {
            const ip = getClientIP(request);
            await logAction(session.userId, '2fa_verify_failed', 'Invalid 2FA token during setup', ip);
            return NextResponse.json(
                { error: 'Invalid verification code' },
                { status: 400 }
            );
        }

        // Generate backup codes
        const backupCodes = generateBackupCodes(10);
        const hashedCodes = await hashBackupCodes(backupCodes);

        // Enable 2FA
        await query(
            `UPDATE users SET 
                totp_enabled = true, 
                backup_codes = $1,
                totp_verified_at = NOW(),
                updated_at = NOW() 
            WHERE id = $2`,
            [JSON.stringify(hashedCodes), session.userId]
        );

        const ip = getClientIP(request);
        await logAction(session.userId, '2fa_enabled', '2FA has been enabled', ip);

        return NextResponse.json({
            success: true,
            backupCodes, // Return plain backup codes (show once only!)
            message: '2FA enabled successfully. Save your backup codes!',
        });
    } catch (error) {
        console.error('[2FA Verify] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
