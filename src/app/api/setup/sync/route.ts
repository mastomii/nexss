import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { isDatabaseUrlConfigured, checkDatabaseHealth, getExpectedSchema } from '@/lib/db-health';

export const dynamic = 'force-dynamic';

// SQL statements for creating tables
const CREATE_STATEMENTS = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(26) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    rank INTEGER NOT NULL DEFAULT 1,
    totp_secret VARCHAR(255),
    totp_enabled BOOLEAN DEFAULT FALSE,
    backup_codes TEXT,
    totp_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(26) PRIMARY KEY,
    user_id VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL UNIQUE,
    ip_address VARCHAR(50),
    user_agent VARCHAR(500),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(26) PRIMARY KEY,
    uri VARCHAR(2000),
    origin VARCHAR(500),
    referer VARCHAR(2000),
    user_agent VARCHAR(1000),
    ip VARCHAR(100),
    cookies TEXT,
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    archived BOOLEAN DEFAULT FALSE,
    read BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_reports_archived ON reports(archived);
CREATE INDEX IF NOT EXISTS idx_reports_triggered_at ON reports(triggered_at);

-- Reports data table
CREATE TABLE IF NOT EXISTS reports_data (
    id VARCHAR(26) PRIMARY KEY,
    report_id VARCHAR(26) NOT NULL REFERENCES reports(id) ON DELETE CASCADE UNIQUE,
    dom TEXT,
    screenshot TEXT,
    screenshot_storage VARCHAR(20) DEFAULT NULL,
    localstorage TEXT,
    sessionstorage TEXT,
    extra JSONB,
    compressed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_data_report_id ON reports_data(report_id);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Logs table
CREATE TABLE IF NOT EXISTS logs (
    id VARCHAR(26) PRIMARY KEY,
    user_id VARCHAR(26) REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    details TEXT,
    ip VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);

-- Persistent sessions table
CREATE TABLE IF NOT EXISTS persistent_sessions (
    id VARCHAR(26) PRIMARY KEY,
    report_id VARCHAR(26) NOT NULL REFERENCES reports(id) ON DELETE CASCADE UNIQUE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    pending_command TEXT,
    last_response TEXT,
    last_response_at TIMESTAMP WITH TIME ZONE,
    session_status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_persistent_sessions_report_id ON persistent_sessions(report_id);
CREATE INDEX IF NOT EXISTS idx_persistent_sessions_last_seen ON persistent_sessions(last_seen);
CREATE INDEX IF NOT EXISTS idx_persistent_sessions_last_response_at ON persistent_sessions(last_response_at);

-- Intercepted traffic table (Traffic Interception Mode)
CREATE TABLE IF NOT EXISTS intercepted_traffic (
    id VARCHAR(26) PRIMARY KEY,
    report_id VARCHAR(26) NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    traffic_type VARCHAR(20) NOT NULL,
    method VARCHAR(10),
    url TEXT,
    request_headers TEXT,
    request_body TEXT,
    response_headers TEXT,
    response_body TEXT,
    status_code INTEGER,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Individual indexes for general queries
CREATE INDEX IF NOT EXISTS idx_intercepted_traffic_report_id ON intercepted_traffic(report_id);
CREATE INDEX IF NOT EXISTS idx_intercepted_traffic_captured_at ON intercepted_traffic(captured_at);
-- Composite index for efficient pagination queries: WHERE report_id = ? ORDER BY captured_at
CREATE INDEX IF NOT EXISTS idx_intercepted_traffic_report_captured ON intercepted_traffic(report_id, captured_at DESC);

-- Update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop and recreate trigger (safer for idempotency)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

// Default admin user (password: admin123)
const INSERT_DEFAULT_ADMIN = `
INSERT INTO users (id, username, email, password, rank) 
VALUES ('01JFRX0000ADMIN00000001', 'admin', 'admin@nexss.local', '$2b$10$8sysysdnKa1.MOl3FiMxP.Pw7ZvUiG4tOSBHeiOaIy1YIgwRcCYOu', 3)
ON CONFLICT (id) DO NOTHING;
`;

// Default settings
const INSERT_DEFAULT_SETTINGS = `
INSERT INTO settings (key, value) VALUES 
('app_name', 'NeXSS'),
('app_tagline', 'Lightweight Blind XSS Listener'),
('timezone', 'UTC'),
('persistent_enabled', 'false'),
('persistent_key', ''),
('advanced_persistent_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
`;

// Column definitions for ALTER TABLE statements
const COLUMN_DEFINITIONS: Record<string, Record<string, string>> = {
    users: {
        id: 'VARCHAR(26) PRIMARY KEY',
        username: 'VARCHAR(50) NOT NULL',
        email: 'VARCHAR(255) NOT NULL',
        password: 'VARCHAR(255) NOT NULL',
        rank: 'INTEGER NOT NULL DEFAULT 1',
        totp_secret: 'VARCHAR(255)',
        totp_enabled: 'BOOLEAN DEFAULT FALSE',
        backup_codes: 'TEXT',
        totp_verified_at: 'TIMESTAMP WITH TIME ZONE',
        created_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
    },
    user_sessions: {
        id: 'VARCHAR(26) PRIMARY KEY',
        user_id: 'VARCHAR(26)',
        token: 'VARCHAR(500) NOT NULL',
        ip_address: 'VARCHAR(50)',
        user_agent: 'VARCHAR(500)',
        expires_at: 'TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP',
        created_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
    },
    reports: {
        id: 'VARCHAR(26) PRIMARY KEY',
        uri: 'VARCHAR(2000)',
        origin: 'VARCHAR(500)',
        referer: 'VARCHAR(2000)',
        user_agent: 'VARCHAR(1000)',
        ip: 'VARCHAR(100)',
        cookies: 'TEXT',
        triggered_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
        archived: 'BOOLEAN DEFAULT FALSE',
        read: 'BOOLEAN DEFAULT FALSE',
    },
    reports_data: {
        id: 'VARCHAR(26) PRIMARY KEY',
        report_id: 'VARCHAR(26)',
        dom: 'TEXT',
        screenshot: 'TEXT',
        screenshot_storage: 'VARCHAR(20) DEFAULT NULL',
        screenshot_error: 'TEXT',
        localstorage: 'TEXT',
        sessionstorage: 'TEXT',
        extra: 'JSONB',
        compressed: 'BOOLEAN DEFAULT FALSE',
        created_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
    },
    settings: {
        key: 'VARCHAR(100) PRIMARY KEY',
        value: 'TEXT NOT NULL',
        updated_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
    },
    logs: {
        id: 'VARCHAR(26) PRIMARY KEY',
        user_id: 'VARCHAR(26)',
        action: 'VARCHAR(255) NOT NULL',
        details: 'TEXT',
        ip: 'VARCHAR(100)',
        created_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
    },
    persistent_sessions: {
        id: 'VARCHAR(26) PRIMARY KEY',
        report_id: 'VARCHAR(26)',
        last_seen: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
        pending_command: 'TEXT',
        last_response: 'TEXT',
        last_response_at: 'TIMESTAMP WITH TIME ZONE',
        session_status: 'VARCHAR(50) DEFAULT \'active\'',
        created_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
    },
    intercepted_traffic: {
        id: 'VARCHAR(26) PRIMARY KEY',
        report_id: 'VARCHAR(26)',
        traffic_type: 'VARCHAR(20) NOT NULL',
        method: 'VARCHAR(10)',
        url: 'TEXT',
        request_headers: 'TEXT',
        request_body: 'TEXT',
        response_headers: 'TEXT',
        response_body: 'TEXT',
        status_code: 'INTEGER',
        captured_at: 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP',
    },
};

// Index definitions for creating missing indexes
const INDEX_DEFINITIONS: Record<string, string> = {
    // User sessions indexes
    idx_user_sessions_token: 'CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token)',
    idx_user_sessions_user_id: 'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
    // Reports indexes
    idx_reports_archived: 'CREATE INDEX IF NOT EXISTS idx_reports_archived ON reports(archived)',
    idx_reports_triggered_at: 'CREATE INDEX IF NOT EXISTS idx_reports_triggered_at ON reports(triggered_at)',
    // Reports data indexes
    idx_reports_data_report_id: 'CREATE INDEX IF NOT EXISTS idx_reports_data_report_id ON reports_data(report_id)',
    // Logs indexes
    idx_logs_user_id: 'CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id)',
    idx_logs_created_at: 'CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)',
    // Persistent sessions indexes
    idx_persistent_sessions_report_id: 'CREATE INDEX IF NOT EXISTS idx_persistent_sessions_report_id ON persistent_sessions(report_id)',
    idx_persistent_sessions_last_seen: 'CREATE INDEX IF NOT EXISTS idx_persistent_sessions_last_seen ON persistent_sessions(last_seen)',
    idx_persistent_sessions_last_response_at: 'CREATE INDEX IF NOT EXISTS idx_persistent_sessions_last_response_at ON persistent_sessions(last_response_at)',
    // Intercepted traffic indexes
    idx_intercepted_traffic_report_id: 'CREATE INDEX IF NOT EXISTS idx_intercepted_traffic_report_id ON intercepted_traffic(report_id)',
    idx_intercepted_traffic_captured_at: 'CREATE INDEX IF NOT EXISTS idx_intercepted_traffic_captured_at ON intercepted_traffic(captured_at)',
    idx_intercepted_traffic_report_captured: 'CREATE INDEX IF NOT EXISTS idx_intercepted_traffic_report_captured ON intercepted_traffic(report_id, captured_at DESC)',
};

export async function POST() {
    // Check if DATABASE_URL is configured
    if (!isDatabaseUrlConfigured()) {
        return NextResponse.json({
            success: false,
            message: 'DATABASE_URL is not configured',
        }, { status: 400 });
    }

    // First check if there's actually an issue to fix
    const preCheckHealth = await checkDatabaseHealth();

    // If database is already OK, reject the request
    if (preCheckHealth.status === 'ok') {
        return NextResponse.json({
            success: false,
            message: 'Database is already configured properly. No sync needed.',
        }, { status: 403 });
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
    });

    try {
        const client = await pool.connect();

        try {
            // Use the pre-checked health status
            const health = preCheckHealth;

            // This check is redundant now but kept for safety
            if (health.status === 'ok') {
                client.release();
                return NextResponse.json({
                    success: false,
                    message: 'Database is already up to date',
                }, { status: 403 });
            }

            if (health.status === 'no_connection' || health.status === 'no_database_url') {
                client.release();
                return NextResponse.json({
                    success: false,
                    message: health.message,
                }, { status: 400 });
            }

            // Start transaction
            await client.query('BEGIN');

            // For empty database or missing tables - run full create statements
            if (health.status === 'empty_database' || (health.details?.missingTables && health.details.missingTables.length > 0)) {
                await client.query(CREATE_STATEMENTS);
            }

            // Add missing columns if any
            if (health.details?.missingColumns && health.details.missingColumns.length > 0) {
                for (const item of health.details.missingColumns) {
                    for (const column of item.columns) {
                        const definition = COLUMN_DEFINITIONS[item.table]?.[column];
                        if (definition) {
                            // Extract just the type and default from definition (remove PRIMARY KEY, NOT NULL for ALTER)
                            const simpleDefinition = definition
                                .replace('PRIMARY KEY', '')
                                .replace('NOT NULL', '')
                                .trim();

                            try {
                                await client.query(`ALTER TABLE ${item.table} ADD COLUMN IF NOT EXISTS ${column} ${simpleDefinition}`);
                            } catch (err) {
                                console.error(`[Sync] Failed to add column ${column} to ${item.table}:`, err);
                            }
                        }
                    }
                }
            }

            // Fix type mismatches if any
            if (health.details?.typeMismatch && health.details.typeMismatch.length > 0) {
                for (const mismatch of health.details.typeMismatch) {
                    const definition = COLUMN_DEFINITIONS[mismatch.table]?.[mismatch.column];
                    if (definition) {
                        // Extract just the type (TEXT, VARCHAR, etc.)
                        const typeMatch = definition.match(/^(\w+(\s+\w+)*)/);
                        const targetType = typeMatch ? typeMatch[1] : definition.split(' ')[0];

                        try {
                            await client.query(`ALTER TABLE ${mismatch.table} ALTER COLUMN ${mismatch.column} TYPE ${targetType} USING ${mismatch.column}::${targetType}`);
                        } catch (err) {
                            console.error(`[Sync] Failed to convert ${mismatch.table}.${mismatch.column} from ${mismatch.actual} to ${targetType}:`, err);
                        }
                    }
                }
            }

            // Create missing indexes if any
            if (health.details?.missingIndexes && health.details.missingIndexes.length > 0) {
                for (const indexName of health.details.missingIndexes) {
                    const indexDef = INDEX_DEFINITIONS[indexName];
                    if (indexDef) {
                        try {
                            await client.query(indexDef);
                            console.log(`[Sync] Created index: ${indexName}`);
                        } catch (err) {
                            console.error(`[Sync] Failed to create index ${indexName}:`, err);
                        }
                    }
                }
            }

            // Insert default data
            await client.query(INSERT_DEFAULT_ADMIN);
            await client.query(INSERT_DEFAULT_SETTINGS);

            // Commit transaction
            await client.query('COMMIT');
            client.release();

            return NextResponse.json({
                success: true,
                message: 'Database synchronized successfully! Default admin user created (username: admin, password: admin123)',
            });

        } catch (error) {
            // Rollback on error
            await client.query('ROLLBACK');
            client.release();
            throw error;
        }

    } catch (error) {
        console.error('[Sync] Error:', error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to sync database',
        }, { status: 500 });
    } finally {
        await pool.end();
    }
}
