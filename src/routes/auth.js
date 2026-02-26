const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const config = require('../config');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  db.get(
    'SELECT * FROM users WHERE email = ? AND is_active = 1',
    [email],
    (err, user) => {
      if (err) return next(err);
      
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
    }
  );
});

// Get current user
router.get('/me', authenticate, (req, res, next) => {
  db.get(
    'SELECT id, email, first_name, last_name, role, phone, telegram_chat_id, created_at FROM users WHERE id = ?',
    [req.userId],
    (err, user) => {
      if (err) return next(err);
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
    }
  );
});

// Change password
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;

  db.get('SELECT password FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err) return next(err);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    
    db.run(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, req.userId],
      (err) => {
        if (err) return next(err);
        res.json({ message: 'Password changed successfully' });
      }
    );
  });
});

module.exports = router;
