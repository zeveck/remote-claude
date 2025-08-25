const express = require('express');
const https = require('https');
const path = require('path');
const SSLManager = require('./ssl-manager');
const AuthMiddleware = require('./auth-middleware');
const ValidationMiddleware = require('./validation-middleware');
const { logger } = require('./logger');

// Load configuration
const config = require('../config/default.json');

const app = express();
const PORT = config.server.port || 3443;

const NetworkUtils = require('./network-utils');

// Determine host based on configuration
let HOST;
if (config.server.allowNetworkAccess) {
  // Bind to all interfaces but use IP whitelist for security
  HOST = '0.0.0.0';
  logger.info('🌐 Network access enabled - binding to all interfaces');
  logger.info(`📍 Primary network IP: ${NetworkUtils.getPrimaryNetworkIP()}`);
  logger.warn('⚠️  Access restricted to local network IPs only');
} else {
  HOST = '127.0.0.1';
  logger.info('🔒 Local access only - binding to localhost');
}

// Initialize managers
const sslManager = new SSLManager(config);
const authMiddleware = new AuthMiddleware(config);

// Security middleware
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// Basic middleware
app.use(express.json({ limit: '1mb' })); // Limit request size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Session middleware
app.use(authMiddleware.createSessionMiddleware());

// Trust proxy for rate limiting (if behind reverse proxy)
app.set('trust proxy', 1);

// Additional security for network access
if (config.server.allowNetworkAccess && HOST !== '127.0.0.1') {
  // Add IP whitelist middleware for local network only
  app.use((req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    const isAllowed = NetworkUtils.isLocalNetworkIP(clientIP);
    
    if (!isAllowed) {
      logger.warn('Blocked access from non-local IP', { ip: clientIP });
      return res.status(403).json({
        success: false,
        error: 'Access denied: Local network access only'
      });
    }
    
    next();
  });
}

// Static files (public access)
app.use(express.static(path.join(__dirname, '../public')));

// Authentication routes
app.post('/api/login', authMiddleware.handleLogin());
app.post('/api/logout', authMiddleware.handleLogout());
app.get('/api/auth-status', authMiddleware.getAuthStatus());

// Initialize file system manager
const FileSystemManager = require('./filesystem-manager');
const fileSystemManager = new FileSystemManager(config);

// Initialize Claude Code integration
const { ClaudeCodeIntegration } = require('./claude-code-integration');
const claudeCodeIntegration = new ClaudeCodeIntegration();

// Protected routes (require authentication)
app.get('/api/status', authMiddleware.requireAuth(), (req, res) => {
  res.json({
    status: 'ok',
    message: 'Remote Claude Web Interface is running',
    ssl: true,
    authenticated: true,
    timestamp: new Date().toISOString()
  });
});

// Directory and file management routes
app.get('/api/directories', authMiddleware.requireAuth(), (req, res) => {
  try {
    const directories = fileSystemManager.getAllowedDirectories();
    res.json({
      success: true,
      directories: directories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/select-directory', 
  authMiddleware.requireAuth(), 
  ValidationMiddleware.requireFields(['directoryPath']),
  ValidationMiddleware.validatePath('directoryPath'),
  (req, res) => {
  try {
    const { directoryPath } = req.body;

    if (!directoryPath) {
      return res.status(400).json({
        success: false,
        error: 'Directory path is required'
      });
    }

    // Validate directory is allowed
    if (!fileSystemManager.isDirectoryAllowed(directoryPath)) {
      return res.status(403).json({
        success: false,
        error: 'Directory access denied'
      });
    }

    // Store selected directory in session
    req.session.currentDirectory = directoryPath;

    // Get directory contents
    const contents = fileSystemManager.getDirectoryContents(directoryPath);
    const breadcrumbs = fileSystemManager.getBreadcrumbs(directoryPath);

    res.json({
      success: true,
      directory: contents,
      breadcrumbs: breadcrumbs,
      message: `Selected directory: ${path.basename(directoryPath)}`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/files', authMiddleware.requireAuth(), (req, res) => {
  try {
    const currentDirectory = req.session.currentDirectory;

    if (!currentDirectory) {
      return res.status(400).json({
        success: false,
        error: 'No directory selected. Please select a directory first.',
        needsDirectorySelection: true
      });
    }

    const contents = fileSystemManager.getDirectoryContents(currentDirectory);
    const breadcrumbs = fileSystemManager.getBreadcrumbs(currentDirectory);

    res.json({
      success: true,
      directory: contents,
      breadcrumbs: breadcrumbs
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/file-content', 
  authMiddleware.requireAuth(), 
  ValidationMiddleware.validatePath('filePath'),
  (req, res) => {
  try {
    const { filePath } = req.query;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    const fileContent = fileSystemManager.readFileContents(filePath);

    res.json({
      success: true,
      file: fileContent
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Claude Code execution endpoint
app.post('/api/command', 
  authMiddleware.requireAuth(), 
  ValidationMiddleware.requireFields(['action', 'prompt']),
  ValidationMiddleware.sanitizeStrings(['action', 'prompt']),
  ValidationMiddleware.rateLimit(20, 60000), // 20 requests per minute
  async (req, res) => {
  try {
    const { action, prompt, options = {} } = req.body;
    const currentDirectory = req.session.currentDirectory;

    // Validate required fields
    if (!action || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Action and prompt are required'
      });
    }

    if (!currentDirectory) {
      return res.status(400).json({
        success: false,
        error: 'No directory selected. Please select a directory first.',
        needsDirectorySelection: true
      });
    }

    // Create request object
    const request = {
      userId: req.session.id || 'anonymous',
      workingDirectory: currentDirectory,
      action,
      prompt,
      options
    };

    // Execute Claude Code command
    const result = await claudeCodeIntegration.execute(request);

    // Wrap Claude's output
    const claudeOutput = {
      type: 'text',
      content: result.output || '',
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      result: {
        ...result,
        claudeOutput
      },
      message: `Claude Code ${action} completed successfully`
    });

  } catch (error) {
    logger.error('Claude Code execution error', { error: error.message, stack: error.stack });

    // Handle specific error types
    if (error.message.includes('Rate limit exceeded')) {
      return res.status(429).json({
        success: false,
        error: error.message,
        retryAfter: 3600 // 1 hour in seconds
      });
    }

    if (error.message.includes('timeout')) {
      return res.status(408).json({
        success: false,
        error: 'Command execution timed out. Please try a simpler request.'
      });
    }

    if (error.message.includes('blocked commands')) {
      return res.status(400).json({
        success: false,
        error: 'Command contains blocked patterns for security reasons'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Claude Code execution failed'
    });
  }
});

// Main application route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start HTTPS server
function startServer() {
  try {
    // Check if certificates exist, generate if needed
    if (sslManager.needsRegeneration()) {
      logger.info('SSL certificates not found or invalid, generating new ones...');
      sslManager.generateCertificates();
    }

    // Load SSL certificates
    const sslOptions = sslManager.loadCertificates();

    // Create HTTPS server
    const server = https.createServer(sslOptions, app);

    server.listen(PORT, HOST, () => {
      const os = require('os');
      const interfaces = os.networkInterfaces();

      logger.info('🔒 HTTPS Server running successfully!');
      logger.info(`📍 Local access: https://localhost:${PORT}`);

      // Find and display actual IP addresses
      Object.keys(interfaces).forEach(name => {
        interfaces[name].forEach(iface => {
          if (iface.family === 'IPv4' && !iface.internal) {
            logger.info(`📍 Network access: https://${iface.address}:${PORT}`);
          }
        });
      });

      logger.info('📱 Use the Network URL to access from your phone');
      logger.warn('⚠️  You may need to accept the self-signed certificate warning');
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        logger.error('❌ Server error', { error: error.message });
        process.exit(1);
      }
    });

    return server;

  } catch (error) {
    logger.error('❌ Failed to start HTTPS server', { error: error.message });
    logger.info('💡 Try running: npm run setup');
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };