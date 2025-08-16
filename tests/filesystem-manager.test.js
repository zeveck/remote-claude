const FileSystemManager = require('../src/filesystem-manager');
const ConfigManager = require('../src/config-manager');
const fs = require('fs');
const path = require('path');

// Mock ConfigManager
jest.mock('../src/config-manager');

describe('FileSystemManager', () => {
  let fileSystemManager;
  let mockConfigManager;
  let testConfig;

  beforeEach(() => {
    testConfig = require('./fixtures/test-config.json');
    
    mockConfigManager = {
      loadAllowedDirectories: jest.fn(),
      isDirectoryAllowed: jest.fn()
    };

    ConfigManager.mockImplementation(() => mockConfigManager);
    fileSystemManager = new FileSystemManager(testConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Core Functionality', () => {
    it('should get allowed directories', () => {
      const mockDirs = [
        'tests/fixtures/test-dir1',
        'tests/fixtures/test-dir2'
      ];
      
      mockConfigManager.loadAllowedDirectories.mockReturnValue(mockDirs);
      
      const result = fileSystemManager.getAllowedDirectories();
      
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('test-dir1');
      expect(result[1].name).toBe('test-dir2');
    });

    it('should list directory contents', () => {
      mockConfigManager.isDirectoryAllowed.mockReturnValue(true);
      
      const result = fileSystemManager.getDirectoryContents('tests/fixtures/test-dir1');
      
      expect(result).toHaveProperty('contents');
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('name');
      
      // Should have sample.txt and subdir in contents
      expect(result.contents.some(f => f.name === 'sample.txt')).toBe(true);
      expect(result.contents.some(d => d.name === 'subdir')).toBe(true);
    });

    it('should read file contents', () => {
      mockConfigManager.isDirectoryAllowed.mockReturnValue(true);
      
      const result = fileSystemManager.readFileContents('tests/fixtures/test-dir1/sample.txt');
      
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('binary');
      expect(result.binary).toBe(false);
      expect(result.content).toContain('This is a sample');
    });

    it('should block access to non-allowed directories', () => {
      mockConfigManager.isDirectoryAllowed.mockReturnValue(false);
      
      expect(() => {
        fileSystemManager.getDirectoryContents('/etc/passwd');
      }).toThrow('Directory access denied');
      
      expect(() => {
        fileSystemManager.readFileContents('/etc/passwd');
      }).toThrow('File access denied');
    });

    it('should detect binary files', () => {
      // Create a binary test file
      const binaryPath = 'tests/temp/binary.dat';
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
      
      if (!fs.existsSync('tests/temp')) {
        fs.mkdirSync('tests/temp', { recursive: true });
      }
      fs.writeFileSync(binaryPath, binaryData);
      
      mockConfigManager.isDirectoryAllowed.mockReturnValue(true);
      
      const result = fileSystemManager.readFileContents(binaryPath);
      
      expect(result.binary).toBe(true);
      expect(result.content).toBeNull();
      expect(result.message).toContain('Binary file');
      
      // Clean up
      fs.unlinkSync(binaryPath);
    });

    it('should handle breadcrumb navigation', () => {
      mockConfigManager.loadAllowedDirectories.mockReturnValue([
        path.resolve('tests/fixtures/test-dir1')
      ]);
      
      const breadcrumbs = fileSystemManager.getBreadcrumbs(
        path.resolve('tests/fixtures/test-dir1/subdir')
      );
      
      expect(breadcrumbs).toHaveLength(2);
      expect(breadcrumbs[0].name).toBe('test-dir1');
      expect(breadcrumbs[0].isRoot).toBe(true);
      expect(breadcrumbs[1].name).toBe('subdir');
      expect(breadcrumbs[1].isRoot).toBe(false);
    });
  });
});