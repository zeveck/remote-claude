const express = require('express');
const https = require('https');
const path = require('path');
const fs = require('fs');
const SSLManager = require('./ssl-manager');
const AuthMiddleware = require('./auth-middleware');

// Load configuration
const config = require('../config/default.json');

const app = express();
const PORT = config.server.port || 3443;
const HOST = config.server.host || '0.0.0.0';

// Initialize managers
const sslManager = new SSLManager(config);
const authMiddleware = new AuthMiddleware(config);

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(authMiddleware.createSessionMiddleware());

// Trust proxy for rate limiting (if behind reverse proxy)
app.set('trust proxy', 1);

// Static files (public access)
app.use(express.static(path.join(__dirname, '../public')));

// Authentication routes
app.post('/api/login', authMiddleware.handleLogin());
app.post('/api/logout', authMiddleware.handleLogout());
app.get('/api/auth-status', authMiddleware.getAuthStatus());

// Initialize file system manager
const FileSystemManager = require('./filesystem-manager');
const fileSystemManager = new FileSystemManager(config);

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

app.post('/api/select-directory', authMiddleware.requireAuth(), (req, res) => {
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

app.get('/api/file-content', authMiddleware.requireAuth(), (req, res) => {
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

// Main application route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start HTTPS server
function startServer() {
  try {
    // Check if certificates exist, generate if needed
    if (sslManager.needsRegeneration()) {
      console.log('SSL certificates not found or invalid, generating new ones...');
      sslManager.generateCertificates();
    }

    // Load SSL certificates
    const sslOptions = sslManager.loadCertificates();
    
    // Create HTTPS server
    const server = https.createServer(sslOptions, app);
    
    server.listen(PORT, HOST, () => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      
      console.log(`🔒 HTTPS Server running successfully!`);
      console.log(`\n📍 Access URLs:`);
      console.log(`   Local:    https://localhost:${PORT}`);
      
      // Find and display actual IP addresses
      Object.keys(interfaces).forEach(name => {
        interfaces[name].forEach(iface => {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`   Network:  https://${iface.address}:${PORT}`);
          }
        });
      });
      
      console.log(`\n📱 Use the Network URL to access from your phone`);
      console.log('⚠️  You may need to accept the self-signed certificate warning');
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error.message);
        process.exit(1);
      }
    });

    return server;
    
  } catch (error) {
    console.error('❌ Failed to start HTTPS server:', error.message);
    console.log('\n💡 Try running: npm run setup');
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };