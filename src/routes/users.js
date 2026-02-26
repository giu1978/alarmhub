const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin only)
router.get('/', requireRole('admin'), (req, res, next) => {
  db.all(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.phone, u.is_active, u.created_at,
           GROUP_CONCAT(t.name) as teams
    FROM users u
    LEFT JOIN team_members tm ON u.id = tm.user_id
    LEFT JOIN teams t ON tm.team_id = t.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `, (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

// Create user (admin only)
router.post('/', requireRole('admin'), [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('role').isIn(['admin', 'operator', 'viewer']),
  body('phone').optional().trim()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, firstName, lastName, role, phone } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(`
    INSERT INTO users (email, password, first_name, last_name, role, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [email, hashedPassword, firstName, lastName, role, phone || null], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Email already exists' });
      }
      return next(err);
    }

    res.status(201).json({
      id: this.lastID,
      email,
      firstName,
      lastName,
      role
    });
  });
});

// Update user (admin only)
router.put('/:id', requireRole('admin'), [
  body('firstName').optional().trim(),
  body('lastName').optional().trim(),
  body('role').optional().isIn(['admin', 'operator', 'viewer']),
  body('phone').optional().trim(),
  body('isActive').optional().isBoolean()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { firstName, lastName, role, phone, isActive } = req.body;
  const updates = [];
  const values = [];

  if (firstName) { updates.push('first_name = ?'); values.push(firstName); }
  if (lastName) { updates.push('last_name = ?'); values.push(lastName); }
  if (role) { updates.push('role = ?'); values.push(role); }
  if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
  if (isActive !== undefined) { updates.push('is_active = ?'); values.push(isActive ? 1 : 0); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.id);

  db.run(`
    UPDATE users SET ${updates.join(', ')} WHERE id = ?
  `, values, function(err) {
    if (err) return next(err);
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
    
    res.json({ message: 'User updated successfully' });
  });
});

module.exports = router;
