const ContextManager = require('../src/context-manager');
const fs = require('fs').promises;
const path = require('path');

// Mock fs.promises
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}));

// Mock logger
jest.mock('../src/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('ContextManager', () => {
  let contextManager;
  const testWorkingDir = 'tests/fixtures/test-dir1';
  const contextPath = path.join(testWorkingDir, 'local-context.md');

  beforeEach(() => {
    contextManager = new ContextManager();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(contextManager.maxLines).toBe(1000);
      expect(contextManager.contextFileName).toBe('local-context.md');
    });
  });

  describe('initializeContext', () => {
    it('should create context file when it does not exist', async () => {
      fs.access.mockRejectedValue(new Error('File not found'));
      
      const result = await contextManager.initializeContext(testWorkingDir);
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        contextPath,
        expect.stringContaining('# Session Context'),
        'utf8'
      );
      expect(result.truncated).toBe(false);
    });

    it('should check line limit when file exists', async () => {
      fs.access.mockResolvedValue();
      fs.readFile.mockResolvedValue('# Session Context\nSession started\n\n## Activity Log\n');
      
      const result = await contextManager.initializeContext(testWorkingDir);
      
      expect(fs.access).toHaveBeenCalledWith(contextPath);
      expect(fs.readFile).toHaveBeenCalledWith(contextPath, 'utf8');
      expect(result.truncated).toBe(false);
    });

    it('should truncate file when it exceeds max lines', async () => {
      const longContent = Array(1100).fill('line').join('\n');
      fs.access.mockResolvedValue();
      fs.readFile.mockResolvedValue(longContent);
      
      const result = await contextManager.initializeContext(testWorkingDir);
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        contextPath,
        expect.stringContaining('[WARNING: File was truncated by server'),
        'utf8'
      );
      expect(result.truncated).toBe(true);
      expect(result.message).toContain('Context file was forcibly truncated');
    });
  });

  describe('enforceLineLimit', () => {
    it('should not truncate file under limit', async () => {
      const shortContent = Array(500).fill('line').join('\n');
      fs.readFile.mockResolvedValue(shortContent);
      
      const result = await contextManager.enforceLineLimit(contextPath);
      
      expect(result.truncated).toBe(false);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should truncate file over limit', async () => {
      const longContent = Array(1100).fill('line').join('\n');
      fs.readFile.mockResolvedValue(longContent);
      
      const result = await contextManager.enforceLineLimit(contextPath);
      
      expect(result.truncated).toBe(true);
      expect(result.message).toContain('forcibly truncated from 1100 to 1000 lines');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle read errors gracefully', async () => {
      fs.readFile.mockRejectedValue(new Error('Read error'));
      
      const result = await contextManager.enforceLineLimit(contextPath);
      
      expect(result.truncated).toBe(false);
      expect(result.error).toBe('Read error');
    });
  });

  describe('clearContext', () => {
    it('should delete existing file and create fresh one', async () => {
      fs.unlink.mockResolvedValue();
      
      const result = await contextManager.clearContext(testWorkingDir);
      
      expect(fs.unlink).toHaveBeenCalledWith(contextPath);
      expect(fs.writeFile).toHaveBeenCalledWith(
        contextPath,
        expect.stringContaining('Context cleared at'),
        'utf8'
      );
      expect(result.success).toBe(true);
    });

    it('should handle non-existent file gracefully', async () => {
      fs.unlink.mockRejectedValue(new Error('File not found'));
      
      const result = await contextManager.clearContext(testWorkingDir);
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        contextPath,
        expect.stringContaining('Context cleared at'),
        'utf8'
      );
      expect(result.success).toBe(true);
    });
  });

  describe('isContextEnabled', () => {
    it('should return true by default', () => {
      const result = contextManager.isContextEnabled(testWorkingDir);
      expect(result).toBe(true);
    });
  });

  describe('getContextPath', () => {
    it('should return correct context file path', () => {
      const result = contextManager.getContextPath(testWorkingDir);
      expect(result).toBe(contextPath);
    });
  });
});