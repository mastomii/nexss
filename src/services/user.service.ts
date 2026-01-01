/**
 * User Service for NeXSS
 * 
 * Handles all user-related business logic:
 * - Profile management
 * - Password changes
 * - User settings
 */

import { query, queryOne, User } from '@/lib/db';
import bcrypt from 'bcrypt';
import {
    ServiceResult,
    success,
    Errors,
    createLogger,
    safeExecute,
} from './base.service';

const logger = createLogger('UserService');

// ============================================
// TYPES
// ============================================

export type SafeUser = Omit<User, 'password' | 'backup_codes'>;

export interface UserProfile {
    id: string;
    username: string;
    email: string;
    rank: number;
    totp_enabled: boolean;
    created_at: Date;
}

export interface UpdateProfileInput {
    email?: string;
    currentPassword?: string;
    newPassword?: string;
}

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<ServiceResult<UserProfile>> {
    return safeExecute('UserService', 'getUserById', async () => {
        const user = await queryOne<User>(
            'SELECT id, username, email, rank, totp_enabled, created_at FROM users WHERE id = $1',
            [id]
        );

        if (!user) {
            return Errors.notFound('User');
        }

        return success({
            id: user.id,
            username: user.username,
            email: user.email,
            rank: user.rank,
            totp_enabled: user.totp_enabled,
            created_at: user.created_at,
        });
    });
}

/**
 * Get user by username or email
 */
export async function getUserByCredential(
    credential: string
): Promise<ServiceResult<User | null>> {
    return safeExecute('UserService', 'getUserByCredential', async () => {
        const user = await queryOne<User>(
            'SELECT * FROM users WHERE username = $1 OR email = $1',
            [credential]
        );

        return success(user);
    });
}

// ============================================
// MUTATION OPERATIONS
// ============================================

/**
 * Update user email
 */
export async function updateEmail(
    userId: string,
    email: string
): Promise<ServiceResult<{ updated: boolean }>> {
    return safeExecute('UserService', 'updateEmail', async () => {
        // Check if email is already taken by another user
        const existingUser = await queryOne<User>(
            'SELECT id FROM users WHERE email = $1 AND id != $2',
            [email, userId]
        );

        if (existingUser) {
            return Errors.conflict('Email already in use');
        }

        await query(
            'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2',
            [email, userId]
        );

        logger.info('Email updated', { userId });
        return success({ updated: true });
    });
}

/**
 * Update user password
 */
export async function updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
): Promise<ServiceResult<{ updated: boolean }>> {
    return safeExecute('UserService', 'updatePassword', async () => {
        // Get current user with password
        const user = await queryOne<User>(
            'SELECT id, password FROM users WHERE id = $1',
            [userId]
        );

        if (!user) {
            return Errors.notFound('User');
        }

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return Errors.badRequest('Current password is incorrect');
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await query(
            'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
            [hashedPassword, userId]
        );

        logger.info('Password updated', { userId });
        return success({ updated: true });
    });
}

/**
 * Update user profile (combined operation)
 */
export async function updateProfile(
    userId: string,
    input: UpdateProfileInput
): Promise<ServiceResult<{ updated: boolean }>> {
    return safeExecute('UserService', 'updateProfile', async () => {
        // Update email if provided
        if (input.email) {
            const emailResult = await updateEmail(userId, input.email);
            if (!emailResult.success) {
                return emailResult;
            }
        }

        // Update password if provided
        if (input.newPassword) {
            if (!input.currentPassword) {
                return Errors.badRequest('Current password is required');
            }

            const passwordResult = await updatePassword(
                userId,
                input.currentPassword,
                input.newPassword
            );
            if (!passwordResult.success) {
                return passwordResult;
            }
        }

        return success({ updated: true });
    });
}

// ============================================
// 2FA OPERATIONS
// ============================================

/**
 * Enable 2FA for user
 */
export async function enable2FA(
    userId: string,
    totpSecret: string
): Promise<ServiceResult<{ enabled: boolean }>> {
    return safeExecute('UserService', 'enable2FA', async () => {
        await query(
            `UPDATE users SET 
                totp_secret = $1, 
                totp_enabled = TRUE, 
                totp_verified_at = NOW(),
                updated_at = NOW()
             WHERE id = $2`,
            [totpSecret, userId]
        );

        logger.info('2FA enabled', { userId });
        return success({ enabled: true });
    });
}

/**
 * Disable 2FA for user
 */
export async function disable2FA(
    userId: string
): Promise<ServiceResult<{ disabled: boolean }>> {
    return safeExecute('UserService', 'disable2FA', async () => {
        await query(
            `UPDATE users SET 
                totp_secret = NULL, 
                totp_enabled = FALSE, 
                totp_verified_at = NULL,
                backup_codes = NULL,
                updated_at = NOW()
             WHERE id = $1`,
            [userId]
        );

        logger.info('2FA disabled', { userId });
        return success({ disabled: true });
    });
}

/**
 * Save backup codes for user
 */
export async function saveBackupCodes(
    userId: string,
    codes: string[]
): Promise<ServiceResult<{ saved: boolean }>> {
    return safeExecute('UserService', 'saveBackupCodes', async () => {
        // Hash backup codes before storing
        const hashedCodes = await Promise.all(
            codes.map(code => bcrypt.hash(code, 10))
        );

        await query(
            'UPDATE users SET backup_codes = $1, updated_at = NOW() WHERE id = $2',
            [JSON.stringify(hashedCodes), userId]
        );

        return success({ saved: true });
    });
}

// ============================================
// SESSION OPERATIONS
// ============================================

export interface UserSession {
    id: string;
    user_id: string;
    ip_address: string | null;
    user_agent: string | null;
    expires_at: Date;
    created_at: Date;
}

/**
 * Get all active sessions for user
 */
export async function getSessions(userId: string): Promise<ServiceResult<UserSession[]>> {
    return safeExecute('UserService', 'getSessions', async () => {
        const sessions = await query<UserSession>(
            'SELECT id, user_id, ip_address, user_agent, expires_at, created_at FROM user_sessions WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC',
            [userId]
        );

        return success(sessions);
    });
}

/**
 * Revoke a specific session
 */
export async function revokeSession(
    userId: string,
    sessionId: string
): Promise<ServiceResult<{ revoked: boolean }>> {
    return safeExecute('UserService', 'revokeSession', async () => {
        await query(
            'DELETE FROM user_sessions WHERE id = $1 AND user_id = $2',
            [sessionId, userId]
        );

        logger.info('Session revoked', { userId, sessionId });
        return success({ revoked: true });
    });
}

/**
 * Revoke all sessions for user (except current)
 */
export async function revokeAllSessions(
    userId: string,
    currentToken?: string
): Promise<ServiceResult<{ revoked: number }>> {
    return safeExecute('UserService', 'revokeAllSessions', async () => {
        let result;
        
        if (currentToken) {
            result = await query(
                'DELETE FROM user_sessions WHERE user_id = $1 AND token != $2',
                [userId, currentToken]
            );
        } else {
            result = await query(
                'DELETE FROM user_sessions WHERE user_id = $1',
                [userId]
            );
        }

        // PostgreSQL returns rowCount from the query
        const deletedCount = (result as unknown as { length: number }).length || 0;
        
        logger.info('All sessions revoked', { userId, count: deletedCount });
        return success({ revoked: deletedCount });
    });
}
