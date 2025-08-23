const ConfigManager = require('../src/config-manager');
const fs = require('fs');
const path = require('path');

describe('ConfigManager', () => {
  let configManager;
  let testConfig;
  
  beforeEach(() => {
    testConfig = {
      security: {
        passwordFile: 'tests/temp/test-passwd.txt',
        allowedDirectoriesFile: 'tests/temp/test-allow-dirs.txt'
      }
    };
    
    // Ensure temp directory exists
    if (!fs.existsSync('tests/temp')) {
      fs.mkdirSync('tests/temp', { recursive: true });
    }
    
    configManager = new ConfigManager(testConfig);
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testConfig.security.passwordFile)) {
      fs.unlinkSync(testConfig.security.passwordFile);
    }
    if (fs.existsSync(testConfig.security.allowedDirectoriesFile)) {
      fs.unlinkSync(testConfig.security.allowedDirectoriesFile);
    }
  });

  describe('Password Management', () => {
    it('should save and verify passwords', () => {
      const password = 'testPassword123';
      
      // Save password
      configManager.savePassword(password);
      expect(configManager.isPasswordConfigured()).toBe(true);
      
      // Load the password data
      const passwordData = configManager.loadPassword();
      expect(passwordData).not.toBeNull();
      
      // Verify correct password
      const result = configManager.verifyPassword(
        password,
        passwordData.hash,
        passwordData.salt,
        passwordData.iterations,
        passwordData.keyLength,
        passwordData.digest
      );
      expect(result).toBe(true);
      
      // Reject wrong password  
      const wrongResult = configManager.verifyPassword(
        'wrongPassword',
        passwordData.hash,
        passwordData.salt,
        passwordData.iterations,
        passwordData.keyLength,
        passwordData.digest
      );
      expect(wrongResult).toBe(false);
    });

    it('should handle missing password file', () => {
      expect(configManager.isPasswordConfigured()).toBe(false);
      expect(configManager.loadPassword()).toBeNull();
    });
  });

  describe('Directory Management', () => {
    it('should save and load allowed directories', () => {
      const tempDir1 = path.resolve('tests/temp/dir1');
      const tempDir2 = path.resolve('tests/temp/dir2');
      
      // Create test directories
      fs.mkdirSync(tempDir1, { recursive: true });
      fs.mkdirSync(tempDir2, { recursive: true });
      
      // Save directories
      const savedDirectories = configManager.saveAllowedDirectories([tempDir1, tempDir2]);
      expect(savedDirectories).toContain(tempDir1);
      expect(savedDirectories).toContain(tempDir2);
      
      // Verify file was created
      expect(fs.existsSync(testConfig.security.allowedDirectoriesFile)).toBe(true);
      
      // Load and verify
      const loaded = configManager.loadAllowedDirectories();
      expect(loaded).toHaveLength(2);
      expect(loaded).toContain(tempDir1);
      expect(loaded).toContain(tempDir2);
      
      // Clean up
      fs.rmSync(tempDir1, { recursive: true });
      fs.rmSync(tempDir2, { recursive: true });
    });

    it('should check if directory is allowed', () => {
      const tempDir = path.resolve('tests/temp/allowed');
      fs.mkdirSync(tempDir, { recursive: true });
      
      configManager.saveAllowedDirectories([tempDir]);
      
      // Should allow the directory and its subdirectories
      expect(configManager.isDirectoryAllowed(tempDir)).toBe(true);
      expect(configManager.isDirectoryAllowed(path.join(tempDir, 'subdir'))).toBe(true);
      
      // Should reject other directories
      expect(configManager.isDirectoryAllowed('/some/other/path')).toBe(false);
      
      fs.rmSync(tempDir, { recursive: true });
    });

    it('should handle missing directories file', () => {
      expect(configManager.areDirectoriesConfigured()).toBe(false);
      expect(configManager.loadAllowedDirectories()).toEqual([]);
    });
  });

  describe('Configuration Status', () => {
    it('should report configuration status', () => {
      const status = configManager.getConfigurationStatus();
      
      expect(status).toHaveProperty('passwordConfigured');
      expect(status).toHaveProperty('directoriesConfigured');
      expect(status).toHaveProperty('allowedDirectories');
      
      // Initially nothing is configured
      expect(status.passwordConfigured).toBe(false);
      expect(status.directoriesConfigured).toBe(false);
    });

    it('should validate complete configuration', () => {
      expect(() => {
        configManager.validateConfiguration();
      }).toThrow('Password not configured');
      
      // Configure password
      configManager.savePassword('test');
      
      expect(() => {
        configManager.validateConfiguration();
      }).toThrow('Allowed directories not configured');
      
      // Configure directories
      const tempDir = path.resolve('tests/temp/dir');
      fs.mkdirSync(tempDir, { recursive: true });
      configManager.saveAllowedDirectories([tempDir]);
      
      // Should not throw now
      expect(() => {
        configManager.validateConfiguration();
      }).not.toThrow();
      
      fs.rmSync(tempDir, { recursive: true });
    });
  });
});