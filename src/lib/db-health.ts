/**
 * Database Health Check Utility
 * Checks database connection and schema compatibility
 */

import { Pool } from 'pg';

export interface TableSchema {
    name: string;
    columns: ColumnSchema[];
    indexes?: string[];
}

export interface ColumnSchema {
    name: string;
    type: string;
    nullable?: boolean;
    defaultValue?: string;
}

export interface HealthCheckResult {
    status: 'ok' | 'no_connection' | 'no_database_url' | 'schema_mismatch' | 'empty_database';
    message: string;
    details?: {
        missingTables?: string[];
        missingColumns?: { table: string; columns: string[] }[];
        typeMismatch?: { table: string; column: string; expected: string; actual: string }[];
        missingIndexes?: string[];
        connectionError?: string;
    };
}

// Expected database schema based on init.sql
const EXPECTED_SCHEMA: TableSchema[] = [
    {
        name: 'users',
        columns: [
            { name: 'id', type: 'character varying' },
            { name: 'username', type: 'character varying' },
            { name: 'email', type: 'character varying' },
            { name: 'password', type: 'character varying' },
            { name: 'rank', type: 'integer' },
            { name: 'totp_secret', type: 'character varying' },
            { name: 'totp_enabled', type: 'boolean' },
            { name: 'backup_codes', type: 'text' },
            { name: 'totp_verified_at', type: 'timestamp with time zone' },
            { name: 'created_at', type: 'timestamp with time zone' },
            { name: 'updated_at', type: 'timestamp with time zone' },
        ],
    },
    {
        name: 'user_sessions',
        columns: [
            { name: 'id', type: 'character varying' },
            { name: 'user_id', type: 'character varying' },
            { name: 'token', type: 'character varying' },
            { name: 'ip_address', type: 'character varying' },
            { name: 'user_agent', type: 'character varying' },
            { name: 'expires_at', type: 'timestamp with time zone' },
            { name: 'created_at', type: 'timestamp with time zone' },
        ],
    },
    {
        name: 'reports',
        columns: [
            { name: 'id', type: 'character varying' },
            { name: 'uri', type: 'character varying' },
            { name: 'origin', type: 'character varying' },
            { name: 'referer', type: 'character varying' },
            { name: 'user_agent', type: 'character varying' },
            { name: 'ip', type: 'character varying' },
            { name: 'cookies', type: 'text' },
            { name: 'triggered_at', type: 'timestamp with time zone' },
            { name: 'archived', type: 'boolean' },
            { name: 'read', type: 'boolean' },
        ],
    },
    {
        name: 'reports_data',
        columns: [
            { name: 'id', type: 'character varying' },
            { name: 'report_id', type: 'character varying' },
            { name: 'dom', type: 'text' },
            { name: 'screenshot', type: 'text' },
            { name: 'screenshot_storage', type: 'character varying' },
            { name: 'screenshot_error', type: 'text' },
            { name: 'localstorage', type: 'text' },
            { name: 'sessionstorage', type: 'text' },
            { name: 'extra', type: 'jsonb' },
            { name: 'compressed', type: 'boolean' },
            { name: 'created_at', type: 'timestamp with time zone' },
        ],
    },
    {
        name: 'settings',
        columns: [
            { name: 'key', type: 'character varying' },
            { name: 'value', type: 'text' },
            { name: 'updated_at', type: 'timestamp with time zone' },
        ],
    },
    {
        name: 'logs',
        columns: [
            { name: 'id', type: 'character varying' },
            { name: 'user_id', type: 'character varying' },
            { name: 'action', type: 'character varying' },
            { name: 'details', type: 'text' },
            { name: 'ip', type: 'character varying' },
            { name: 'created_at', type: 'timestamp with time zone' },
        ],
    },
    {
        name: 'persistent_sessions',
        columns: [
            { name: 'id', type: 'character varying' },
            { name: 'report_id', type: 'character varying' },
            { name: 'last_seen', type: 'timestamp with time zone' },
            { name: 'pending_command', type: 'text' },
            { name: 'last_response', type: 'text' },
            { name: 'last_response_at', type: 'timestamp with time zone' },
            { name: 'session_status', type: 'character varying' },
            { name: 'created_at', type: 'timestamp with time zone' },
        ],
    },
    {
        name: 'intercepted_traffic',
        columns: [
            { name: 'id', type: 'character varying' },
            { name: 'report_id', type: 'character varying' },
            { name: 'traffic_type', type: 'character varying' },
            { name: 'method', type: 'character varying' },
            { name: 'url', type: 'text' },
            { name: 'request_headers', type: 'text' },
            { name: 'request_body', type: 'text' },
            { name: 'response_headers', type: 'text' },
            { name: 'response_body', type: 'text' },
            { name: 'status_code', type: 'integer' },
            { name: 'captured_at', type: 'timestamp with time zone' },
        ],
        indexes: [
            'idx_intercepted_traffic_report_id',
            'idx_intercepted_traffic_captured_at',
            'idx_intercepted_traffic_report_captured', // Composite index for pagination
        ],
    },
    {
        name: 'path_enumeration_config',
        columns: [
            { name: 'id', type: 'character varying' },
            { name: 'path', type: 'character varying' },
            { name: 'description', type: 'character varying' },
            { name: 'active', type: 'boolean' },
            { name: 'created_at', type: 'timestamp with time zone' },
            { name: 'updated_at', type: 'timestamp with time zone' },
        ],
        indexes: [
            'idx_path_enum_config_active',
        ],
    },
    {
        name: 'path_enumeration_results',
        columns: [
            { name: 'id', type: 'character varying' },
            { name: 'report_id', type: 'character varying' },
            { name: 'path', type: 'character varying' },
            { name: 'description', type: 'character varying' },
            { name: 'status_code', type: 'integer' },
            { name: 'response_size', type: 'integer' },
            { name: 'response_body', type: 'text' },
            { name: 'response_headers', type: 'text' },
            { name: 'error_message', type: 'text' },
            { name: 'fetched_at', type: 'timestamp with time zone' },
        ],
        indexes: [
            'idx_path_enum_results_report_id',
        ],
    },
];

/**
 * Check if DATABASE_URL is configured
 */
export function isDatabaseUrlConfigured(): boolean {
    const dbUrl = process.env.DATABASE_URL;
    return !!(dbUrl && dbUrl.trim() !== '');
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!isDatabaseUrlConfigured()) {
        return { success: false, error: 'DATABASE_URL is not configured' };
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
    });

    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        await pool.end();
        return { success: true };
    } catch (error) {
        await pool.end();
        const err = error as Error;
        return { success: false, error: err.message };
    }
}

/**
 * Get existing tables in the database
 */
export async function getExistingTables(): Promise<string[]> {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
    });

    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        `);
        client.release();
        await pool.end();
        return result.rows.map((row: { table_name: string }) => row.table_name);
    } catch (error) {
        await pool.end();
        throw error;
    }
}

/**
 * Get columns for a specific table
 */
export async function getTableColumns(tableName: string): Promise<{ name: string; type: string }[]> {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
    });

    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = $1
        `, [tableName]);
        client.release();
        await pool.end();
        return result.rows.map((row: { column_name: string; data_type: string }) => ({
            name: row.column_name,
            type: row.data_type,
        }));
    } catch (error) {
        await pool.end();
        throw error;
    }
}

/**
 * Get existing indexes in the database
 */
export async function getExistingIndexes(): Promise<string[]> {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
    });

    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT indexname 
            FROM pg_indexes 
            WHERE schemaname = 'public'
        `);
        client.release();
        await pool.end();
        return result.rows.map((row: { indexname: string }) => row.indexname);
    } catch (error) {
        await pool.end();
        throw error;
    }
}

/**
 * Comprehensive health check
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
    // Check 1: DATABASE_URL configured?
    if (!isDatabaseUrlConfigured()) {
        return {
            status: 'no_database_url',
            message: 'DATABASE_URL environment variable is not configured. Please set it to connect to your PostgreSQL database.',
        };
    }

    // Check 2: Can we connect?
    const connectionTest = await testConnection();
    if (!connectionTest.success) {
        return {
            status: 'no_connection',
            message: 'Cannot connect to the database. Please check your DATABASE_URL configuration.',
            details: {
                connectionError: connectionTest.error,
            },
        };
    }

    // Check 3: Check tables exist
    try {
        const existingTables = await getExistingTables();
        const expectedTableNames = EXPECTED_SCHEMA.map(t => t.name);
        const missingTables = expectedTableNames.filter(t => !existingTables.includes(t));

        if (missingTables.length === expectedTableNames.length) {
            return {
                status: 'empty_database',
                message: 'The database is empty. Click "Initialize Database" to create the required tables.',
                details: {
                    missingTables,
                },
            };
        }

        // Check 4: Check columns for existing tables
        const missingColumns: { table: string; columns: string[] }[] = [];
        const typeMismatch: { table: string; column: string; expected: string; actual: string }[] = [];

        for (const tableSchema of EXPECTED_SCHEMA) {
            if (existingTables.includes(tableSchema.name)) {
                const existingColumns = await getTableColumns(tableSchema.name);
                const existingColumnMap = new Map(existingColumns.map(c => [c.name, c.type]));
                const expectedColumnNames = tableSchema.columns.map(c => c.name);
                const missing = expectedColumnNames.filter(c => !existingColumnMap.has(c));

                if (missing.length > 0) {
                    missingColumns.push({ table: tableSchema.name, columns: missing });
                }

                // Check for type mismatches
                for (const expectedCol of tableSchema.columns) {
                    const actualType = existingColumnMap.get(expectedCol.name);
                    if (actualType && actualType !== expectedCol.type) {
                        typeMismatch.push({
                            table: tableSchema.name,
                            column: expectedCol.name,
                            expected: expectedCol.type,
                            actual: actualType,
                        });
                    }
                }
            }
        }

        // Check 5: Check indexes
        const existingIndexes = await getExistingIndexes();
        const expectedIndexes: string[] = [];
        for (const tableSchema of EXPECTED_SCHEMA) {
            if (tableSchema.indexes) {
                expectedIndexes.push(...tableSchema.indexes);
            }
        }
        const missingIndexes = expectedIndexes.filter(idx => !existingIndexes.includes(idx));

        if (missingTables.length > 0 || missingColumns.length > 0 || typeMismatch.length > 0 || missingIndexes.length > 0) {
            return {
                status: 'schema_mismatch',
                message: 'Database schema is incomplete or has type mismatches. Click "Sync Database" to fix.',
                details: {
                    missingTables: missingTables.length > 0 ? missingTables : undefined,
                    missingColumns: missingColumns.length > 0 ? missingColumns : undefined,
                    typeMismatch: typeMismatch.length > 0 ? typeMismatch : undefined,
                    missingIndexes: missingIndexes.length > 0 ? missingIndexes : undefined,
                },
            };
        }

        return {
            status: 'ok',
            message: 'Database is properly configured and schema is up to date.',
        };
    } catch (error) {
        const err = error as Error;
        return {
            status: 'no_connection',
            message: 'Error checking database schema.',
            details: {
                connectionError: err.message,
            },
        };
    }
}

/**
 * Get the expected schema (for display purposes)
 */
export function getExpectedSchema(): TableSchema[] {
    return EXPECTED_SCHEMA;
}
