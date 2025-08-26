const request = require('supertest');
const { Server } = require('socket.io');

// Mock dependencies before importing server
jest.mock('../src/auth-middleware');
jest.mock('../src/filesystem-manager');
jest.mock('../src/claude-code-integration');
jest.mock('../src/ssl-manager');
jest.mock('../src/chat-log-manager');
jest.mock('../src/websocket-manager');

// Mock the config with chatLog section
jest.mock('../config/default.json', () => ({
  server: { port: 3443, host: '0.0.0.0' },
  ssl: { keyPath: './config/ssl/server.key', certPath: './config/ssl/server.crt' },
  auth: { sessionSecret: 'test', sessionTimeout: 1800000, maxLoginAttempts: 5 },
  claude: { timeout: 30000, maxConcurrent: 3, rateLimit: { requests: 100, window: 60000 } },
  security: { allowedDirectoriesFile: './config/allow-dirs.txt', passwordFile: './config/passwd.txt' },
  chatLog: { enabled: true, fileName: 'chatlog.md' }
}), { virtual: true });

describe('WebSocket Integration Tests', () => {
  let app;
  let httpServer;
  let mockChatLogManager;
  let mockWebSocketManager;

  const setupMocks = (overrides = {}) => {
    jest.resetModules();
    
    // Set up basic mocks
    const AuthMiddleware = require('../src/auth-middleware');
    AuthMiddleware.mockImplementation(() => ({
      createSessionMiddleware: jest.fn(() => (req, res, next) => next()),
      handleLogin: jest.fn(() => (req, res) => res.json({ success: true })),
      handleLogout: jest.fn(() => (req, res) => res.json({ success: true })),
      getAuthStatus: jest.fn(() => (req, res) => res.json({ configured: true })),
      requireAuth: overrides.requireAuth || jest.fn(() => (req, res, next) => {
        // Mock session with directory and session ID
        req.session = { 
          currentDirectory: '/test/directory',
          id: 'session-123'
        };
        next();
      })
    }));

    const FileSystemManager = require('../src/filesystem-manager');
    FileSystemManager.mockImplementation(() => ({
      getAllowedDirectories: jest.fn(() => []),
      isDirectoryAllowed: overrides.isDirectoryAllowed || jest.fn(() => true),
      getDirectoryContents: jest.fn(() => ({ files: [], directories: [] })),
      readFileContents: jest.fn(() => ({ content: 'test' })),
      getBreadcrumbs: jest.fn(() => [])
    }));

    const { ClaudeCodeIntegration } = require('../src/claude-code-integration');
    ClaudeCodeIntegration.mockImplementation(() => ({
      execute: jest.fn(() => ({ success: true, output: 'test' }))
    }));

    // Mock ChatLogManager
    const ChatLogManager = require('../src/chat-log-manager');
    ChatLogManager.mockImplementation(() => mockChatLogManager);

    // Mock WebSocketManager
    const WebSocketManager = require('../src/websocket-manager');
    WebSocketManager.mockImplementation(() => mockWebSocketManager);
    
    // Get the fresh app instance
    return require('../src/server').app;
  };

  beforeEach(() => {
    // Mock ChatLogManager
    mockChatLogManager = {
      readChatLog: jest.fn(),
      appendMessage: jest.fn(),
      clearChatLog: jest.fn()
    };

    // Mock WebSocketManager
    mockWebSocketManager = {
      broadcastNewMessage: jest.fn(),
      broadcastChatCleared: jest.fn(),
      getStatistics: jest.fn(() => ({
        totalConnections: 0,
        activeRooms: 0,
        roomDetails: {}
      }))
    };
    
    app = setupMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/chatlog with WebSocket Broadcasting', () => {
    it('should broadcast new message after saving to server', async () => {
      mockChatLogManager.appendMessage.mockResolvedValue();

      const message = {
        role: 'user',
        content: 'Test message for broadcasting',
        timestamp: '2024-01-08T10:00:00Z'
      };

      // Make the app locals available
      app.locals.webSocketManager = mockWebSocketManager;

      const response = await request(app)
        .post('/api/chatlog')
        .send({ message })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Message saved to chat log'
      });

      // Verify message was saved to chat log manager
      expect(mockChatLogManager.appendMessage).toHaveBeenCalledWith('/test/directory', message);

      // Verify WebSocket broadcast was called
      expect(mockWebSocketManager.broadcastNewMessage).toHaveBeenCalledWith(
        '/test/directory',
        message,
        'session-123' // session ID should exclude sender
      );
    });

    it('should save message even if WebSocket broadcasting fails', async () => {
      mockChatLogManager.appendMessage.mockResolvedValue();
      mockWebSocketManager.broadcastNewMessage.mockImplementation(() => {
        throw new Error('WebSocket error');
      });

      const message = {
        role: 'claude',
        content: 'Response message',
        timestamp: '2024-01-08T10:00:00Z'
      };

      app.locals.webSocketManager = mockWebSocketManager;

      const response = await request(app)
        .post('/api/chatlog')
        .send({ message })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockChatLogManager.appendMessage).toHaveBeenCalled();
    });

    it('should work without WebSocket manager present', async () => {
      mockChatLogManager.appendMessage.mockResolvedValue();
      
      // Don't set webSocketManager on app.locals
      const message = {
        role: 'user',
        content: 'Test without WebSocket',
        timestamp: '2024-01-08T10:00:00Z'
      };

      const response = await request(app)
        .post('/api/chatlog')
        .send({ message })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockChatLogManager.appendMessage).toHaveBeenCalled();
      expect(mockWebSocketManager.broadcastNewMessage).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/chatlog/clear with WebSocket Broadcasting', () => {
    it('should broadcast chat cleared after clearing from server', async () => {
      mockChatLogManager.clearChatLog.mockResolvedValue();
      app.locals.webSocketManager = mockWebSocketManager;

      const response = await request(app)
        .delete('/api/chatlog/clear')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Chat log cleared successfully'
      });

      // Verify chat log was cleared
      expect(mockChatLogManager.clearChatLog).toHaveBeenCalledWith('/test/directory');

      // Verify WebSocket broadcast was called
      expect(mockWebSocketManager.broadcastChatCleared).toHaveBeenCalledWith(
        '/test/directory',
        'session-123' // session ID should exclude user who cleared
      );
    });

    it('should clear chat even if WebSocket broadcasting fails', async () => {
      mockChatLogManager.clearChatLog.mockResolvedValue();
      mockWebSocketManager.broadcastChatCleared.mockImplementation(() => {
        throw new Error('WebSocket broadcast error');
      });

      app.locals.webSocketManager = mockWebSocketManager;

      const response = await request(app)
        .delete('/api/chatlog/clear')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockChatLogManager.clearChatLog).toHaveBeenCalled();
    });
  });

  describe('WebSocket Manager Integration', () => {
    it('should make WebSocket manager available to endpoints', async () => {
      const testWebSocketManager = { test: 'manager' };
      app.locals.webSocketManager = testWebSocketManager;

      // Access a route that might use the WebSocket manager
      await request(app)
        .get('/api/status')
        .expect(200);

      // Verify the manager is accessible
      expect(app.locals.webSocketManager).toBe(testWebSocketManager);
    });

    it('should handle missing WebSocket manager gracefully', async () => {
      // Don't set webSocketManager
      delete app.locals.webSocketManager;

      const message = {
        role: 'user',
        content: 'Test without manager',
        timestamp: '2024-01-08T10:00:00Z'
      };

      mockChatLogManager.appendMessage.mockResolvedValue();

      const response = await request(app)
        .post('/api/chatlog')
        .send({ message })
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should not crash even without WebSocket manager
    });
  });

  describe('Session ID Handling', () => {
    it('should use session ID to exclude sender from broadcasts', async () => {
      const testSessionId = 'unique-session-789';
      
      app = setupMocks({
        requireAuth: jest.fn(() => (req, res, next) => {
          req.session = { 
            currentDirectory: '/test/directory',
            id: testSessionId
          };
          next();
        })
      });

      mockChatLogManager.appendMessage.mockResolvedValue();
      app.locals.webSocketManager = mockWebSocketManager;

      const message = {
        role: 'user',
        content: 'Test session exclusion',
        timestamp: '2024-01-08T10:00:00Z'
      };

      await request(app)
        .post('/api/chatlog')
        .send({ message })
        .expect(200);

      expect(mockWebSocketManager.broadcastNewMessage).toHaveBeenCalledWith(
        '/test/directory',
        message,
        testSessionId
      );
    });

    it('should handle missing session ID gracefully', async () => {
      app = setupMocks({
        requireAuth: jest.fn(() => (req, res, next) => {
          req.session = { 
            currentDirectory: '/test/directory'
            // No session ID
          };
          next();
        })
      });

      mockChatLogManager.appendMessage.mockResolvedValue();
      app.locals.webSocketManager = mockWebSocketManager;

      const message = {
        role: 'user',
        content: 'Test without session ID',
        timestamp: '2024-01-08T10:00:00Z'
      };

      await request(app)
        .post('/api/chatlog')
        .send({ message })
        .expect(200);

      expect(mockWebSocketManager.broadcastNewMessage).toHaveBeenCalledWith(
        '/test/directory',
        message,
        undefined
      );
    });
  });

  describe('Error Scenarios', () => {
    it('should continue operation when WebSocket manager throws errors', async () => {
      mockChatLogManager.appendMessage.mockResolvedValue();
      
      const faultyWebSocketManager = {
        broadcastNewMessage: jest.fn(() => {
          throw new Error('Broadcasting failed');
        }),
        broadcastChatCleared: jest.fn(() => {
          throw new Error('Clear broadcast failed');
        })
      };
      
      app.locals.webSocketManager = faultyWebSocketManager;

      // Test POST endpoint
      const message = { role: 'user', content: 'Test error handling' };
      
      const postResponse = await request(app)
        .post('/api/chatlog')
        .send({ message })
        .expect(200);

      expect(postResponse.body.success).toBe(true);

      // Test DELETE endpoint
      mockChatLogManager.clearChatLog.mockResolvedValue();
      
      const deleteResponse = await request(app)
        .delete('/api/chatlog/clear')
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);
    });
  });
});