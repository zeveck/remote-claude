const { ClaudeCodeSandbox, ClaudeCodeIntegration } = require('../src/claude-code-integration');
const { spawn } = require('child_process');
const fs = require('fs').promises;

// Mock child_process
jest.mock('child_process');

// Mock fs.promises
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}));

describe('ClaudeCodeSandbox', () => {
  let sandbox;
  const testUserId = 'test-user';
  const testWorkingDir = 'tests/fixtures/test-dir1';

  beforeEach(() => {
    sandbox = new ClaudeCodeSandbox(testUserId, testWorkingDir);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(sandbox.userId).toBe(testUserId);
      expect(sandbox.workingDirectory).toBe(testWorkingDir);
      expect(sandbox.sessionId).toBeDefined();
      expect(sandbox.allowedCommands).toContain('generate');
      expect(sandbox.blockedPatterns).toHaveLength(9);
    });
  });

  describe('sanitizePrompt', () => {
    it('should sanitize valid prompt', () => {
      const prompt = 'Create a simple function';
      const result = sandbox.sanitizePrompt(prompt);
      expect(result).toBe('Create a simple function');
    });

    it('should throw error for null prompt', () => {
      expect(() => {
        sandbox.sanitizePrompt(null);
      }).toThrow('Invalid prompt: must be a non-empty string');
    });

    it('should throw error for empty string', () => {
      expect(() => {
        sandbox.sanitizePrompt('');
      }).toThrow('Invalid prompt: must be a non-empty string');
    });

    it('should throw error for non-string prompt', () => {
      expect(() => {
        sandbox.sanitizePrompt(123);
      }).toThrow('Invalid prompt: must be a non-empty string');
    });

    it('should block dangerous commands', () => {
      const dangerousPrompts = [
        'rm -rf /',
        'del important.txt',
        'delete all files',
        'format C:',
        'shutdown now',
        'restart computer',
        'exec malicious code',
        'eval dangerous script',
        'system("rm -rf /")'
      ];

      dangerousPrompts.forEach(prompt => {
        expect(() => {
          sandbox.sanitizePrompt(prompt);
        }).toThrow('Prompt contains blocked commands or patterns');
      });
    });

    it('should remove shell metacharacters', () => {
      const prompt = 'Create <script>alert("test")</script> & echo "hello"';
      const result = sandbox.sanitizePrompt(prompt);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('&');
      expect(result).not.toContain('"');
    });

    it('should normalize whitespace', () => {
      const prompt = 'Create    a   function   with   spaces';
      const result = sandbox.sanitizePrompt(prompt);
      expect(result).toBe('Create a function with spaces');
    });

    it('should throw error for empty prompt after sanitization', () => {
      const prompt = '<>&"|;`$(){}[]';
      expect(() => {
        sandbox.sanitizePrompt(prompt);
      }).toThrow('Prompt is empty after sanitization');
    });

    it('should throw error for too long prompt', () => {
      const longPrompt = 'a'.repeat(2001);
      expect(() => {
        sandbox.sanitizePrompt(longPrompt);
      }).toThrow('Prompt too long (max 2000 characters)');
    });
  });

  describe('validateWorkingDirectory', () => {
    beforeEach(() => {
      fs.access.mockResolvedValue();
    });

    it('should validate allowed directory', async () => {
      const result = await sandbox.validateWorkingDirectory();
      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(testWorkingDir);
    });

    it('should throw error for inaccessible directory', async () => {
      fs.access.mockRejectedValue(new Error('Access denied'));
      
      await expect(sandbox.validateWorkingDirectory()).rejects.toThrow(
        'Invalid working directory: Access denied'
      );
    });

    it('should block system directories', async () => {
      const systemDirs = [
        'C:\\Windows\\System32',
        'C:\\Program Files\\test',
        'C:\\Program Files (x86)\\app'
      ];

      for (const dir of systemDirs) {
        const systemSandbox = new ClaudeCodeSandbox(testUserId, dir);
        await expect(systemSandbox.validateWorkingDirectory()).rejects.toThrow(
          'Invalid working directory: Access to system directories is not allowed'
        );
      }
    });
  });

  describe('buildClaudePrompt', () => {
    it('should build prompt for generate action with context management', () => {
      const result = sandbox.buildClaudePrompt('generate', 'Create a function', {});
      
      expect(result).toContain('CONTEXT MANAGEMENT INSTRUCTIONS');
      expect(result).toContain('Generate code for: Create a function');
      expect(result).toContain(`Working directory: ${testWorkingDir}`);
      expect(result).toContain('Read \'local-context.md\' in the current working directory');
      expect(result).toContain('Append to local-context.md with a new entry');
    });

    it('should build basic prompt when context disabled', () => {
      const result = sandbox.buildClaudePrompt('generate', 'Create a function', { contextEnabled: false });
      
      expect(result).toContain('Please generate code based on this request: Create a function');
      expect(result).toContain('production-ready');
      expect(result).toContain(`Working directory: ${testWorkingDir}`);
      expect(result).not.toContain('CONTEXT MANAGEMENT');
    });

    it('should build prompt for analyze action with context management', () => {
      const result = sandbox.buildClaudePrompt('analyze', 'Review this code', {});
      
      expect(result).toContain('CONTEXT MANAGEMENT INSTRUCTIONS');
      expect(result).toContain('Analyze: Review this code');
      expect(result).toContain(`Working directory: ${testWorkingDir}`);
    });

    it('should build prompt for refactor action with context management', () => {
      const result = sandbox.buildClaudePrompt('refactor', 'Improve this code', {});
      
      expect(result).toContain('CONTEXT MANAGEMENT INSTRUCTIONS');
      expect(result).toContain('Refactor: Improve this code');
      expect(result).toContain(`Working directory: ${testWorkingDir}`);
    });

    it('should build prompt for review action with context management', () => {
      const result = sandbox.buildClaudePrompt('review', 'Check this implementation', {});
      
      expect(result).toContain('CONTEXT MANAGEMENT INSTRUCTIONS');
      expect(result).toContain('Review: Check this implementation');
      expect(result).toContain(`Working directory: ${testWorkingDir}`);
    });

    it('should build prompt for test action with context management', () => {
      const result = sandbox.buildClaudePrompt('test', 'Create tests for function', {});
      
      expect(result).toContain('CONTEXT MANAGEMENT INSTRUCTIONS');
      expect(result).toContain('Create tests for: Create tests for function');
      expect(result).toContain(`Working directory: ${testWorkingDir}`);
    });

    it('should throw error for invalid action', () => {
      expect(() => {
        sandbox.buildClaudePrompt('invalid', 'test prompt', {});
      }).toThrow('Invalid action: invalid. Allowed: generate, analyze, refactor, review, test');
    });

    it('should include additional context when provided', () => {
      const options = { context: 'This is additional context' };
      const result = sandbox.buildClaudePrompt('generate', 'Create function', options);
      
      expect(result).toContain('Additional context: This is additional context');
    });

    it('should include context wrapping even for /clear command', () => {
      const result = sandbox.buildClaudePrompt('generate', '/clear', {});
      
      expect(result).toContain('CONTEXT MANAGEMENT INSTRUCTIONS');
      expect(result).toContain('Generate code for: /clear');
      expect(result).toContain(`Working directory: ${testWorkingDir}`);
    });

    it('should sanitize prompt during build', () => {
      expect(() => {
        sandbox.buildClaudePrompt('generate', 'rm -rf /', {});
      }).toThrow('Prompt contains blocked commands or patterns');
    });
  });

  describe('createEnvironment', () => {
    it('should create secure environment', () => {
      const env = sandbox.createEnvironment();
      
      expect(env).toHaveProperty('PATH');
      expect(env).toHaveProperty('TEMP');
      expect(env).toHaveProperty('TMP');
      expect(env).toHaveProperty('CLAUDE_CODE_SESSION', sandbox.sessionId);
      expect(env).toHaveProperty('CLAUDE_CODE_USER', testUserId);
      expect(env).toHaveProperty('CLAUDE_CODE_WORKSPACE', testWorkingDir);
      
      // Should not have dangerous environment variables
      expect(env).not.toHaveProperty('COMSPEC');
      expect(env).not.toHaveProperty('PATHEXT');
    });
  });
});

describe('ClaudeCodeIntegration', () => {
  let integration;
  let mockChild;

  beforeEach(() => {
    integration = new ClaudeCodeIntegration();
    
    mockChild = {
      stdin: {
        write: jest.fn(),
        end: jest.fn()
      },
      stdout: {
        on: jest.fn()
      },
      stderr: {
        on: jest.fn()
      },
      on: jest.fn(),
      kill: jest.fn()
    };
    
    spawn.mockReturnValue(mockChild);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(integration.activeSessions).toBeInstanceOf(Map);
      expect(integration.rateLimits).toBeInstanceOf(Map);
      expect(integration.maxRequestsPerHour).toBe(50);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow first request', () => {
      const result = integration.checkRateLimit('user1');
      expect(result).toBe(true);
    });

    it('should track request count', () => {
      const userId = 'user1';
      
      for (let i = 0; i < 10; i++) {
        integration.checkRateLimit(userId);
      }
      
      const userLimit = integration.rateLimits.get(userId);
      expect(userLimit.count).toBe(10);
    });

    it('should block after exceeding limit', () => {
      const userId = 'user1';
      
      // Exceed the limit
      for (let i = 0; i < 51; i++) {
        integration.checkRateLimit(userId);
      }
      
      const result = integration.checkRateLimit(userId);
      expect(result).toBe(false);
    });

    it('should reset after time window', () => {
      const userId = 'user1';
      
      // Exceed the limit
      for (let i = 0; i < 51; i++) {
        integration.checkRateLimit(userId);
      }
      
      // Manually set old timestamp
      const userLimit = integration.rateLimits.get(userId);
      userLimit.resetTime = Date.now() - 1000; // 1 second ago
      
      const result = integration.checkRateLimit(userId);
      expect(result).toBe(true);
    });
  });

  describe('execute', () => {
    const mockRequest = {
      userId: 'test-user',
      workingDirectory: 'tests/fixtures/test-dir1',
      action: 'generate',
      prompt: 'Create a function',
      options: {}
    };

    beforeEach(() => {
      fs.access.mockResolvedValue();
      fs.readFile.mockResolvedValue('# Session Context\n\n## Activity Log\n');
      fs.writeFile.mockResolvedValue();
      fs.unlink.mockResolvedValue();
    });

    it('should handle /clear command', async () => {
      const clearRequest = { ...mockRequest, prompt: '/clear' };
      
      const result = await integration.execute(clearRequest);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('Context cleared. Starting fresh session.');
      expect(result.executionTime).toBe(0);
      expect(result.sessionId).toBe(null);
    });

    it('should reject if rate limited', async () => {
      // Exceed rate limit
      for (let i = 0; i < 51; i++) {
        integration.checkRateLimit(mockRequest.userId);
      }
      
      await expect(integration.execute(mockRequest)).rejects.toThrow(
        'Rate limit exceeded. Please try again later.'
      );
    });

    it('should initialize context before execution', async () => {
      // Mock successful execution
      const mockResult = { success: true, output: 'test output' };
      integration.executeWithClaude = jest.fn().mockResolvedValue(mockResult);
      
      const result = await integration.execute(mockRequest);
      
      // Should have attempted to read context file
      expect(fs.access).toHaveBeenCalled();
      expect(integration.executeWithClaude).toHaveBeenCalledWith(
        mockRequest,
        expect.any(Object) // ClaudeCodeSandbox instance
      );
      expect(result).toBe(mockResult);
    });

    it('should handle context truncation warning', async () => {
      // Mock file with too many lines
      const longContent = Array(1100).fill('line').join('\n');
      fs.readFile.mockResolvedValue(longContent);
      
      // Mock successful execution
      const mockResult = { success: true, output: 'test output' };
      integration.executeWithClaude = jest.fn().mockResolvedValue(mockResult);
      
      const result = await integration.execute(mockRequest);
      
      expect(result.output).toContain('[SYSTEM WARNING:');
      expect(result.output).toContain('Context file was forcibly truncated');
    });

    it('should call executeWithClaude for valid request', async () => {
      // Mock successful execution
      const mockResult = { success: true, output: 'test output' };
      integration.executeWithClaude = jest.fn().mockResolvedValue(mockResult);
      
      const result = await integration.execute(mockRequest);
      
      expect(integration.executeWithClaude).toHaveBeenCalledWith(
        mockRequest,
        expect.any(Object) // ClaudeCodeSandbox instance
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('executeWithClaude', () => {
    const mockRequest = {
      userId: 'test-user',
      workingDirectory: 'tests/fixtures/test-dir1',
      action: 'generate',
      prompt: 'Create a function',
      options: {}
    };

    let mockSandbox;

    beforeEach(() => {
      mockSandbox = {
        workingDirectory: mockRequest.workingDirectory,
        sessionId: 'test-session',
        buildClaudePrompt: jest.fn().mockReturnValue('test prompt'),
        createEnvironment: jest.fn().mockReturnValue({ TEST: 'env' })
      };
    });

    it('should spawn claude process with correct arguments', async () => {
      // Setup mock child process to simulate success
      setTimeout(() => {
        const stdoutCallback = mockChild.stdout.on.mock.calls.find(call => call[0] === 'data')[1];
        stdoutCallback('{"result": "success"}');
        
        const closeCallback = mockChild.on.mock.calls.find(call => call[0] === 'close')[1];
        closeCallback(0);
      }, 10);

      const promise = integration.executeWithClaude(mockRequest, mockSandbox);
      
      expect(spawn).toHaveBeenCalledWith('claude -p --dangerously-skip-permissions', 
        [],
        {
          cwd: mockSandbox.workingDirectory,
          env: { TEST: 'env' },
          shell: true,
          windowsHide: true
        }
      );

      await promise;
    });

    it('should send prompt to claude stdin', async () => {
      setTimeout(() => {
        const closeCallback = mockChild.on.mock.calls.find(call => call[0] === 'close')[1];
        closeCallback(0);
      }, 10);

      await integration.executeWithClaude(mockRequest, mockSandbox);
      
      expect(mockChild.stdin.write).toHaveBeenCalledWith('test prompt');
      expect(mockChild.stdin.end).toHaveBeenCalled();
    });

    it('should resolve with success result', async () => {
      const testOutput = '{"result": "test output"}';
      
      setTimeout(() => {
        const stdoutCallback = mockChild.stdout.on.mock.calls.find(call => call[0] === 'data')[1];
        stdoutCallback(testOutput);
        
        const closeCallback = mockChild.on.mock.calls.find(call => call[0] === 'close')[1];
        closeCallback(0);
      }, 10);

      const result = await integration.executeWithClaude(mockRequest, mockSandbox);
      
      expect(result).toEqual({
        success: true,
        output: testOutput,
        executionTime: expect.any(Number),
        sessionId: mockSandbox.sessionId
      });
    });

    it('should reject with error for non-zero exit code', async () => {
      const errorOutput = 'Claude execution failed';
      
      setTimeout(() => {
        const stderrCallback = mockChild.stderr.on.mock.calls.find(call => call[0] === 'data')[1];
        stderrCallback(errorOutput);
        
        const closeCallback = mockChild.on.mock.calls.find(call => call[0] === 'close')[1];
        closeCallback(1);
      }, 10);

      await expect(integration.executeWithClaude(mockRequest, mockSandbox))
        .rejects.toThrow('Claude execution failed (exit code 1): Claude execution failed');
    });

    it('should reject with timeout error', async () => {
      // Mock setTimeout to immediately trigger timeout
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback) => {
        setImmediate(callback);
        return 'timeout-id';
      });
      
      await expect(integration.executeWithClaude(mockRequest, mockSandbox))
        .rejects.toThrow('Claude execution timeout (3 minutes)');
      
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
      
      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    });

    it('should reject with spawn error', async () => {
      const spawnError = new Error('Failed to spawn');
      
      setTimeout(() => {
        const errorCallback = mockChild.on.mock.calls.find(call => call[0] === 'error')[1];
        errorCallback(spawnError);
      }, 10);

      await expect(integration.executeWithClaude(mockRequest, mockSandbox))
        .rejects.toThrow('Failed to start Claude process: Failed to spawn');
    });

    it('should store active session', async () => {
      setTimeout(() => {
        const closeCallback = mockChild.on.mock.calls.find(call => call[0] === 'close')[1];
        closeCallback(0);
      }, 10);

      await integration.executeWithClaude(mockRequest, mockSandbox);
      
      expect(integration.activeSessions.has(mockSandbox.sessionId)).toBe(true);
    });
  });

  describe('getActiveSessions', () => {
    it('should return active sessions list', () => {
      const sessionId = 'test-session';
      const startTime = Date.now();
      
      integration.activeSessions.set(sessionId, {
        userId: 'test-user',
        startTime,
        process: mockChild
      });
      
      const result = integration.getActiveSessions();
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sessionId,
        userId: 'test-user',
        startTime,
        duration: expect.any(Number)
      });
    });

    it('should return empty array when no active sessions', () => {
      const result = integration.getActiveSessions();
      expect(result).toHaveLength(0);
    });
  });

  describe('killSession', () => {
    it('should kill active session', () => {
      const sessionId = 'test-session';
      
      integration.activeSessions.set(sessionId, {
        userId: 'test-user',
        startTime: Date.now(),
        process: mockChild
      });
      
      const result = integration.killSession(sessionId);
      
      expect(result).toBe(true);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
      expect(integration.activeSessions.has(sessionId)).toBe(false);
    });

    it('should return false for non-existent session', () => {
      const result = integration.killSession('non-existent');
      expect(result).toBe(false);
    });
  });
});