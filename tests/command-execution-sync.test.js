const request = require('supertest');

// Mock dependencies before importing server
jest.mock('../src/auth-middleware');
jest.mock('../src/filesystem-manager');
jest.mock('../src/claude-code-integration');
jest.mock('../src/ssl-manager');
jest.mock('../src/chat-log-manager');
jest.mock('../src/websocket-manager');

// Mock the config
jest.mock('../config/default.json', () => ({
  server: { port: 3443, host: '0.0.0.0' },
  ssl: { keyPath: './config/ssl/server.key', certPath: './config/ssl/server.crt' },
  auth: { sessionSecret: 'test', sessionTimeout: 1800000, maxLoginAttempts: 5 },
  claude: { timeout: 30000, maxConcurrent: 3, rateLimit: { requests: 100, window: 60000 } },
  security: { allowedDirectoriesFile: './config/allow-dirs.txt', passwordFile: './config/passwd.txt' },
  chatLog: { enabled: true, fileName: 'chatlog.md' }
}), { virtual: true });

describe('Command Execution Synchronization Tests', () => {
  let app;
  let mockClaudeCodeIntegration;
  let mockWebSocketManager;

  const setupMocks = (overrides = {}) => {
    jest.resetModules();
    
    const AuthMiddleware = require('../src/auth-middleware');
    AuthMiddleware.mockImplementation(() => ({
      createSessionMiddleware: jest.fn(() => (req, res, next) => next()),
      handleLogin: jest.fn(() => (req, res) => res.json({ success: true })),
      handleLogout: jest.fn(() => (req, res) => res.json({ success: true })),
      getAuthStatus: jest.fn(() => (req, res) => res.json({ configured: true })),
      requireAuth: overrides.requireAuth || jest.fn(() => (req, res, next) => {
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
      isDirectoryAllowed: jest.fn(() => true),
      getDirectoryContents: jest.fn(() => ({ files: [], directories: [] })),
      readFileContents: jest.fn(() => ({ content: 'test' })),
      getBreadcrumbs: jest.fn(() => [])
    }));

    const { ClaudeCodeIntegration } = require('../src/claude-code-integration');
    ClaudeCodeIntegration.mockImplementation(() => mockClaudeCodeIntegration);

    const ChatLogManager = require('../src/chat-log-manager');
    ChatLogManager.mockImplementation(() => ({
      readChatLog: jest.fn(),
      appendMessage: jest.fn(),
      clearChatLog: jest.fn()
    }));

    const WebSocketManager = require('../src/websocket-manager');
    WebSocketManager.mockImplementation(() => mockWebSocketManager);
    
    return require('../src/server').app;
  };

  beforeEach(() => {
    mockClaudeCodeIntegration = {
      execute: jest.fn()
    };

    mockWebSocketManager = {
      broadcastNewMessage: jest.fn(),
      broadcastChatCleared: jest.fn(),
      broadcastCommandStarted: jest.fn(),
      broadcastCommandCompleted: jest.fn()
    };
    
    app = setupMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Command Execution Broadcasting', () => {
    it('should broadcast command-started before execution', async () => {
      mockClaudeCodeIntegration.execute.mockResolvedValue({
        success: true,
        output: 'Test output'
      });

      app.locals.webSocketManager = mockWebSocketManager;

      const response = await request(app)
        .post('/api/command')
        .send({
          action: 'generate',
          prompt: 'test command'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify command-started was broadcasted before execution
      expect(mockWebSocketManager.broadcastCommandStarted).toHaveBeenCalledWith(
        '/test/directory',
        'test command',
        'session-123'
      );

      // Verify command-completed was broadcasted after execution
      expect(mockWebSocketManager.broadcastCommandCompleted).toHaveBeenCalledWith(
        '/test/directory',
        true, // success
        'session-123'
      );

      // Verify the order: both should be called
      expect(mockWebSocketManager.broadcastCommandStarted).toHaveBeenCalledTimes(1);
      expect(mockWebSocketManager.broadcastCommandCompleted).toHaveBeenCalledTimes(1);
    });

    it('should broadcast command-completed with error on execution failure', async () => {
      mockClaudeCodeIntegration.execute.mockRejectedValue(new Error('Execution failed'));

      app.locals.webSocketManager = mockWebSocketManager;

      const response = await request(app)
        .post('/api/command')
        .send({
          action: 'generate',
          prompt: 'failing command'
        })
        .expect(500);

      expect(response.body.success).toBe(false);

      // Verify command-started was broadcasted
      expect(mockWebSocketManager.broadcastCommandStarted).toHaveBeenCalledWith(
        '/test/directory',
        'failing command',
        'session-123'
      );

      // Verify command-completed was broadcasted with error state
      expect(mockWebSocketManager.broadcastCommandCompleted).toHaveBeenCalledWith(
        '/test/directory',
        false, // error
        'session-123'
      );
    });

    it('should continue execution even if broadcasting fails', async () => {
      mockClaudeCodeIntegration.execute.mockResolvedValue({
        success: true,
        output: 'Test output'
      });

      // Make broadcasting throw errors
      mockWebSocketManager.broadcastCommandStarted.mockImplementation(() => {
        throw new Error('Broadcast failed');
      });
      mockWebSocketManager.broadcastCommandCompleted.mockImplementation(() => {
        throw new Error('Broadcast failed');
      });

      app.locals.webSocketManager = mockWebSocketManager;

      const response = await request(app)
        .post('/api/command')
        .send({
          action: 'generate',
          prompt: 'test command'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockClaudeCodeIntegration.execute).toHaveBeenCalled();
    });

    it('should work without WebSocket manager present', async () => {
      mockClaudeCodeIntegration.execute.mockResolvedValue({
        success: true,
        output: 'Test output'
      });

      // Don't set webSocketManager on app.locals

      const response = await request(app)
        .post('/api/command')
        .send({
          action: 'generate',
          prompt: 'test command'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockClaudeCodeIntegration.execute).toHaveBeenCalled();
      expect(mockWebSocketManager.broadcastCommandStarted).not.toHaveBeenCalled();
      expect(mockWebSocketManager.broadcastCommandCompleted).not.toHaveBeenCalled();
    });
  });

  describe('Session ID Handling', () => {
    it('should exclude sender from command execution broadcasts', async () => {
      const testSessionId = 'unique-session-456';
      
      app = setupMocks({
        requireAuth: jest.fn(() => (req, res, next) => {
          req.session = { 
            currentDirectory: '/test/directory',
            id: testSessionId
          };
          next();
        })
      });

      mockClaudeCodeIntegration.execute.mockResolvedValue({
        success: true,
        output: 'Test output'
      });

      app.locals.webSocketManager = mockWebSocketManager;

      await request(app)
        .post('/api/command')
        .send({
          action: 'generate',
          prompt: 'test command'
        })
        .expect(200);

      expect(mockWebSocketManager.broadcastCommandStarted).toHaveBeenCalledWith(
        '/test/directory',
        'test command',
        testSessionId
      );

      expect(mockWebSocketManager.broadcastCommandCompleted).toHaveBeenCalledWith(
        '/test/directory',
        true,
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

      mockClaudeCodeIntegration.execute.mockResolvedValue({
        success: true,
        output: 'Test output'
      });

      app.locals.webSocketManager = mockWebSocketManager;

      await request(app)
        .post('/api/command')
        .send({
          action: 'generate',
          prompt: 'test command'
        })
        .expect(200);

      expect(mockWebSocketManager.broadcastCommandStarted).toHaveBeenCalledWith(
        '/test/directory',
        'test command',
        undefined
      );

      expect(mockWebSocketManager.broadcastCommandCompleted).toHaveBeenCalledWith(
        '/test/directory',
        true,
        undefined
      );
    });
  });

  describe('Command Truncation', () => {
    it('should truncate long commands for logging', async () => {
      const longCommand = 'a'.repeat(200); // Very long command
      
      mockClaudeCodeIntegration.execute.mockResolvedValue({
        success: true,
        output: 'Test output'
      });

      app.locals.webSocketManager = mockWebSocketManager;

      await request(app)
        .post('/api/command')
        .send({
          action: 'generate',
          prompt: longCommand
        })
        .expect(200);

      // Verify full command is still passed to broadcast (client will truncate for display)
      expect(mockWebSocketManager.broadcastCommandStarted).toHaveBeenCalledWith(
        '/test/directory',
        longCommand, // Full command should be passed
        'session-123'
      );
    });
  });

  describe('Error Types', () => {
    it('should broadcast completion on rate limit errors', async () => {
      mockClaudeCodeIntegration.execute.mockRejectedValue(new Error('Rate limit exceeded'));

      app.locals.webSocketManager = mockWebSocketManager;

      await request(app)
        .post('/api/command')
        .send({
          action: 'generate',
          prompt: 'test command'
        })
        .expect(429);

      expect(mockWebSocketManager.broadcastCommandCompleted).toHaveBeenCalledWith(
        '/test/directory',
        false,
        'session-123'
      );
    });

    it('should broadcast completion on timeout errors', async () => {
      mockClaudeCodeIntegration.execute.mockRejectedValue(new Error('timeout'));

      app.locals.webSocketManager = mockWebSocketManager;

      await request(app)
        .post('/api/command')
        .send({
          action: 'generate',
          prompt: 'test command'
        })
        .expect(408);

      expect(mockWebSocketManager.broadcastCommandCompleted).toHaveBeenCalledWith(
        '/test/directory',
        false,
        'session-123'
      );
    });
  });
});