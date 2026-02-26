const twilio = require('twilio');
const axios = require('axios');
const nodemailer = require('nodemailer');
const db = require('../config/database');
const config = require('../config');

// Initialize Twilio client
const twilioClient = config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN
  ? twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
  : null;

// Initialize Email transporter
const emailTransporter = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS
      }
    })
  : null;

const notificationService = {
  // Send notification via all configured channels
  async notifyNewAlarm(alarm, io) {
    // Get team members to notify
    let usersToNotify = [];
    
    if (alarm.team_id) {
      db.all(`
        SELECT u.* FROM users u
        JOIN team_members tm ON u.id = tm.user_id
        WHERE tm.team_id = ? AND u.is_active = 1
      `, [alarm.team_id], async (err, users) => {
        if (err) {
          console.error('Error getting team members:', err);
          return;
        }
        usersToNotify = users;
        await this.sendToUsers(usersToNotify, alarm, io);
      });
    } else {
      // Notify all active users if no team specified
      db.all('SELECT * FROM users WHERE is_active = 1', async (err, users) => {
        if (err) {
          console.error('Error getting users:', err);
          return;
        }
        usersToNotify = users;
        await this.sendToUsers(usersToNotify, alarm, io);
      });
    }
  },

  async sendToUsers(users, alarm, io) {
    const severityEmojis = {
      low: 'ℹ️',
      medium: '⚠️',
      high: '🚨',
      critical: '🔥'
    };

    const message = `
${severityEmojis[alarm.severity]} ALARM: ${alarm.severity.toUpperCase()}

${alarm.title}
${alarm.description || 'Keine Beschreibung'}

Standort: ${alarm.location || 'Unbekannt'}
Zeit: ${new Date(alarm.created_at).toLocaleString('de-DE')}

Antworten: [Bestätigen] [Ablehnen]
    `.trim();

    for (const user of users) {
      // WebSocket notification
      if (io) {
        io.to(`user:${user.id}`).emit('alarm:new', { alarm, message });
      }

      // Telegram notification
      if (user.telegram_chat_id && config.TELEGRAM_BOT_TOKEN) {
        await this.sendTelegram(user.telegram_chat_id, message, alarm);
      }

      // SMS notification
      if (user.phone && twilioClient) {
        await this.sendSMS(user.phone, message, alarm);
      }

      // Call notification (for critical alarms)
      if (user.phone && twilioClient && ['high', 'critical'].includes(alarm.severity)) {
        await this.sendCall(user.phone, alarm);
      }

      // Email notification
      if (user.email && emailTransporter) {
        await this.sendEmail(user.email, alarm);
      }
    }
  },

  async sendTelegram(chatId, message, alarm) {
    try {
      await axios.post(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      });
      
      await this.logNotification(alarm.id, null, 'telegram', 'sent');
    } catch (err) {
      console.error('Telegram notification failed:', err.message);
      await this.logNotification(alarm.id, null, 'telegram', 'failed', err.message);
    }
  },

  async sendSMS(phone, message, alarm) {
    if (!twilioClient) return;
    
    try {
      await twilioClient.messages.create({
        body: message.substring(0, 1600), // SMS limit
        from: config.TWILIO_PHONE_NUMBER,
        to: phone
      });
      
      await this.logNotification(alarm.id, null, 'sms', 'sent');
    } catch (err) {
      console.error('SMS notification failed:', err.message);
      await this.logNotification(alarm.id, null, 'sms', 'failed', err.message);
    }
  },

  async sendCall(phone, alarm) {
    if (!twilioClient) return;
    
    const voiceMessage = `Hallo, hier ist AlarmHub. Ein ${alarm.severity === 'critical' ? 'kritischer' : 'hoher'} Alarm wurde ausgelöst: ${alarm.title}`;
    
    try {
      await twilioClient.calls.create({
        twiml: `<Response><Say voice="Polly.Daniel" language="de-DE">${voiceMessage}</Say></Response>`,
        from: config.TWILIO_PHONE_NUMBER,
        to: phone
      });
      
      await this.logNotification(alarm.id, null, 'call', 'sent');
    } catch (err) {
      console.error('Call notification failed:', err.message);
      await this.logNotification(alarm.id, null, 'call', 'failed', err.message);
    }
  },

  async sendEmail(email, alarm) {
    if (!emailTransporter) return;
    
    try {
      await emailTransporter.sendMail({
        from: config.SMTP_FROM,
        to: email,
        subject: `🚨 Alarm: ${alarm.title}`,
        html: `
          <h2>Alarm: ${alarm.title}</h2>
          <p><strong>Schweregrad:</strong> ${alarm.severity}</p>
          <p><strong>Beschreibung:</strong> ${alarm.description || 'Keine'}</p>
          <p><strong>Standort:</strong> ${alarm.location || 'Unbekannt'}</p>
          <p><strong>Zeit:</strong> ${new Date(alarm.created_at).toLocaleString('de-DE')}</p>
        `
      });
      
      await this.logNotification(alarm.id, null, 'email', 'sent');
    } catch (err) {
      console.error('Email notification failed:', err.message);
      await this.logNotification(alarm.id, null, 'email', 'failed', err.message);
    }
  },

  async logNotification(alarmId, userId, channel, status, errorMessage = null) {
    db.run(`
      INSERT INTO notification_logs (alarm_id, user_id, channel, status, error_message, sent_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [alarmId, userId, channel, status, errorMessage, status === 'sent' ? new Date().toISOString() : null]);
  }
};

module.exports = notificationService;
