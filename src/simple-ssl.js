const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function generateSimpleSSL(certDir, commonName = 'localhost') {
  console.log('🔐 Generating SSL certificates...');
  
  // Ensure directory exists
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.crt');

  try {
    // Check if openssl is available
    execSync('openssl version', { stdio: 'ignore' });
    console.log('✅ OpenSSL found, generating certificates...');
    
    // Generate private key
    execSync(`openssl genrsa -out "${keyPath}" 2048`, { stdio: 'pipe' });
    
    // Generate certificate
    const opensslCmd = `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 -subj "/CN=${commonName}"`;
    execSync(opensslCmd, { stdio: 'pipe' });
    
    console.log('✅ SSL certificates generated successfully!');
    console.log(`📄 Certificate: ${certPath}`);
    console.log(`🔑 Private Key: ${keyPath}`);
    
    return { keyPath, certPath };
    
  } catch (error) {
    console.log('❌ OpenSSL not found or failed');
    console.log('\n📋 Manual Setup Required:');
    console.log('1. Install OpenSSL:');
    console.log('   - Windows: winget install OpenSSL.Light');
    console.log('   - Or download from: https://slproweb.com/products/Win32OpenSSL.html');
    console.log('2. Run: npm run generate-ssl');
    console.log('3. Or manually create certificates and place in config/ssl/');
    
    // Create dummy files with instructions
    const instruction = `# SSL Certificate Setup Required
# 
# This application requires SSL certificates to run securely.
# Please install OpenSSL and run: npm run generate-ssl
# 
# Or manually create:
# - server.key (private key)
# - server.crt (certificate)
# 
# Place both files in this directory.
`;
    
    fs.writeFileSync(path.join(certDir, 'README.txt'), instruction);
    
    throw new Error('OpenSSL required for SSL certificate generation. See config/ssl/README.txt for instructions.');
  }
}

module.exports = { generateSimpleSSL };

// CLI usage
if (require.main === module) {
  const certDir = process.argv[2] || 'config/ssl';
  const commonName = process.argv[3] || 'localhost';
  
  try {
    generateSimpleSSL(certDir, commonName);
  } catch (error) {
    console.error('❌', error.message);
    process.exit(1);
  }
}