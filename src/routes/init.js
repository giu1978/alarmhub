const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/database');

const router = express.Router();
const usePostgres = !!process.env.DATABASE_URL;

// Initialize database tables and admin user
router.get('/init-db', async (req, res) => {
  try {
    if (usePostgres) {
      // Create all tables
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          role TEXT DEFAULT 'viewer',
          phone TEXT,
          telegram_chat_id TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS teams (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS team_members (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          is_primary BOOLEAN DEFAULT FALSE,
          UNIQUE(team_id, user_id)
        )
      `);

      await db.query(`
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

      await db.query(`
        CREATE TABLE IF NOT EXISTS alarm_responses (
          id SERIAL PRIMARY KEY,
          alarm_id INTEGER NOT NULL REFERENCES alarms(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id),
          action TEXT CHECK(action IN ('acknowledged', 'declined', 'resolved', 'commented')) NOT NULL,
          comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await db.query(`
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

      await db.query(`
        CREATE TABLE IF NOT EXISTS escalation_rules (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          delay_minutes INTEGER NOT NULL,
          escalation_level INTEGER NOT NULL,
          notify_users TEXT,
          notify_teams TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          action TEXT NOT NULL,
          entity_type TEXT,
          entity_id INTEGER,
          old_value TEXT,
          new_value TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create admin user
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      await db.query(`
        INSERT INTO users (email, password, first_name, last_name, role)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO UPDATE SET 
          password = EXCLUDED.password,
          is_active = TRUE
      `, ['admin@alarmhub.local', hashedPassword, 'Admin', 'User', 'admin']);

    } else {
      // SQLite fallback
      const sqlite3 = require('sqlite3').verbose();
      
      db.run(`CREATE TABLE IF NOT EXISTS users (...)`); // simplified
      
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.run(`INSERT OR REPLACE INTO users (email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)`,
        ['admin@alarmhub.local', hashedPassword, 'Admin', 'User', 'admin']);
    }

    res.json({ 
      success: true, 
      message: 'Database initialized successfully',
      adminUser: {
        email: 'admin@alarmhub.local',
        password: 'admin123'
      }
    });
  } catch (err) {
    console.error('Init error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;