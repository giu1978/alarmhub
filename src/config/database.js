const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('./index');

// Ensure data directory exists
const dbPath = config.DB_PATH || './data/alarmhub.db';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initDatabase();
  }
});

function initDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'operator', 'viewer')) DEFAULT 'viewer',
        phone TEXT,
        telegram_chat_id TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Teams table
    db.run(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Team members
    db.run(`
      CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        is_primary BOOLEAN DEFAULT 0,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(team_id, user_id)
      )
    `);

    // Alarms table
    db.run(`
      CREATE TABLE IF NOT EXISTS alarms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
        status TEXT CHECK(status IN ('open', 'acknowledged', 'declined', 'resolved', 'escalated')) DEFAULT 'open',
        source TEXT CHECK(source IN ('manual', 'api', 'sensor')) NOT NULL,
        triggered_by INTEGER,
        team_id INTEGER,
        location TEXT,
        metadata TEXT,
        acknowledged_by INTEGER,
        acknowledged_at DATETIME,
        resolved_by INTEGER,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (triggered_by) REFERENCES users(id),
        FOREIGN KEY (acknowledged_by) REFERENCES users(id),
        FOREIGN KEY (resolved_by) REFERENCES users(id),
        FOREIGN KEY (team_id) REFERENCES teams(id)
      )
    `);

    // Alarm responses
    db.run(`
      CREATE TABLE IF NOT EXISTS alarm_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alarm_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action TEXT CHECK(action IN ('acknowledged', 'declined', 'resolved', 'commented')) NOT NULL,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (alarm_id) REFERENCES alarms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Notification logs
    db.run(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alarm_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        channel TEXT CHECK(channel IN ('telegram', 'sms', 'call', 'email', 'push')) NOT NULL,
        status TEXT CHECK(status IN ('pending', 'sent', 'failed', 'delivered')) DEFAULT 'pending',
        error_message TEXT,
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (alarm_id) REFERENCES alarms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Escalation rules
    db.run(`
      CREATE TABLE IF NOT EXISTS escalation_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        delay_minutes INTEGER NOT NULL,
        escalation_level INTEGER NOT NULL,
        notify_users TEXT,
        notify_teams TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      )
    `);

    // Audit logs
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        old_value TEXT,
        new_value TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create default admin user (password: admin123)
    const bcrypt = require('bcrypt');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    
    db.run(`
      INSERT OR IGNORE INTO users (email, password, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?)
    `, ['admin@alarmhub.local', hashedPassword, 'Admin', 'User', 'admin']);

    console.log('Database initialized successfully.');
  });
}

module.exports = db;
