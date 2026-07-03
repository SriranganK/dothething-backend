const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const boardRoutes = require('./routes/boardRoutes');
const itemRoutes = require('./routes/itemRoutes');
const userRoutes = require('./routes/userRoutes');
const activityRoutes = require('./routes/activityRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const milestoneRoutes = require('./routes/milestoneRoutes');
const labelRoutes = require('./routes/labelRoutes');
const savedViewRoutes = require('./routes/savedViewRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const searchRoutes = require('./routes/searchRoutes');
const expenseCalcRoutes = require('./routes/expenseCalcRoutes');

const SocketService = require('./services/SocketService');

// Create Server & App
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173','http://localhost:5174', 'http://127.0.0.1:5174', '*'],
    credentials: true,
    methods: ['GET', 'POST']
  }
});
SocketService.init(io);

// Connect to Database & Load Workers / Cron
connectDB().then(() => {
  // Load workers
  require('./workers/emailWorker');
  require('./workers/notificationWorker');
  require('./workers/pushWorker');
  
  const { scheduleCronJobs } = require('./workers/reminderWorker');
  scheduleCronJobs();
}).catch(err => {
  console.error('Failed to initialize database/workers:', err.message);
});

// Middlewares
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', '*','http://localhost:5174', 'http://127.0.0.1:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/users', userRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/saved-views', savedViewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/expense-calc', expenseCalcRoutes);

// Serve static assets from frontend build
const frontendBuildPath = process.env.FRONTEND_BUILD_PATH || path.join(__dirname, '../../dotheThing/dist');
app.use(express.static(frontendBuildPath));

// Wildcard routing fallback for SPA (React Router)
app.get('*any', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendBuildPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Frontend build not found. Please run "npm run build" in dotheThing first.');
    }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

