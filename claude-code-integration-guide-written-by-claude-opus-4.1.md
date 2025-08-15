# Claude Code Integration Technical Specification

## System Architecture Overview

```
[Web Client] → [Your Web Server] → [Claude Code CLI] → [Anthropic API]
                     ↓                      ↓
              [File System]          [Local Project Files]
```

## Core Integration Components

### 1. Environment Setup

```bash
# Required environment variables
export ANTHROPIC_API_KEY="your-api-key"
export CLAUDE_CODE_WORKSPACE="/path/to/workspace"
export CLAUDE_CODE_TIMEOUT=300  # seconds
export CLAUDE_CODE_MAX_CONCURRENT=5
```

### 2. Command Interface Patterns

```javascript
// Base command structure
const CLAUDE_CODE_COMMANDS = {
  generate: {
    command: 'generate',
    args: ['prompt'],
    flags: ['--directory', '--format', '--no-interactive', '--max-tokens']
  },
  analyze: {
    command: 'analyze',
    args: ['path'],
    flags: ['--format', '--depth', '--include-tests']
  },
  refactor: {
    command: 'refactor',
    args: ['file', 'instructions'],
    flags: ['--backup', '--dry-run', '--format']
  },
  review: {
    command: 'review',
    args: ['path'],
    flags: ['--severity', '--format', '--fix']
  }
};
```

### 3. Request/Response Schema

```typescript
// Request interface
interface ClaudeCodeRequest {
  action: 'generate' | 'analyze' | 'refactor' | 'review';
  prompt: string;
  context: {
    workingDirectory: string;
    files?: string[];
    language?: string;
    framework?: string;
  };
  options: {
    format: 'json' | 'text' | 'markdown';
    streaming?: boolean;
    timeout?: number;
    maxTokens?: number;
  };
  metadata: {
    userId: string;
    projectId: string;
    timestamp: number;
  };
}

// Response interface
interface ClaudeCodeResponse {
  success: boolean;
  action: string;
  result?: {
    code?: string;
    files?: Array<{
      path: string;
      content: string;
      action: 'created' | 'modified' | 'deleted';
    }>;
    analysis?: object;
    suggestions?: string[];
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    duration: number;
    tokensUsed: number;
    model: string;
  };
}
```

### 4. Security & Isolation Layer

```javascript
class ClaudeCodeSandbox {
  constructor(userId, projectId) {
    this.workspace = `/tmp/claude-code/${userId}/${projectId}`;
    this.allowedPaths = [this.workspace];
    this.blockedCommands = ['rm', 'delete', 'exec'];
  }

  validatePath(path) {
    const resolved = path.resolve(path);
    return this.allowedPaths.some(allowed => 
      resolved.startsWith(allowed)
    );
  }

  sanitizePrompt(prompt) {
    // Remove potential command injection attempts
    return prompt
      .replace(/[;&|`$]/g, '')
      .replace(/\.\.\//g, '')
      .slice(0, 1000); // Limit length
  }

  createIsolatedEnvironment() {
    return {
      env: {
        ...process.env,
        HOME: this.workspace,
        PATH: '/usr/local/bin:/usr/bin:/bin',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
      },
      cwd: this.workspace,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024 // 10MB
    };
  }
}
```

### 5. Advanced Integration Manager

```javascript
class ClaudeCodeIntegration {
  constructor(config) {
    this.config = config;
    this.queue = [];
    this.activeProcesses = new Map();
    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  async execute(request) {
    // Rate limiting
    await this.rateLimiter.acquire();
    
    // Create sandbox
    const sandbox = new ClaudeCodeSandbox(
      request.metadata.userId,
      request.metadata.projectId
    );
    
    // Build command
    const command = this.buildCommand(request, sandbox);
    
    // Execute with streaming support
    if (request.options.streaming) {
      return this.executeStreaming(command, sandbox);
    } else {
      return this.executeBlocking(command, sandbox);
    }
  }

  buildCommand(request, sandbox) {
    const baseCmd = ['claude-code'];
    const action = CLAUDE_CODE_COMMANDS[request.action];
    
    baseCmd.push(action.command);
    baseCmd.push(sandbox.sanitizePrompt(request.prompt));
    
    // Add flags
    baseCmd.push('--format', request.options.format);
    baseCmd.push('--no-interactive');
    
    if (request.options.maxTokens) {
      baseCmd.push('--max-tokens', request.options.maxTokens);
    }
    
    return baseCmd;
  }

  async executeStreaming(command, sandbox) {
    const process = spawn(command[0], command.slice(1), 
      sandbox.createIsolatedEnvironment()
    );
    
    const stream = new EventEmitter();
    
    process.stdout.on('data', (chunk) => {
      stream.emit('data', chunk.toString());
    });
    
    process.on('close', (code) => {
      stream.emit('end', { exitCode: code });
    });
    
    return stream;
  }
}
```

### 6. Web Server Implementation

```javascript
const express = require('express');
const { ClaudeCodeIntegration } = require('./claude-code-integration');

const app = express();
const integration = new ClaudeCodeIntegration({
  rateLimit: { requests: 100, window: 60000 },
  maxConcurrent: 5,
  defaultTimeout: 30000
});

// REST endpoint
app.post('/api/claude-code', async (req, res) => {
  try {
    const result = await integration.execute(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket for streaming
io.on('connection', (socket) => {
  socket.on('claude-code-stream', async (request) => {
    const stream = await integration.execute({
      ...request,
      options: { ...request.options, streaming: true }
    });
    
    stream.on('data', (chunk) => {
      socket.emit('claude-code-data', chunk);
    });
    
    stream.on('end', (result) => {
      socket.emit('claude-code-complete', result);
    });
  });
});
```

### 7. Critical Implementation Notes

#### Performance Optimization
- **Process Pooling**: Pre-spawn Claude Code processes to reduce latency
- **Caching**: Cache frequently used prompts and their results
- **Batching**: Group similar requests to optimize API usage

#### Error Handling
```javascript
const ERROR_CODES = {
  TIMEOUT: 'E001',
  RATE_LIMIT: 'E002',
  INVALID_PROMPT: 'E003',
  FILE_ACCESS: 'E004',
  API_ERROR: 'E005',
  SANDBOX_VIOLATION: 'E006'
};

class ClaudeCodeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
```

#### Monitoring & Logging
```javascript
const metrics = {
  requests: new Counter('claude_code_requests_total'),
  errors: new Counter('claude_code_errors_total'),
  duration: new Histogram('claude_code_duration_seconds'),
  tokensUsed: new Counter('claude_code_tokens_total')
};

// Log structure
const logEntry = {
  timestamp: Date.now(),
  userId: request.metadata.userId,
  action: request.action,
  promptLength: request.prompt.length,
  success: result.success,
  duration: result.metadata.duration,
  tokensUsed: result.metadata.tokensUsed,
  error: result.error
};
```

### 8. Production Considerations

#### Scaling Strategy
1. **Horizontal Scaling**: Deploy multiple web server instances
2. **Queue Management**: Use Redis/RabbitMQ for job queuing
3. **Load Balancing**: Distribute requests across Claude Code instances
4. **Resource Limits**: Set memory/CPU limits per process

#### Security Checklist
- [ ] API keys stored securely (environment variables/secrets manager)
- [ ] Input validation and sanitization
- [ ] Path traversal prevention
- [ ] Command injection protection
- [ ] Rate limiting per user/IP
- [ ] Audit logging for all operations
- [ ] File system isolation per user
- [ ] Network isolation for Claude Code processes

#### Deployment Configuration
```yaml
# docker-compose.yml example
version: '3.8'
services:
  web-server:
    build: .
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CLAUDE_CODE_WORKSPACE=/workspace
    volumes:
      - workspace:/workspace
      - claude-code-cache:/cache
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 2G
          cpus: '2'
```

### 9. Testing Strategy

```javascript
// Integration test example
describe('Claude Code Integration', () => {
  it('should generate code with timeout', async () => {
    const request = {
      action: 'generate',
      prompt: 'Create a simple REST API',
      options: { format: 'json', timeout: 5000 }
    };
    
    const result = await integration.execute(request);
    expect(result.success).toBe(true);
    expect(result.result.files).toHaveLength(greaterThan(0));
  });
  
  it('should handle malicious input', async () => {
    const request = {
      action: 'generate',
      prompt: 'Create file at ../../etc/passwd',
      options: { format: 'json' }
    };
    
    await expect(integration.execute(request))
      .rejects.toThrow(ClaudeCodeError);
  });
});
```

### 10. Alternative Approaches

If Claude Code CLI proves limiting, consider:

1. **Direct Anthropic API Integration**: Build your own coding-focused prompts
2. **Hybrid Approach**: Use Claude Code for complex tasks, API for simple ones
3. **Custom CLI Wrapper**: Build your own CLI that combines multiple AI services
4. **Message Queue Architecture**: Decouple request handling from execution

### Quick Reference Commands

```bash
# Check Claude Code version
claude-code --version

# Test connectivity
claude-code test-connection

# Generate with specific model
claude-code generate "prompt" --model claude-3-opus

# Dry run to see what would be generated
claude-code generate "prompt" --dry-run

# Output to specific directory
claude-code generate "prompt" --output ./generated/

# Use specific configuration file
claude-code --config ./claude-code.json generate "prompt"
```