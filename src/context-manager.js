const fs = require('fs').promises;
const path = require('path');
const { logger } = require('./logger');

/**
 * Context Manager for managing local-context.md files per directory
 * Handles creation, deletion, and line limit enforcement
 */
class ContextManager {
    constructor() {
        this.maxLines = 1000;  // Hard limit enforced by server
        this.contextFileName = 'local-context.md';
    }

    /**
     * Initialize context file for a directory
     * Creates file if it doesn't exist, enforces line limit if it does
     */
    async initializeContext(workingDirectory) {
        const contextPath = path.join(workingDirectory, this.contextFileName);
        const timestamp = new Date().toISOString();
        
        try {
            await fs.access(contextPath);
            // File exists, check and enforce line limit
            const truncateResult = await this.enforceLineLimit(contextPath);
            return truncateResult;
        } catch (error) {
            // File doesn't exist, create it
            const initialContent = `# Session Context
Session started at ${timestamp}

## Activity Log
`;
            await fs.writeFile(contextPath, initialContent, 'utf8');
            logger.info(`Created new local-context.md in ${workingDirectory}`);
            return { truncated: false };
        }
    }

    /**
     * Enforce maximum line limit on context file
     * Truncates if necessary and logs warning
     */
    async enforceLineLimit(contextPath) {
        try {
            const content = await fs.readFile(contextPath, 'utf8');
            const lines = content.split('\n');
            
            if (lines.length > this.maxLines) {
                // Log warning - Claude should have prevented this
                logger.warn(`Context file exceeded ${this.maxLines} lines (had ${lines.length}). Claude should have maintained this. Truncating...`);
                
                // Keep header and most recent lines
                const header = lines.slice(0, 4); // Keep header lines
                const recentLines = lines.slice(-(this.maxLines - 10)); // Keep recent entries
                
                const truncatedContent = [
                    ...header,
                    '',
                    `[WARNING: File was truncated by server at ${new Date().toISOString()}]`,
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
        } catch (error) {
            logger.error('Error enforcing line limit on context file', { error: error.message });
            return { truncated: false, error: error.message };
        }
    }

    /**
     * Clear context by deleting and recreating the file
     */
    async clearContext(workingDirectory) {
        const contextPath = path.join(workingDirectory, this.contextFileName);
        const timestamp = new Date().toISOString();
        
        // Delete existing file if it exists
        try {
            await fs.unlink(contextPath);
            logger.info(`Deleted existing local-context.md in ${workingDirectory}`);
        } catch (error) {
            // File doesn't exist, ignore
        }
        
        // Create fresh context file
        const freshContent = `# Session Context
Context cleared at ${timestamp}
Starting fresh session.

## Activity Log
`;
        await fs.writeFile(contextPath, freshContent, 'utf8');
        logger.info(`Created fresh local-context.md in ${workingDirectory}`);
        
        return { success: true };
    }

    /**
     * Check if context is enabled for a directory
     * This will be expanded later to check per-directory settings
     */
    isContextEnabled(workingDirectory) {
        // For now, context is always enabled
        // Later this will check per-directory settings
        return true;
    }

    /**
     * Get context file path for a directory
     */
    getContextPath(workingDirectory) {
        return path.join(workingDirectory, this.contextFileName);
    }
}

module.exports = ContextManager;