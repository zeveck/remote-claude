const fs = require('fs');
const path = require('path');

class SSLManager {
  constructor(config) {
    this.keyPath = config.ssl.keyPath;
    this.certPath = config.ssl.certPath;
  }

  /**
   * Check if SSL certificates exist and are valid
   */
  validateCertificates() {
    try {
      if (!fs.existsSync(this.keyPath)) {
        throw new Error(`SSL private key not found: ${this.keyPath}`);
      }
      
      if (!fs.existsSync(this.certPath)) {
        throw new Error(`SSL certificate not found: ${this.certPath}`);
      }

      // Basic validation - check if files are not empty
      const keyStats = fs.statSync(this.keyPath);
      const certStats = fs.statSync(this.certPath);
      
      if (keyStats.size === 0) {
        throw new Error('SSL private key file is empty');
      }
      
      if (certStats.size === 0) {
        throw new Error('SSL certificate file is empty');
      }

      // Check if certificate contains proper PEM headers
      const certContent = fs.readFileSync(this.certPath, 'utf8');
      if (!certContent.includes('-----BEGIN CERTIFICATE-----')) {
        throw new Error('SSL certificate file does not appear to be in PEM format');
      }

      const keyContent = fs.readFileSync(this.keyPath, 'utf8');
      if (!keyContent.includes('-----BEGIN PRIVATE KEY-----') && !keyContent.includes('-----BEGIN RSA PRIVATE KEY-----')) {
        throw new Error('SSL private key file does not appear to be in PEM format');
      }

      return true;
    } catch (error) {
      throw new Error(`SSL certificate validation failed: ${error.message}`);
    }
  }

  /**
   * Load SSL certificates for HTTPS server
   */
  loadCertificates() {
    try {
      this.validateCertificates();
      
      return {
        key: fs.readFileSync(this.keyPath, 'utf8'),
        cert: fs.readFileSync(this.certPath, 'utf8')
      };
    } catch (error) {
      throw new Error(`Failed to load SSL certificates: ${error.message}`);
    }
  }

  /**
   * Generate SSL certificates using Node.js crypto or OpenSSL
   */
  generateCertificates(commonName = 'localhost', validDays = 365) {
    try {
      console.log('Generating SSL certificates...');
      
      const { saveCertificates } = require('./cert-generator');
      const sslDir = path.dirname(this.certPath);
      
      // Generate certificates
      saveCertificates(sslDir, commonName, validDays);
      
      // Validate the generated certificates
      this.validateCertificates();
      
      console.log('SSL certificates generated and validated successfully');
      return true;
      
    } catch (error) {
      throw new Error(`Failed to generate SSL certificates: ${error.message}`);
    }
  }

  /**
   * Check if certificates need to be regenerated
   */
  needsRegeneration() {
    try {
      this.validateCertificates();
      
      // Check certificate expiration (basic check)
      const certContent = fs.readFileSync(this.certPath, 'utf8');
      
      // For a more thorough check, we could parse the certificate
      // For now, just check if files exist and are valid
      return false;
      
    } catch (error) {
      // If validation fails, we need to regenerate
      return true;
    }
  }
}

module.exports = SSLManager;