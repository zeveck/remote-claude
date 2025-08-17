const fs = require('fs');
const path = require('path');
const ConfigManager = require('./config-manager');

class FileSystemManager {
  constructor(config) {
    this.configManager = new ConfigManager(config);
  }

  /**
   * Get list of allowed directories for selection
   */
  getAllowedDirectories() {
    try {
      const directories = this.configManager.loadAllowedDirectories();
      return directories.map(dir => ({
        path: dir,
        name: path.basename(dir),
        fullPath: dir
      }));
    } catch (error) {
      throw new Error(`Failed to load allowed directories: ${error.message}`);
    }
  }

  /**
   * Validate if a directory path is allowed
   */
  isDirectoryAllowed(targetPath) {
    // Additional security checks
    if (!targetPath || typeof targetPath !== 'string') {
      return false;
    }
    
    // Prevent path traversal attempts
    if (targetPath.includes('..') || targetPath.includes('~')) {
      return false;
    }
    
    // Normalize path to prevent bypass attempts
    const normalizedPath = path.resolve(targetPath);
    
    return this.configManager.isDirectoryAllowed(normalizedPath);
  }

  /**
   * Get directory contents (files and subdirectories)
   */
  getDirectoryContents(directoryPath) {
    try {
      // Validate directory is allowed
      if (!this.isDirectoryAllowed(directoryPath)) {
        throw new Error('Directory access denied');
      }

      // Check if directory exists
      if (!fs.existsSync(directoryPath)) {
        throw new Error('Directory does not exist');
      }

      if (!fs.statSync(directoryPath).isDirectory()) {
        throw new Error('Path is not a directory');
      }

      const items = fs.readdirSync(directoryPath);
      const contents = [];

      for (const item of items) {
        const itemPath = path.join(directoryPath, item);
        
        try {
          const stats = fs.statSync(itemPath);
          const isDirectory = stats.isDirectory();
          
          // Skip hidden files/directories (starting with .)
          if (item.startsWith('.')) {
            continue;
          }

          contents.push({
            name: item,
            path: itemPath,
            relativePath: path.relative(directoryPath, itemPath),
            type: isDirectory ? 'directory' : 'file',
            size: isDirectory ? null : stats.size,
            modified: stats.mtime.toISOString(),
            extension: isDirectory ? null : path.extname(item).toLowerCase()
          });
        } catch (error) {
          // Skip items we can't read (permission issues, etc.)
          continue;
        }
      }

      // Sort: directories first, then files, both alphabetically
      contents.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      return {
        path: directoryPath,
        name: path.basename(directoryPath),
        contents: contents,
        totalItems: contents.length,
        directories: contents.filter(item => item.type === 'directory').length,
        files: contents.filter(item => item.type === 'file').length
      };
    } catch (error) {
      throw new Error(`Failed to read directory: ${error.message}`);
    }
  }

  /**
   * Get file information
   */
  getFileInfo(filePath) {
    try {
      // Validate file is in allowed directory
      if (!this.isDirectoryAllowed(path.dirname(filePath))) {
        throw new Error('File access denied');
      }

      if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist');
      }

      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        throw new Error('Path is a directory, not a file');
      }

      return {
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        created: stats.birthtime.toISOString(),
        extension: path.extname(filePath).toLowerCase(),
        directory: path.dirname(filePath)
      };
    } catch (error) {
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * Read file contents (for text files)
   */
  readFileContents(filePath, maxSize = 1024 * 1024) { // 1MB limit
    try {
      // Validate file is in allowed directory
      if (!this.isDirectoryAllowed(path.dirname(filePath))) {
        throw new Error('File access denied');
      }

      if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist');
      }

      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        throw new Error('Cannot read directory as file');
      }

      if (stats.size > maxSize) {
        throw new Error(`File too large (${stats.size} bytes). Maximum size: ${maxSize} bytes`);
      }

      // Check if file appears to be binary
      const buffer = fs.readFileSync(filePath);
      const isBinary = this.isBinaryFile(buffer);

      if (isBinary) {
        return {
          name: path.basename(filePath),
          path: filePath,
          size: stats.size,
          binary: true,
          content: null,
          message: 'Binary file - content not displayed'
        };
      }

      return {
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        binary: false,
        content: buffer.toString('utf8'),
        encoding: 'utf8'
      };
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Simple binary file detection
   */
  isBinaryFile(buffer) {
    // Check first 1024 bytes for null bytes (common in binary files)
    const sample = buffer.slice(0, Math.min(1024, buffer.length));
    
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) {
        return true;
      }
    }
    
    // Check for high percentage of non-printable characters
    let nonPrintable = 0;
    for (let i = 0; i < sample.length; i++) {
      const byte = sample[i];
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        nonPrintable++;
      }
    }
    
    return (nonPrintable / sample.length) > 0.3; // More than 30% non-printable
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Get breadcrumb navigation for a path
   */
  getBreadcrumbs(currentPath) {
    const allowedDirs = this.configManager.loadAllowedDirectories();
    const breadcrumbs = [];
    
    // Find which allowed directory this path belongs to
    const rootDir = allowedDirs.find(dir => currentPath.startsWith(dir));
    
    if (!rootDir) {
      return breadcrumbs;
    }
    
    // Build breadcrumb trail from root to current
    const relativePath = path.relative(rootDir, currentPath);
    const parts = relativePath === '' ? [] : relativePath.split(path.sep);
    
    // Add root directory
    breadcrumbs.push({
      name: path.basename(rootDir),
      path: rootDir,
      isRoot: true
    });
    
    // Add intermediate directories
    let currentBreadcrumbPath = rootDir;
    for (const part of parts) {
      currentBreadcrumbPath = path.join(currentBreadcrumbPath, part);
      breadcrumbs.push({
        name: part,
        path: currentBreadcrumbPath,
        isRoot: false
      });
    }
    
    return breadcrumbs;
  }
}

module.exports = FileSystemManager;