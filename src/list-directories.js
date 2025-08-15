#!/usr/bin/env node

const ConfigManager = require('./config-manager');
const config = require('../config/default.json');

function listDirectories() {
  try {
    const configManager = new ConfigManager(config);
    const directories = configManager.loadAllowedDirectories();
    
    if (directories.length === 0) {
      console.log('📁 No directories configured yet');
      console.log('\n💡 Add directories with:');
      console.log('   npm run add-directory <path>');
      console.log('   npm run setup-directories');
      return;
    }
    
    console.log(`📁 Allowed Directories (${directories.length}):`);
    directories.forEach((dir, index) => {
      console.log(`  ${index + 1}. ${dir}`);
    });
    
    console.log('\n💡 Add more directories with:');
    console.log('   npm run add-directory <path>');
    
  } catch (error) {
    console.error('❌ Failed to list directories:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  listDirectories();
}

module.exports = { listDirectories };