const os = require('os');

class NetworkUtils {
  /**
   * Get all available network interfaces
   */
  static getNetworkInterfaces() {
    const interfaces = os.networkInterfaces();
    const result = [];
    
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          result.push({
            name,
            address: iface.address,
            netmask: iface.netmask,
            mac: iface.mac
          });
        }
      }
    }
    
    return result;
  }

  /**
   * Get the primary network interface IP
   */
  static getPrimaryNetworkIP() {
    const interfaces = this.getNetworkInterfaces();
    
    // Prefer common network interface names
    const preferredNames = ['Ethernet', 'Wi-Fi', 'WiFi', 'Wireless', 'en0', 'eth0', 'wlan0'];
    
    for (const preferred of preferredNames) {
      const found = interfaces.find(iface => 
        iface.name.toLowerCase().includes(preferred.toLowerCase())
      );
      if (found) return found.address;
    }
    
    // Return first available interface
    return interfaces.length > 0 ? interfaces[0].address : '127.0.0.1';
  }

  /**
   * Check if an IP address is in a local network range
   */
  static isLocalNetworkIP(ip) {
    const localRanges = [
      /^127\./,           // 127.x.x.x (localhost)
      /^192\.168\./,      // 192.168.x.x (private network)
      /^10\./,            // 10.x.x.x (private network)
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16-31.x.x (private network)
      /^::1$/,            // IPv6 localhost
      /^fe80:/            // IPv6 link-local
    ];
    
    return localRanges.some(range => range.test(ip));
  }

  /**
   * Display network information for user
   */
  static displayNetworkInfo() {
    const interfaces = this.getNetworkInterfaces();
    const primary = this.getPrimaryNetworkIP();
    
    console.log('🌐 Available Network Interfaces:');
    interfaces.forEach(iface => {
      const isPrimary = iface.address === primary ? ' (Primary)' : '';
      console.log(`   ${iface.name}: ${iface.address}${isPrimary}`);
    });
    
    return { interfaces, primary };
  }
}

module.exports = NetworkUtils;