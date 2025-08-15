#!/usr/bin/env node

const SSLManager = require('./ssl-manager');
const config = require('../config/default.json');
const { secureInput, regularInput } = require('./secure-input');

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
    
    // Final status
    console.log('📋 Configuration Summary:');
    const status = configManager.getConfigurationStatus();
    console.log(`🔐 Password: ${status.passwordConfigured ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`📁 Directories: ${status.directoriesConfigured ? '✅ Configured' : '❌ Not configured'} (${status.allowedDirectories.length} allowed)`);
    console.log('🔒 SSL Certificates: ✅ Generated');
    
    console.log('\n📋 Next Steps:');
    console.log('1. Run: npm start');
    console.log('2. Open: https://localhost:3443');
    console.log('3. Accept the self-signed certificate warning');
    console.log('4. Login with your configured password');
    console.log('5. Select a directory and start using Claude Code remotely!');
    
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