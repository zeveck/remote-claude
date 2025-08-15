const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function generateSSLCertificates(certDir, commonName = 'localhost', validDays = 365) {
  console.log('Generating SSL certificates...');
  
  // Ensure directory exists
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.crt');

  // Generate RSA key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Create certificate
  const cert = createSelfSignedCert(privateKey, publicKey, commonName, validDays);

  // Write files
  fs.writeFileSync(keyPath, privateKey);
  fs.writeFileSync(certPath, cert);

  console.log('✅ SSL certificates generated successfully!');
  console.log(`📄 Certificate: ${certPath}`);
  console.log(`🔑 Private Key: ${keyPath}`);
  
  return { keyPath, certPath };
}

function createSelfSignedCert(privateKey, publicKey, commonName, validDays) {
  // Use Node.js built-in X.509 certificate creation (Node 15.6+)
  try {
    const { X509Certificate } = require('crypto');
    
    // For older Node.js versions or if X509Certificate is not available,
    // we'll need to use OpenSSL or throw an error
    throw new Error('Using OpenSSL fallback');
    
  } catch (error) {
    // This simplified approach won't work - we need proper X.509 format
    throw new Error('Cannot create valid certificate without OpenSSL. Please install OpenSSL or use the OpenSSL method.');
  }
}

// Alternative: Use openssl command if available (cross-platform)
function generateWithOpenSSL(certDir, commonName = 'localhost', validDays = 365) {
  const { execSync } = require('child_process');
  
  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.crt');
  
  try {
    // Check if openssl is available
    execSync('openssl version', { stdio: 'ignore' });
    
    console.log('Using OpenSSL to generate certificates...');
    
    // Generate private key
    execSync(`openssl genrsa -out "${keyPath}" 2048`, { stdio: 'inherit' });
    
    // Generate certificate
    const opensslCmd = `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days ${validDays} -subj "/CN=${commonName}"`;
    execSync(opensslCmd, { stdio: 'inherit' });
    
    console.log('✅ SSL certificates generated with OpenSSL!');
    return { keyPath, certPath };
    
  } catch (error) {
    throw new Error('OpenSSL not available or failed to generate certificates');
  }
}

function generateCertificates(certDir, commonName = 'localhost', validDays = 365) {
  // Ensure directory exists
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  try {
    // Try OpenSSL first (more standard)
    return generateWithOpenSSL(certDir, commonName, validDays);
  } catch (error) {
    console.log('❌ OpenSSL not available');
    console.log('💡 Please install OpenSSL to generate proper SSL certificates');
    console.log('   Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
    console.log('   Or use: winget install OpenSSL.Light');
    throw new Error('OpenSSL is required for SSL certificate generation');
  }
}

module.exports = { generateCertificates };

// CLI usage
if (require.main === module) {
  const certDir = process.argv[2] || 'config/ssl';
  const commonName = process.argv[3] || 'localhost';
  const validDays = parseInt(process.argv[4]) || 365;
  
  try {
    generateCertificates(certDir, commonName, validDays);
  } catch (error) {
    console.error('❌ Failed to generate certificates:', error.message);
    process.exit(1);
  }
}