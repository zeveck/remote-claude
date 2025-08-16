# Remote Claude Web Interface

Secure web interface for remote access to Claude Code functionality from mobile devices and remote locations.

**⚠️ NOTE**: This is primarily an exercise in developing an app using Kiro and should be used with caution.

**⚠️ WARNING**: This tool provides command execution capability and is designed for use on local networks only. It grants authenticated users the ability to run Claude Code (and thus execute commands) with your user privileges. For security, always use behind a firewall and avoid exposing to the public internet.

## Features

- 🔒 SSL/HTTPS encryption with self-signed certificates (using node-forge)
- 🔐 Password authentication with bcrypt hashing
- 📁 Directory access controls with allow-list
- 📱 Mobile-responsive interface
- 🤖 Claude Code CLI integration
- 🛡️ Sandboxed execution environment
- ⚡ Rate limiting and security controls

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
   - Set up password authentication
   - Configure allowed directories

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
- Server port and host
- SSL certificate paths
- Session timeout
- Rate limiting settings

## Security Features

- **HTTPS Only**: All communications encrypted with TLS
- **Password Protection**: Passwords hashed with bcrypt
- **Directory Sandboxing**: Only explicitly allowed directories can be accessed
- **Input Sanitization**: All user inputs are validated and sanitized
- **Rate Limiting**: Protection against brute force attacks
- **Session Management**: Secure session handling with timeouts
- **Command Filtering**: Dangerous system commands are blocked

## Project Structure

```
remote_term_llm/
├── src/
│   ├── server.js                 # Main Express server
│   ├── auth-middleware.js        # Authentication handling
│   ├── filesystem-manager.js     # File system operations
│   ├── claude-code-integration.js # Claude CLI integration
│   ├── ssl-manager.js            # SSL certificate management
│   ├── config-manager.js         # Configuration handling
│   ├── cert-generator.js         # Certificate generation (node-forge)
│   └── setup.js                  # Interactive setup script
├── public/                       # Web interface files
├── config/                       # Configuration and certificates
├── tests/                        # Test suite
└── package.json
```

## Mobile Access

1. Ensure your mobile device is on the same network
2. Find your computer's local IP address
3. Access via `https://[YOUR-IP]:3443`
4. Accept the self-signed certificate warning
5. Log in with your configured password

## Troubleshooting

- **Certificate Warnings**: Self-signed certificates will trigger browser warnings. This is normal - add an exception.
- **Connection Refused**: Check firewall settings and ensure port 3443 is accessible
- **Authentication Issues**: Re-run `npm run setup-password` to reset password
- **Directory Access**: Use `npm run list-directories` to verify allowed paths

## Credits

Created by Rich Conlan  
Coded by via Kiro using Claude Sonnet 4.0

## License

This project is provided as-is for educational and personal use.