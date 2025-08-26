const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

class ChatLogManager {
  constructor(config) {
    this.config = config || { chatLog: { enabled: true, fileName: 'chatlog.md' } };
    this.chatLogConfig = this.config.chatLog || { enabled: true, fileName: 'chatlog.md' };
  }

  /**
   * Get the chat log file path for a directory
   */
  getChatLogPath(directoryPath) {
    if (!directoryPath || typeof directoryPath !== 'string') {
      throw new Error('Invalid directory path');
    }
    
    // Normalize path to prevent path traversal
    const normalizedDir = path.resolve(directoryPath);
    return path.join(normalizedDir, this.chatLogConfig.fileName);
  }

  /**
   * Check if chat logging is enabled
   */
  isEnabled() {
    return this.chatLogConfig.enabled;
  }

  /**
   * Read chat log from file and convert to JSON format
   */
  async readChatLog(directoryPath) {
    if (!this.isEnabled()) {
      return { history: [], sessionStartTime: new Date().toISOString() };
    }

    const chatLogPath = this.getChatLogPath(directoryPath);
    
    try {
      // If file doesn't exist, return empty history
      try {
        await fs.promises.access(chatLogPath);
      } catch {
        return { history: [], sessionStartTime: new Date().toISOString() };
      }

      const content = await fs.promises.readFile(chatLogPath, 'utf-8');
      return this.parseMarkdownToJson(content);
    } catch (error) {
      logger.error('Failed to read chat log', { chatLogPath, error: error.message });
      // Return empty history on error
      return { history: [], sessionStartTime: new Date().toISOString() };
    }
  }

  /**
   * Append a message to the chat log file
   */
  async appendMessage(directoryPath, message) {
    if (!this.isEnabled()) {
      return;
    }

    const chatLogPath = this.getChatLogPath(directoryPath);
    
    try {
      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(chatLogPath), { recursive: true });
      
      const messageMarkdown = this.formatMessageAsMarkdown(message);
      
      // Check if file exists to determine if we need to create header
      let fileExists;
      try {
        await fs.promises.access(chatLogPath);
        fileExists = true;
      } catch {
        fileExists = false;
      }
      
      if (!fileExists) {
        // Create new file with header
        const header = '# Chat Log\n\n';
        await fs.promises.writeFile(chatLogPath, header + messageMarkdown, 'utf-8');
      } else {
        // Append to existing file
        await fs.promises.appendFile(chatLogPath, messageMarkdown, 'utf-8');
      }
    } catch (error) {
      logger.error('Failed to append message to chat log', { chatLogPath, error: error.message });
      throw error;
    }
  }

  /**
   * Clear chat log file
   */
  async clearChatLog(directoryPath) {
    if (!this.isEnabled()) {
      return;
    }

    const chatLogPath = this.getChatLogPath(directoryPath);
    
    try {
      await fs.promises.unlink(chatLogPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, nothing to clear
        return;
      }
      logger.error('Failed to clear chat log', { chatLogPath, error: error.message });
      throw error;
    }
  }


  /**
   * Format a message as Markdown
   */
  formatMessageAsMarkdown(message, includeTimestamp = true) {
    const timestamp = message.timestamp || new Date().toISOString();
    const role = message.role === 'user' ? 'User' : 'Claude';
    const content = message.content || '';
    
    let markdown = '';
    
    if (includeTimestamp) {
      // Add timestamp header for new messages
      const dateTime = new Date(timestamp).toISOString().replace('T', ' ').split('.')[0];
      markdown += `## ${dateTime}\n\n`;
    }
    
    markdown += `**${role}**: ${content}\n\n`;
    
    return markdown;
  }

  /**
   * Parse Markdown chat log to JSON format
   */
  parseMarkdownToJson(markdownContent) {
    const lines = markdownContent.split('\n');
    const history = [];
    let sessionStartTime = new Date().toISOString();
    
    let currentMessage = null;
    let currentContent = '';
    let inMessageContent = false;
    let currentTimestamp = new Date().toISOString();
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for timestamp headers (## YYYY-MM-DD HH:MM:SS)
      const timestampMatch = line.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
      if (timestampMatch) {
        // Save previous message if exists
        if (currentMessage) {
          currentMessage.content = currentContent.trim();
          currentMessage.timestamp = currentTimestamp;
          history.push(currentMessage);
        }
        
        // Parse and store the timestamp
        currentTimestamp = new Date(timestampMatch[1] + 'Z').toISOString();
        
        // Reset for new message group
        currentMessage = null;
        currentContent = '';
        inMessageContent = false;
        continue;
      }
      
      // Check for message headers (**User**: or **Claude**:)
      const messageMatch = line.match(/^\*\*(User|Claude)\*\*:\s*(.*)/);
      if (messageMatch) {
        // Save previous message if exists
        if (currentMessage) {
          currentMessage.content = currentContent.trim();
          currentMessage.timestamp = currentTimestamp;
          history.push(currentMessage);
        }
        
        // Start new message
        const role = messageMatch[1].toLowerCase() === 'user' ? 'user' : 'claude';
        const content = messageMatch[2];
        
        currentMessage = {
          role: role,
          content: content,
          timestamp: currentTimestamp
        };
        currentContent = content;
        inMessageContent = true;
        continue;
      }
      
      // If we're in message content and it's not a separator line
      if (inMessageContent && currentMessage && line !== '---') {
        if (line.trim() === '') {
          // Empty line - add to content if we already have content
          if (currentContent.trim()) {
            currentContent += '\n';
          }
        } else {
          // Content line
          currentContent += (currentContent.trim() ? '\n' : '') + line;
        }
      }
    }
    
    // Save last message if exists
    if (currentMessage) {
      currentMessage.content = currentContent.trim();
      currentMessage.timestamp = currentTimestamp;
      history.push(currentMessage);
    }
    
    // Set session start time from first message if available
    if (history.length > 0 && history[0].timestamp) {
      sessionStartTime = history[0].timestamp;
    }
    
    return {
      history: history,
      sessionStartTime: sessionStartTime
    };
  }

  /**
   * Check if chat log file exists for a directory
   */
  chatLogExists(directoryPath) {
    if (!this.isEnabled()) {
      return false;
    }

    const chatLogPath = this.getChatLogPath(directoryPath);
    // Use sync version to maintain the existing API
    return fs.existsSync(chatLogPath);
  }
}

module.exports = ChatLogManager;