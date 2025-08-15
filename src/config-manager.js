const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ConfigManager {
  constructor(config) {
    this.passwordFile = config.security.passwordFile;
    this.allowedDirectoriesFile = config.security.allowedDirectoriesFile;
  }

  /**
   * Generate a random salt for password hashing
   */
  generateSalt() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash a password with PBKDF2 (100,000 iterations) and salt - modern security standards
   */
  hashPassword(password, salt) {
    if (!salt) {
      salt = this.generateSalt();
    }
    
    // PBKDF2 with 100,000 iterations (OWASP recommendation)
    const iterations = 100000;
    const keyLength = 64; // 512 bits
    const digest = 'sha256';
    
    const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);
    
    return {
      hash: hash.toString('hex'),
      salt: salt,
      iterations: iterations,
      keyLength: keyLength,
      digest: digest
    };
  }

  /**
   * Verify a password against stored hash
   */
  verifyPassword(password, storedHash, salt, iterations, keyLength, digest) {
    const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);
    const computedHash = hash.toString('hex');
    
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(storedHash, 'hex'),
      Buffer.from(computedHash, 'hex')
    );
  }

  /**
   * Save password hash to file
   */
  savePassword(password) {
    try {
      const { hash, salt, iterations, keyLength, digest } = this.hashPassword(password);
      // Store all parameters needed for verification
      const passwordData = `${hash}:${salt}:${iterations}:${keyLength}:${digest}`;
      
      // Ensure config directory exists
      const configDir = path.dirname(this.passwordFile);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(this.passwordFile, passwordData, 'utf8');
      return true;
    } catch (error) {
      throw new Error(`Failed to save password: ${error.message}`);
    }
  }

  /**
   * Load password hash from file
   */
  loadPassword() {
    try {
      if (!fs.existsSync(this.passwordFile)) {
        return null;
      }
      
      const passwordData = fs.readFileSync(this.passwordFile, 'utf8').trim();
      const parts = passwordData.split(':');
      
      if (parts.length !== 5) {
        throw new Error('Invalid password file format. Expected: hash:salt:iterations:keyLength:digest');
      }
      
      const [hash, salt, iterations, keyLength, digest] = parts;
      return { 
        hash, 
        salt, 
        iterations: parseInt(iterations), 
        keyLength: parseInt(keyLength), 
        digest
      };
    } catch (error) {
      throw new Error(`Failed to load password: ${error.message}`);
    }
  }

  /**
   * Check if password is configured
   */
  isPasswordConfigured() {
    try {
      const passwordData = this.loadPassword();
      return passwordData !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Save allowed directories to file
   */
  saveAllowedDirectories(directories) {
    try {
      // Validate directories exist
      const validDirectories = [];
      for (const dir of directories) {
        const resolvedPath = path.resolve(dir);
        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
          validDirectories.push(resolvedPath);
        } else {
          console.warn(`⚠️  Directory does not exist: ${dir}`);
        }
      }
      
      if (validDirectories.length === 0) {
        throw new Error('No valid directories provided');
      }
      
      // Ensure config directory exists
      const configDir = path.dirname(this.allowedDirectoriesFile);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      const directoriesData = validDirectories.join('\n');
      fs.writeFileSync(this.allowedDirectoriesFile, directoriesData, 'utf8');
      
      console.log('✅ Allowed directories saved successfully');
      console.log(`📁 ${validDirectories.length} directories configured:`);
      validDirectories.forEach(dir => console.log(`   ${dir}`));
      
      return validDirectories;
    } catch (error) {
      throw new Error(`Failed to save allowed directories: ${error.message}`);
    }
  }

  /**
   * Load allowed directories from file
   */
  loadAllowedDirectories() {
    try {
      if (!fs.existsSync(this.allowedDirectoriesFile)) {
        return [];
      }
      
      const directoriesData = fs.readFileSync(this.allowedDirectoriesFile, 'utf8');
      const directories = directoriesData
        .split('\n')
        .map(dir => dir.trim())
        .filter(dir => dir.length > 0);
      
      // Validate directories still exist
      const validDirectories = directories.filter(dir => {
        try {
          return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
        } catch (error) {
          return false;
        }
      });
      
      return validDirectories;
    } catch (error) {
      throw new Error(`Failed to load allowed directories: ${error.message}`);
    }
  }

  /**
   * Check if directories are configured
   */
  areDirectoriesConfigured() {
    try {
      const directories = this.loadAllowedDirectories();
      return directories.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate if a directory is in the allowed list
   */
  isDirectoryAllowed(targetPath) {
    try {
      const allowedDirectories = this.loadAllowedDirectories();
      const resolvedTarget = path.resolve(targetPath);
      
      return allowedDirectories.some(allowedDir => {
        const resolvedAllowed = path.resolve(allowedDir);
        // Check if target is the allowed directory or a subdirectory of it
        return resolvedTarget === resolvedAllowed || 
               resolvedTarget.startsWith(resolvedAllowed + path.sep);
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Get configuration status
   */
  getConfigurationStatus() {
    return {
      passwordConfigured: this.isPasswordConfigured(),
      directoriesConfigured: this.areDirectoriesConfigured(),
      allowedDirectories: this.loadAllowedDirectories()
    };
  }

  /**
   * Validate complete configuration
   */
  validateConfiguration() {
    const status = this.getConfigurationStatus();
    
    if (!status.passwordConfigured) {
      throw new Error('Password not configured. Run setup to configure authentication.');
    }
    
    if (!status.directoriesConfigured) {
      throw new Error('Allowed directories not configured. Run setup to configure directory access.');
    }
    
    return true;
  }
}

module.exports = ConfigManager;