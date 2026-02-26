const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all teams
router.get('/', (req, res, next) => {
  db.all(`
    SELECT t.*, COUNT(tm.user_id) as member_count
    FROM teams t
    LEFT JOIN team_members tm ON t.id = tm.team_id
    GROUP BY t.id
    ORDER BY t.name
  `, (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

// Create team (admin only)
router.post('/', requireRole('admin'), [
  body('name').notEmpty().trim(),
  body('description').optional().trim()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description } = req.body;

  db.run(`
    INSERT INTO teams (name, description)
    VALUES (?, ?)
  `, [name, description || null], function(err) {
    if (err) return next(err);

    res.status(201).json({
      id: this.lastID,
      name,
      description
    });
  });
});

// Get team with members
router.get('/:id', (req, res, next) => {
  db.get('SELECT * FROM teams WHERE id = ?', [req.params.id], (err, team) => {
    if (err) return next(err);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    db.all(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.phone, tm.is_primary
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ?
    `, [req.params.id], (err, members) => {
      if (err) return next(err);
      res.json({ ...team, members });
    });
  });
});

// Add member to team (admin only)
router.post('/:id/members', requireRole('admin'), [
  body('userId').isInt(),
  body('isPrimary').optional().isBoolean()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { userId, isPrimary = false } = req.body;
  const teamId = req.params.id;

  db.run(`
    INSERT INTO team_members (team_id, user_id, is_primary)
    VALUES (?, ?, ?)
  `, [teamId, userId, isPrimary ? 1 : 0], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'User is already in this team' });
      }
      return next(err);
    }

    res.status(201).json({ message: 'Member added to team' });
  });
});

module.exports = router;
