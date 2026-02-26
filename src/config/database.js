const { Pool } = require('pg');

// Use PostgreSQL if DATABASE_URL is provided (Railway), otherwise SQLite
const usePostgres = !!process.env.DATABASE_URL;

let db;

if (usePostgres) {
  // PostgreSQL connection
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log('Using PostgreSQL database');
} else {
  // SQLite fallback for local development
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const fs = require('fs');
  
  const dbPath = process.env.DB_PATH || './data/alarmhub.db';
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log('Connected to SQLite database.');
    }
  });
  
  // Promisify SQLite methods for compatibility
  db.query = (sql, params) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve({ rows });
      });
    });
  };
  
  console.log('Using SQLite database');
}

// Initialize database tables
async function initDatabase() {
  try {
    if (usePostgres) {
      await initPostgresTables();
    } else {
      initSQLiteTables();
    }
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

async function initPostgresTables() {
  const client = await db.connect();
  
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'operator', 'viewer')) DEFAULT 'viewer',
        phone TEXT,
        telegram_chat_id TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Teams table
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Team members
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_primary BOOLEAN DEFAULT FALSE,
        UNIQUE(team_id, user_id)
      )
    `);

    // Alarms table
    await client.query(`
      CREATE TABLE IF NOT EXISTS alarms (
        id SERIAL PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
        status TEXT CHECK(status IN ('open', 'acknowledged', 'declined', 'resolved', 'escalated')) DEFAULT 'open',
        source TEXT CHECK(source IN ('manual', 'api', 'sensor')) NOT NULL,
        triggered_by INTEGER REFERENCES users(id),
        team_id INTEGER REFERENCES teams(id),
        location TEXT,
        metadata TEXT,
        acknowledged_by INTEGER REFERENCES users(id),
        acknowledged_at TIMESTAMP,
        resolved_by INTEGER REFERENCES users(id),
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Alarm responses
    await client.query(`
      CREATE TABLE IF NOT EXISTS alarm_responses (
        id SERIAL PRIMARY KEY,
        alarm_id INTEGER NOT NULL REFERENCES alarms(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        action TEXT CHECK(action IN ('acknowledged', 'declined', 'resolved', 'commented')) NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notification logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id SERIAL PRIMARY KEY,
        alarm_id INTEGER NOT NULL REFERENCES alarms(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        channel TEXT CHECK(channel IN ('telegram', 'sms', 'call', 'email', 'push')) NOT NULL,
        status TEXT CHECK(status IN ('pending', 'sent', 'failed', 'delivered')) DEFAULT 'pending',
        error_message TEXT,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create default admin user
    const bcrypt = require('bcrypt');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    
    await client.query(`
      INSERT INTO users (email, password, first_name, last_name, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
    `, ['admin@alarmhub.local', hashedPassword, 'Admin', 'User', 'admin']);
    
  } finally {
    client.release();
  }
}

function initSQLiteTables() {
  const sqlite3 = require('sqlite3').verbose();
  
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

    // Create default admin user
    const bcrypt = require('bcrypt');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    
    db.run(`
      INSERT OR IGNORE INTO users (email, password, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?)
    `, ['admin@alarmhub.local', hashedPassword, 'Admin', 'User', 'admin']);
  });
}

// Initialize on module load
initDatabase().then(() => {
  // Ensure admin user always exists (for SQLite in production)
  if (!usePostgres) {
    setTimeout(() => {
      const bcrypt = require('bcrypt');
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.run(
        `INSERT OR REPLACE INTO users (id, email, password, first_name, last_name, role, is_active) 
         VALUES (1, ?, ?, ?, ?, ?, 1)`,
        ['admin@alarmhub.local', hashedPassword, 'Admin', 'User', 'admin'],
        (err) => {
          if (err) console.error('Error creating admin:', err);
          else console.log('Admin user ensured');
        }
      );
    }, 1000);
  }
});

module.exports = db;