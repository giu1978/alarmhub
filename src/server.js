const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config');
const db = require('./config/database');

// Routes
const authRoutes = require('./routes/auth');
const debugLoginRoutes = require('./routes/debug-login');
const initRoutes = require('./routes/init');
const userRoutes = require('./routes/users');
const alarmRoutes = require('./routes/alarms');
const teamRoutes = require('./routes/teams');
const publicRoutes = require('./routes/public');

// Middleware
const { authenticate, requireRole } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Global socket.io instance
app.set('io', io);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/debug', debugLoginRoutes);
app.use('/api', initRoutes);
app.use('/api/alarms', authenticate, alarmRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/teams', authenticate, teamRoutes);
app.use('/api/public', publicRoutes);

// Serve frontend static files
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

// Handle client-side routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Join user-specific room based on auth
  socket.on('authenticate', (token) => {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, config.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.join(`user:${decoded.userId}`);
      socket.join('alarms:live');
      console.log(`User ${decoded.userId} joined real-time updates`);
    } catch (err) {
      console.error('Socket auth failed:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handler
app.use(errorHandler);

// Start server
const PORT = config.PORT;
server.listen(PORT, () => {
  console.log(`🚨 AlarmHub Server running on port ${PORT}`);
  console.log(`📊 Environment: ${config.NODE_ENV}`);
});

module.exports = { app, io };
