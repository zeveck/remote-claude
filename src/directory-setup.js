#!/usr/bin/env node

const ConfigManager = require('./config-manager');
const config = require('../config/default.json');
const { regularInput } = require('./secure-input');
const path = require('path');

async function setupDirectories() {
  console.log('📁 Directory Access Setup for Remote Claude Web Interface\n');
  
  try {
    const configManager = new ConfigManager(config);
    
    if (configManager.areDirectoriesConfigured()) {
      console.log('Current allowed directories:');
      const dirs = configManager.loadAllowedDirectories();
      dirs.forEach((dir, index) => console.log(`  ${index + 1}. ${dir}`));
      
      const change = await regularInput('\nReconfigure directories? (y/N): ');
      if (change.toLowerCase() !== 'y' && change.toLowerCase() !== 'yes') {
        console.log('Directory configuration unchanged.');
        return;
      }
    }
    
    console.log('\n📋 Configure directories that Claude Code can access:');
    console.log('💡 Tips:');
    console.log('   - Use absolute paths for clarity');
    console.log('   - Claude will have access to subdirectories too');
    console.log('   - Enter one directory per line');
    console.log('   - Press Enter on empty line to finish\n');
    
    const directories = [];
    let directory;
    
    // Suggest current directory as default
    const currentDir = process.cwd();
    const useCurrentDir = await regularInput(`Add current directory (${currentDir})? (Y/n): `);
    if (useCurrentDir.toLowerCase() !== 'n' && useCurrentDir.toLowerCase() !== 'no') {
      directories.push(currentDir);
      console.log(`✅ Added: ${currentDir}`);
    }
    
    // Allow adding more directories
    do {
      directory = await regularInput(`\nDirectory ${directories.length + 1} (or press Enter to finish): `);
      if (directory.trim()) {
        const resolvedPath = path.resolve(directory.trim());
        
        // Check if directory exists
        const fs = require('fs');
        if (!fs.existsSync(resolvedPath)) {
          console.log(`❌ Directory does not exist: ${resolvedPath}`);
          continue;
        }
        
        if (!fs.statSync(resolvedPath).isDirectory()) {
          console.log(`❌ Path is not a directory: ${resolvedPath}`);
          continue;
        }
        
        // Check for duplicates
        if (directories.includes(resolvedPath)) {
          console.log(`⚠️  Directory already added: ${resolvedPath}`);
          continue;
        }
        
        directories.push(resolvedPath);
        console.log(`✅ Added: ${resolvedPath}`);
      }
    } while (directory.trim() && directories.length < 20);
    
    if (directories.length === 0) {
      console.log('❌ No directories configured. At least one directory is required.');
      process.exit(1);
    }
    
    // Confirm configuration
    console.log('\n📋 Directories to be configured:');
    directories.forEach((dir, index) => console.log(`  ${index + 1}. ${dir}`));
    
    const confirm = await regularInput('\nSave this configuration? (Y/n): ');
    if (confirm.toLowerCase() === 'n' || confirm.toLowerCase() === 'no') {
      console.log('Configuration cancelled.');
      return;
    }
    
    configManager.saveAllowedDirectories(directories);
    console.log('\n✅ Directory access configured successfully!');
    console.log('Claude Code will be able to access these directories and their subdirectories.');
    
  } catch (error) {
    console.error('❌ Directory setup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  setupDirectories();
}

module.exports = { setupDirectories };