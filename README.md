# Remote Claude Web Interface

Secure web interface for remote access to Claude Code functionality from mobile devices and remote locations.

**⚠️ NOTE**: This is primarily an exercise in developing an app using Kiro and should be used with caution.

**⚠️ WARNING**: This tool provides command execution capability and is designed for use on local networks only. It grants authenticated users the ability to run Claude Code (and thus execute commands) with your user privileges. For security, always use behind a firewall and avoid exposing to the public internet.

## Features

- 🔒 SSL/HTTPS encryption with self-signed certificates (using node-forge)
- 🔐 Password authentication with PBKDF2 hashing (100,000 iterations)
- 📁 Directory access controls with allow-list validation
- 📱 Mobile-responsive interface with conversation persistence
- 🤖 Claude Code CLI integration with real-time execution
- 🛡️ Sandboxed execution environment with command filtering
- ⚡ Rate limiting and comprehensive security controls
- 🌐 Smart network access with local IP filtering
- 💾 Conversation history persistence across sessions
- 🎨 Professional loading indicators and user feedback
- 📊 Conversation export functionality
- 🔍 File browser with syntax highlighting

## Requirements

- Node.js 16+
- Claude Code CLI installed and configured

## Quick Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run interactive setup (recommended):**
   ```bash
   npm run setup
   ```
   This will:
   - Generate SSL certificates (using node-forge, no PowerShell needed)
   - Set up password authentication with secure hashing
   - Configure allowed directories with validation
   - Set up network access for mobile devices (optional)
   - Display your network IP addresses for mobile access

3. **Start the server:**
   ```bash
   npm start
   ```

The server will be available at `https://localhost:3443` (or your configured port).

## Manual Setup

If you prefer to set up components individually:

### Generate SSL Certificates
```bash
npm run generate-ssl
```
Creates self-signed SSL certificates in `config/ssl/` directory.

### Set Password
```bash
npm run setup-password
```
Configure the password for web interface authentication.

### Configure Directories
```bash
npm run add-directory <path>  # Add a directory
npm run list-directories      # List allowed directories
```

## Development

```bash
npm run dev   # Start with auto-reload (requires Node.js --watch flag)
npm test      # Run test suite
```

## Configuration

The application uses `config/default.json` for configuration:

```json
{
  "server": {
    "port": 3443,
    "host": "auto",              // Auto-detect network IP
    "allowNetworkAccess": true   // Enable mobile access
  },
  "auth": {
    "sessionSecret": null,       // Auto-generated secure secret
    "sessionTimeout": 3600000,   // 1 hour
    "maxLoginAttempts": 5
  },
  "security": {
    "allowedDirectoriesFile": "./config/allow-dirs.txt",
    "passwordFile": "./config/passwd.txt"
  }
}
```

### Configuration Options
- **host**: `"auto"` (auto-detect), `"127.0.0.1"` (localhost only), or specific IP
- **allowNetworkAccess**: `true` enables mobile access with local network filtering
- **sessionSecret**: `null` generates secure random secret automatically

## Security Features

- **HTTPS Only**: All communications encrypted with TLS
- **Strong Password Protection**: PBKDF2 hashing with 100,000 iterations and salt
- **Directory Sandboxing**: Only explicitly allowed directories can be accessed
- **Comprehensive Input Validation**: Multi-layer validation with sanitization
- **Rate Limiting**: Per-endpoint protection against abuse (20 requests/minute for commands)
- **Secure Session Management**: Auto-generated secrets with httpOnly and sameSite cookies
- **Command Filtering**: Dangerous system commands blocked with regex patterns
- **Network Security**: Local network IP filtering - blocks internet access automatically
- **Path Traversal Protection**: Enhanced validation prevents directory traversal attacks
- **Security Headers**: Helmet.js with Content Security Policy
- **Request Size Limits**: 1MB limits prevent DoS attacks
- **Structured Logging**: Security events logged without sensitive data exposure

## Project Structure

```
remote_term_llm/
├── src/
│   ├── server.js                    # Main Express server with security middleware
│   ├── auth-middleware.js           # Authentication with secure session handling
│   ├── validation-middleware.js     # Input validation and sanitization
│   ├── filesystem-manager.js        # File system operations with path validation
│   ├── claude-code-integration.js   # Claude CLI integration with sandboxing
│   ├── ssl-manager.js               # SSL certificate management
│   ├── config-manager.js            # Configuration with PBKDF2 password hashing
│   ├── network-utils.js             # Network interface detection and IP filtering
│   ├── logger.js                    # Structured logging system
│   ├── cert-generator.js            # Certificate generation (node-forge)
│   └── setup.js                     # Interactive setup with network configuration
├── public/                          # Web interface with mobile-responsive design
│   ├── app.js                       # Frontend with conversation persistence
│   ├── index.html                   # Mobile-optimized HTML
│   └── styles.css                   # Responsive CSS with loading animations
├── config/                          # Configuration and certificates
├── tests/                           # Comprehensive test suite (82 tests)
└── package.json
```

## Mobile Access

### Automatic Network Configuration (Recommended)
1. Run `npm run setup` and choose "yes" for network access
2. The setup will show your network IP address (e.g., `https://192.168.1.100:3443`)
3. Use that URL on your mobile device
4. Accept the self-signed certificate warning
5. Log in with your configured password

### Manual Network Setup
1. Ensure your mobile device is on the same local network
2. The server automatically detects and binds to your primary network interface
3. Check the server startup logs for the exact network URL
4. Access via the displayed network URL on your phone

### Security Notes
- **Local Network Only**: Access is automatically restricted to local network IPs
- **No Internet Exposure**: Even with port forwarding, external IPs are blocked
- **Specific Interface Binding**: Server binds to your actual network IP, not all interfaces
- **Conversation Persistence**: Your work automatically saves and restores across sessions

## User Interface Features

### Conversation Management
- **Persistent Conversations**: Work automatically saves and restores per directory
- **Export Functionality**: Download conversation history as structured JSON
- **Clear Command**: Type `/clear` to reset conversation and start fresh
- **Loading Indicators**: Professional spinner during Claude command execution

### File Browser
- **Syntax Highlighting**: View code files with VS Code-like highlighting
- **Mobile Responsive**: Full-screen file viewer on mobile devices
- **Smart Navigation**: Back button appears only when in subdirectories
- **File Type Detection**: Automatic language detection for syntax highlighting

### Mobile Optimizations
- **Viewport Fixes**: Solved mobile browser height issues (100vh problems)
- **Touch Friendly**: Optimized for mobile touch interactions
- **Auto-Focus Control**: Smart keyboard behavior on mobile devices
- **Responsive Design**: Clean interface that works on all screen sizes

## Troubleshooting

### Network Access Issues
- **Can't Access from Phone**: Run `npm run setup` and enable network access
- **Wrong IP Address**: Check server startup logs for correct network URLs
- **Blocked Access**: Ensure your phone is on the same local network

### General Issues
- **Certificate Warnings**: Self-signed certificates trigger browser warnings - add exception
- **Connection Refused**: Check firewall settings and ensure port 3443 is accessible
- **Authentication Issues**: Re-run `npm run setup-password` to reset password
- **Directory Access**: Use `npm run list-directories` to verify allowed paths
- **Command Execution**: Check that Claude CLI is installed and accessible in PATH

### Security Warnings
- **Network Access Warning**: Normal when binding to network interface for mobile access
- **Local Network Only**: External access is automatically blocked for security

## Version History

- **v0.1.4** - Security hardening, code quality improvements, loading spinners
- **v0.1.3** - Navigation improvements, conversation persistence, UI polish
- **v0.1.2** - Security enhancements, file viewer, mobile viewport fixes
- **v0.1.1** - UI polish, bold text formatting, version display
- **v0.1.0** - Initial release with full Claude CLI integration

## Credits

Created by Rich Conlan  
Coded via Kiro using Claude Sonnet 4.0

## License

This project is provided as-is for educational and personal use.

---

**Security Reminder**: This tool provides command execution capability. Use only on trusted local networks with strong passwords and proper firewall protection.