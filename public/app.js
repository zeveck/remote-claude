// Remote Claude Web Interface Client
class RemoteClaudeApp {
    constructor() {
        this.loginSection = document.getElementById('login-section');
        this.directorySection = document.getElementById('directory-section');
        this.appSection = document.getElementById('app-section');
        this.loginForm = document.getElementById('login-form');
        this.loginBtn = document.getElementById('login-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.loginError = document.getElementById('login-error');
        this.currentDirectoryName = document.getElementById('current-directory-name');
        
        // Initialize status div (will be created dynamically)
        this.statusDiv = null;
        
        // Auto-refresh timer
        this.refreshTimer = null;
        this.isWindowVisible = true;
        
        // Conversation tracking
        this.conversationHistory = [];
        this.currentDirectory = null;
        this.sessionStartTime = new Date().toISOString();
        
        this.init();
    }
    
    async init() {
        console.log('Remote Claude Web Interface loaded');
        
        // Set up event listeners first
        this.setupEventListeners();
        
        // Set up visibility change listener for auto-refresh
        this.setupVisibilityListener();
        
        // Fix mobile viewport height issues
        this.fixMobileViewport();
        
        // Check authentication status
        await this.checkAuthStatus();
    }
    
    fixMobileViewport() {
        // Apply viewport fix for all devices to ensure consistency
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setViewportHeight();
        window.addEventListener('resize', setViewportHeight);
        window.addEventListener('orientationchange', setViewportHeight);
        
        // Also fix on window focus (helps with mobile browser address bar changes)
        window.addEventListener('focus', setViewportHeight);
    }
    
    async initializeApp() {
        // Load directories after successful authentication
        await this.loadDirectories();
    }
    
    setupEventListeners() {
        // Login form - handle both form submit and button click
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
        
        // Login button click
        this.loginBtn.addEventListener('click', () => {
            this.handleLogin();
        });
        
        // Logout button
        this.logoutBtn.addEventListener('click', () => {
            this.handleLogout();
        });
        
        // Back to directory selection button
        document.getElementById('back-to-directory-btn').addEventListener('click', () => {
            this.handleBackToDirectory();
        });
        
        // Enter key on password field
        document.getElementById('password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleLogin();
            }
        });
        
        // Directory selection
        document.getElementById('select-directory-btn').addEventListener('click', () => {
            this.handleDirectorySelection();
        });
        
        document.getElementById('directory-select').addEventListener('change', (e) => {
            const btn = document.getElementById('select-directory-btn');
            btn.disabled = !e.target.value;
        });
        
        document.getElementById('directory-select').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleDirectorySelection();
            }
        });
        
        document.getElementById('logout-from-dir-btn').addEventListener('click', () => {
            this.handleLogout();
        });
        
        // Global Enter key handler
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                // Directory selection screen
                if (!this.directorySection.classList.contains('hidden')) {
                    const btn = document.getElementById('select-directory-btn');
                    if (!btn.disabled) {
                        e.preventDefault();
                        this.handleDirectorySelection();
                    }
                }
            }
        });
        
        // File browser toggle
        document.getElementById('toggle-files-btn').addEventListener('click', () => {
            this.toggleFileBrowser();
        });
        

        
        // Claude interface
        document.getElementById('send-claude-btn').addEventListener('click', () => {
            this.sendClaudeCommand();
        });
        
        document.getElementById('claude-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                this.sendClaudeCommand();
            }
            // Ctrl+Enter adds newline (default behavior, don't prevent)
            // Auto-resize textarea
            this.autoResizeTextarea(e.target);
        });
        
        document.getElementById('claude-input').addEventListener('input', (e) => {
            this.autoResizeTextarea(e.target);
        });
        
        // Download conversation button
        document.getElementById('download-conversation-btn').addEventListener('click', () => {
            this.downloadConversation();
        });
        
        // File viewer modal
        document.getElementById('close-file-viewer').addEventListener('click', () => {
            this.closeFileViewer();
        });
        
        // Close modal when clicking outside
        document.getElementById('file-viewer-modal').addEventListener('click', (e) => {
            if (e.target.id === 'file-viewer-modal') {
                this.closeFileViewer();
            }
        });
        
        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeFileViewer();
            }
        });
        
        // Handle browser back button
        window.addEventListener('popstate', (e) => {
            this.handleBrowserNavigation(e);
        });
    }
    
    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth-status');
            const data = await response.json();
            
            if (data.authenticated) {
                this.showDirectorySelection();
                await this.initializeApp();
            } else {
                this.showLoginSection();
            }
        } catch (error) {
            console.error('Auth status check failed:', error);
            // Always show login section if auth check fails
            this.showLoginSection();
        }
    }
    
    async handleLogin() {
        const password = document.getElementById('password').value;
        
        if (!password) {
            this.showLoginError('Please enter a password');
            return;
        }
        
        this.setLoading(true);
        this.clearLoginError();
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showDirectorySelection();
                document.getElementById('password').value = '';
                await this.initializeApp();
            } else {
                this.showLoginError(data.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showLoginError('Connection error. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }
    
    async handleLogout() {
        try {
            const response = await fetch('/api/logout', {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showLoginSection();
                this.updateStatus('Logged out successfully', 'info');
            } else {
                console.error('Logout failed:', data.error);
            }
        } catch (error) {
            console.error('Logout error:', error);
            // Still show login section even if logout request failed
            this.showLoginSection();
        }
    }
    
    showLoginSection() {
        this.loginSection.classList.remove('hidden');
        this.directorySection.classList.add('hidden');
        this.appSection.classList.add('hidden');
        document.getElementById('password').focus();
        
        // Update browser history
        history.replaceState({ section: 'login' }, '', '#login');
    }
    
    showDirectorySelection() {
        this.loginSection.classList.add('hidden');
        this.directorySection.classList.remove('hidden');
        this.appSection.classList.add('hidden');
        
        // Auto-focus the directory dropdown
        setTimeout(() => {
            document.getElementById('directory-select').focus();
        }, 100);
        
        // Update browser history
        history.replaceState({ section: 'directory' }, '', '#directory');
    }
    
    showAppSection() {
        this.loginSection.classList.add('hidden');
        this.directorySection.classList.add('hidden');
        this.appSection.classList.remove('hidden');
        
        // Only auto-focus on desktop to prevent mobile keyboard popup
        if (!this.isMobileDevice()) {
            document.getElementById('claude-input').focus();
        }
    }
    
    handleBackToDirectory() {
        // Clear the current directory context
        this.currentDirectory = null;
        this.currentDirectoryName.textContent = 'Remote Claude';
        
        // Clear conversation history for the new session
        this.conversationHistory = [];
        this.sessionStartTime = new Date().toISOString();
        
        // Clear the terminal output
        const output = document.getElementById('claude-output');
        output.innerHTML = '<div class="terminal-welcome"><div class="welcome-line">Remote Claude Web Interface</div></div>';
        
        // Show directory selection screen
        this.showDirectorySelection();
        
        // Reload directories to ensure fresh list
        this.loadDirectories();
        
        // Update browser history
        history.pushState({ section: 'directory' }, '', '#directory');
    }
    
    handleBrowserNavigation(e) {
        const state = e.state;
        
        if (state && state.section === 'directory') {
            // User pressed back button while in Claude interface
            if (!this.appSection.classList.contains('hidden')) {
                this.handleBackToDirectory();
            }
        } else if (state && state.section === 'app') {
            // User pressed forward button to return to app
            if (!this.directorySection.classList.contains('hidden')) {
                // This would require re-selecting the directory, so we'll just stay on directory selection
                return;
            }
        }
    }
    
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               (window.innerWidth <= 768 && 'ontouchstart' in window);
    }
    
    showLoginError(message) {
        this.loginError.textContent = message;
        this.loginError.style.display = 'block';
    }
    
    clearLoginError() {
        this.loginError.textContent = '';
        this.loginError.style.display = 'none';
    }
    
    setLoading(loading) {
        this.loginBtn.disabled = loading;
        this.loginBtn.textContent = loading ? 'Logging in...' : 'Login';
    }
    
    updateStatus(message, type = 'info') {
        // Create status div if it doesn't exist
        if (!this.statusDiv) {
            this.statusDiv = document.createElement('div');
            this.statusDiv.className = 'status-message';
            document.body.appendChild(this.statusDiv);
        }
        
        this.statusDiv.textContent = message;
        this.statusDiv.className = `status-message ${type}`;
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (this.statusDiv && this.statusDiv.parentNode) {
                this.statusDiv.remove();
                this.statusDiv = null;
            }
        }, 3000);
    }
    
    // Directory and File Management Methods
    async loadDirectories() {
        try {
            const response = await fetch('/api/directories');
            const data = await response.json();
            
            if (data.success) {
                this.populateDirectorySelect(data.directories);
            } else {
                this.updateStatus(`Failed to load directories: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Failed to load directories:', error);
            this.updateStatus('Failed to load directories', 'error');
        }
    }
    
    populateDirectorySelect(directories) {
        const select = document.getElementById('directory-select');
        select.innerHTML = '';
        
        if (directories.length === 0) {
            select.innerHTML = '<option value="">No directories configured</option>';
            this.showStatus('No directories configured. Use "npm run add-directory" to add directories.', 'error');
            return;
        }
        
        // Default to first directory
        directories.forEach((dir, index) => {
            const option = document.createElement('option');
            option.value = dir.fullPath;
            option.textContent = dir.name;
            if (index === 0) option.selected = true;
            select.appendChild(option);
        });
        
        // Enable the button since we have a default selection
        document.getElementById('select-directory-btn').disabled = false;
    }
    
    async handleDirectorySelection() {
        const select = document.getElementById('directory-select');
        const directoryPath = select.value;
        
        if (!directoryPath) {
            return;
        }
        
        try {
            const response = await fetch('/api/select-directory', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ directoryPath })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showAppSection();
                this.currentDirectoryName.textContent = data.directory.name;
                this.currentDirectory = data.directory.name;
                this.showFilesBrowser(data.directory, data.breadcrumbs);
                
                // Update browser history
                history.pushState({ section: 'app', directory: data.directory.name }, '', '#app');
            } else {
                this.updateStatus(`Failed to select directory: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Directory selection error:', error);
            this.updateStatus('Failed to select directory', 'error');
        }
    }
    
    showFilesBrowser(directory, breadcrumbs) {
        const fileBrowser = document.getElementById('file-browser');
        fileBrowser.classList.remove('hidden');
        
        this.renderBreadcrumbs(breadcrumbs);
        this.renderFileList(directory);
    }
    
    showClaudeInterface() {
        const claudeInterface = document.getElementById('claude-interface');
        claudeInterface.classList.remove('hidden');
    }
    
    renderBreadcrumbs(breadcrumbs) {
        const breadcrumbsDiv = document.getElementById('breadcrumbs');
        breadcrumbsDiv.innerHTML = '';
        
        breadcrumbs.forEach((crumb, index) => {
            if (index > 0) {
                const separator = document.createElement('span');
                separator.className = 'breadcrumb-separator';
                separator.textContent = '/';
                breadcrumbsDiv.appendChild(separator);
            }
            
            const crumbElement = document.createElement('span');
            crumbElement.className = index === breadcrumbs.length - 1 ? 'breadcrumb-item current' : 'breadcrumb-item';
            crumbElement.textContent = crumb.name;
            
            if (index < breadcrumbs.length - 1) {
                crumbElement.addEventListener('click', () => {
                    this.navigateToDirectory(crumb.path);
                });
            }
            
            breadcrumbsDiv.appendChild(crumbElement);
        });
    }
    
    renderFileList(directory) {
        const fileList = document.getElementById('file-list');
        fileList.innerHTML = '';
        
        if (directory.contents.length === 0) {
            fileList.innerHTML = '<div class="placeholder">Directory is empty</div>';
            return;
        }
        
        directory.contents.forEach(item => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            
            const icon = this.getFileIcon(item);
            const size = item.type === 'file' ? this.formatFileSize(item.size) : '';
            const modified = new Date(item.modified).toLocaleDateString();
            
            fileItem.innerHTML = `
                <div class="file-icon">${icon}</div>
                <div class="file-info">
                    <div class="file-name">${item.name}</div>
                    <div class="file-meta">
                        ${size ? `<span>${size}</span>` : ''}
                        <span>${modified}</span>
                    </div>
                </div>
            `;
            
            if (item.type === 'directory') {
                fileItem.addEventListener('click', () => {
                    this.navigateToDirectory(item.path);
                });
            } else {
                fileItem.addEventListener('click', () => {
                    this.viewFile(item.path);
                });
            }
            
            fileList.appendChild(fileItem);
        });
    }
    
    getFileIcon(item) {
        if (item.type === 'directory') {
            return '📁';
        }
        
        const ext = item.extension;
        const iconMap = {
            '.js': '📄',
            '.ts': '📄',
            '.py': '🐍',
            '.html': '🌐',
            '.css': '🎨',
            '.json': '📋',
            '.md': '📝',
            '.txt': '📄',
            '.jpg': '🖼️',
            '.png': '🖼️',
            '.gif': '🖼️',
            '.pdf': '📕'
        };
        
        return iconMap[ext] || '📄';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    async navigateToDirectory(directoryPath) {
        try {
            const response = await fetch('/api/select-directory', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ directoryPath })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.renderBreadcrumbs(data.breadcrumbs);
                this.renderFileList(data.directory);
            } else {
                this.updateStatus(`Failed to navigate: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Navigation error:', error);
            this.updateStatus('Failed to navigate to directory', 'error');
        }
    }
    
    async refreshFiles() {
        try {
            const response = await fetch('/api/files');
            const data = await response.json();
            
            if (data.success) {
                this.renderBreadcrumbs(data.breadcrumbs);
                this.renderFileList(data.directory);
                this.updateStatus('Files refreshed', 'success');
            } else {
                this.updateStatus(`Failed to refresh: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Refresh error:', error);
            this.updateStatus('Failed to refresh files', 'error');
        }
    }
    
    async viewFile(filePath) {
        try {
            const response = await fetch(`/api/file-content?filePath=${encodeURIComponent(filePath)}`);
            const data = await response.json();
            
            if (data.success) {
                const file = data.file;
                if (file.binary) {
                    this.updateStatus(`${file.name}: ${file.message}`, 'info');
                } else {
                    this.showFileViewer(file);
                }
            } else {
                this.updateStatus(`Failed to read file: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('File view error:', error);
            this.updateStatus('Failed to view file', 'error');
        }
    }
    
    showFileViewer(file) {
        const modal = document.getElementById('file-viewer-modal');
        const title = document.getElementById('file-viewer-title');
        const codeElement = document.getElementById('file-viewer-code');
        
        title.textContent = `${file.name} (${this.formatFileSize(file.size)})`;
        
        const content = file.content || 'File is empty';
        const language = this.detectLanguage(file.name);
        
        // Set the language class for Prism.js
        codeElement.className = language ? `language-${language}` : '';
        codeElement.textContent = content;
        
        // Apply syntax highlighting if Prism is available
        if (window.Prism && language) {
            window.Prism.highlightElement(codeElement);
        }
        
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
    
    detectLanguage(filename) {
        const ext = filename.toLowerCase().split('.').pop();
        const languageMap = {
            'js': 'javascript',
            'jsx': 'jsx',
            'ts': 'typescript',
            'tsx': 'tsx',
            'py': 'python',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'scss',
            'sass': 'sass',
            'json': 'json',
            'xml': 'xml',
            'md': 'markdown',
            'yml': 'yaml',
            'yaml': 'yaml',
            'sh': 'bash',
            'bash': 'bash',
            'sql': 'sql',
            'php': 'php',
            'java': 'java',
            'c': 'c',
            'cpp': 'cpp',
            'cs': 'csharp',
            'go': 'go',
            'rs': 'rust',
            'rb': 'ruby'
        };
        
        return languageMap[ext] || null;
    }
    
    closeFileViewer() {
        const modal = document.getElementById('file-viewer-modal');
        modal.classList.add('hidden');
        document.body.style.overflow = ''; // Restore scrolling
    }
    
    // UI Helper Methods
    toggleFileBrowser() {
        const fileBrowser = document.getElementById('file-browser');
        fileBrowser.classList.toggle('hidden');
        
        // The new flexbox layout handles height automatically
        // No manual height calculations needed
    }
    
    setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            this.isWindowVisible = !document.hidden;
            
            if (this.isWindowVisible && this.appSection && !this.appSection.classList.contains('hidden')) {
                // Refresh immediately when window becomes visible
                this.refreshFiles();
            }
        });
    }
    

    
    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
    
    formatClaudeResponse(content) {
        // Escape HTML to prevent XSS attacks
        const escapeHtml = (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        
        // Escape the content first
        let formatted = escapeHtml(content);
        
        // Convert **text** to <strong>text</strong>
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        return formatted;
    }
    
    addToTerminal(content, type = 'output') {
        const output = document.getElementById('claude-output');
        const entry = document.createElement('div');
        entry.className = `terminal-entry ${type}`;
        
        if (type === 'command') {
            entry.innerHTML = `<span class="prompt-symbol">$</span> ${content}`;
            entry.style.color = '#00d4aa';
            entry.style.marginBottom = '10px';
        } else {
            // Parse **text** and convert to bold formatting
            const formattedContent = this.formatClaudeResponse(content);
            entry.innerHTML = formattedContent;
            entry.style.marginBottom = '15px';
        }
        
        output.appendChild(entry);
        output.scrollTop = output.scrollHeight;
    }
    
    formatClaudeResponse(content) {
        // Escape HTML first to prevent XSS
        const escaped = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        
        // Convert **text** to <strong>text</strong>
        const formatted = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        return formatted;
    }
    
    async sendClaudeCommand() {
        const input = document.getElementById('claude-input');
        const command = input.value.trim();
        
        if (!command) {
            return;
        }
        
        // Track user command in conversation history
        this.addToConversationHistory('user', command);
        
        // Add command to terminal
        this.addToTerminal(command, 'command');
        
        // Clear input and reset height
        input.value = '';
        input.style.height = 'auto';
        
        // Show loading
        this.addToTerminal('Executing Claude Code command...');
        
        try {
            const response = await fetch('/api/command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'generate', // Default action for now
                    prompt: command,
                    options: {}
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.addToTerminal('✅ Command completed successfully');
                
                let claudeResponse = '';
                if (data.result.parsedOutput) {
                    if (data.result.parsedOutput.type === 'result') {
                        // Handle Claude CLI JSON response - clean and simple
                        claudeResponse = data.result.parsedOutput.result;
                        this.addToTerminal(claudeResponse);
                    } else if (data.result.parsedOutput.type === 'text') {
                        claudeResponse = data.result.parsedOutput.content;
                        this.addToTerminal(claudeResponse);
                    } else {
                        // Handle other JSON responses
                        claudeResponse = JSON.stringify(data.result.parsedOutput, null, 2);
                        this.addToTerminal(claudeResponse);
                    }
                } else {
                    claudeResponse = data.result.output;
                    this.addToTerminal(claudeResponse);
                }
                
                // Track Claude's response in conversation history
                this.addToConversationHistory('claude', claudeResponse);
                
                // Refresh files to show any changes
                this.refreshFiles();
                
            } else {
                const errorMessage = `❌ Error: ${data.error}`;
                this.addToTerminal(errorMessage);
                
                if (data.needsDirectorySelection) {
                    this.addToTerminal('Please select a working directory first.');
                }
                
                // Track error in conversation history
                this.addToConversationHistory('system', errorMessage);
            }
            
        } catch (error) {
            console.error('Claude Code execution error:', error);
            const errorMessage = `❌ Connection error: ${error.message}`;
            this.addToTerminal(errorMessage);
            
            // Track connection error in conversation history
            this.addToConversationHistory('system', errorMessage);
        }
    }
    
    addToConversationHistory(role, content) {
        this.conversationHistory.push({
            role: role, // 'user', 'claude', or 'system'
            content: content,
            timestamp: new Date().toISOString(),
            directory: this.currentDirectory
        });
    }
    
    downloadConversation() {
        if (this.conversationHistory.length === 0) {
            this.updateStatus('No conversation to download', 'info');
            return;
        }
        
        const conversationData = {
            metadata: {
                sessionStartTime: this.sessionStartTime,
                exportTime: new Date().toISOString(),
                directory: this.currentDirectory || 'unknown',
                totalMessages: this.conversationHistory.length,
                version: 'v0.1.2'
            },
            conversation: this.conversationHistory
        };
        
        const jsonString = JSON.stringify(conversationData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const directoryName = this.currentDirectory || 'unknown';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `remote-claude.${directoryName}.${timestamp}.json`;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.updateStatus(`Conversation exported as ${filename}`, 'success');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RemoteClaudeApp();
});