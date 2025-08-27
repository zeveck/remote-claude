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
        this.currentDirectoryPath = null;
        this.initialDirectoryPath = null;
        this.sessionStartTime = new Date().toISOString();

        // WebSocket properties
        this.socket = null;
        this.isSocketConnected = false;
        this.currentSession = null;
        this.syncStatus = 'disconnected'; // disconnected, connecting, connected, synced
        this.activeUsers = [];
        this.remoteCommandExecuting = false; // Track if another user is executing command
        this.localCommandExecuting = false; // Track if this user is executing command

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

        // Initialize WebSocket connection
        this.initializeWebSocket();

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

        // Handle virtual keyboard on mobile
        this.setupVirtualKeyboardHandling();
    }

    setupVirtualKeyboardHandling() {
        if (!this.isMobileDevice()) return;

        // Track keyboard state and viewport heights
        let keyboardIsOpen = false;
        let originalViewportHeight = window.innerHeight;

        // Centralized function to clean up keyboard adjustments
        const closeKeyboardAdjustments = () => {
            keyboardIsOpen = false;
            document.body.classList.remove('keyboard-open');
            document.body.classList.remove('keyboard-detected');
            document.documentElement.style.setProperty('--keyboard-height', '0px');
            
            // Reset viewport height
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };

        // Centralized function to apply keyboard adjustments
        const openKeyboardAdjustments = () => {
            keyboardIsOpen = true;
            document.body.classList.add('keyboard-open');
            document.body.classList.add('keyboard-detected');
        };

        // Setup keyboard handling after DOM is ready
        setTimeout(() => {
            const claudeInput = document.getElementById('claude-input');
            if (!claudeInput) return;

            // Handle focus - keyboard opening
            claudeInput.addEventListener('focus', () => {
                // Small delay to let keyboard animation start
                setTimeout(() => {
                    // Scroll input into view
                    claudeInput.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'nearest'
                    });

                    openKeyboardAdjustments();
                }, 300);
            });

            // Handle blur - keyboard closing (might not always fire on mobile)
            claudeInput.addEventListener('blur', () => {
                // On mobile, blur might fire even if keyboard stays open
                // So we'll check viewport height after a delay
                setTimeout(() => {
                    const currentHeight = window.visualViewport ? 
                        window.visualViewport.height : window.innerHeight;
                    const heightDifference = originalViewportHeight - currentHeight;
                    
                    // Only close if keyboard is actually gone (height restored)
                    if (heightDifference < 100) {
                        closeKeyboardAdjustments();
                    }
                }, 100);
            });

            // Additional check: clicking outside the input
            document.addEventListener('click', (e) => {
                if (e.target !== claudeInput && keyboardIsOpen) {
                    // Check if keyboard actually closed after a delay
                    setTimeout(() => {
                        const currentHeight = window.visualViewport ? 
                            window.visualViewport.height : window.innerHeight;
                        const heightDifference = originalViewportHeight - currentHeight;
                        
                        if (heightDifference < 100) {
                            closeKeyboardAdjustments();
                        }
                    }, 300);
                }
            });
        }, 1000);

        // Visual Viewport API - most reliable for modern mobile browsers
        if (window.visualViewport) {
            let visualViewportTimer;
            
            window.visualViewport.addEventListener('resize', () => {
                clearTimeout(visualViewportTimer);
                visualViewportTimer = setTimeout(() => {
                    const viewport = window.visualViewport;
                    const currentHeight = viewport.height;
                    const heightDifference = window.innerHeight - currentHeight;

                    // Keyboard is open if viewport is significantly smaller
                    if (heightDifference > 100) {
                        if (!keyboardIsOpen) {
                            openKeyboardAdjustments();
                        }
                        document.documentElement.style.setProperty('--keyboard-height', `${heightDifference}px`);
                    } else {
                        // Keyboard has closed - viewport restored
                        if (keyboardIsOpen) {
                            closeKeyboardAdjustments();
                        }
                    }
                }, 50); // Shorter delay for visual viewport
            });

            // Also listen for scroll events on visual viewport (iOS specific behavior)
            window.visualViewport.addEventListener('scroll', () => {
                // On iOS, scrolling can indicate keyboard dismissal
                if (keyboardIsOpen) {
                    const currentHeight = window.visualViewport.height;
                    const heightDifference = window.innerHeight - currentHeight;
                    
                    if (heightDifference < 100) {
                        closeKeyboardAdjustments();
                    }
                }
            });
        }

        // Fallback: Window resize event
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const currentHeight = window.innerHeight;
                const heightDifference = originalViewportHeight - currentHeight;

                // Update viewport height CSS variable
                const vh = currentHeight * 0.01;
                document.documentElement.style.setProperty('--vh', `${vh}px`);

                // Only use this as fallback if visualViewport isn't available
                if (!window.visualViewport) {
                    if (heightDifference > 150) {
                        if (!keyboardIsOpen) {
                            openKeyboardAdjustments();
                        }
                    } else {
                        if (keyboardIsOpen) {
                            closeKeyboardAdjustments();
                        }
                    }
                }
            }, 150);
        });

        // Periodic check as last resort (for edge cases)
        if (this.isMobileDevice()) {
            setInterval(() => {
                if (keyboardIsOpen) {
                    const currentHeight = window.visualViewport ? 
                        window.visualViewport.height : window.innerHeight;
                    const heightDifference = originalViewportHeight - currentHeight;
                    
                    // If height is restored but we still think keyboard is open, fix it
                    if (heightDifference < 100) {
                        closeKeyboardAdjustments();
                    }
                }
            }, 1000); // Check every second
        }
    }

    // WebSocket Methods
    initializeWebSocket() {
        try {
            if (typeof io !== 'undefined') {
                this.socket = io({
                    transports: ['websocket', 'polling'],
                    upgrade: true,
                    rememberUpgrade: true
                });

                this.setupWebSocketEventHandlers();
                this.updateSyncStatus('connecting');
                console.log('WebSocket initialization started');
            } else {
                console.warn('Socket.IO not loaded, real-time features disabled');
            }
        } catch (error) {
            console.error('Failed to initialize WebSocket:', error);
            this.updateSyncStatus('disconnected');
        }
    }

    setupWebSocketEventHandlers() {
        if (!this.socket) return;

        // Connection events
        this.socket.on('connect', () => {
            console.log('WebSocket connected');
            this.isSocketConnected = true;
            this.updateSyncStatus('synced'); // Connected = synced (green)
            
            // Join directory room if we have one selected
            if (this.initialDirectoryPath) {
                this.joinDirectoryRoom(this.initialDirectoryPath);
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            this.isSocketConnected = false;
            this.updateSyncStatus('disconnected');
            this.activeUsers = [];
            this.updateUserPresence();
            
            // Clear remote command state if we were waiting for one to complete
            if (this.remoteCommandExecuting) {
                this.handleRemoteCommandCompleted({
                    success: false,
                    directoryPath: this.initialDirectoryPath
                });
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            this.updateSyncStatus('disconnected');
        });

        // Chat events
        this.socket.on('new-message', (data) => {
            this.handleIncomingMessage(data);
        });

        this.socket.on('chat-cleared', (data) => {
            this.handleChatCleared(data);
        });

        // Room events
        this.socket.on('user-joined', (data) => {
            console.log('User joined:', data);
            // No notification - too noisy
        });

        this.socket.on('user-left', (data) => {
            console.log('User left:', data);
            // No notification - too noisy
        });

        this.socket.on('room-status', (data) => {
            this.handleRoomStatus(data);
        });

        // Typing indicators
        this.socket.on('user-typing-start', (data) => {
            this.handleUserTypingStart(data);
        });

        this.socket.on('user-typing-stop', (data) => {
            this.handleUserTypingStop(data);
        });

        // Command execution events
        this.socket.on('command-started', (data) => {
            this.handleRemoteCommandStarted(data);
        });

        this.socket.on('command-completed', (data) => {
            this.handleRemoteCommandCompleted(data);
        });
    }

    async joinDirectoryRoom(directoryPath) {
        if (!this.socket || !this.isSocketConnected) return;

        // Ensure we have server's session ID before joining
        if (!this.currentSession) {
            await this.fetchSessionId();
        }
        
        this.socket.emit('join-directory', {
            sessionId: this.currentSession,
            directoryPath: directoryPath
        });

        console.log('Joined directory room:', directoryPath, 'with session ID:', this.currentSession);
    }

    leaveDirectoryRoom() {
        if (!this.socket || !this.isSocketConnected) return;

        this.socket.emit('leave-directory', {
            sessionId: this.currentSession
        });

        console.log('Left directory room');
    }

    handleIncomingMessage(data) {
        const { message, directoryPath } = data;

        // Only process messages for the current directory
        if (directoryPath !== this.initialDirectoryPath) return;

        // Check if we already have this message (avoid duplicates)
        const exists = this.conversationHistory.some(msg => 
            msg.timestamp === message.timestamp && 
            msg.content === message.content && 
            msg.role === message.role
        );

        if (!exists) {
            // Add message to history
            this.conversationHistory.push(message);

            // Update UI
            if (message.role === 'user') {
                this.addToTerminal(message.content, 'command');
            } else if (message.role === 'claude') {
                this.addToTerminal(message.content, 'claude-response');
            }

            this.scrollConversationToBottom();
            this.updateDownloadButtonVisibility();
            // No notification for new messages - they appear naturally in chat
        }
    }

    handleChatCleared(data) {
        const { directoryPath } = data;

        // Only process for the current directory
        if (directoryPath !== this.initialDirectoryPath) return;

        // Clear local conversation history
        this.clearConversationLocal();
        this.showNotification('Chat cleared', 'info', 2000);
    }

    handleRoomStatus(data) {
        this.activeUsers = data.activeUsers || [];
        this.updateUserPresence();
        // Keep current sync status - room status doesn't change sync state
        
        console.log(`Room status: ${data.activeUserCount} users active`);
    }

    handleUserTypingStart(data) {
        // Could show typing indicator in the future
        console.log('User started typing:', data.sessionId);
    }

    handleUserTypingStop(data) {
        // Could hide typing indicator in the future
        console.log('User stopped typing:', data.sessionId);
    }

    updateSyncStatus(status) {
        this.syncStatus = status;
        // Sync indicator removed - status tracking for internal use only
    }


    updateUserPresence() {
        // Could add user presence indicators in the future
        const userCount = this.activeUsers.length;
        if (userCount > 0) {
            console.log(`${userCount} users are viewing this directory`);
        }
    }

    handleRemoteCommandStarted(data) {
        const { command, directoryPath } = data;

        // Only process for the current directory
        if (directoryPath !== this.initialDirectoryPath) return;

        // Ignore remote commands if we're executing locally
        if (this.localCommandExecuting) {
            console.log('Ignoring remote command started - local command in progress');
            return;
        }

        console.log('Remote command started:', command.substring(0, 50) + '...');
        
        // Set remote command executing state
        this.remoteCommandExecuting = true;

        // Disable send button and show execution status (same as local execution)
        const sendBtn = document.getElementById('send-claude-btn');
        const input = document.getElementById('claude-input');
        
        sendBtn.disabled = true;
        sendBtn.textContent = 'Executing...';
        input.disabled = true;
        input.placeholder = 'Enter your Claude command...';

        // Show loading message in terminal (same as local execution)
        const loadingMessage = '<span class="spinner"></span>Executing Claude Code command...';
        this.remoteCommandLoadingElement = this.addToTerminal(loadingMessage, 'loading');
    }

    handleRemoteCommandCompleted(data) {
        const { success, directoryPath } = data;

        // Only process for the current directory
        if (directoryPath !== this.initialDirectoryPath) return;

        // Ignore remote command completion if we're executing locally
        if (this.localCommandExecuting) {
            console.log('Ignoring remote command completed - local command in progress');
            return;
        }

        console.log('Remote command completed, success:', success);
        
        // Clear remote command executing state
        this.remoteCommandExecuting = false;

        // Re-enable send button and restore normal state
        const sendBtn = document.getElementById('send-claude-btn');
        const input = document.getElementById('claude-input');
        
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        input.disabled = false;
        input.placeholder = 'Enter your Claude command...';

        // Remove loading message
        if (this.remoteCommandLoadingElement) {
            this.remoteCommandLoadingElement.remove();
            this.remoteCommandLoadingElement = null;
        }

        // Show completion message (same as local execution)
        const statusMessage = success ? 
            '✅ Command completed successfully' : 
            '❌ Command execution failed';
        this.addToTerminal(statusMessage, 'system');
    }

    generateSessionId() {
        return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    getLastSelectedDirectory() {
        try {
            return localStorage.getItem('lastSelectedDirectory');
        } catch (error) {
            console.warn('Failed to read from localStorage:', error);
            return null;
        }
    }

    saveLastSelectedDirectory(directoryPath) {
        try {
            localStorage.setItem('lastSelectedDirectory', directoryPath);
        } catch (error) {
            console.warn('Failed to save to localStorage:', error);
        }
    }

    clearLastSelectedDirectory() {
        try {
            localStorage.removeItem('lastSelectedDirectory');
        } catch (error) {
            console.warn('Failed to clear from localStorage:', error);
        }
    }

    async initializeApp() {
        // Get last selected directory from localStorage
        const lastDirectory = this.getLastSelectedDirectory();
        
        // Load directories after successful authentication
        await this.loadDirectories(lastDirectory);
        
        // Fetch session ID for WebSocket coordination
        await this.fetchSessionId();
    }

    async fetchSessionId() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            if (data.success !== false && data.sessionId) {
                this.currentSession = data.sessionId;
                console.log('Session ID fetched:', this.currentSession);
            }
        } catch (error) {
            console.error('Failed to fetch session ID:', error);
            // Fall back to generating our own session ID
            if (!this.currentSession) {
                this.currentSession = this.generateSessionId();
            }
        }
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

        // Back directory button (go up one level)
        document.getElementById('back-directory-btn').addEventListener('click', () => {
            this.handleBackDirectory();
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
            // Ensure input stays visible on mobile
            if (this.isMobileDevice()) {
                this.ensureInputVisible(e.target);
            }
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
        // Leave WebSocket room before logout
        this.leaveDirectoryRoom();

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

        // Ensure conversation pane scrolls to bottom when app section is shown
        setTimeout(() => {
            this.scrollConversationToBottom();
        }, 100);
    }

    handleBackToDirectory() {
        // Store the current directory path to restore selection
        const previousDirectoryPath = this.initialDirectoryPath;

        // Current conversation is automatically saved to server as messages are sent
        // No need to manually save here

        // Clear the current directory context
        this.currentDirectory = null;
        this.currentDirectoryPath = null;
        this.initialDirectoryPath = null;
        this.currentDirectoryName.textContent = 'Remote Claude';

        // Clear conversation history for the new session
        this.conversationHistory = [];
        this.sessionStartTime = new Date().toISOString();

        // Update download button visibility
        this.updateDownloadButtonVisibility();

        // Clear the terminal output
        const output = document.getElementById('claude-output');
        output.innerHTML = '<div class="terminal-welcome"><div class="welcome-line">Remote Claude Web Interface</div></div>';

        // Show directory selection screen
        this.showDirectorySelection();

        // Reload directories and restore previous selection
        this.loadDirectories(previousDirectoryPath);

        // Update browser history
        history.pushState({ section: 'directory' }, '', '#directory');
    }

    handleBrowserNavigation(e) {
        const state = e.state;

        // Check if file viewer modal is open first
        const modal = document.getElementById('file-viewer-modal');
        if (modal && !modal.classList.contains('hidden')) {
            // Close the file viewer modal instead of navigating
            this.closeFileViewer();
            // Push current state back to prevent actual navigation
            history.pushState({ section: 'app', directory: this.currentDirectory }, '', '#app');
            return;
        }

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
        } else {
            // Handle back button when no specific state (e.g., first navigation)
            if (!this.appSection.classList.contains('hidden')) {
                this.handleBackToDirectory();
            }
        }
    }

    async handleBackDirectory() {
        if (!this.currentDirectoryPath) {
            return;
        }

        // Calculate parent directory path
        const pathParts = this.currentDirectoryPath.split(/[/\\]/);
        if (pathParts.length <= 1) {
            // Already at root, disable the button or do nothing
            return;
        }

        // Remove the last part to go up one level
        pathParts.pop();
        const parentPath = pathParts.join('/');

        // Navigate to parent directory
        try {
            const response = await fetch('/api/select-directory', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ directoryPath: parentPath })
            });

            const data = await response.json();

            if (data.success) {
                this.currentDirectoryPath = data.directory.path;
                this.renderFileList(data.directory);
                this.updateBackButtonState();
            } else {
                this.updateStatus(`Failed to navigate up: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Back directory error:', error);
            this.updateStatus('Failed to navigate up directory', 'error');
        }
    }

    updateBackButtonState() {
        const backBtn = document.getElementById('back-directory-btn');
        if (!backBtn) return;

        if (!this.currentDirectoryPath || !this.initialDirectoryPath) {
            backBtn.style.display = 'none';
            return;
        }

        // Normalize paths for comparison (handle different separators)
        const normalizePath = (path) => path.replace(/\\/g, '/').replace(/\/+$/, '');
        const currentNormalized = normalizePath(this.currentDirectoryPath);
        const initialNormalized = normalizePath(this.initialDirectoryPath);

        // Show button only if we're deeper than the initial selected directory
        const isInSubdirectory = currentNormalized !== initialNormalized &&
            currentNormalized.startsWith(initialNormalized + '/');

        backBtn.style.display = isInSubdirectory ? 'block' : 'none';
    }

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            (window.innerWidth <= 768 && 'ontouchstart' in window);
    }

    ensureInputVisible(inputElement) {
        // Debounce to avoid excessive scrolling
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }

        this.scrollTimeout = setTimeout(() => {
            if (document.activeElement === inputElement) {
                // Get the input's position
                const rect = inputElement.getBoundingClientRect();
                const viewportHeight = window.innerHeight;

                // If input is not fully visible, scroll it into view
                if (rect.bottom > viewportHeight * 0.7) {
                    inputElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'nearest'
                    });
                }
            }
        }, 100);
    }

    scrollConversationToBottom() {
        // Scroll the conversation pane to the bottom to show the most recent messages
        const output = document.getElementById('claude-output');
        if (output) {
            // Use requestAnimationFrame to ensure DOM updates are complete
            requestAnimationFrame(() => {
                output.scrollTop = output.scrollHeight;
            });
        }
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
    async loadDirectories(defaultPath = null) {
        try {
            const response = await fetch('/api/directories');
            const data = await response.json();

            if (data.success) {
                this.populateDirectorySelect(data.directories, defaultPath);
            } else {
                this.updateStatus(`Failed to load directories: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Failed to load directories:', error);
            this.updateStatus('Failed to load directories', 'error');
        }
    }

    populateDirectorySelect(directories, defaultPath = null) {
        const select = document.getElementById('directory-select');
        select.innerHTML = '';

        if (directories.length === 0) {
            select.innerHTML = '<option value="">No directories configured</option>';
            this.showStatus('No directories configured. Use "npm run add-directory" to add directories.', 'error');
            return;
        }

        let hasDefaultSelection = false;

        // Populate directories and select the default if provided
        directories.forEach((dir, index) => {
            const option = document.createElement('option');
            option.value = dir.fullPath;
            option.textContent = dir.name;

            // Select this option if it matches the default path, otherwise select first
            if (defaultPath && dir.fullPath === defaultPath) {
                option.selected = true;
                hasDefaultSelection = true;
            } else if (!defaultPath && index === 0) {
                option.selected = true;
                hasDefaultSelection = true;
            }

            select.appendChild(option);
        });

        // If no default was found, select the first directory
        if (!hasDefaultSelection && directories.length > 0) {
            select.children[0].selected = true;
        }

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
                this.currentDirectoryPath = data.directory.path;
                this.initialDirectoryPath = data.directory.path; // Store the initial selected directory

                // Save selected directory to localStorage for next session
                this.saveLastSelectedDirectory(directoryPath);

                // Load stored conversation for this directory
                try {
                    const hasStoredConversation = await this.loadConversationFromServer();
                    if (!hasStoredConversation) {
                        // Start fresh session if no stored conversation
                        this.conversationHistory = [];
                        this.sessionStartTime = new Date().toISOString();
                    }
                } catch (error) {
                    console.warn('Failed to load conversation from server:', error);
                    // Start fresh session on error
                    this.conversationHistory = [];
                    this.sessionStartTime = new Date().toISOString();
                }

                this.showFilesBrowser(data.directory, data.breadcrumbs);

                // Join WebSocket room for this directory
                await this.joinDirectoryRoom(this.initialDirectoryPath);

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

        // Ensure the file list container doesn't have empty class when showing files
        const fileListContainer = document.querySelector('.file-list-container');
        if (fileListContainer) {
            fileListContainer.classList.remove('empty');
        }

        this.renderFileList(directory);
        this.updateBackButtonState();
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
        const fileListContainer = document.getElementById('file-list').parentElement;
        fileList.innerHTML = '';

        if (directory.contents.length === 0) {
            fileList.innerHTML = '<div class="placeholder">Directory is empty</div>';
            fileListContainer.classList.add('empty');
            return;
        }

        // Remove empty class when there are files
        fileListContainer.classList.remove('empty');

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
                this.currentDirectoryPath = data.directory.path;
                this.renderFileList(data.directory);
                this.updateBackButtonState();
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
                this.currentDirectoryPath = data.directory.path;
                this.renderFileList(data.directory);
                this.updateBackButtonState();
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
        // Escape HTML first to prevent XSS
        const escaped = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        let formatted = escaped;

        // Handle code blocks first, including surrounding newlines
        formatted = formatted.replace(/\n?```(\w+)?\n([\s\S]*?)\n```\n?/g, (match, language, code) => {
            const lang = language ? ` class="language-${language}"` : '';
            return `<pre class="code-block"><code${lang}>${code}</code></pre>`;
        });

        // Handle inline code (`code`)
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // Convert **text** to <strong>text</strong>
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Convert *text* to <em>text</em>
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Convert URLs to clickable links
        formatted = formatted.replace(
            /(https?:\/\/[^\s<>"]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        // Convert line breaks to <br> tags
        formatted = formatted.replace(/\n/g, '<br>');

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
        } else if (type === 'loading') {
            entry.innerHTML = content;
            entry.className += ' loading-message';
            entry.style.marginBottom = '15px';
        } else {
            // Parse **text** and convert to bold formatting
            const formattedContent = this.formatClaudeResponse(content);
            entry.innerHTML = formattedContent;
            entry.style.marginBottom = '15px';
        }

        output.appendChild(entry);
        output.scrollTop = output.scrollHeight;

        // Return the element so it can be modified later
        return entry;
    }



    async sendClaudeCommand() {
        const input = document.getElementById('claude-input');
        const command = input.value.trim();

        if (!command) {
            return;
        }

        // Check if any command is already executing (local or remote)
        if (this.localCommandExecuting || this.remoteCommandExecuting) {
            this.updateStatus('A command is already executing. Please wait.', 'warning');
            return;
        }

        // Handle special commands
        if (command === '/clear') {
            // Add command to terminal first
            this.addToTerminal(command, 'command');

            // Clear local conversation
            this.clearCurrentConversation();

            // Send /clear to backend to clear context.md
            try {
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
                    if (data.success && data.result && data.result.output) {
                        this.addToTerminal(data.result.output, 'system');
                    }
                }
            } catch (error) {
                console.error('Error clearing context:', error);
            }

            // Clear input
            input.value = '';
            input.style.height = 'auto';

            return;
        }

        // Handle /trim command - removes last message without sending to Claude
        if (command === '/trim') {
            // Don't add the command itself to terminal
            // Just trim the last message
            this.trimLastMessage();

            // Clear input
            input.value = '';
            input.style.height = 'auto';

            return;
        }

        // Track user command in conversation history
        this.addToConversationHistory('user', command);

        // Add command to terminal
        this.addToTerminal(command, 'command');

        // Clear input and reset height
        input.value = '';
        input.style.height = 'auto';

        // Set local command executing flag to ignore remote broadcasts
        this.localCommandExecuting = true;

        // Disable send button and show loading with spinner
        const sendBtn = document.getElementById('send-claude-btn');
        sendBtn.disabled = true;
        sendBtn.textContent = 'Executing...';

        const loadingMessage = '<span class="spinner"></span>Executing Claude Code command...';
        const loadingElement = this.addToTerminal(loadingMessage, 'loading');
        this.addToConversationHistory('system', 'Executing Claude Code command...');

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

            // Clear local command executing flag first to prevent race conditions
            this.localCommandExecuting = false;

            // Remove loading spinner and re-enable send button
            if (loadingElement) {
                loadingElement.remove();
            }
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';

            if (data.success) {
                const successMessage = '✅ Command completed successfully';
                this.addToTerminal(successMessage);
                this.addToConversationHistory('system', successMessage);

                // Extract Claude's response from the result
                let claudeResponse = '';
                if (data.result.claudeOutput && data.result.claudeOutput.content !== undefined) {
                    claudeResponse = data.result.claudeOutput.content;
                    if (claudeResponse) {
                        this.addToTerminal(claudeResponse);
                        this.addToConversationHistory('claude', claudeResponse);
                    } else {
                        // Claude returned empty response - show feedback
                        const emptyMsg = '(No response from Claude)';
                        this.addToTerminal(emptyMsg, 'system');
                        console.log('Claude returned empty response - check server logs for details');
                    }
                }

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
            // Clear local command executing flag first to prevent race conditions
            this.localCommandExecuting = false;

            // Remove loading spinner and re-enable send button
            if (loadingElement) {
                loadingElement.remove();
            }
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';

            console.error('Claude Code execution error:', error);
            const errorMessage = `❌ Connection error: ${error.message}`;
            this.addToTerminal(errorMessage);

            // Track connection error in conversation history
            this.addToConversationHistory('system', errorMessage);
        }
    }

    addToConversationHistory(role, content) {
        const message = {
            role: role,
            content: content,
            timestamp: new Date().toISOString(),
            directory: this.currentDirectory
        };
        
        this.conversationHistory.push(message);

        // Save message to server (but only user and claude messages, not system messages)
        if (role === 'user' || role === 'claude') {
            this.saveMessageToServer(message);
        }

        // Update download button visibility
        this.updateDownloadButtonVisibility();
    }

    async saveMessageToServer(message) {
        if (!this.initialDirectoryPath) return;

        try {
            const response = await fetch('/api/chatlog', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save message to server');
            }
        } catch (error) {
            console.warn('Failed to save message to server:', error);
            // Continue operation - chat remains functional even if save fails
            this.showNotification('Chat history could not be saved: ' + error.message, 'warning');
        }
    }

    async loadConversationFromServer() {
        if (!this.initialDirectoryPath) return false;

        try {
            // Load conversation from server
            const response = await fetch('/api/chatlog', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to load conversation from server');
            }

            const data = await response.json();
            const chatHistory = data.chatHistory;

            if (chatHistory && chatHistory.history && chatHistory.history.length > 0) {
                // Restore conversation history
                this.conversationHistory = chatHistory.history;
                this.sessionStartTime = chatHistory.sessionStartTime || new Date().toISOString();
                
                // Restore terminal display
                this.restoreTerminalFromHistory();
                
                // Update download button visibility
                this.updateDownloadButtonVisibility();
                
                return true;
            }

            return false;
        } catch (error) {
            console.warn('Failed to load conversation from server:', error);
            // Continue with empty conversation on error
            return false;
        }
    }

    async clearConversationFromServer() {
        if (!this.initialDirectoryPath) return;

        try {
            const response = await fetch('/api/chatlog/clear', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to clear conversation on server');
            }
        } catch (error) {
            console.warn('Failed to clear conversation from server:', error);
            throw error;
        }
    }


    restoreTerminalFromHistory() {
        const output = document.getElementById('claude-output');
        output.innerHTML = '<div class="terminal-welcome"><div class="welcome-line">Remote Claude Web Interface</div></div>';

        // Replay conversation history in terminal
        this.conversationHistory.forEach(entry => {
            if (entry.role === 'user') {
                this.addToTerminal(entry.content, 'command');
            } else if (entry.role === 'claude') {
                this.addToTerminal(entry.content);
            } else if (entry.role === 'system') {
                this.addToTerminal(entry.content);
            }
        });

        // Ensure conversation pane scrolls to bottom after loading
        this.scrollConversationToBottom();
    }

    async clearCurrentConversation() {
        // Clear from server
        try {
            await this.clearConversationFromServer();
        } catch (error) {
            console.warn('Failed to clear conversation from server:', error);
            this.showNotification('Failed to clear conversation history: ' + error.message, 'error');
        }

        // Clear from memory
        this.conversationHistory = [];
        this.sessionStartTime = new Date().toISOString();

        // Clear terminal display
        const output = document.getElementById('claude-output');
        output.innerHTML = '<div class="terminal-welcome"><div class="welcome-line">Remote Claude Web Interface</div></div>';

        // Update download button visibility
        this.updateDownloadButtonVisibility();

        this.updateStatus('Conversation cleared', 'info');
    }

    clearConversationLocal() {
        // Clear from memory only (for WebSocket events)
        this.conversationHistory = [];
        this.sessionStartTime = new Date().toISOString();

        // Clear terminal display
        const output = document.getElementById('claude-output');
        output.innerHTML = '<div class="terminal-welcome"><div class="welcome-line">Remote Claude Web Interface</div></div>';

        // Update download button visibility
        this.updateDownloadButtonVisibility();
    }

    trimLastMessage() {
        // Check if there's anything to trim
        if (this.conversationHistory.length === 0) {
            this.updateStatus('No messages to trim', 'info');
            return;
        }

        // Remove the last message from conversation history
        const removedMessage = this.conversationHistory.pop();
        
        // Note: Individual messages are saved to server when sent
        // For undo operations, we clear and rebuild from remaining messages
        // This is a limitation - proper implementation would need server-side undo support

        // Rebuild the terminal display from the updated history
        this.restoreTerminalFromHistory();

        // Update download button visibility
        this.updateDownloadButtonVisibility();

        // Show status message about what was removed
        const messageType = removedMessage.role === 'user' ? 'command' : 
                           removedMessage.role === 'claude' ? 'response' : 'message';
        this.updateStatus(`Removed last ${messageType}`, 'info');
    }

    updateDownloadButtonVisibility() {
        const downloadBtn = document.getElementById('download-conversation-btn');
        if (!downloadBtn) return;

        // Show button only if there's conversation history
        downloadBtn.style.display = this.conversationHistory.length > 0 ? 'block' : 'none';
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
                version: 'v0.1.7'
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