# CLAUDE_CLI_CONTEXT_PLAN.md

## Executive Summary

Implement a context management system for the Remote Claude Web Interface that maintains conversation memory across `claude -p` calls by instructing Claude to manage a `local-context.md` file per working directory. Since `claude -p` has full file access, it can directly read and write the context file.

## Core Architecture

### The Fundamental Understanding

**Critical Insight**: Separation of responsibilities:
- **Node.js Backend**:
  - Creates local-context.md when context is enabled for directory
  - Deletes local-context.md on /clear command
  - Handles file initialization and cleanup
- **Claude CLI**:
  - Reads existing local-context.md for context awareness
  - Appends updates to local-context.md after completing tasks
  - Handles content maintenance (truncation, summarization)
- **Stateless between calls** - But maintains state via local-context.md file

### Solution Architecture

```
┌─────────────────┐
│   User Input    │
└────────┬────────┘
         ▼
┌─────────────────────────────────────┐
│     Node.js Backend                 │
│ 1. Create local-context.md if needed│
│ 2. Wrap prompt with context         │
│    management instructions          │
│ 3. Send to claude -p via stdin      │
└────────┬────────────────────────────┘
         ▼
┌─────────────────────────────────────┐
│     Claude CLI (with file access)   │
│ • Reads existing local-context.md   │
│ • Processes task with context       │
│ • Appends new info to local-context │
│ • Returns response to user          │
└────────┬────────────────────────────┘
         ▼
┌─────────────────────────────────────┐
│     Node.js Backend                 │
│ 4. Return response to user          │
│    (context file already updated)   │
└─────────────────────────────────────┘
```

## Detailed Implementation Plan

### Phase 1: Context Management via Prompt Instructions

Since Claude can handle file operations directly, we wrap prompts with context management instructions that Claude will execute.

#### 1.1 Server-side Context File Management

```javascript
// In claude-code-integration.js or new context-manager.js
class ContextManager {
    constructor() {
        this.maxLines = 1000;  // Hard limit enforced by server
        this.logger = require('./logger');
    }
    
    async initializeContext(workingDirectory) {
        const contextPath = path.join(workingDirectory, 'local-context.md');
        const timestamp = new Date().toISOString();
        
        // Check if local-context.md already exists
        try {
            await fs.access(contextPath);
            // File exists, check and enforce line limit
            const truncateResult = await this.enforceLineLimit(contextPath);
            return truncateResult;
        } catch (error) {
            // File doesn't exist, create it
            const initialContent = `# Session Context
Session started at ${timestamp}\n\n## Activity Log\n`;
            await fs.writeFile(contextPath, initialContent, 'utf8');
            return { truncated: false };
        }
    }
    
    async enforceLineLimit(contextPath) {
        const content = await fs.readFile(contextPath, 'utf8');
        const lines = content.split('\n');
        
        if (lines.length > this.maxLines) {
            // Log warning - Claude should have prevented this
            this.logger.warn(`Context file exceeded ${this.maxLines} lines (had ${lines.length}). Claude should have maintained this. Truncating...`);
            
            // Keep header and most recent lines
            const header = lines.slice(0, 4); // Keep header lines
            const recentLines = lines.slice(-(this.maxLines - 10)); // Keep recent entries
            
            const truncatedContent = [
                ...header,
                `\n[WARNING: File was truncated by server at ${new Date().toISOString()}]`,
                `[Claude should maintain the file under ${this.maxLines} lines]`,
                '',
                ...recentLines
            ].join('\n');
            
            await fs.writeFile(contextPath, truncatedContent, 'utf8');
            
            // Return warning to include in response
            return {
                truncated: true,
                message: `Context file was forcibly truncated from ${lines.length} to ${this.maxLines} lines. Claude should handle this maintenance.`
            };
        }
        
        return { truncated: false };
    }
    
    async clearContext(workingDirectory) {
        const contextPath = path.join(workingDirectory, 'local-context.md');
        const timestamp = new Date().toISOString();
        
        // Delete existing file if it exists
        try {
            await fs.unlink(contextPath);
        } catch (error) {
            // File doesn't exist, ignore
        }
        
        // Create fresh context file
        const freshContent = `# Session Context
Context cleared at ${timestamp}\nStarting fresh session.\n\n## Activity Log\n`;
        await fs.writeFile(contextPath, freshContent, 'utf8');
    }
```

#### 1.2 Modify `buildClaudePrompt()` in `claude-code-integration.js`

```javascript
buildClaudePrompt(action, prompt, options = {}) {
    // Validate action
    if (!this.allowedCommands.includes(action)) {
        throw new Error(`Invalid action: ${action}. Allowed: ${this.allowedCommands.join(', ')}`);
    }

    // Sanitize prompt
    const sanitizedPrompt = this.sanitizePrompt(prompt);
    
    // Build wrapped prompt with context management instructions
    // Context file will be created by server before this point
    const contextInstructions = `
CONTEXT MANAGEMENT INSTRUCTIONS:
1. Read the file 'local-context.md' in the current directory to understand previous work
   (Note: This file has already been created by the system if context is enabled)

2. Complete the requested task: ${sanitizedPrompt}

3. After completing the task, APPEND to local-context.md with a new entry:
   - Format: [${new Date().toISOString()}] Brief description of what was done
   - Include key decisions, files modified, or important changes
   - Keep entries concise (1-3 lines each)
   
4. If local-context.md exceeds 800 lines while appending, perform maintenance:
   - Keep the last 20 entries fully detailed
   - Condense entries 21-40 to single lines
   - Group entries older than 40 into categories
   - Never exceed 1000 total lines

5. IMPORTANT: Do not mention the context management process in your response. Only respond about the actual task.

CURRENT TASK:`;

    // Build the full prompt based on action
    let fullPrompt = contextInstructions + '\n' + sanitizedPrompt;
    
    // Add working directory info
    fullPrompt += `\n\nWorking directory: ${this.workingDirectory}`;
    
    // Add any additional context
    if (options.context) {
        fullPrompt += `\n\nAdditional context: ${options.context}`;
    }
    
    return fullPrompt;
}
```

#### 1.3 Expected Context File Structure (created by server, updated by Claude)

```markdown
# Session Context
Starting new session at 2025-01-21T14:30:00Z

## Activity Log
[2025-01-21T14:30:15Z] Created authentication module with JWT tokens
  - Files: src/auth.js, src/middleware/auth.js
  - Decision: RS256 for token signing
  
[2025-01-21T14:45:22Z] Fixed SQL injection vulnerability
  - File: src/db/users.js
  - Used parameterized queries

[2025-01-21T15:00:00Z] Implemented password reset flow
  - Files: src/auth/reset.js, src/email/templates.js
  - Added rate limiting: 3 attempts per hour

## Current State
- Active work: User authentication system
- Recent files: src/auth/reset.js, src/db/users.js
- Next steps: Add email verification
```

### Phase 2: Special Command Handling

#### Handle /clear Command

```javascript
// In execute() method - detect /clear command BEFORE calling Claude
async execute(request) {
    const { userId, workingDirectory, action, prompt, options = {} } = request;
    
    // Handle /clear command at server level
    if (prompt.toLowerCase().trim() === '/clear') {
        const contextManager = new ContextManager();
        await contextManager.clearContext(workingDirectory);
        
        // Return success without calling Claude
        return {
            success: true,
            output: "Context cleared. Starting fresh session.",
            executionTime: 0,
            sessionId: null
        };
    }
    
    // For regular commands, ensure local-context.md exists if context is enabled
    let truncationWarning = null;
    if (this.isContextEnabled(workingDirectory)) {
        const contextManager = new ContextManager();
        const result = await contextManager.initializeContext(workingDirectory);
        
        if (result.truncated) {
            truncationWarning = result.message;
            // Log to console/file
            this.logger.warn(truncationWarning);
        }
    }
    
    // Continue with normal execution...
    const response = await this.executeWithClaude(request, sandbox);
    
    // Add truncation warning to output if it occurred
    if (truncationWarning) {
        response.output = `[SYSTEM WARNING: ${truncationWarning}]\n\n${response.output}`;
    }
    
    return response;
}
```

### Phase 3: Complete Modified buildClaudePrompt Method

```javascript
buildClaudePrompt(action, prompt, options = {}) {
    // Validate action
    if (!this.allowedCommands.includes(action)) {
        throw new Error(`Invalid action: ${action}. Allowed: ${this.allowedCommands.join(', ')}`);
    }

    // Sanitize prompt
    const sanitizedPrompt = this.sanitizePrompt(prompt);
    
    // Note: /clear is now handled at the server level before reaching this point
    // Server creates/clears local-context.md, so Claude doesn't need these instructions
    
    // Regular command with context management
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
Update local-context.md by appending a new entry with this format:

[${timestamp}] <brief description of what was accomplished>
- Key decisions or changes made
- Files created/modified
- Any important notes

MAINTENANCE RULES:
- If local-context.md exceeds 800 lines:
  * Keep the last 20 entries fully detailed
  * Summarize entries 21-40 to single lines
  * Group entries older than 40 into categories like "Initial setup", "API development", etc.
- Never exceed 1000 total lines
- Focus on WHAT was done and WHY, not HOW

IMPORTANT: Do not mention the context management process in your response. Only respond about the actual task completed.

================================================================================
`;

    // Build the full prompt
    let fullPrompt = contextInstructions;
    
    // Add action-specific prefix if needed
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
```

### Phase 4: Frontend Integration

#### 4.1 Modify app.js for /clear Command

The existing /clear command in app.js already clears the local conversation. The backend will handle local-context.md deletion when it receives the /clear command:

```javascript
// In app.js sendClaudeCommand()
if (command === '/clear') {
    // Add command to terminal first
    this.addToTerminal(command, 'command');
    
    // Clear local conversation
    this.clearCurrentConversation();
    
    // Send /clear to backend (server will handle local-context.md)
    const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generate', // Use any valid action
            prompt: '/clear'
        })
    });
    
    if (response.ok) {
        const data = await response.json();
        // Show confirmation from server
        this.addToTerminal(data.result.output, 'system');
    }
    
    // Clear input
    input.value = '';
    input.style.height = 'auto';
    
    return;
}
```


## Implementation Steps

### Step 1: Modify buildClaudePrompt Method
1. Open `src/claude-code-integration.js`
2. Replace the existing `buildClaudePrompt` method with the complete version above
3. Test that context instructions are properly wrapped

### Step 2: Update Frontend Commands
1. Open `public/app.js`
2. Modify the `/clear` command handling to send to backend
3. Test the command works correctly

### Step 3: Remove Prompt Sanitization for Special Commands
Since `/clear` is a special command, we might need to handle it before sanitization:

```javascript
// In ClaudeCodeSandbox.sanitizePrompt()
// Add at the beginning:
if (prompt === '/clear') {
    return prompt; // Don't sanitize special command
}
```

### Step 4: Testing
1. Test normal commands create and update local-context.md
2. Test `/clear` removes and recreates local-context.md
3. Test context persists across sessions
4. Test truncation when context grows large

## Edge Cases and Considerations

### Concurrent Access
Since Claude handles the file directly, we rely on Claude's file operations being atomic. If multiple Claude instances run simultaneously in the same directory, there could be race conditions. Consider:
- Adding a note in the UI about avoiding concurrent operations
- Or implementing file locking in Node.js before calling Claude

### Context File Corruption
If local-context.md becomes corrupted:
- Claude should detect malformed content and recreate it
- Users can use `/clear` to reset

### Large Context Files
Claude will handle truncation when local-context.md exceeds 800 lines, keeping:
- Last 20 entries detailed
- Entries 21-40 as single-line summaries  
- Older entries grouped into categories
- Hard limit of 1000 lines

### Security
- local-context.md stays in the user's working directory
- No sensitive data should be stored in context
- Path validation already exists in the codebase

## Testing Checklist

- [ ] local-context.md is created on first command
- [ ] Context persists between commands
- [ ] Context persists between sessions
- [ ] `/clear` command resets context
- [ ] Context updates include timestamps
- [ ] Large contexts are truncated properly
- [ ] Special commands don't appear in context
- [ ] Context management isn't mentioned in responses

## Benefits of This Approach

1. **Simplicity**: Leverages Claude's existing file capabilities
2. **No Backend Complexity**: No need for Node.js to manage context files
3. **Natural Language Management**: Claude understands context semantically
4. **Self-Maintaining**: Claude handles truncation intelligently
5. **Transparent**: Users can inspect local-context.md directly

## Potential Improvements (Future)

1. **Context Templates**: Different templates for different project types
2. **Context Backup**: Periodic backups of local-context.md
3. **Context Analytics**: Analyze context to provide insights
4. **Shared Context**: Multiple users sharing context (with locking)
5. **Context Export**: Export context as project documentation

## Future Enhancement: Toggle Context On/Off

### Per-Directory Context Settings

The context management system will be designed to support toggling on/off per directory:

1. **Configuration Storage**: Store context preference in session or a `.claude-settings.json` file per directory
2. **Conditional Wrapping**: Only wrap prompts with context instructions when enabled
3. **UI Indicator**: Show context status in the interface (e.g., "Context: ON" or "Context: OFF")
4. **Stream Notification**: When toggling, display status change in the chat stream
5. **Logging**: Log context toggle events for debugging

### Implementation Considerations for Toggle Feature

```javascript
// Pseudo-code for future toggle implementation
buildClaudePrompt(action, prompt, options = {}) {
    // Check if context is enabled for this directory
    const contextEnabled = this.getContextSetting(this.workingDirectory);
    
    if (!contextEnabled) {
        // Return original prompt without context wrapping
        return this.buildBasicPrompt(action, prompt, options);
    }
    
    // Continue with context-wrapped prompt
    // ... existing context logic ...
}
```

### Benefits of Toggle Design
- **Flexibility**: Users can disable context for simple tasks or sensitive directories
- **Performance**: Skip context overhead when not needed
- **Clean State**: Easy to work without context pollution when desired
- **Backward Compatible**: Existing directories work without context by default

## Conclusion

This implementation leverages Claude's file system access to maintain context directly, eliminating the need for complex backend file management. The context persists across sessions, provides memory for Claude, and can be managed with simple commands. The design supports future enhancement for per-directory toggle functionality.
