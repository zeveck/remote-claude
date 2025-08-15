#!/usr/bin/env node

const ConfigManager = require('./config-manager');
const config = require('../config/default.json');
const path = require('path');
const fs = require('fs');

function addDirectory() {
  const targetDir = process.argv[2];
  
  if (!targetDir) {
    console.log('📁 Add Directory to Remote Claude Web Interface');
    console.log('\nUsage:');
    console.log('  npm run add-directory <directory-path>');
    console.log('  npm run add-directory .');
    console.log('  npm run add-directory /path/to/project');
    console.log('  npm run add-directory "C:\\Users\\Name\\Projects"');
    console.log('\n💡 Tips:');
    console.log('   - Use absolute paths for clarity');
    console.log('   - Claude will have access to subdirectories too');
    console.log('   - Use quotes around paths with spaces');
    process.exit(1);
  }
  
  try {
    const configManager = new ConfigManager(config);
    const resolvedPath = path.resolve(targetDir);
    
    // Validate directory exists
    if (!fs.existsSync(resolvedPath)) {
      console.error(`❌ Directory does not exist: ${resolvedPath}`);
      process.exit(1);
    }
    
    if (!fs.statSync(resolvedPath).isDirectory()) {
      console.error(`❌ Path is not a directory: ${resolvedPath}`);
      process.exit(1);
    }
    
    // Load existing directories
    const existingDirs = configManager.loadAllowedDirectories();
    
    // Check if already exists
    if (existingDirs.includes(resolvedPath)) {
      console.log(`⚠️  Directory already allowed: ${resolvedPath}`);
      return;
    }
    
    // Check if it's a subdirectory of an existing allowed directory
    const isSubdirectory = existingDirs.some(existingDir => 
      resolvedPath.startsWith(existingDir + path.sep)
    );
    
    if (isSubdirectory) {
      console.log(`⚠️  Directory is already covered by an existing allowed directory:`);
      existingDirs.forEach(dir => {
        if (resolvedPath.startsWith(dir + path.sep)) {
          console.log(`   ${dir}`);
        }
      });
      return;
    }
    
    // Add the new directory
    const updatedDirs = [...existingDirs, resolvedPath];
    configManager.saveAllowedDirectories(updatedDirs);
    
    console.log(`✅ Added directory: ${resolvedPath}`);
    console.log(`📁 Total allowed directories: ${updatedDirs.length}`);
    
  } catch (error) {
    console.error('❌ Failed to add directory:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  addDirectory();
}

module.exports = { addDirectory };