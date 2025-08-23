const AuthMiddleware = require('../src/auth-middleware');
const ConfigManager = require('../src/config-manager');

// Mock ConfigManager
jest.mock('../src/config-manager');

describe('AuthMiddleware', () => {
  let authMiddleware;
  let mockConfig;
  let mockConfigManager;
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockConfig = {
      auth: {
        sessionSecret: 'test-secret',
        sessionTimeout: 1800000,
        maxLoginAttempts: 5
      }
    };

    mockConfigManager = {
      isPasswordConfigured: jest.fn(),
      loadPassword: jest.fn(),
      verifyPassword: jest.fn()
    };

    ConfigManager.mockImplementation(() => mockConfigManager);
    
    authMiddleware = new AuthMiddleware(mockConfig);

    mockReq = {
      body: {},
      session: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSessionMiddleware', () => {
    it('should create session middleware with correct configuration', () => {
      const middleware = authMiddleware.createSessionMiddleware();
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow login attempts within limit', () => {
      const result = authMiddleware.checkRateLimit('127.0.0.1');
      expect(result.allowed).toBe(true);
    });

    it('should block login attempts after exceeding limit', () => {
      const ip = '127.0.0.1';
      
      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        authMiddleware.recordFailedAttempt(ip);
      }
      
      const result = authMiddleware.checkRateLimit(ip);
      expect(result.allowed).toBe(false);
      expect(result.timeRemaining).toBeGreaterThan(0);
    });

    it('should reset rate limit after timeout period', () => {
      const ip = '127.0.0.1';
      
      // Simulate failed attempts
      for (let i = 0; i < 5; i++) {
        authMiddleware.recordFailedAttempt(ip);
      }
      
      // Manually set old timestamp to simulate timeout
      const attempts = authMiddleware.loginAttempts.get(ip);
      attempts.lastAttempt = Date.now() - (16 * 60 * 1000); // 16 minutes ago
      
      const result = authMiddleware.checkRateLimit(ip);
      expect(result.allowed).toBe(true);
    });
  });

  describe('recordFailedAttempt', () => {
    it('should record failed login attempts', () => {
      const ip = '127.0.0.1';
      
      authMiddleware.recordFailedAttempt(ip);
      const attempts = authMiddleware.loginAttempts.get(ip);
      
      expect(attempts.count).toBe(1);
      expect(attempts.lastAttempt).toBeCloseTo(Date.now(), -2);
    });

    it('should increment attempt count for repeated failures', () => {
      const ip = '127.0.0.1';
      
      authMiddleware.recordFailedAttempt(ip);
      authMiddleware.recordFailedAttempt(ip);
      
      const attempts = authMiddleware.loginAttempts.get(ip);
      expect(attempts.count).toBe(2);
    });
  });

  describe('resetAttempts', () => {
    it('should reset login attempts for successful login', () => {
      const ip = '127.0.0.1';
      
      authMiddleware.recordFailedAttempt(ip);
      expect(authMiddleware.loginAttempts.has(ip)).toBe(true);
      
      authMiddleware.resetAttempts(ip);
      expect(authMiddleware.loginAttempts.has(ip)).toBe(false);
    });
  });

  describe('handleLogin', () => {
    let loginHandler;

    beforeEach(() => {
      loginHandler = authMiddleware.handleLogin();
    });

    it('should return 400 for missing password', async () => {
      mockReq.body = {};
      
      await loginHandler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Password is required'
      });
    });

    it('should return 500 if password not configured', async () => {
      mockReq.body = { password: 'test' };
      mockConfigManager.isPasswordConfigured.mockReturnValue(false);
      
      await loginHandler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Server not configured. Please run setup.'
      });
    });

    it('should return 401 for invalid password', async () => {
      mockReq.body = { password: 'wrong' };
      mockConfigManager.isPasswordConfigured.mockReturnValue(true);
      mockConfigManager.loadPassword.mockReturnValue({
        hash: 'hash',
        salt: 'salt',
        iterations: 10000,
        keyLength: 32,
        digest: 'sha256'
      });
      mockConfigManager.verifyPassword.mockReturnValue(false);
      
      await loginHandler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid password'
      });
    });

    it('should return 200 for valid password', async () => {
      mockReq.body = { password: 'correct' };
      mockConfigManager.isPasswordConfigured.mockReturnValue(true);
      mockConfigManager.loadPassword.mockReturnValue({
        hash: 'hash',
        salt: 'salt',
        iterations: 10000,
        keyLength: 32,
        digest: 'sha256'
      });
      mockConfigManager.verifyPassword.mockReturnValue(true);
      
      await loginHandler(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful'
      });
      expect(mockReq.session.authenticated).toBe(true);
      expect(mockReq.session.lastActivity).toBeCloseTo(Date.now(), -2);
    });

    it('should return 429 for rate limited IP', async () => {
      const ip = '127.0.0.1';
      
      // Exceed rate limit
      for (let i = 0; i < 5; i++) {
        authMiddleware.recordFailedAttempt(ip);
      }
      
      mockReq.body = { password: 'test' };
      
      await loginHandler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Too many login attempts')
        })
      );
    });
  });

  describe('handleLogout', () => {
    let logoutHandler;

    beforeEach(() => {
      logoutHandler = authMiddleware.handleLogout();
    });

    it('should successfully logout and destroy session', async () => {
      mockReq.session.destroy = jest.fn((callback) => callback(null));
      
      await logoutHandler(mockReq, mockRes);
      
      expect(mockReq.session.destroy).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out successfully'
      });
    });

    it('should handle logout error', async () => {
      const error = new Error('Session destroy failed');
      mockReq.session.destroy = jest.fn((callback) => callback(error));
      
      await logoutHandler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to logout'
      });
    });
  });

  describe('requireAuth', () => {
    let authHandler;

    beforeEach(() => {
      authHandler = authMiddleware.requireAuth();
    });

    it('should return 503 if password not configured', () => {
      mockConfigManager.isPasswordConfigured.mockReturnValue(false);
      
      authHandler(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Server not configured. Please run setup.',
        needsSetup: true
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if not authenticated', () => {
      mockConfigManager.isPasswordConfigured.mockReturnValue(true);
      mockReq.session = {};
      
      authHandler(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
        needsLogin: true
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if session expired due to inactivity', () => {
      mockConfigManager.isPasswordConfigured.mockReturnValue(true);
      mockReq.session = {
        authenticated: true,
        lastActivity: Date.now() - (2 * 1800000), // 1 hour ago (2x timeout)
        destroy: jest.fn()
      };
      
      authHandler(mockReq, mockRes, mockNext);
      
      expect(mockReq.session.destroy).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session expired due to inactivity',
        needsLogin: true
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next() for valid authenticated session and update lastActivity', () => {
      const initialTime = Date.now() - 1000; // 1 second ago
      mockConfigManager.isPasswordConfigured.mockReturnValue(true);
      mockReq.session = {
        authenticated: true,
        lastActivity: initialTime
      };
      
      authHandler(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockReq.session.lastActivity).toBeGreaterThan(initialTime);
    });

    it('should extend session on activity (sliding timeout)', () => {
      mockConfigManager.isPasswordConfigured.mockReturnValue(true);
      mockReq.session = {
        authenticated: true,
        lastActivity: Date.now() - 1000000 // 16+ minutes ago but less than 30
      };
      
      authHandler(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.session.lastActivity).toBeCloseTo(Date.now(), -2); // Within 100ms
    });
  });

  describe('getAuthStatus', () => {
    let statusHandler;

    beforeEach(() => {
      statusHandler = authMiddleware.getAuthStatus();
    });

    it('should return correct auth status', () => {
      mockConfigManager.isPasswordConfigured.mockReturnValue(true);
      mockReq.session = { authenticated: true };
      
      statusHandler(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        configured: true,
        authenticated: true,
        sessionTimeout: mockConfig.auth.sessionTimeout
      });
    });

    it('should return false for unconfigured server', () => {
      mockConfigManager.isPasswordConfigured.mockReturnValue(false);
      mockReq.session = {};
      
      statusHandler(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        configured: false,
        authenticated: undefined,
        sessionTimeout: mockConfig.auth.sessionTimeout
      });
    });
  });
});