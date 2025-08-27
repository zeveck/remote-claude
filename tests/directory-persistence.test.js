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

describe('Directory Persistence Tests', () => {
  let app;
  let mockFileSystemManager;

  const setupMocks = (directories = []) => {
    jest.resetModules();
    
    const AuthMiddleware = require('../src/auth-middleware');
    AuthMiddleware.mockImplementation(() => ({
      createSessionMiddleware: jest.fn(() => (req, res, next) => next()),
      handleLogin: jest.fn(() => (req, res) => res.json({ success: true })),
      handleLogout: jest.fn(() => (req, res) => res.json({ success: true })),
      getAuthStatus: jest.fn(() => (req, res) => res.json({ configured: true })),
      requireAuth: jest.fn(() => (req, res, next) => {
        req.session = { 
          currentDirectory: '/test/directory',
          id: 'session-123'
        };
        next();
      })
    }));

    const FileSystemManager = require('../src/filesystem-manager');
    mockFileSystemManager = {
      getAllowedDirectories: jest.fn(() => directories),
      isDirectoryAllowed: jest.fn(() => true),
      getDirectoryContents: jest.fn(() => ({ 
        files: [], 
        directories: [],
        name: 'test-dir',
        path: '/test/directory'
      })),
      readFileContents: jest.fn(() => ({ content: 'test' })),
      getBreadcrumbs: jest.fn(() => [])
    };
    FileSystemManager.mockImplementation(() => mockFileSystemManager);

    const { ClaudeCodeIntegration } = require('../src/claude-code-integration');
    ClaudeCodeIntegration.mockImplementation(() => ({
      execute: jest.fn()
    }));

    const ChatLogManager = require('../src/chat-log-manager');
    ChatLogManager.mockImplementation(() => ({
      readChatLog: jest.fn(),
      appendMessage: jest.fn(),
      clearChatLog: jest.fn()
    }));

    const WebSocketManager = require('../src/websocket-manager');
    WebSocketManager.mockImplementation(() => ({
      broadcastNewMessage: jest.fn(),
      broadcastChatCleared: jest.fn(),
      broadcastCommandStarted: jest.fn(),
      broadcastCommandCompleted: jest.fn()
    }));
    
    return require('../src/server').app;
  };

  beforeEach(() => {
    app = setupMocks([
      { name: 'Project A', fullPath: '/path/to/project-a' },
      { name: 'Project B', fullPath: '/path/to/project-b' },
      { name: 'Project C', fullPath: '/path/to/project-c' }
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/directories', () => {
    it('should return available directories for selection', async () => {
      const response = await request(app)
        .get('/api/directories')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.directories).toHaveLength(3);
      expect(response.body.directories[0]).toEqual({
        name: 'Project A',
        fullPath: '/path/to/project-a'
      });
    });

    it('should handle empty directories list', async () => {
      app = setupMocks([]);

      const response = await request(app)
        .get('/api/directories')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.directories).toHaveLength(0);
    });
  });

  describe('POST /api/select-directory', () => {
    it('should successfully select a valid directory', async () => {
      const testDirectory = '/path/to/project-b';

      const response = await request(app)
        .post('/api/select-directory')
        .send({ directoryPath: testDirectory })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.directory).toEqual({
        files: [],
        directories: [],
        name: 'test-dir',
        path: '/test/directory'
      });
      expect(mockFileSystemManager.getDirectoryContents).toHaveBeenCalledWith(testDirectory);
    });

    it('should reject invalid directory paths', async () => {
      mockFileSystemManager.isDirectoryAllowed.mockReturnValue(false);

      const response = await request(app)
        .post('/api/select-directory')
        .send({ directoryPath: '/invalid/path' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Directory access denied');
    });

    it('should handle missing directory path', async () => {
      const response = await request(app)
        .post('/api/select-directory')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required fields: directoryPath');
    });

    it('should handle filesystem errors', async () => {
      mockFileSystemManager.getDirectoryContents.mockImplementation(() => {
        throw new Error('Filesystem error');
      });

      const response = await request(app)
        .post('/api/select-directory')
        .send({ directoryPath: '/path/to/project-a' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Filesystem error');
    });
  });

  describe('Directory Selection Edge Cases', () => {
    it('should handle directory that was removed from allowed list', async () => {
      // First, setup with directory available
      app = setupMocks([
        { name: 'Project A', fullPath: '/path/to/project-a' },
        { name: 'Project B', fullPath: '/path/to/project-b' }
      ]);

      // Then simulate the previously stored directory no longer being in allowed list
      mockFileSystemManager.getAllowedDirectories.mockReturnValue([
        { name: 'Project B', fullPath: '/path/to/project-b' },
        { name: 'Project C', fullPath: '/path/to/project-c' }
      ]);

      const response = await request(app)
        .get('/api/directories')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.directories).toHaveLength(2);
      expect(response.body.directories).not.toContainEqual({
        name: 'Project A',
        fullPath: '/path/to/project-a'
      });
    });

    it('should handle directory selection with special characters', async () => {
      const specialPath = '/path/to/project with spaces & symbols!';
      
      app = setupMocks([
        { name: 'Special Project', fullPath: specialPath }
      ]);

      const response = await request(app)
        .post('/api/select-directory')
        .send({ directoryPath: specialPath })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockFileSystemManager.getDirectoryContents).toHaveBeenCalledWith(specialPath);
    });
  });

  describe('Directory Breadcrumbs', () => {
    it('should provide breadcrumbs for selected directory', async () => {
      const testBreadcrumbs = [
        { name: 'home', path: '/home' },
        { name: 'user', path: '/home/user' },
        { name: 'project', path: '/home/user/project' }
      ];

      mockFileSystemManager.getBreadcrumbs.mockReturnValue(testBreadcrumbs);

      const response = await request(app)
        .post('/api/select-directory')
        .send({ directoryPath: '/home/user/project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.breadcrumbs).toEqual(testBreadcrumbs);
      expect(mockFileSystemManager.getBreadcrumbs).toHaveBeenCalledWith('/home/user/project');
    });
  });
});