# Remote Claude Web Interface

Secure web interface for remote access to Claude Code functionality from mobile devices and remote locations.

## Features

- 🔒 SSL/HTTPS encryption
- 🔐 Password authentication with secure hashing
- 📁 Directory access controls
- 📱 Mobile-responsive interface
- 🤖 Claude Code integration
- 🛡️ Sandboxed execution environment

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Generate SSL certificates:
   ```bash
   npm run setup
   ```

3. Configure authentication and directories (interactive setup)

4. Start the server:
   ```bash
   npm start
   ```

## Development

```bash
npm run dev  # Start with auto-reload
npm test     # Run tests
```

## Security

- All communications encrypted with HTTPS
- Passwords stored with SHA-256 + salt
- Directory access restricted to allow-list
- Input sanitization and validation
- Rate limiting and timeout protection

## Requirements

- Node.js 16+
- Windows 10+ (for PowerShell certificate generation)
- Claude Code CLI installed and configured