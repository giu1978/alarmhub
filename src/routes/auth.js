const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const config = require('../config');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const usePostgres = !!process.env.DATABASE_URL;

// Helper function for database queries
function dbGet(sql, params) {
  if (usePostgres) {
    // Convert SQLite ? to PostgreSQL $1, $2, etc.
    let pgSql = sql;
    let paramIndex = 1;
    while (pgSql.includes('?')) {
      pgSql = pgSql.replace('?', `$${paramIndex}`);
      paramIndex++;
    }
    return db.query(pgSql, params).then(result => result.rows[0]);
  } else {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const user = await dbGet(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email]
    );
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get current user
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await dbGet(
      'SELECT id, email, first_name, last_name, role, phone, telegram_chat_id, created_at FROM users WHERE id = ?',
      [req.userId]
    );
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      phone: user.phone,
      telegramChatId: user.telegram_chat_id,
      createdAt: user.created_at
    });
  } catch (err) {
    next(err);
  }
});

// Change password
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;

  try {
    const user = await dbGet('SELECT password FROM users WHERE id = ?', [req.userId]);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    
    if (usePostgres) {
      await db.query(
        'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [hashedPassword, req.userId]
      );
    } else {
      db.run(
        'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedPassword, req.userId]
      );
    }
    
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;