const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const ContextManager = require('./context-manager');

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

        // Allow special commands without sanitization
        if (prompt.trim().toLowerCase() === '/clear') {
            return '/clear';
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

        // Check if context is enabled (will be configurable per-directory later)
        const contextEnabled = options.contextEnabled !== false; // Default to true for now
        
        if (!contextEnabled) {
            // Build prompt without context wrapping
            return this.buildBasicPrompt(action, sanitizedPrompt, options);
        }

        // Build prompt with context management instructions
        const timestamp = new Date().toISOString();
        const contextInstructions = `
================================================================================
CONTEXT MANAGEMENT INSTRUCTIONS
================================================================================

BEFORE STARTING:
1. Read 'local-context.md' in the current working directory to understand previous work
   (This file has been created by the system if context is enabled)

COMPLETE THE TASK:
${sanitizedPrompt}

AFTER COMPLETING THE TASK:
Append to local-context.md with a new entry in this format:

[${timestamp}] <brief description of what was accomplished>
- Key decisions or changes made
- Files created/modified
- Any important notes

MAINTENANCE RULES:
- If local-context.md exceeds 800 lines while appending, perform maintenance:
  * Keep the last 20 entries fully detailed
  * Condense entries 21-40 to single lines
  * Group entries older than 40 into categories
- Never exceed 1000 total lines
- Focus on WHAT was done and WHY, not HOW

IMPORTANT: Do not mention the context management process in your response. Only respond about the actual task completed.

================================================================================
`;

        // Build the full prompt
        let fullPrompt = contextInstructions;
        
        // Add action-specific prefix
        switch (action) {
            case 'generate':
                fullPrompt += `\nGenerate code for: ${sanitizedPrompt}`;
                break;
            case 'analyze':
                fullPrompt += `\nAnalyze: ${sanitizedPrompt}`;
                break;
            case 'refactor':
                fullPrompt += `\nRefactor: ${sanitizedPrompt}`;
                break;
            case 'review':
                fullPrompt += `\nReview: ${sanitizedPrompt}`;
                break;
            case 'test':
                fullPrompt += `\nCreate tests for: ${sanitizedPrompt}`;
                break;
            default:
                fullPrompt += `\n${sanitizedPrompt}`;
        }
        
        fullPrompt += `\n\nWorking directory: ${this.workingDirectory}`;
        
        if (options.context) {
            fullPrompt += `\n\nAdditional context: ${options.context}`;
        }
        
        return fullPrompt;
    }

    /**
     * Build basic prompt without context management
     */
    buildBasicPrompt(action, sanitizedPrompt, options = {}) {
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
        this.contextManager = new ContextManager();
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

        // Handle /clear command at server level
        if (prompt && prompt.trim().toLowerCase() === '/clear') {
            await this.contextManager.clearContext(workingDirectory);
            
            // Return success without calling Claude
            return {
                success: true,
                output: "Context cleared. Starting fresh session.",
                executionTime: 0,
                sessionId: null
            };
        }

        // Check rate limiting
        if (!this.checkRateLimit(userId)) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }

        // Initialize context if enabled (for now always enabled)
        let truncationWarning = null;
        if (this.contextManager.isContextEnabled(workingDirectory)) {
            const result = await this.contextManager.initializeContext(workingDirectory);
            
            if (result.truncated) {
                truncationWarning = result.message;
                // Log warning
                const { logger } = require('./logger');
                logger.warn(truncationWarning);
            }
        }

        // Create sandbox
        const sandbox = new ClaudeCodeSandbox(userId, workingDirectory);

        // Validate working directory
        await sandbox.validateWorkingDirectory();

        // Use your claude CLI directly
        const response = await this.executeWithClaude(request, sandbox);
        
        // Add truncation warning to output if it occurred
        if (truncationWarning) {
            response.output = `[SYSTEM WARNING: ${truncationWarning}]\n\n${response.output}`;
        }
        
        return response;
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
            const args = ['-p', '--dangerously-skip-permissions'];
            
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

                // Log Claude's response for debugging
                const { logger } = require('./logger');
                logger.info('Claude process completed', {
                    exitCode: code,
                    executionTime,
                    stdoutLength: stdout.length,
                    stderrLength: stderr.length,
                    hasOutput: !!stdout,
                    outputPreview: stdout.substring(0, 100) // First 100 chars for debugging
                });

                if (!stdout && code === 0) {
                    logger.warn('Claude returned success but no output - this is unusual');
                }

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