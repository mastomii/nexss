import { Pool, PoolClient } from 'pg';
import { ulid } from 'ulid';

const globalForPg = global as unknown as { pool: Pool | undefined };

// Pool configuration from environment variables
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Pool size: default 20, configurable via DB_POOL_MAX
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  // How long a client is allowed to remain idle before being closed: default 30s
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
  // Maximum time to wait for connection: default 2s
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000', 10),
};

export const pool = globalForPg.pool ?? new Pool(poolConfig);

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pool = pool;
}

// Generate new ULID
export function generateId(): string {
  return ulid();
}

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// User types (ULID-based)
export interface User {
  id: string; // ULID
  username: string;
  email: string;
  password: string;
  rank: number;
  // 2FA fields
  totp_secret: string | null;
  totp_enabled: boolean;
  backup_codes: string | null;
  totp_verified_at: Date | null;
  // Timestamps
  created_at: Date;
  updated_at: Date;
}

export interface Report {
  id: string; // ULID
  uri: string | null;
  origin: string | null;
  referer: string | null;
  user_agent: string | null;
  ip: string | null;
  triggered_at: Date;
  archived: boolean;
  read: boolean;
  cookies: string | null;
}

export interface ReportData {
  id: string; // ULID
  report_id: string; // ULID
  dom: string | null;
  screenshot: string | null;
  screenshot_storage: string | null; // 'local', 's3', 'gcs', 'db'
  screenshot_error: string | null; // Error message if screenshot capture failed
  localstorage: string | null;
  sessionstorage: string | null;
  extra: Record<string, unknown> | null;
  compressed: boolean;
  created_at: Date;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: Date;
}

export interface PathEnumerationConfig {
  id: string;
  path: string;
  description: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PathEnumerationResult {
  id: string;
  report_id: string;
  path: string;
  description: string | null;
  status_code: number | null;
  response_size: number | null;
  response_body: string | null;
  response_headers: string | null;
  error_message: string | null;
  fetched_at: Date;
}
