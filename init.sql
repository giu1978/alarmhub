-- PostgreSQL Schema für AlarmHub
-- Erstellt alle Tabellen für Railway Deployment

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('admin', 'operator', 'viewer')) DEFAULT 'viewer',
    phone VARCHAR(50),
    telegram_chat_id VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    UNIQUE(team_id, user_id)
);

-- Alarms table
CREATE TABLE IF NOT EXISTS alarms (
    id SERIAL PRIMARY KEY,
    uuid UUID UNIQUE DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
    status VARCHAR(20) CHECK (status IN ('open', 'acknowledged', 'declined', 'resolved', 'escalated')) DEFAULT 'open',
    source VARCHAR(20) CHECK (source IN ('manual', 'api', 'sensor')) NOT NULL,
    triggered_by INTEGER REFERENCES users(id),
    team_id INTEGER REFERENCES teams(id),
    location TEXT,
    metadata JSONB,
    acknowledged_by INTEGER REFERENCES users(id),
    acknowledged_at TIMESTAMP,
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alarm responses
CREATE TABLE IF NOT EXISTS alarm_responses (
    id SERIAL PRIMARY KEY,
    alarm_id INTEGER REFERENCES alarms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(20) CHECK (action IN ('acknowledged', 'declined', 'resolved', 'commented')) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification logs
CREATE TABLE IF NOT EXISTS notification_logs (
    id SERIAL PRIMARY KEY,
    alarm_id INTEGER REFERENCES alarms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    channel VARCHAR(20) CHECK (channel IN ('telegram', 'sms', 'call', 'email', 'push')) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('pending', 'sent', 'failed', 'delivered')) DEFAULT 'pending',
    error_message TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Escalation rules
CREATE TABLE IF NOT EXISTS escalation_rules (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    delay_minutes INTEGER NOT NULL,
    escalation_level INTEGER NOT NULL,
    notify_users TEXT,
    notify_teams TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (password: admin123)
INSERT INTO users (email, password, first_name, last_name, role)
VALUES ('admin@alarmhub.local', '$2b$10$YourHashedPasswordHere', 'Admin', 'User', 'admin')
ON CONFLICT (email) DO NOTHING;
