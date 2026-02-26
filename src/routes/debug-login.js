const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const config = require('../config');

const router = express.Router();
const usePostgres = !!process.env.DATABASE_URL;

// Emergency debug login - bypasses all checks
router.post('/debug-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Ensure admin exists
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    
    if (usePostgres) {
      // Create user if not exists
      await db.query(`
        INSERT INTO users (email, password, first_name, last_name, role, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (email) DO UPDATE SET 
          password = EXCLUDED.password,
          is_active = TRUE
      `, ['admin@alarmhub.local', hashedPassword, 'Admin', 'User', 'admin', true]);
      
      // Get user
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        config.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role
        }
      });
    } else {
      // SQLite
      db.run(`INSERT OR REPLACE INTO users (email, password, first_name, last_name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
        ['admin@alarmhub.local', hashedPassword, 'Admin', 'User', 'admin', 1]);
      
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'User not found' });
        
        const token = jwt.sign(
          { userId: user.id, email: user.email, role: user.role },
          config.JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        res.json({
          token,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role
          }
        });
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
