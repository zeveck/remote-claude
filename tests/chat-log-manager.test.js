const ChatLogManager = require('../src/chat-log-manager');
const fs = require('fs');
const path = require('path');

describe('ChatLogManager', () => {
  let chatLogManager;
  let testConfig;
  let testDirectory;
  let chatLogPath;
  
  beforeEach(() => {
    testConfig = {
      chatLog: {
        enabled: true,
        fileName: 'test-chatlog.md'
      }
    };
    
    testDirectory = path.join(__dirname, 'temp', 'chat-test');
    chatLogPath = path.join(testDirectory, testConfig.chatLog.fileName);
    
    // Ensure test directory exists
    if (!fs.existsSync(testDirectory)) {
      fs.mkdirSync(testDirectory, { recursive: true });
    }
    
    chatLogManager = new ChatLogManager(testConfig);
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(chatLogPath)) {
      if (fs.lstatSync(chatLogPath).isDirectory()) {
        fs.rmSync(chatLogPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(chatLogPath);
      }
    }
    if (fs.existsSync(testDirectory)) {
      fs.rmSync(testDirectory, { recursive: true, force: true });
    }
  });

  describe('Configuration', () => {
    it('should initialize with default config', () => {
      const defaultManager = new ChatLogManager();
      expect(defaultManager.isEnabled()).toBe(true);
    });

    it('should respect enabled config setting', () => {
      const disabledConfig = { chatLog: { enabled: false, fileName: 'chatlog.md' } };
      const disabledManager = new ChatLogManager(disabledConfig);
      expect(disabledManager.isEnabled()).toBe(false);
    });

    it('should get correct chat log path', () => {
      const expectedPath = path.join(testDirectory, testConfig.chatLog.fileName);
      const actualPath = chatLogManager.getChatLogPath(testDirectory);
      expect(actualPath).toBe(expectedPath);
    });

    it('should throw error for invalid directory path', () => {
      expect(() => {
        chatLogManager.getChatLogPath(null);
      }).toThrow('Invalid directory path');
    });
  });

  describe('File Operations', () => {
    it('should read empty chat log when file does not exist', async () => {
      const result = await chatLogManager.readChatLog(testDirectory);
      expect(result.history).toEqual([]);
      expect(result.sessionStartTime).toBeDefined();
    });

    it('should append message to new file', async () => {
      const message = {
        role: 'user',
        content: 'Hello, world!',
        timestamp: '2024-01-08T10:00:00Z'
      };

      await chatLogManager.appendMessage(testDirectory, message);
      
      // Verify file exists
      expect(fs.existsSync(chatLogPath)).toBe(true);
      
      // Verify file content
      const content = fs.readFileSync(chatLogPath, 'utf-8');
      expect(content).toContain('# Chat Log');
      expect(content).toContain('**User**: Hello, world!');
      expect(content).toContain('2024-01-08 10:00:00');
    });

    it('should append message to existing file', async () => {
      const message1 = {
        role: 'user',
        content: 'First message',
        timestamp: '2024-01-08T10:00:00Z'
      };
      
      const message2 = {
        role: 'claude',
        content: 'Second message',
        timestamp: '2024-01-08T10:01:00Z'
      };

      await chatLogManager.appendMessage(testDirectory, message1);
      await chatLogManager.appendMessage(testDirectory, message2);
      
      const content = fs.readFileSync(chatLogPath, 'utf-8');
      expect(content).toContain('First message');
      expect(content).toContain('Second message');
      expect(content).toContain('**User**: First message');
      expect(content).toContain('**Claude**: Second message');
    });

    it('should clear chat log file', async () => {
      const message = {
        role: 'user',
        content: 'Test message',
        timestamp: '2024-01-08T10:00:00Z'
      };

      await chatLogManager.appendMessage(testDirectory, message);
      expect(fs.existsSync(chatLogPath)).toBe(true);
      
      await chatLogManager.clearChatLog(testDirectory);
      expect(fs.existsSync(chatLogPath)).toBe(false);
    });

    it('should check if chat log exists', () => {
      expect(chatLogManager.chatLogExists(testDirectory)).toBe(false);
      
      fs.writeFileSync(chatLogPath, '# Chat Log\n');
      expect(chatLogManager.chatLogExists(testDirectory)).toBe(true);
    });
  });

  describe('Format Conversion', () => {
    it('should format message as markdown', () => {
      const message = {
        role: 'user',
        content: 'Test content',
        timestamp: '2024-01-08T10:00:00Z'
      };

      const markdown = chatLogManager.formatMessageAsMarkdown(message);
      expect(markdown).toContain('## 2024-01-08 10:00:00');
      expect(markdown).toContain('**User**: Test content');
    });

    it('should format message without timestamp when specified', () => {
      const message = {
        role: 'claude',
        content: 'Claude response',
        timestamp: '2024-01-08T10:00:00Z'
      };

      const markdown = chatLogManager.formatMessageAsMarkdown(message, false);
      expect(markdown).not.toContain('## 2024-01-08');
      expect(markdown).toContain('**Claude**: Claude response');
    });

    it('should parse markdown to JSON format', () => {
      const markdownContent = `# Chat Log

## 2024-01-08 10:00:00

**User**: Hello there

**Claude**: Hello! How can I help you?

## 2024-01-08 10:05:00

**User**: Another question

**Claude**: Another response`;

      const result = chatLogManager.parseMarkdownToJson(markdownContent);
      expect(result.history).toHaveLength(4);
      expect(result.history[0].role).toBe('user');
      expect(result.history[0].content).toBe('Hello there');
      expect(result.history[1].role).toBe('claude');
      expect(result.history[1].content).toBe('Hello! How can I help you?');
      expect(result.history[2].role).toBe('user');
      expect(result.history[2].content).toBe('Another question');
      expect(result.history[3].role).toBe('claude');
      expect(result.history[3].content).toBe('Another response');
    });

    it('should handle multiline content in markdown parsing', () => {
      const markdownContent = `# Chat Log

## 2024-01-08 10:00:00

**User**: This is a
multiline message
with several lines

**Claude**: This is also
a multiline response
with multiple paragraphs`;

      const result = chatLogManager.parseMarkdownToJson(markdownContent);
      expect(result.history).toHaveLength(2);
      expect(result.history[0].content).toBe('This is a\nmultiline message\nwith several lines');
      expect(result.history[1].content).toBe('This is also\na multiline response\nwith multiple paragraphs');
    });

    it('should read and parse existing markdown file', async () => {
      const testContent = `# Chat Log

## 2024-01-08 10:00:00

**User**: Test question

**Claude**: Test response`;

      fs.writeFileSync(chatLogPath, testContent);
      
      const result = await chatLogManager.readChatLog(testDirectory);
      expect(result.history).toHaveLength(2);
      expect(result.history[0].role).toBe('user');
      expect(result.history[0].content).toBe('Test question');
      expect(result.history[1].role).toBe('claude');
      expect(result.history[1].content).toBe('Test response');
    });
  });


  describe('Disabled Chat Log', () => {
    let disabledManager;

    beforeEach(() => {
      const disabledConfig = { chatLog: { enabled: false, fileName: 'chatlog.md' } };
      disabledManager = new ChatLogManager(disabledConfig);
    });

    it('should return empty history when disabled', async () => {
      const result = await disabledManager.readChatLog(testDirectory);
      expect(result.history).toEqual([]);
    });

    it('should not create file when appending and disabled', async () => {
      const message = { role: 'user', content: 'Test', timestamp: '2024-01-08T10:00:00Z' };
      await disabledManager.appendMessage(testDirectory, message);
      
      expect(fs.existsSync(chatLogPath)).toBe(false);
    });

  });

  describe('Error Handling', () => {
    it('should handle read errors gracefully', async () => {
      // Create a directory where file should be (to cause read error)
      fs.mkdirSync(chatLogPath);
      
      const result = await chatLogManager.readChatLog(testDirectory);
      expect(result.history).toEqual([]);
      
      // Clean up the directory
      fs.rmdirSync(chatLogPath);
    });


    it('should handle write permission errors', async () => {
      // Test writing to a non-existent parent directory 
      const invalidDir = path.join(__dirname, 'nonexistent', 'deep', 'path');
      
      const message = { role: 'user', content: 'Test', timestamp: '2024-01-08T10:00:00Z' };
      
      // Mock fs.promises.mkdir to throw an error
      const originalMkdir = fs.promises.mkdir;
      fs.promises.mkdir = jest.fn().mockRejectedValue(new Error('Permission denied'));
      
      try {
        await expect(chatLogManager.appendMessage(invalidDir, message))
          .rejects.toThrow('Permission denied');
      } finally {
        // Restore original mkdir
        fs.promises.mkdir = originalMkdir;
      }
    });
  });
});