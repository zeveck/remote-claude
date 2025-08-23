const request = require('supertest');

// Mock dependencies before importing server
jest.mock('../src/auth-middleware');
jest.mock('../src/filesystem-manager'); 
jest.mock('../src/claude-code-integration');
jest.mock('../src/ssl-manager');

// Mock the config
jest.mock('../config/default.json', () => ({
  server: { port: 3443, host: '0.0.0.0' },
  ssl: { keyPath: './config/ssl/server.key', certPath: './config/ssl/server.crt' },
  auth: { sessionSecret: 'test', sessionTimeout: 1800000, maxLoginAttempts: 5 },
  claude: { timeout: 30000, maxConcurrent: 3, rateLimit: { requests: 100, window: 60000 } },
  security: { allowedDirectoriesFile: './config/allow-dirs.txt', passwordFile: './config/passwd.txt' }
}), { virtual: true });

describe('Server', () => {
  let app;

  beforeEach(() => {
    // Set up basic mocks
    const AuthMiddleware = require('../src/auth-middleware');
    AuthMiddleware.mockImplementation(() => ({
      createSessionMiddleware: jest.fn(() => (req, res, next) => next()),
      handleLogin: jest.fn(() => (req, res) => res.json({ success: true })),
      handleLogout: jest.fn(() => (req, res) => res.json({ success: true })),
      getAuthStatus: jest.fn(() => (req, res) => res.json({ configured: true })),
      requireAuth: jest.fn(() => (req, res, next) => next())
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
    ClaudeCodeIntegration.mockImplementation(() => ({
      execute: jest.fn(() => ({ success: true, output: 'test' })),
      parseResponse: jest.fn(() => ({ result: 'test' }))
    }));
    
    // Clear and re-import app
    delete require.cache[require.resolve('../src/server')];
    app = require('../src/server').app;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should serve static files', async () => {
    const response = await request(app)
      .get('/')
      .expect(200);
    
    expect(response.type).toBe('text/html');
  });

  it('should handle login endpoint', async () => {
    const response = await request(app)
      .post('/api/login')
      .send({ password: 'test' })
      .expect(200);
    
    expect(response.body.success).toBe(true);
  });

  it('should handle logout endpoint', async () => {
    const response = await request(app)
      .post('/api/logout')
      .expect(200);
    
    expect(response.body.success).toBe(true);
  });

  it('should handle auth status endpoint', async () => {
    const response = await request(app)
      .get('/api/auth-status')
      .expect(200);
    
    expect(response.body.configured).toBe(true);
  });

  it('should handle status endpoint', async () => {
    const response = await request(app)
      .get('/api/status')
      .expect(200);
    
    expect(response.body.status).toBe('ok');
  });
});