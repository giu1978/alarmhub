# 🚨 AlarmHub - Team Alarm Management System

## One-Click Deploy auf Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/dein-username/alarmhub)

## ⚡ Schnellstart

1. **Klicke den Button oben** oder geh zu [railway.app](https://railway.app)
2. **Repository auswählen** (nachdem du es auf GitHub hochgeladen hast)
3. **Umgebungsvariablen setzen** (siehe unten)
4. **Fertig!** Railway deployt automatisch

## 🔧 Erforderliche Umgebungsvariablen

In Railway Dashboard → Variables:

| Variable | Beschreibung |
|----------|--------------|
| `JWT_SECRET` | Mindestens 32 zufällige Zeichen |
| `TWILIO_ACCOUNT_SID` | Dein Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Dein Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Deine Twilio Nummer |
| `PUBLIC_API_KEY` | Beliebiger String für API-Zugriff |

## 📱 Features

- ✅ Alarm-Management mit Live-Updates
- 📞 Multi-Channel Benachrichtigungen (Anruf, SMS, Telegram)
- 👥 Team-Verwaltung mit Rollen
- 🔌 Public API für externe Systeme
- 🎨 Modernes React Frontend

## 🚀 Nach dem Deploy

1. Öffne die Railway URL
2. Login: `admin@alarmhub.local` / `admin123`
3. Passwort sofort ändern!

## 📡 Public API Beispiel

```bash
curl -X POST https://deine-railway-url.railway.app/api/public/alarms/trigger \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dein-public-api-key" \
  -d '{
    "title": "Server Ausfall",
    "severity": "high"
  }'
```

## 📂 Repository Struktur

```
alarmhub/
├── backend/          # Node.js API
├── frontend/         # React App
├── Dockerfile        # Railway Build
├── init.sql          # PostgreSQL Schema
└── railway.json      # Railway Config
```

## 📝 Wichtige Dateien

### Für lokale Entwicklung:
- `backend/package.json` - SQLite Version
- `backend/package.railway.json` - PostgreSQL Version

### Für Railway:
- `Dockerfile` - Kombiniert Backend + Frontend
- `railway.json` - Deploy Konfiguration
- `init.sql` - Datenbank Schema

## 🆘 Support

Bei Problemen:
1. Railway Dashboard → "View Logs" prüfen
2. Railway Discord: https://discord.gg/railway

---

**Viel Erfolg! 🎉**
