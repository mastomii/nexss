import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import { query, queryOne, User, generateId } from './db';

// SECURITY: JWT_SECRET must be set in production
function getJWTSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET environment variable is required in production');
        }
        console.warn('[SECURITY WARNING] JWT_SECRET not set. Using insecure fallback for development only.');
        return new TextEncoder().encode('dev-only-insecure-secret-do-not-use-in-production');
    }
    if (secret.length < 32) {
        console.warn('[SECURITY WARNING] JWT_SECRET should be at least 32 characters for adequate security.');
    }
    return new TextEncoder().encode(secret);
}

const JWT_SECRET = getJWTSecret();

const COOKIE_NAME = 'nexss_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface JWTPayload {
    userId: string; // ULID
    username: string;
    rank: number;
    exp?: number;
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

export async function verifyPassword(
    password: string,
    hash: string
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export async function createToken(payload: Omit<JWTPayload, 'exp'>): Promise<string> {
    return new SignJWT(payload as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('7d')
        .setIssuedAt()
        .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return payload as unknown as JWTPayload;
    } catch {
        return null;
    }
}

export interface LoginResult {
    token?: string;
    user: Omit<User, 'password'>;
    requires2FA?: boolean;
    userId?: string;
}

export async function login(
    username: string,
    password: string,
    ip?: string,
    userAgent?: string
): Promise<LoginResult | null> {
    const user = await queryOne<User>(
        'SELECT * FROM users WHERE username = $1 OR email = $1',
        [username]
    );

    if (!user) {
        return null;
    }

    const validPassword = await verifyPassword(password, user.password);
    if (!validPassword) {
        return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userWithoutPassword } = user;

    // Check if 2FA is enabled
    if (user.totp_enabled) {
        // Return partial result - requires 2FA verification
        return {
            user: userWithoutPassword,
            requires2FA: true,
            userId: user.id,
        };
    }

    const token = await createToken({
        userId: user.id,
        username: user.username,
        rank: user.rank,
    });

    // Store session in database with ULID (use ON CONFLICT to handle duplicate requests)
    const sessionId = generateId();
    const expiresAt = new Date(Date.now() + SESSION_DURATION);
    await query(
        `INSERT INTO user_sessions (id, user_id, token, ip_address, user_agent, expires_at) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (token) DO UPDATE SET 
            ip_address = EXCLUDED.ip_address,
            user_agent = EXCLUDED.user_agent,
            expires_at = EXCLUDED.expires_at`,
        [sessionId, user.id, token, ip || null, userAgent || null, expiresAt]
    );

    return { token, user: userWithoutPassword };
}

export async function logout(token: string): Promise<void> {
    await query('DELETE FROM user_sessions WHERE token = $1', [token]);
}

export async function getSession(): Promise<JWTPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
        return null;
    }

    // Verify token
    const payload = await verifyToken(token);
    if (!payload) {
        return null;
    }

    // Check if session exists in database and is not expired
    const session = await queryOne<{ id: string }>(
        'SELECT id FROM user_sessions WHERE token = $1 AND expires_at > NOW()',
        [token]
    );

    if (!session) {
        return null;
    }

    return payload;
}

export async function requireAuth(): Promise<JWTPayload> {
    const session = await getSession();
    if (!session) {
        throw new Error('Unauthorized');
    }
    return session;
}

export async function requireAdmin(): Promise<JWTPayload> {
    const session = await requireAuth();
    if (session.rank < 3) {
        throw new Error('Forbidden: Admin access required');
    }
    return session;
}

export async function getCurrentUser(): Promise<Omit<User, 'password'> | null> {
    const session = await getSession();
    if (!session) {
        return null;
    }

    const user = await queryOne<User>(
        'SELECT * FROM users WHERE id = $1',
        [session.userId]
    );

    if (!user) {
        return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
}

// Log user action
export async function logAction(
    userId: string | null,
    action: string,
    details?: string,
    ip?: string
): Promise<void> {
    const logId = generateId();
    await query(
        'INSERT INTO logs (id, user_id, action, details, ip) VALUES ($1, $2, $3, $4, $5)',
        [logId, userId, action, details || null, ip || null]
    );
}
