const { logger } = require('./logger');

class WebSocketManager {
  constructor(io) {
    this.io = io;
    this.activeConnections = new Map(); // socketId -> { sessionId, currentDirectory, joinedAt }
    this.directoryRooms = new Map(); // directoryPath -> Set of socketIds
    
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('WebSocket client connected', { socketId: socket.id });

      // Handle joining a directory room
      socket.on('join-directory', (data) => {
        this.handleJoinDirectory(socket, data);
      });

      // Handle leaving a directory room
      socket.on('leave-directory', (data) => {
        this.handleLeaveDirectory(socket, data);
      });

      // Handle typing indicators
      socket.on('typing-start', (data) => {
        this.handleTypingStart(socket, data);
      });

      socket.on('typing-stop', (data) => {
        this.handleTypingStop(socket, data);
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', { 
          socketId: socket.id, 
          reason 
        });
        this.handleDisconnection(socket);
      });
    });
  }

  handleJoinDirectory(socket, data) {
    const { sessionId, directoryPath } = data;

    if (!directoryPath || !sessionId) {
      logger.warn('Invalid join-directory request', { socketId: socket.id, data });
      return;
    }

    try {
      // Leave any existing directory room first
      this.leaveCurrentDirectory(socket);

      // Join the new directory room
      const roomName = this.getRoomName(directoryPath);
      socket.join(roomName);

      // Update connection tracking
      this.activeConnections.set(socket.id, {
        sessionId,
        currentDirectory: directoryPath,
        joinedAt: new Date().toISOString()
      });

      // Update directory room tracking
      if (!this.directoryRooms.has(directoryPath)) {
        this.directoryRooms.set(directoryPath, new Set());
      }
      this.directoryRooms.get(directoryPath).add(socket.id);

      logger.info('Client joined directory room', {
        socketId: socket.id,
        sessionId,
        directoryPath,
        roomName
      });

      // Notify other users in the room
      socket.to(roomName).emit('user-joined', {
        sessionId,
        directoryPath,
        timestamp: new Date().toISOString()
      });

      // Send current room status to the joining user
      const roomStatus = this.getRoomStatus(directoryPath);
      socket.emit('room-status', roomStatus);

    } catch (error) {
      logger.error('Error handling join-directory', {
        socketId: socket.id,
        error: error.message,
        stack: error.stack
      });
    }
  }

  handleLeaveDirectory(socket, data) {
    try {
      this.leaveCurrentDirectory(socket);
    } catch (error) {
      logger.error('Error handling leave-directory', {
        socketId: socket.id,
        error: error.message
      });
    }
  }

  handleTypingStart(socket, data) {
    const connection = this.activeConnections.get(socket.id);
    if (!connection) return;

    const roomName = this.getRoomName(connection.currentDirectory);
    socket.to(roomName).emit('user-typing-start', {
      sessionId: connection.sessionId,
      directoryPath: connection.currentDirectory,
      timestamp: new Date().toISOString()
    });
  }

  handleTypingStop(socket, data) {
    const connection = this.activeConnections.get(socket.id);
    if (!connection) return;

    const roomName = this.getRoomName(connection.currentDirectory);
    socket.to(roomName).emit('user-typing-stop', {
      sessionId: connection.sessionId,
      directoryPath: connection.currentDirectory,
      timestamp: new Date().toISOString()
    });
  }

  handleDisconnection(socket) {
    try {
      this.leaveCurrentDirectory(socket);
      this.activeConnections.delete(socket.id);
    } catch (error) {
      logger.error('Error handling disconnection', {
        socketId: socket.id,
        error: error.message
      });
    }
  }

  leaveCurrentDirectory(socket) {
    const connection = this.activeConnections.get(socket.id);
    if (!connection) return;

    const { sessionId, currentDirectory } = connection;
    const roomName = this.getRoomName(currentDirectory);

    // Leave the socket room
    socket.leave(roomName);

    // Update directory room tracking
    if (this.directoryRooms.has(currentDirectory)) {
      this.directoryRooms.get(currentDirectory).delete(socket.id);
      
      // Clean up empty rooms
      if (this.directoryRooms.get(currentDirectory).size === 0) {
        this.directoryRooms.delete(currentDirectory);
      }
    }

    // Notify other users in the room
    socket.to(roomName).emit('user-left', {
      sessionId,
      directoryPath: currentDirectory,
      timestamp: new Date().toISOString()
    });

    logger.info('Client left directory room', {
      socketId: socket.id,
      sessionId,
      directoryPath: currentDirectory,
      roomName
    });
  }

  // Broadcast new message to all users in a directory room
  broadcastNewMessage(directoryPath, message, excludeSessionId = null) {
    try {
      const roomName = this.getRoomName(directoryPath);
      const broadcast = {
        event: 'new-message',
        data: {
          message,
          directoryPath,
          timestamp: new Date().toISOString()
        }
      };

      // If excludeSessionId is provided, exclude that user from the broadcast
      if (excludeSessionId) {
        // Find sockets in this room that don't belong to excludeSessionId
        const roomSockets = this.directoryRooms.get(directoryPath) || new Set();
        roomSockets.forEach(socketId => {
          const connection = this.activeConnections.get(socketId);
          if (connection && connection.sessionId !== excludeSessionId) {
            this.io.to(socketId).emit('new-message', broadcast.data);
          }
        });
      } else {
        // Broadcast to all users in the room
        this.io.to(roomName).emit('new-message', broadcast.data);
      }

      logger.info('Broadcasted new message', {
        directoryPath,
        roomName,
        excludeSessionId,
        messageRole: message.role
      });

    } catch (error) {
      logger.error('Error broadcasting new message', {
        directoryPath,
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Broadcast command execution started to all users in a directory room
  broadcastCommandStarted(directoryPath, command, excludeSessionId = null) {
    try {
      const roomName = this.getRoomName(directoryPath);
      const broadcast = {
        event: 'command-started',
        data: {
          command,
          directoryPath,
          timestamp: new Date().toISOString()
        }
      };

      if (excludeSessionId) {
        const roomSockets = this.directoryRooms.get(directoryPath) || new Set();
        roomSockets.forEach(socketId => {
          const connection = this.activeConnections.get(socketId);
          if (connection && connection.sessionId !== excludeSessionId) {
            this.io.to(socketId).emit('command-started', broadcast.data);
          }
        });
      } else {
        this.io.to(roomName).emit('command-started', broadcast.data);
      }

      logger.info('Broadcasted command started', {
        directoryPath,
        roomName,
        excludeSessionId,
        command: command.substring(0, 50) + '...' // Log first 50 chars
      });

    } catch (error) {
      logger.error('Error broadcasting command started', {
        directoryPath,
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Broadcast command execution completed to all users in a directory room
  broadcastCommandCompleted(directoryPath, success = true, excludeSessionId = null) {
    try {
      const roomName = this.getRoomName(directoryPath);
      const broadcast = {
        event: 'command-completed',
        data: {
          success,
          directoryPath,
          timestamp: new Date().toISOString()
        }
      };

      if (excludeSessionId) {
        const roomSockets = this.directoryRooms.get(directoryPath) || new Set();
        roomSockets.forEach(socketId => {
          const connection = this.activeConnections.get(socketId);
          if (connection && connection.sessionId !== excludeSessionId) {
            this.io.to(socketId).emit('command-completed', broadcast.data);
          }
        });
      } else {
        this.io.to(roomName).emit('command-completed', broadcast.data);
      }

      logger.info('Broadcasted command completed', {
        directoryPath,
        roomName,
        excludeSessionId,
        success
      });

    } catch (error) {
      logger.error('Error broadcasting command completed', {
        directoryPath,
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Broadcast chat cleared event to all users in a directory room
  broadcastChatCleared(directoryPath, excludeSessionId = null) {
    try {
      const roomName = this.getRoomName(directoryPath);
      const broadcast = {
        event: 'chat-cleared',
        data: {
          directoryPath,
          timestamp: new Date().toISOString()
        }
      };

      if (excludeSessionId) {
        const roomSockets = this.directoryRooms.get(directoryPath) || new Set();
        roomSockets.forEach(socketId => {
          const connection = this.activeConnections.get(socketId);
          if (connection && connection.sessionId !== excludeSessionId) {
            this.io.to(socketId).emit('chat-cleared', broadcast.data);
          }
        });
      } else {
        this.io.to(roomName).emit('chat-cleared', broadcast.data);
      }

      logger.info('Broadcasted chat cleared', {
        directoryPath,
        roomName,
        excludeSessionId
      });

    } catch (error) {
      logger.error('Error broadcasting chat cleared', {
        directoryPath,
        error: error.message,
        stack: error.stack
      });
    }
  }

  getRoomName(directoryPath) {
    // Convert directory path to a safe room name
    return `dir:${Buffer.from(directoryPath).toString('base64')}`;
  }

  getRoomStatus(directoryPath) {
    const roomSockets = this.directoryRooms.get(directoryPath) || new Set();
    const activeUsers = [];

    roomSockets.forEach(socketId => {
      const connection = this.activeConnections.get(socketId);
      if (connection) {
        activeUsers.push({
          sessionId: connection.sessionId,
          joinedAt: connection.joinedAt
        });
      }
    });

    return {
      directoryPath,
      activeUserCount: activeUsers.length,
      activeUsers,
      timestamp: new Date().toISOString()
    };
  }

  // Get statistics for monitoring
  getStatistics() {
    const stats = {
      totalConnections: this.activeConnections.size,
      activeRooms: this.directoryRooms.size,
      roomDetails: {}
    };

    this.directoryRooms.forEach((sockets, directoryPath) => {
      stats.roomDetails[directoryPath] = {
        userCount: sockets.size,
        users: []
      };

      sockets.forEach(socketId => {
        const connection = this.activeConnections.get(socketId);
        if (connection) {
          stats.roomDetails[directoryPath].users.push({
            sessionId: connection.sessionId,
            joinedAt: connection.joinedAt
          });
        }
      });
    });

    return stats;
  }
}

module.exports = WebSocketManager;