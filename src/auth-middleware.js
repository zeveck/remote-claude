const ConfigManager = require('./config-manager');
const session = require('express-session');

class AuthMiddleware {
  constructor(config) {
    this.configManager = new ConfigManager(config);
    this.config = config;
    this.loginAttempts = new Map(); // Track login attempts by IP
  }

  /**
   * Create session middleware
   */
  createSessionMiddleware() {
    // Generate secure session secret if not configured
    const sessionSecret = this.config.auth.sessionSecret || this.generateSessionSecret();
    
    return session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true, // HTTPS only
        httpOnly: true, // Prevent XSS
        maxAge: this.config.auth.sessionTimeout,
        sameSite: 'strict' // CSRF protection
      },
      name: 'claude-session' // Custom session name
    });
  }

  /**
   * Generate a secure session secret
   */
  generateSessionSecret() {
    const crypto = require('crypto');
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Rate limiting for login attempts
   */
  checkRateLimit(ip) {
    const attempts = this.loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    const now = Date.now();
    const timeSinceLastAttempt = now - attempts.lastAttempt;
    
    // Reset counter after 15 minutes
    if (timeSinceLastAttempt > 15 * 60 * 1000) {
      attempts.count = 0;
    }
    
    if (attempts.count >= this.config.auth.maxLoginAttempts) {
      const timeRemaining = 15 * 60 * 1000 - timeSinceLastAttempt;
      if (timeRemaining > 0) {
        return {
          allowed: false,
          timeRemaining: Math.ceil(timeRemaining / 1000 / 60) // minutes
        };
      }
    }
    
    return { allowed: true };
  }

  /**
   * Record failed login attempt
   */
  recordFailedAttempt(ip) {
    const attempts = this.loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    this.loginAttempts.set(ip, attempts);
  }

  /**
   * Reset login attempts for successful login
   */
  resetAttempts(ip) {
    this.loginAttempts.delete(ip);
  }

  /**
   * Login route handler
   */
  handleLogin() {
    return async (req, res) => {
      try {
        const { password } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        // Check rate limiting
        const rateCheck = this.checkRateLimit(clientIP);
        if (!rateCheck.allowed) {
          return res.status(429).json({
            success: false,
            error: `Too many login attempts. Try again in ${rateCheck.timeRemaining} minutes.`
          });
        }
        
        // Validate password
        if (!password) {
          this.recordFailedAttempt(clientIP);
          return res.status(400).json({
            success: false,
            error: 'Password is required'
          });
        }
        
        // Check if password is configured
        if (!this.configManager.isPasswordConfigured()) {
          return res.status(500).json({
            success: false,
            error: 'Server not configured. Please run setup.'
          });
        }
        
        // Verify password
        const storedPassword = this.configManager.loadPassword();
        const isValid = this.configManager.verifyPassword(
          password, 
          storedPassword.hash, 
          storedPassword.salt,
          storedPassword.iterations,
          storedPassword.keyLength,
          storedPassword.digest
        );
        
        if (!isValid) {
          this.recordFailedAttempt(clientIP);
          return res.status(401).json({
            success: false,
            error: 'Invalid password'
          });
        }
        
        // Successful login
        this.resetAttempts(clientIP);
        req.session.authenticated = true;
        req.session.lastActivity = Date.now();
        
        res.json({
          success: true,
          message: 'Login successful'
        });
        
      } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    };
  }

  /**
   * Logout route handler
   */
  handleLogout() {
    return (req, res) => {
      req.session.destroy((err) => {
        if (err) {
          console.error('Logout error:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to logout'
          });
        }
        
        res.json({
          success: true,
          message: 'Logged out successfully'
        });
      });
    };
  }

  /**
   * Authentication check middleware
   */
  requireAuth() {
    return (req, res, next) => {
      // Check if authentication is configured
      if (!this.configManager.isPasswordConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Server not configured. Please run setup.',
          needsSetup: true
        });
      }
      
      // Check if user is authenticated
      if (!req.session || !req.session.authenticated) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          needsLogin: true
        });
      }
      
      // Check session timeout (sliding window based on last activity)
      const timeSinceActivity = Date.now() - req.session.lastActivity;
      if (timeSinceActivity > this.config.auth.sessionTimeout) {
        req.session.destroy();
        return res.status(401).json({
          success: false,
          error: 'Session expired due to inactivity',
          needsLogin: true
        });
      }
      
      // Update last activity time for sliding timeout
      req.session.lastActivity = Date.now();
      
      next();
    };
  }

  /**
   * Get authentication status
   */
  getAuthStatus() {
    return (req, res) => {
      const isConfigured = this.configManager.isPasswordConfigured();
      const isAuthenticated = req.session && req.session.authenticated;
      
      res.json({
        configured: isConfigured,
        authenticated: isAuthenticated,
        sessionTimeout: this.config.auth.sessionTimeout
      });
    };
  }
}

module.exports = AuthMiddleware;