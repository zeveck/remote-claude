const WebSocketManager = require('../src/websocket-manager');
const { logger } = require('../src/logger');

// Mock logger
jest.mock('../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('WebSocketManager', () => {
  let webSocketManager;
  let mockIo;
  let mockSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock socket
    mockSocket = {
      id: 'socket-123',
      join: jest.fn(),
      leave: jest.fn(),
      to: jest.fn(() => mockSocket),
      emit: jest.fn(),
      on: jest.fn()
    };

    // Create mock io
    mockIo = {
      on: jest.fn(),
      to: jest.fn(() => mockSocket),
      emit: jest.fn()
    };

    webSocketManager = new WebSocketManager(mockIo);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty tracking maps', () => {
      expect(webSocketManager.activeConnections).toBeInstanceOf(Map);
      expect(webSocketManager.directoryRooms).toBeInstanceOf(Map);
      expect(webSocketManager.activeConnections.size).toBe(0);
      expect(webSocketManager.directoryRooms.size).toBe(0);
    });

    it('should set up socket event handlers on io', () => {
      expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  describe('Room Management', () => {
    it('should generate safe room names from directory paths', () => {
      const directoryPath = '/home/user/project';
      const roomName = webSocketManager.getRoomName(directoryPath);
      
      expect(roomName).toMatch(/^dir:/);
      expect(roomName).toContain(Buffer.from(directoryPath).toString('base64'));
    });

    it('should handle join directory correctly', () => {
      const sessionId = 'session-123';
      const directoryPath = '/test/directory';
      
      webSocketManager.handleJoinDirectory(mockSocket, {
        sessionId,
        directoryPath
      });

      // Should join socket room
      expect(mockSocket.join).toHaveBeenCalledWith(
        expect.stringContaining('dir:')
      );

      // Should track connection
      expect(webSocketManager.activeConnections.has(mockSocket.id)).toBe(true);
      expect(webSocketManager.directoryRooms.has(directoryPath)).toBe(true);
    });

    it('should handle leave directory correctly', () => {
      const sessionId = 'session-123';
      const directoryPath = '/test/directory';
      
      // First join a directory
      webSocketManager.handleJoinDirectory(mockSocket, {
        sessionId,
        directoryPath
      });

      // Then leave
      webSocketManager.handleLeaveDirectory(mockSocket, {});

      // Should leave socket room
      expect(mockSocket.leave).toHaveBeenCalled();

      // Should clean up tracking
      expect(webSocketManager.directoryRooms.has(directoryPath)).toBe(false);
    });

    it('should handle invalid join-directory requests gracefully', () => {
      webSocketManager.handleJoinDirectory(mockSocket, {});
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid join-directory request',
        expect.any(Object)
      );
      expect(mockSocket.join).not.toHaveBeenCalled();
    });
  });

  describe('Message Broadcasting', () => {
    beforeEach(() => {
      // Set up a connection in a directory
      const sessionId = 'session-123';
      const directoryPath = '/test/directory';
      
      webSocketManager.handleJoinDirectory(mockSocket, {
        sessionId,
        directoryPath
      });
    });

    it('should broadcast new messages to directory room', () => {
      const directoryPath = '/test/directory';
      const message = {
        role: 'user',
        content: 'Hello world',
        timestamp: '2024-01-08T10:00:00Z'
      };

      webSocketManager.broadcastNewMessage(directoryPath, message);

      expect(mockIo.to).toHaveBeenCalledWith(expect.stringContaining('dir:'));
      expect(mockSocket.emit).toHaveBeenCalledWith('new-message', expect.objectContaining({
        message,
        directoryPath
      }));
    });

    it('should exclude sender from broadcast when specified', () => {
      const directoryPath = '/test/directory';
      const message = { role: 'user', content: 'Test' };
      const excludeSessionId = 'session-123';

      // Add a second socket to test exclusion logic
      const secondSocket = { id: 'socket-456' };
      webSocketManager.activeConnections.set(secondSocket.id, {
        sessionId: 'session-456',
        currentDirectory: directoryPath,
        joinedAt: new Date().toISOString()
      });
      webSocketManager.directoryRooms.get(directoryPath).add(secondSocket.id);

      webSocketManager.broadcastNewMessage(directoryPath, message, excludeSessionId);

      // Should broadcast to non-excluded socket (session-456) but not to excluded socket (session-123)
      expect(mockIo.to).toHaveBeenCalledWith(secondSocket.id);
      expect(mockIo.to).not.toHaveBeenCalledWith(mockSocket.id);
    });

    it('should broadcast chat cleared events', () => {
      const directoryPath = '/test/directory';

      webSocketManager.broadcastChatCleared(directoryPath);

      expect(mockSocket.emit).toHaveBeenCalledWith('chat-cleared', expect.objectContaining({
        directoryPath
      }));
    });

    it('should broadcast command started events', () => {
      const directoryPath = '/test/directory';
      const command = 'test command';

      webSocketManager.broadcastCommandStarted(directoryPath, command);

      expect(mockSocket.emit).toHaveBeenCalledWith('command-started', expect.objectContaining({
        command,
        directoryPath
      }));
    });

    it('should broadcast command completed events', () => {
      const directoryPath = '/test/directory';
      const success = true;

      webSocketManager.broadcastCommandCompleted(directoryPath, success);

      expect(mockSocket.emit).toHaveBeenCalledWith('command-completed', expect.objectContaining({
        success,
        directoryPath
      }));
    });
  });

  describe('Connection Management', () => {
    it('should handle disconnection and cleanup properly', () => {
      const sessionId = 'session-123';
      const directoryPath = '/test/directory';
      
      // Join directory first
      webSocketManager.handleJoinDirectory(mockSocket, {
        sessionId,
        directoryPath
      });

      // Then disconnect
      webSocketManager.handleDisconnection(mockSocket);

      // Should clean up all tracking
      expect(webSocketManager.activeConnections.has(mockSocket.id)).toBe(false);
      expect(webSocketManager.directoryRooms.has(directoryPath)).toBe(false);
    });

    it('should handle disconnection gracefully when no connection exists', () => {
      expect(() => {
        webSocketManager.handleDisconnection(mockSocket);
      }).not.toThrow();
    });
  });

  describe('Room Status and Statistics', () => {
    it('should provide room status correctly', () => {
      const sessionId = 'session-123';
      const directoryPath = '/test/directory';
      
      webSocketManager.handleJoinDirectory(mockSocket, {
        sessionId,
        directoryPath
      });

      const status = webSocketManager.getRoomStatus(directoryPath);

      expect(status).toEqual({
        directoryPath,
        activeUserCount: 1,
        activeUsers: expect.arrayContaining([
          expect.objectContaining({
            sessionId,
            joinedAt: expect.any(String)
          })
        ]),
        timestamp: expect.any(String)
      });
    });

    it('should provide comprehensive statistics', () => {
      const sessionId = 'session-123';
      const directoryPath = '/test/directory';
      
      webSocketManager.handleJoinDirectory(mockSocket, {
        sessionId,
        directoryPath
      });

      const stats = webSocketManager.getStatistics();

      expect(stats).toEqual({
        totalConnections: 1,
        activeRooms: 1,
        roomDetails: {
          [directoryPath]: {
            userCount: 1,
            users: expect.arrayContaining([
              expect.objectContaining({
                sessionId,
                joinedAt: expect.any(String)
              })
            ])
          }
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in broadcastNewMessage gracefully', () => {
      // Mock io.to to throw an error
      mockIo.to = jest.fn(() => {
        throw new Error('Socket error');
      });

      expect(() => {
        webSocketManager.broadcastNewMessage('/test', { role: 'user', content: 'test' });
      }).not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Error broadcasting new message',
        expect.any(Object)
      );
    });

    it('should handle errors in handleJoinDirectory gracefully', () => {
      // Mock socket.join to throw an error
      mockSocket.join = jest.fn(() => {
        throw new Error('Join error');
      });

      expect(() => {
        webSocketManager.handleJoinDirectory(mockSocket, {
          sessionId: 'test',
          directoryPath: '/test'
        });
      }).not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Error handling join-directory',
        expect.any(Object)
      );
    });
  });

  describe('Typing Indicators', () => {
    beforeEach(() => {
      webSocketManager.handleJoinDirectory(mockSocket, {
        sessionId: 'session-123',
        directoryPath: '/test/directory'
      });
    });

    it('should handle typing start events', () => {
      webSocketManager.handleTypingStart(mockSocket, {});

      expect(mockSocket.to).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('user-typing-start', expect.any(Object));
    });

    it('should handle typing stop events', () => {
      webSocketManager.handleTypingStop(mockSocket, {});

      expect(mockSocket.to).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('user-typing-stop', expect.any(Object));
    });

    it('should ignore typing events for non-connected sockets', () => {
      const disconnectedSocket = { id: 'disconnected-socket' };
      
      webSocketManager.handleTypingStart(disconnectedSocket, {});
      
      expect(mockSocket.emit).not.toHaveBeenCalledWith('user-typing-start', expect.any(Object));
    });
  });
});