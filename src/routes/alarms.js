const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const notificationService = require('../services/notifications');

const router = express.Router();

// Get all alarms with filtering
router.get('/', [
  query('status').optional().isIn(['open', 'acknowledged', 'declined', 'resolved', 'escalated']),
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 })
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { status, severity, limit = 50, offset = 0 } = req.query;
  
  let sql = `
    SELECT 
      a.*,
      u1.first_name as triggered_by_first_name,
      u1.last_name as triggered_by_last_name,
      u2.first_name as acknowledged_by_first_name,
      u2.last_name as acknowledged_by_last_name,
      t.name as team_name
    FROM alarms a
    LEFT JOIN users u1 ON a.triggered_by = u1.id
    LEFT JOIN users u2 ON a.acknowledged_by = u2.id
    LEFT JOIN teams t ON a.team_id = t.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }
  if (severity) {
    sql += ' AND a.severity = ?';
    params.push(severity);
  }

  sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(sql, params, (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

// Get single alarm
router.get('/:id', (req, res, next) => {
  const sql = `
    SELECT 
      a.*,
      u1.first_name as triggered_by_first_name,
      u1.last_name as triggered_by_last_name,
      u2.first_name as acknowledged_by_first_name,
      u2.last_name as acknowledged_by_last_name,
      u3.first_name as resolved_by_first_name,
      u3.last_name as resolved_by_last_name,
      t.name as team_name
    FROM alarms a
    LEFT JOIN users u1 ON a.triggered_by = u1.id
    LEFT JOIN users u2 ON a.acknowledged_by = u2.id
    LEFT JOIN users u3 ON a.resolved_by = u3.id
    LEFT JOIN teams t ON a.team_id = t.id
    WHERE a.id = ?
  `;

  db.get(sql, [req.params.id], (err, alarm) => {
    if (err) return next(err);
    if (!alarm) return res.status(404).json({ error: 'Alarm not found' });
    
    // Get responses
    db.all(`
      SELECT ar.*, u.first_name, u.last_name
      FROM alarm_responses ar
      JOIN users u ON ar.user_id = u.id
      WHERE ar.alarm_id = ?
      ORDER BY ar.created_at DESC
    `, [req.params.id], (err, responses) => {
      if (err) return next(err);
      res.json({ ...alarm, responses });
    });
  });
});

// Create alarm (manual)
router.post('/', [
  body('title').notEmpty().trim(),
  body('description').optional().trim(),
  body('severity').isIn(['low', 'medium', 'high', 'critical']),
  body('teamId').optional().isInt(),
  body('location').optional().trim()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, description, severity, teamId, location } = req.body;
  const uuid = uuidv4();

  db.run(`
    INSERT INTO alarms (uuid, title, description, severity, status, source, triggered_by, team_id, location)
    VALUES (?, ?, ?, ?, 'open', 'manual', ?, ?, ?)
  `, [uuid, title, description, severity, req.userId, teamId || null, location || null], function(err) {
    if (err) return next(err);

    const alarmId = this.lastID;
    
    // Get created alarm
    db.get('SELECT * FROM alarms WHERE id = ?', [alarmId], (err, alarm) => {
      if (err) return next(err);
      
      // Notify team members
      const io = req.app.get('io');
      notificationService.notifyNewAlarm(alarm, io);
      
      res.status(201).json(alarm);
    });
  });
});

// Acknowledge alarm
router.post('/:id/acknowledge', [
  body('comment').optional().trim()
], (req, res, next) => {
  const { comment } = req.body;
  const alarmId = req.params.id;

  db.get('SELECT * FROM alarms WHERE id = ?', [alarmId], (err, alarm) => {
    if (err) return next(err);
    if (!alarm) return res.status(404).json({ error: 'Alarm not found' });
    if (alarm.status === 'resolved') {
      return res.status(400).json({ error: 'Alarm already resolved' });
    }

    db.serialize(() => {
      db.run(`
        UPDATE alarms 
        SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.userId, alarmId]);

      db.run(`
        INSERT INTO alarm_responses (alarm_id, user_id, action, comment)
        VALUES (?, ?, 'acknowledged', ?)
      `, [alarmId, req.userId, comment || null], function(err) {
        if (err) return next(err);

        const io = req.app.get('io');
        io.to('alarms:live').emit('alarm:updated', { alarmId, status: 'acknowledged' });
        
        res.json({ message: 'Alarm acknowledged', alarmId });
      });
    });
  });
});

// Decline alarm
router.post('/:id/decline', [
  body('comment').notEmpty().trim()
], (req, res, next) => {
  const { comment } = req.body;
  const alarmId = req.params.id;

  db.get('SELECT * FROM alarms WHERE id = ?', [alarmId], (err, alarm) => {
    if (err) return next(err);
    if (!alarm) return res.status(404).json({ error: 'Alarm not found' });
    if (alarm.status === 'resolved') {
      return res.status(400).json({ error: 'Alarm already resolved' });
    }

    db.serialize(() => {
      db.run(`
        UPDATE alarms 
        SET status = 'declined', acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.userId, alarmId]);

      db.run(`
        INSERT INTO alarm_responses (alarm_id, user_id, action, comment)
        VALUES (?, ?, 'declined', ?)
      `, [alarmId, req.userId, comment], function(err) {
        if (err) return next(err);

        const io = req.app.get('io');
        io.to('alarms:live').emit('alarm:updated', { alarmId, status: 'declined' });
        
        res.json({ message: 'Alarm declined', alarmId });
      });
    });
  });
});

// Resolve alarm
router.post('/:id/resolve', [
  body('comment').optional().trim()
], (req, res, next) => {
  const { comment } = req.body;
  const alarmId = req.params.id;

  db.get('SELECT * FROM alarms WHERE id = ?', [alarmId], (err, alarm) => {
    if (err) return next(err);
    if (!alarm) return res.status(404).json({ error: 'Alarm not found' });

    db.serialize(() => {
      db.run(`
        UPDATE alarms 
        SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [req.userId, alarmId]);

      db.run(`
        INSERT INTO alarm_responses (alarm_id, user_id, action, comment)
        VALUES (?, ?, 'resolved', ?)
      `, [alarmId, req.userId, comment || null], function(err) {
        if (err) return next(err);

        const io = req.app.get('io');
        io.to('alarms:live').emit('alarm:updated', { alarmId, status: 'resolved' });
        
        res.json({ message: 'Alarm resolved', alarmId });
      });
    });
  });
});

module.exports = router;
