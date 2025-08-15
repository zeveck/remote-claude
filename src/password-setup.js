#!/usr/bin/env node

const ConfigManager = require('./config-manager');
const config = require('../config/default.json');
const { secureInput, regularInput } = require('./secure-input');

async function setupPassword() {
  console.log('🔐 Password Setup for Remote Claude Web Interface\n');
  
  try {
    const configManager = new ConfigManager(config);
    
    if (configManager.isPasswordConfigured()) {
      const change = await regularInput('Password is already configured. Change it? (y/N): ');
      if (change.toLowerCase() !== 'y' && change.toLowerCase() !== 'yes') {
        console.log('Password unchanged.');
        return;
      }
    }
    
    let password;
    let confirmPassword;
    
    do {
      password = await secureInput('Enter new password (min 6 characters): ');
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
    console.log('\n✅ Password configured successfully!');
    
  } catch (error) {
    console.error('❌ Password setup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  setupPassword();
}

module.exports = { setupPassword };