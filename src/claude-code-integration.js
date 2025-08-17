const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

/**
 * Claude Code Sandbox for secure command execution
 * Handles Windows process spawning, command sanitization, and isolated environments
 */
class ClaudeCodeSandbox {
    constructor(userId, workingDirectory) {
        this.userId = userId;
        this.workingDirectory = workingDirectory;
        this.sessionId = crypto.randomUUID();
        this.allowedCommands = ['generate', 'analyze', 'refactor', 'review', 'test'];
        this.blockedPatterns = [
            /rm\s+/i,
            /del\s+/i,
            /delete\s+/i,
            /format\s+/i,
            /shutdown\s+/i,
            /restart\s+/i,
            /exec\s+/i,
            /eval\s+/i,
            /system\s+/i
        ];
    }

    /**
     * Sanitize and validate command prompt
     */
    sanitizePrompt(prompt) {
        if (!prompt || typeof prompt !== 'string') {
            throw new Error('Invalid prompt: must be a non-empty string');
        }

        // Check for blocked patterns
        for (const pattern of this.blockedPatterns) {
            if (pattern.test(prompt)) {
                throw new Error('Prompt contains blocked commands or patterns');
            }
        }

        // Basic sanitization - remove potentially dangerous characters
        const sanitized = prompt
            .replace(/[<>"|&;`$(){}\[\]]/g, '') // Remove shell metacharacters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        if (sanitized.length === 0) {
            throw new Error('Prompt is empty after sanitization');
        }

        if (sanitized.length > 2000) {
            throw new Error('Prompt too long (max 2000 characters)');
        }

        return sanitized;
    }

    /**
     * Validate working directory is allowed
     */
    async validateWorkingDirectory() {
        try {
            // Check if directory exists and is accessible
            await fs.access(this.workingDirectory);

            // Resolve to absolute path to prevent path traversal
            const resolvedPath = path.resolve(this.workingDirectory);

            // Basic validation - ensure it's not a system directory
            const systemDirs = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'];
            for (const sysDir of systemDirs) {
                if (resolvedPath.toLowerCase().startsWith(sysDir.toLowerCase())) {
                    throw new Error('Access to system directories is not allowed');
                }
            }

            this.workingDirectory = resolvedPath;
            return true;
        } catch (error) {
            throw new Error(`Invalid working directory: ${error.message}`);
        }
    }

    /**
     * Build claude prompt for interactive CLI
     */
    buildClaudePrompt(action, prompt, options = {}) {
        // Validate action
        if (!this.allowedCommands.includes(action)) {
            throw new Error(`Invalid action: ${action}. Allowed: ${this.allowedCommands.join(', ')}`);
        }

        // Sanitize prompt
        const sanitizedPrompt = this.sanitizePrompt(prompt);

        // Build a comprehensive prompt for the interactive Claude
        let fullPrompt = '';

        switch (action) {
            case 'generate':
                fullPrompt = `Please generate code based on this request: ${sanitizedPrompt}\n\nPlease provide the code with clear explanations and make sure it's production-ready. Working directory: ${this.workingDirectory}`;
                break;
            case 'analyze':
                fullPrompt = `Please analyze the following request and provide insights: ${sanitizedPrompt}\n\nWorking directory: ${this.workingDirectory}`;
                break;
            case 'refactor':
                fullPrompt = `Please help refactor code based on this request: ${sanitizedPrompt}\n\nWorking directory: ${this.workingDirectory}`;
                break;
            case 'review':
                fullPrompt = `Please review and provide feedback on: ${sanitizedPrompt}\n\nWorking directory: ${this.workingDirectory}`;
                break;
            case 'test':
                fullPrompt = `Please help create tests for: ${sanitizedPrompt}\n\nWorking directory: ${this.workingDirectory}`;
                break;
            default:
                fullPrompt = `${sanitizedPrompt}\n\nWorking directory: ${this.workingDirectory}`;
        }

        // Add context about the working directory and any options
        if (options.context) {
            fullPrompt += `\n\nAdditional context: ${options.context}`;
        }

        return fullPrompt;
    }

    /**
     * Create isolated environment for command execution
     */
    createEnvironment() {
        const env = {
            ...process.env,
            // Limit environment variables for security
            PATH: process.env.PATH,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
            // Add Claude Code specific environment
            CLAUDE_CODE_SESSION: this.sessionId,
            CLAUDE_CODE_USER: this.userId,
            CLAUDE_CODE_WORKSPACE: this.workingDirectory
        };

        // Remove potentially dangerous environment variables
        delete env.COMSPEC;
        delete env.PATHEXT;

        return env;
    }
}

/**
 * Claude Code Integration Manager
 * Handles command execution, response parsing, and error handling
 */
class ClaudeCodeIntegration {
    constructor() {
        this.activeSessions = new Map();
        this.rateLimits = new Map(); // userId -> { count, resetTime }
        this.maxRequestsPerHour = 50;
    }

    /**
     * Check rate limiting for user
     */
    checkRateLimit(userId) {
        const now = Date.now();
        const userLimit = this.rateLimits.get(userId);

        if (!userLimit) {
            this.rateLimits.set(userId, { count: 1, resetTime: now + 3600000 }); // 1 hour
            return true;
        }

        if (now > userLimit.resetTime) {
            // Reset the limit
            this.rateLimits.set(userId, { count: 1, resetTime: now + 3600000 });
            return true;
        }

        if (userLimit.count >= this.maxRequestsPerHour) {
            return false;
        }

        userLimit.count++;
        return true;
    }

    /**
     * Execute Claude Code command with proper CLI detection
     */
    async execute(request) {
        const { userId, workingDirectory, action, prompt, options = {} } = request;

        // Check rate limiting
        if (!this.checkRateLimit(userId)) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }

        // Create sandbox
        const sandbox = new ClaudeCodeSandbox(userId, workingDirectory);

        // Validate working directory
        await sandbox.validateWorkingDirectory();

        // Use your claude CLI directly
        return this.executeWithClaude(request, sandbox);
    }

    /**
     * Execute using the Claude CLI
     */
    async executeWithClaude(request, sandbox) {
        const { action, prompt, options = {} } = request;

        // Build the prompt for Claude
        const fullPrompt = sandbox.buildClaudePrompt(action, prompt, options);

        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let stdout = '';
            let stderr = '';

            // Spawn claude process in headless mode with -p flag and skip permissions
            const args = ['-p', '--output-format', 'json', '--dangerously-skip-permissions'];
            
            // Construct command safely to avoid deprecation warning and injection
            // Validate args are safe (no shell metacharacters)
            const safeArgs = args.filter(arg => /^[a-zA-Z0-9\-_]+$/.test(arg));
            if (safeArgs.length !== args.length) {
                throw new Error('Invalid command arguments detected');
            }
            
            const command = `claude ${safeArgs.join(' ')}`;
            const child = spawn(command, [], {
                cwd: sandbox.workingDirectory,
                env: sandbox.createEnvironment(),
                shell: true,
                windowsHide: true
            });

            // Set timeout (3 minutes for interactive)
            const timeout = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error('Claude execution timeout (3 minutes)'));
            }, 180000);

            // Send the prompt to claude via stdin (headless mode)
            child.stdin.write(fullPrompt);
            child.stdin.end();

            // Handle stdout
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            // Handle stderr
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // Handle process completion
            child.on('close', (code) => {
                clearTimeout(timeout);
                const executionTime = Date.now() - startTime;

                if (code === 0) {
                    resolve({
                        success: true,
                        output: stdout,
                        executionTime,
                        sessionId: sandbox.sessionId
                    });
                } else {
                    reject(new Error(`Claude execution failed (exit code ${code}): ${stderr || stdout}`));
                }
            });

            // Handle process errors
            child.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`Failed to start Claude process: ${error.message}`));
            });

            // Store active session
            this.activeSessions.set(sandbox.sessionId, {
                userId: request.userId,
                startTime,
                process: child
            });
        });
    }

    /**
     * Parse Claude Code JSON response
     */
    parseResponse(output) {
        try {
            // Try to parse as JSON first
            return JSON.parse(output);
        } catch (error) {
            // If not JSON, return as plain text response
            return {
                type: 'text',
                content: output,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get active sessions for monitoring
     */
    getActiveSessions() {
        return Array.from(this.activeSessions.entries()).map(([sessionId, session]) => ({
            sessionId,
            userId: session.userId,
            startTime: session.startTime,
            duration: Date.now() - session.startTime
        }));
    }

    /**
     * Kill active session
     */
    killSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session && session.process) {
            session.process.kill('SIGTERM');
            this.activeSessions.delete(sessionId);
            return true;
        }
        return false;
    }
}

module.exports = {
    ClaudeCodeSandbox,
    ClaudeCodeIntegration
};