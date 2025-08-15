const fs = require('fs');
const path = require('path');
const forge = require('node-forge');

function generateSelfSignedCert(commonName = 'localhost', validDays = 365) {
  console.log('🔐 Generating self-signed SSL certificate...');

  // Generate RSA key pair
  const keys = forge.pki.rsa.generateKeyPair(2048);
  
  // Create certificate
  const cert = forge.pki.createCertificate();
  
  // Set certificate fields
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + Math.floor(validDays / 365));
  
  // Set subject and issuer (same for self-signed)
  const attrs = [{
    name: 'commonName',
    value: commonName
  }, {
    name: 'countryName',
    value: 'US'
  }, {
    shortName: 'ST',
    value: 'Local'
  }, {
    name: 'localityName',
    value: 'Local'
  }, {
    name: 'organizationName',
    value: 'Remote Claude Web'
  }, {
    shortName: 'OU',
    value: 'Development'
  }];
  
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  
  // Add extensions
  cert.setExtensions([{
    name: 'basicConstraints',
    cA: true
  }, {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  }, {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true,
    codeSigning: true,
    emailProtection: true,
    timeStamping: true
  }, {
    name: 'nsCertType',
    client: true,
    server: true,
    email: true,
    objsign: true,
    sslCA: true,
    emailCA: true,
    objCA: true
  }, {
    name: 'subjectAltName',
    altNames: [{
      type: 2, // DNS
      value: commonName
    }, {
      type: 2, // DNS
      value: 'localhost'
    }, {
      type: 7, // IP
      ip: '127.0.0.1'
    }]
  }]);
  
  // Self-sign certificate
  cert.sign(keys.privateKey);
  
  // Convert to PEM format
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  
  return {
    cert: certPem,
    key: keyPem
  };
}

function saveCertificates(certDir, commonName = 'localhost', validDays = 365) {
  // Ensure directory exists
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.crt');

  try {
    // Generate certificates
    const { cert, key } = generateSelfSignedCert(commonName, validDays);
    
    // Write files
    fs.writeFileSync(keyPath, key);
    fs.writeFileSync(certPath, cert);
    
    console.log('✅ SSL certificates generated successfully!');
    console.log(`📄 Certificate: ${certPath}`);
    console.log(`🔑 Private Key: ${keyPath}`);
    
    return { keyPath, certPath };
    
  } catch (error) {
    throw new Error(`Failed to generate certificates: ${error.message}`);
  }
}

module.exports = { generateSelfSignedCert, saveCertificates };

// CLI usage
if (require.main === module) {
  const certDir = process.argv[2] || 'config/ssl';
  const commonName = process.argv[3] || 'localhost';
  const validDays = parseInt(process.argv[4]) || 365;
  
  try {
    saveCertificates(certDir, commonName, validDays);
  } catch (error) {
    console.error('❌ Failed to generate certificates:', error.message);
    process.exit(1);
  }
}