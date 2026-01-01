-- NeXSS Database Schema (Simplified)
-- PostgreSQL 15

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    rank INTEGER NOT NULL DEFAULT 1, -- 1: user, 3: admin
    -- 2FA fields
    totp_secret VARCHAR(255), -- Encrypted TOTP secret
    totp_enabled BOOLEAN DEFAULT FALSE,
    backup_codes TEXT, -- JSON array of hashed backup codes
    totp_verified_at TIMESTAMP WITH TIME ZONE,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create default admin user (password: admin123)
INSERT INTO users (id, username, email, password, rank) VALUES 
('01JFRX0000ADMIN00000001', 'admin', 'admin@nexss.local', '$2b$10$8sysysdnKa1.MOl3FiMxP.Pw7ZvUiG4tOSBHeiOaIy1YIgwRcCYOu', 3);

-- ============================================
-- USER SESSIONS TABLE
-- ============================================
CREATE TABLE user_sessions (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    user_id VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL UNIQUE,
    ip_address VARCHAR(50),
    user_agent VARCHAR(500),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_sessions_token ON user_sessions(token);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);

-- ============================================
-- REPORTS TABLE
-- ============================================
CREATE TABLE reports (
    id VARCHAR(26) PRIMARY KEY, -- ULID (sortable)
    -- Basic info
    uri VARCHAR(2000),
    origin VARCHAR(500),
    referer VARCHAR(2000),
    -- Browser info
    user_agent VARCHAR(1000),
    ip VARCHAR(100),
    cookies TEXT,
    -- Timestamps
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Status
    archived BOOLEAN DEFAULT FALSE,
    read BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_reports_archived ON reports(archived);
CREATE INDEX idx_reports_triggered_at ON reports(triggered_at);

-- ============================================
-- REPORTS DATA TABLE (Large data)
-- ============================================
CREATE TABLE reports_data (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    report_id VARCHAR(26) NOT NULL REFERENCES reports(id) ON DELETE CASCADE UNIQUE,
    dom TEXT,
    screenshot TEXT, -- File path for local/s3/gcs, or base64 data for legacy
    screenshot_storage VARCHAR(20) DEFAULT NULL, -- 'local', 's3', 'gcs', 'db' (legacy)
    screenshot_error TEXT, -- Error message if screenshot capture failed
    localstorage TEXT,
    sessionstorage TEXT,
    extra JSONB,
    compressed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reports_data_report_id ON reports_data(report_id);

-- ============================================
-- SETTINGS TABLE
-- ============================================
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES 
('app_name', 'NeXSS'),
('app_tagline', 'Lightweight Blind XSS Listener'),
('timezone', 'UTC'),
('persistent_enabled', 'false'),
('persistent_key', ''),
('advanced_persistent_enabled', 'false');

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================
CREATE TABLE logs (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    user_id VARCHAR(26) REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    details TEXT,
    ip VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_logs_user_id ON logs(user_id);
CREATE INDEX idx_logs_created_at ON logs(created_at);

-- ============================================
-- PERSISTENT SESSIONS TABLE
-- ============================================
CREATE TABLE persistent_sessions (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    report_id VARCHAR(26) NOT NULL REFERENCES reports(id) ON DELETE CASCADE UNIQUE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    pending_command TEXT,
    last_response TEXT,
    last_response_at TIMESTAMP WITH TIME ZONE,
    session_status VARCHAR(50) DEFAULT 'active', -- 'active', 'popup_blocked', 'popup_opened', 'terminated', 'popup_error'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_persistent_sessions_report_id ON persistent_sessions(report_id);
CREATE INDEX idx_persistent_sessions_last_seen ON persistent_sessions(last_seen);
CREATE INDEX idx_persistent_sessions_last_response_at ON persistent_sessions(last_response_at);

-- ============================================
-- INTERCEPTED TRAFFIC TABLE (Traffic Interception)
-- ============================================
CREATE TABLE intercepted_traffic (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    report_id VARCHAR(26) NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    traffic_type VARCHAR(20) NOT NULL, -- 'fetch', 'xhr', 'form', 'navigation'
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
CREATE INDEX idx_intercepted_traffic_report_id ON intercepted_traffic(report_id);
CREATE INDEX idx_intercepted_traffic_captured_at ON intercepted_traffic(captured_at);
-- Composite index for efficient pagination queries: WHERE report_id = ? ORDER BY captured_at
CREATE INDEX idx_intercepted_traffic_report_captured ON intercepted_traffic(report_id, captured_at DESC);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
