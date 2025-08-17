const fs = require('fs');
const path = require('path');

class Logger {
  constructor(config = {}) {
    this.logLevel = config.logLevel || 'info';
    this.logFile = config.logFile || null;
    this.enableConsole = config.enableConsole !== false;
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  log(level, message, meta = {}) {
    if (this.levels[level] > this.levels[this.logLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta
    };

    const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}${
      Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
    }`;

    // Console output
    if (this.enableConsole) {
      const colorMap = {
        error: '\x1b[31m', // red
        warn: '\x1b[33m',  // yellow
        info: '\x1b[36m',  // cyan
        debug: '\x1b[37m'  // white
      };
      console.log(`${colorMap[level] || ''}${logLine}\x1b[0m`);
    }

    // File output
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, logLine + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error.message);
      }
    }
  }

  error(message, meta) { this.log('error', message, meta); }
  warn(message, meta) { this.log('warn', message, meta); }
  info(message, meta) { this.log('info', message, meta); }
  debug(message, meta) { this.log('debug', message, meta); }
}

// Create default logger instance
const logger = new Logger({
  logLevel: process.env.LOG_LEVEL || 'info',
  enableConsole: true
});

module.exports = { Logger, logger };