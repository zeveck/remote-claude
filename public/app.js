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
        
        this.init();
    }
    
    async init() {
        console.log('Remote Claude Web Interface loaded');
        
        // Set up event listeners first
        this.setupEventListeners();
        
        // Set up visibility change listener for auto-refresh
        this.setupVisibilityListener();
        
        // Check authentication status
        await this.checkAuthStatus();
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
    }
    
    showDirectorySelection() {
        this.loginSection.classList.add('hidden');
        this.directorySection.classList.remove('hidden');
        this.appSection.classList.add('hidden');
        
        // Auto-focus the directory dropdown
        setTimeout(() => {
            document.getElementById('directory-select').focus();
        }, 100);
    }
    
    showAppSection() {
        this.loginSection.classList.add('hidden');
        this.directorySection.classList.add('hidden');
        this.appSection.classList.remove('hidden');
        document.getElementById('claude-input').focus();
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
            option.textContent = `${dir.name} (${dir.fullPath})`;
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
                this.showFilesBrowser(data.directory, data.breadcrumbs);
                this.updateStatus('Directory selected successfully', 'success');
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
                    // For now, just show file info. Later we can add a file viewer modal
                    this.updateStatus(`Viewing ${file.name} (${this.formatFileSize(file.size)})`, 'info');
                }
            } else {
                this.updateStatus(`Failed to read file: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('File view error:', error);
            this.updateStatus('Failed to view file', 'error');
        }
    }
    
    // UI Helper Methods
    toggleFileBrowser() {
        const fileBrowser = document.getElementById('file-browser');
        fileBrowser.classList.toggle('hidden');
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
    
    addToTerminal(content, type = 'output') {
        const output = document.getElementById('claude-output');
        const entry = document.createElement('div');
        entry.className = `terminal-entry ${type}`;
        
        if (type === 'command') {
            entry.innerHTML = `<span class="prompt-symbol">$</span> ${content}`;
            entry.style.color = '#00d4aa';
            entry.style.marginBottom = '10px';
        } else {
            entry.textContent = content;
            entry.style.marginBottom = '15px';
        }
        
        output.appendChild(entry);
        output.scrollTop = output.scrollHeight;
    }
    
    async sendClaudeCommand() {
        const input = document.getElementById('claude-input');
        const command = input.value.trim();
        
        if (!command) {
            return;
        }
        
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
                
                if (data.result.parsedOutput) {
                    if (data.result.parsedOutput.type === 'result') {
                        // Handle Claude CLI JSON response - clean and simple
                        this.addToTerminal(data.result.parsedOutput.result);
                    } else if (data.result.parsedOutput.type === 'text') {
                        this.addToTerminal(data.result.parsedOutput.content);
                    } else {
                        // Handle other JSON responses
                        this.addToTerminal(JSON.stringify(data.result.parsedOutput, null, 2));
                    }
                } else {
                    this.addToTerminal(data.result.output);
                }
                
                // Refresh files to show any changes
                this.refreshFiles();
                
            } else {
                this.addToTerminal(`❌ Error: ${data.error}`);
                
                if (data.needsDirectorySelection) {
                    this.addToTerminal('Please select a working directory first.');
                }
            }
            
        } catch (error) {
            console.error('Claude Code execution error:', error);
            this.addToTerminal(`❌ Connection error: ${error.message}`);
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RemoteClaudeApp();
});