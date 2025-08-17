#!/usr/bin/env node

const SSLManager = require('./ssl-manager');
const ConfigManager = require('./config-manager');
const config = require('../config/default.json');
const { secureInput, regularInput } = require('./secure-input');
const fs = require('fs');
const path = require('path');

async function setup() {
  console.log('🚀 Remote Claude Web Interface Setup\n');

  try {
    const ConfigManager = require('./config-manager');
    const configManager = new ConfigManager(config);

    // SSL Certificate Setup
    console.log('📋 Step 1: SSL Certificate Generation');

    const sslManager = new SSLManager(config);

    if (sslManager.needsRegeneration()) {
      console.log('⚠️  SSL certificates not found or invalid');

      const commonName = await regularInput('Enter hostname/domain (default: localhost): ') || 'localhost';
      const validDays = await regularInput('Certificate validity in days (default: 365): ') || '365';

      console.log('\n🔐 Generating SSL certificates...');
      sslManager.generateCertificates(commonName, parseInt(validDays));
      console.log('✅ SSL certificates generated successfully\n');
    } else {
      console.log('✅ SSL certificates already exist and are valid\n');
    }

    // Password Setup
    console.log('📋 Step 2: Authentication Setup');

    if (!configManager.isPasswordConfigured()) {
      console.log('⚠️  No password configured');

      let password;
      let confirmPassword;

      do {
        password = await secureInput('Enter password for web interface: ');
        if (password.length < 6) {
          console.log('❌ Password must be at least 6 characters long');
          continue;
        }

        confirmPassword = await secureInput('Confirm password: ');
        if (password !== confirmPassword) {
          console.log('❌ Passwords do not match');
        }
      } while (password !== confirmPassword || password.length < 6);

      configManager.savePassword(password);
      console.log('✅ Password configured successfully\n');
    } else {
      console.log('✅ Password already configured\n');
    }

    // Directory Setup
    console.log('📋 Step 3: Directory Access Setup');

    if (!configManager.areDirectoriesConfigured()) {
      console.log('⚠️  No allowed directories configured');
      console.log('Enter directories that Claude Code can access (one per line, empty line to finish):');

      const directories = [];
      let directory;

      do {
        directory = await regularInput(`Directory ${directories.length + 1} (or press Enter to finish): `);
        if (directory.trim()) {
          directories.push(directory.trim());
        }
      } while (directory.trim() && directories.length < 10);

      if (directories.length === 0) {
        // Default to current directory
        directories.push(process.cwd());
        console.log('Using current directory as default');
      }

      configManager.saveAllowedDirectories(directories);
      console.log('✅ Directory access configured successfully\n');
    } else {
      console.log('✅ Directory access already configured');
      const dirs = configManager.loadAllowedDirectories();
      console.log(`📁 ${dirs.length} directories allowed:`);
      dirs.forEach(dir => console.log(`   ${dir}`));
      console.log('');
    }

    // Network Access Setup
    console.log('📋 Step 4: Network Access Configuration');

    if (config.server.allowNetworkAccess) {
      console.log('✅ Network access already enabled for mobile device access');
      console.log(`🌐 Server will bind to: ${config.server.host === 'auto' ? 'auto-detected network IP' : config.server.host}`);

      // Show current network info
      const NetworkUtils = require('./network-utils');
      const primaryIP = NetworkUtils.getPrimaryNetworkIP();
      console.log(`📍 Your phone should connect to: https://${primaryIP}:${config.server.port}`);
    } else {
      const enableNetwork = await regularInput('Enable mobile device access from local network? (y/N): ');
      if (enableNetwork.toLowerCase() === 'y' || enableNetwork.toLowerCase() === 'yes') {
        // Show available network interfaces
        const NetworkUtils = require('./network-utils');
        const { primary } = NetworkUtils.displayNetworkInfo();

        // Update config to enable network access
        const updatedConfig = { ...config };
        updatedConfig.server.allowNetworkAccess = true;
        updatedConfig.server.host = 'auto';

        // Save updated config
        const configPath = path.join(__dirname, '../config/default.json');
        fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));

        console.log('✅ Network access enabled - you can now access from your phone');
        console.log('🔒 Access is restricted to local network IPs only for security');
        console.log(`📍 Your phone should connect to: https://${primary}:${config.server.port}`);
      } else {
        console.log('✅ Network access disabled - localhost only');
      }
    }
    console.log('');

    // Final status
    console.log('📋 Configuration Summary:');
    const status = configManager.getConfigurationStatus();
    console.log(`🔐 Password: ${status.passwordConfigured ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`📁 Directories: ${status.directoriesConfigured ? '✅ Configured' : '❌ Not configured'} (${status.allowedDirectories.length} allowed)`);
    console.log('🔒 SSL Certificates: ✅ Generated');

    console.log('\n📋 Next Steps:');
    console.log('1. Run: npm start');
    console.log('2. Open: https://localhost:3443');
    if (config.server.host === '0.0.0.0' && config.server.allowNetworkAccess) {
      console.log('3. Or access from your phone using your computer\'s IP address');
      console.log('   (The server will display network URLs when it starts)');
      console.log('4. Accept the self-signed certificate warning');
      console.log('5. Login with your configured password');
      console.log('6. Select a directory and start using Claude Code remotely!');
    } else {
      console.log('3. Accept the self-signed certificate warning');
      console.log('4. Login with your configured password');
      console.log('5. Select a directory and start using Claude Code remotely!');
    }

    console.log('\n🎉 Setup complete! You can now start the server.');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  setup();
}

module.exports = { setup };