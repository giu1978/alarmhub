const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const config = require('../config');
const notificationService = require('../services/notifications');

const router = express.Router();

// Public API Key authentication middleware
const authenticatePublicApi = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== config.PUBLIC_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  
  next();
};

// Trigger alarm via public API
router.post('/alarms/trigger', authenticatePublicApi, [
  body('title').notEmpty().trim(),
  body('description').optional().trim(),
  body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('teamId').optional().isInt(),
  body('location').optional().trim(),
  body('source').optional().trim()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, description, severity = 'medium', teamId, location, source = 'api' } = req.body;
  const uuid = uuidv4();

  db.run(`
    INSERT INTO alarms (uuid, title, description, severity, status, source, triggered_by, team_id, location)
    VALUES (?, ?, ?, ?, 'open', ?, NULL, ?, ?)
  `, [uuid, title, description, severity, source, teamId || null, location || null], function(err) {
    if (err) return next(err);

    const alarmId = this.lastID;
    
    db.get('SELECT * FROM alarms WHERE id = ?', [alarmId], (err, alarm) => {
      if (err) return next(err);
      
      // Get io instance and notify
      const io = req.app.get('io');
      notificationService.notifyNewAlarm(alarm, io);
      
      res.status(201).json({
        success: true,
        alarmId: alarm.id,
        uuid: alarm.uuid,
        message: 'Alarm triggered successfully'
      });
    });
  });
});

// Get alarm status via public API
router.get('/alarms/:uuid', authenticatePublicApi, (req, res, next) => {
  db.get(`
    SELECT 
      a.id, a.uuid, a.title, a.description, a.severity, a.status,
      a.location, a.created_at, a.updated_at,
      t.name as team_name
    FROM alarms a
    LEFT JOIN teams t ON a.team_id = t.id
    WHERE a.uuid = ?
  `, [req.params.uuid], (err, alarm) => {
    if (err) return next(err);
    if (!alarm) return res.status(404).json({ error: 'Alarm not found' });
    
    res.json(alarm);
  });
});

module.exports = router;
