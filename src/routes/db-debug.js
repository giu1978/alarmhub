const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/database');

const router = express.Router();
const usePostgres = !!process.env.DATABASE_URL;

// Debug database status
router.get('/db-status', async (req, res) => {
  const status = {
    postgres: usePostgres,
    tables: {},
    errors: []
  };
  
  try {
    // Check if users table exists
    if (usePostgres) {
      try {
        const tablesResult = await db.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `);
        status.tables.list = tablesResult.rows.map(r => r.table_name);
      } catch (e) {
        status.errors.push({ step: 'list_tables', error: e.message });
      }
      
      // Try to get users
      try {
        const usersResult = await db.query('SELECT id, email, first_name, role, is_active FROM users');
        status.tables.users = usersResult.rows;
      } catch (e) {
        status.errors.push({ step: 'get_users', error: e.message });
      }
      
      // Try to create admin if not exists
      try {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        await db.query(`
          INSERT INTO users (email, password, first_name, last_name, role, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password
        `, ['admin@alarmhub.local', hashedPassword, 'Admin', 'User', 'admin', true]);
        status.adminCreated = true;
      } catch (e) {
        status.errors.push({ step: 'create_admin', error: e.message });
      }
    } else {
      // SQLite
      status.database = 'sqlite';
    }
    
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Force create tables and admin
router.get('/force-init', async (req, res) => {
  try {
    if (!usePostgres) {
      return res.json({ error: 'Only for PostgreSQL' });
    }
    
    // Create users table with simple syntax
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE,
        password TEXT,
        first_name TEXT,
        last_name TEXT,
        role TEXT,
        is_active BOOLEAN DEFAULT true
      )
    `);
    
    // Insert admin
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    await db.query(`
      INSERT INTO users (email, password, first_name, last_name, role, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password
    `, ['admin@alarmhub.local', hashedPassword, 'Admin', 'User', 'admin', true]);
    
    // Verify
    const result = await db.query('SELECT * FROM users WHERE email = $1', ['admin@alarmhub.local']);
    
    res.json({
      success: true,
      user: result.rows[0],
      message: 'Admin created/updated'
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;