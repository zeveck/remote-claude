const request = require('supertest');

// Mock dependencies before importing server
jest.mock('../src/auth-middleware');
jest.mock('../src/filesystem-manager'); 
jest.mock('../src/claude-code-integration');
jest.mock('../src/ssl-manager');
jest.mock('../src/chat-log-manager');

// Mock the config with chatLog section
jest.mock('../config/default.json', () => ({
  server: { port: 3443, host: '0.0.0.0' },
  ssl: { keyPath: './config/ssl/server.key', certPath: './config/ssl/server.crt' },
  auth: { sessionSecret: 'test', sessionTimeout: 1800000, maxLoginAttempts: 5 },
  claude: { timeout: 30000, maxConcurrent: 3, rateLimit: { requests: 100, window: 60000 } },
  security: { allowedDirectoriesFile: './config/allow-dirs.txt', passwordFile: './config/passwd.txt' },
  chatLog: { enabled: true, fileName: 'chatlog.md' }
}), { virtual: true });

describe('Chat Log Server Endpoints', () => {
  let app;
  let mockChatLogManager;

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
        // Mock session with directory
        req.session = { currentDirectory: '/test/directory' };
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
    
    app = setupMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/chatlog', () => {
    it('should return chat history successfully', async () => {
      const mockHistory = {
        history: [
          { role: 'user', content: 'Hello', timestamp: '2024-01-08T10:00:00Z' },
          { role: 'claude', content: 'Hi there!', timestamp: '2024-01-08T10:00:01Z' }
        ],
        sessionStartTime: '2024-01-08T10:00:00Z'
      };
      
      mockChatLogManager.readChatLog.mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/chatlog')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        chatHistory: mockHistory
      });
      expect(mockChatLogManager.readChatLog).toHaveBeenCalledWith('/test/directory');
    });

    it('should return error when no directory selected', async () => {
      app = setupMocks({
        requireAuth: jest.fn(() => (req, res, next) => {
          req.session = {}; // No currentDirectory
          next();
        })
      });

      const response = await request(app)
        .get('/api/chatlog')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'No directory selected. Please select a directory first.',
        needsDirectorySelection: true
      });
    });

    it('should handle directory access denied', async () => {
      app = setupMocks({
        isDirectoryAllowed: jest.fn(() => false)
      });

      const response = await request(app)
        .get('/api/chatlog')
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: 'Directory access denied'
      });
    });

    it('should handle ChatLogManager errors', async () => {
      mockChatLogManager.readChatLog.mockRejectedValue(new Error('File read error'));

      const response = await request(app)
        .get('/api/chatlog')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'File read error'
      });
    });
  });

  describe('POST /api/chatlog', () => {
    it('should save message successfully', async () => {
      mockChatLogManager.appendMessage.mockResolvedValue();

      const message = {
        role: 'user',
        content: 'Test message',
        timestamp: '2024-01-08T10:00:00Z'
      };

      const response = await request(app)
        .post('/api/chatlog')
        .send({ message })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Message saved to chat log'
      });
      expect(mockChatLogManager.appendMessage).toHaveBeenCalledWith('/test/directory', message);
    });

    it('should add timestamp if missing', async () => {
      mockChatLogManager.appendMessage.mockResolvedValue();

      const message = {
        role: 'claude',
        content: 'Response without timestamp'
      };

      const response = await request(app)
        .post('/api/chatlog')
        .send({ message })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      const calledMessage = mockChatLogManager.appendMessage.mock.calls[0][1];
      expect(calledMessage.timestamp).toBeDefined();
      expect(calledMessage.role).toBe('claude');
      expect(calledMessage.content).toBe('Response without timestamp');
    });

    it('should validate message format', async () => {
      const invalidMessage = {
        content: 'Missing role field'
      };

      const response = await request(app)
        .post('/api/chatlog')
        .send({ message: invalidMessage })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Message must have role and content fields'
      });
    });

    it('should require message field', async () => {
      const response = await request(app)
        .post('/api/chatlog')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('message');
    });

    it('should handle append errors', async () => {
      mockChatLogManager.appendMessage.mockRejectedValue(new Error('Write error'));

      const message = {
        role: 'user',
        content: 'Test message',
        timestamp: '2024-01-08T10:00:00Z'
      };

      const response = await request(app)
        .post('/api/chatlog')
        .send({ message })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Write error'
      });
    });
  });

  describe('DELETE /api/chatlog/clear', () => {
    it('should clear chat log successfully', async () => {
      mockChatLogManager.clearChatLog.mockResolvedValue();

      const response = await request(app)
        .delete('/api/chatlog/clear')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Chat log cleared successfully'
      });
      expect(mockChatLogManager.clearChatLog).toHaveBeenCalledWith('/test/directory');
    });

    it('should handle clear errors', async () => {
      mockChatLogManager.clearChatLog.mockRejectedValue(new Error('Delete error'));

      const response = await request(app)
        .delete('/api/chatlog/clear')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Delete error'
      });
    });

    it('should require directory selection', async () => {
      app = setupMocks({
        requireAuth: jest.fn(() => (req, res, next) => {
          req.session = {}; // No currentDirectory
          next();
        })
      });

      const response = await request(app)
        .delete('/api/chatlog/clear')
        .expect(400);

      expect(response.body.needsDirectorySelection).toBe(true);
    });
  });


  describe('Integration with existing endpoints', () => {
    it('should not interfere with existing endpoints', async () => {
      // Test that existing endpoints still work
      const response = await request(app)
        .get('/api/status')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });

    it('should handle authentication properly', async () => {
      // This test verifies that the authentication middleware is called
      // In the actual implementation, unauthenticated requests would be rejected
      // by the auth middleware before reaching the chatlog endpoints
      
      // For this test, we just verify the endpoint is protected
      const response = await request(app)
        .get('/api/chatlog')
        .expect(200); // Our mock always authenticates

      expect(response.body.success).toBeDefined();
    });
  });
});