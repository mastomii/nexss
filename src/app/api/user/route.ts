import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, User } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { validateCSRF } from '@/lib/csrf';
import bcrypt from 'bcrypt';

// GET - Get current user profile
export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await queryOne<User>(
            'SELECT id, username, email, rank, totp_enabled, created_at FROM users WHERE id = $1',
            [session.userId]
        );

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ user });
    } catch (error) {
        console.error('[User] Get error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT - Update user profile (email/password)
export async function PUT(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        
        // CSRF validation for sensitive profile changes
        const csrfError = validateCSRF(request, body);
        if (csrfError) return csrfError;
        
        const { email, currentPassword, newPassword } = body;

        // Get current user
        const user = await queryOne<User>(
            'SELECT id, password FROM users WHERE id = $1',
            [session.userId]
        );

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Update email if provided
        if (email) {
            // Check if email is already taken by another user
            const existingUser = await queryOne<User>(
                'SELECT id FROM users WHERE email = $1 AND id != $2',
                [email, session.userId]
            );

            if (existingUser) {
                return NextResponse.json({ error: 'Email already in use' }, { status: 400 });
            }

            await query(
                'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2',
                [email, session.userId]
            );
        }

        // Update password if provided
        if (newPassword) {
            if (!currentPassword) {
                return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
            }

            // Verify current password
            const validPassword = await bcrypt.compare(currentPassword, user.password);
            if (!validPassword) {
                return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            await query(
                'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
                [hashedPassword, session.userId]
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[User] Update error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
