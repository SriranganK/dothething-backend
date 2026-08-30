const jwt = require('jsonwebtoken');

let io = null;
const userSockets = new Map();

const init = (socketIoInstance) => {
  io = socketIoInstance;

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    console.log(`Socket connected: ${socket.id} (User: ${userId})`);

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    socket.join(`user:${userId}`);

    // Join and leave rooms for real-time board updates sync
    socket.on('board:join', (boardId) => {
      if (boardId) {
        socket.join(`board:${boardId}`);
        console.log(`Socket ${socket.id} (User: ${userId}) joined room: board:${boardId}`);
      }
    });

    socket.on('board:leave', (boardId) => {
      if (boardId) {
        socket.leave(`board:${boardId}`);
        console.log(`Socket ${socket.id} (User: ${userId}) left room: board:${boardId}`);
      }
    });

    // Join and leave rooms for real-time workspace updates sync
    socket.on('workspace:join', (workspaceId) => {
      if (workspaceId) {
        socket.join(`workspace:${workspaceId}`);
        console.log(`Socket ${socket.id} (User: ${userId}) joined room: workspace:${workspaceId}`);
      }
    });

    socket.on('workspace:leave', (workspaceId) => {
      if (workspaceId) {
        socket.leave(`workspace:${workspaceId}`);
        console.log(`Socket ${socket.id} (User: ${userId}) left room: workspace:${workspaceId}`);
      }
    });

    // Join and leave rooms for real-time scratch page updates sync
    socket.on('scratch:join', (pageId) => {
      if (pageId) {
        socket.join(`scratch:${pageId}`);
        console.log(`Socket ${socket.id} (User: ${userId}) joined room: scratch:${pageId}`);
      }
    });

    socket.on('scratch:leave', (pageId) => {
      if (pageId) {
        socket.leave(`scratch:${pageId}`);
        console.log(`Socket ${socket.id} (User: ${userId}) left room: scratch:${pageId}`);
      }
    });

    // Real-time zero-latency typing sync relay across co-editors
    socket.on('scratch:block-typing', (data) => {
      if (data?.pageId) {
        socket.to(`scratch:${data.pageId}`).emit('scratch:block-typing', data);
      }
    });

    socket.on('scratch:title-typing', (data) => {
      if (data?.pageId) {
        socket.to(`scratch:${data.pageId}`).emit('scratch:title-typing', data);
      }
      if (data?.workspaceId) {
        socket.to(`workspace:${data.workspaceId}`).emit('scratch:title-typing', data);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id} (User: ${userId})`);
      if (userSockets.has(userId)) {
        const sockets = userSockets.get(userId);
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
    });
  });
};

const sendToUser = (userId, event, data) => {
  if (!io) return false;
  io.to(`user:${userId}`).emit(event, data);
  return true;
};

const sendToMultipleUsers = (userIds, event, data) => {
  if (!io) return;
  userIds.forEach(userId => {
    io.to(`user:${userId}`).emit(event, data);
  });
};

/**
 * Broadcast event to everyone in a board room
 * @param {string} boardId 
 * @param {string} event 
 * @param {Object} data 
 */
const broadcastToBoard = (boardId, event, data) => {
  if (!io) return;
  io.to(`board:${boardId}`).emit(event, data);
};

const broadcastToWorkspace = (workspaceId, event, data) => {
  if (!io) return;
  io.to(`workspace:${workspaceId}`).emit(event, data);
};

const broadcastToScratchPage = (pageId, event, data) => {
  if (!io) return;
  io.to(`scratch:${pageId}`).emit(event, data);
};

const getIo = () => io;

module.exports = {
  init,
  sendToUser,
  sendToMultipleUsers,
  broadcastToBoard,
  broadcastToWorkspace,
  broadcastToScratchPage,
  getIo
};
