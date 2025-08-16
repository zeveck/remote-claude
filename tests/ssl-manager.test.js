const SSLManager = require('../src/ssl-manager');

describe('SSLManager', () => {
  it('should create an SSLManager instance', () => {
    const config = {
      ssl: {
        keyPath: 'test.key',
        certPath: 'test.crt'
      }
    };
    
    const sslManager = new SSLManager(config);
    expect(sslManager).toBeDefined();
    expect(typeof sslManager.generateCertificates).toBe('function');
  });
});