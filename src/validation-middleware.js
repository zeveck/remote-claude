const { logger } = require('./logger');

class ValidationMiddleware {
  /**
   * Validate request body contains required fields
   */
  static requireFields(fields) {
    return (req, res, next) => {
      const missing = fields.filter(field => !req.body[field]);
      
      if (missing.length > 0) {
        logger.warn('Validation failed: missing required fields', { 
          missing, 
          ip: req.ip 
        });
        
        return res.status(400).json({
          success: false,
          error: `Missing required fields: ${missing.join(', ')}`
        });
      }
      
      next();
    };
  }

  /**
   * Sanitize string inputs
   */
  static sanitizeStrings(fields) {
    return (req, res, next) => {
      for (const field of fields) {
        if (req.body[field] && typeof req.body[field] === 'string') {
          // Basic sanitization
          req.body[field] = req.body[field]
            .trim()
            .replace(/[<>]/g, '') // Remove potential HTML
            .substring(0, 1000); // Limit length
        }
      }
      next();
    };
  }

  /**
   * Validate file paths
   */
  static validatePath(pathField) {
    return (req, res, next) => {
      const pathValue = req.body[pathField] || req.query[pathField];
      
      if (!pathValue) {
        return next();
      }

      // Check for path traversal attempts
      if (pathValue.includes('..') || pathValue.includes('~')) {
        logger.warn('Path traversal attempt detected', { 
          path: pathValue, 
          ip: req.ip 
        });
        
        return res.status(400).json({
          success: false,
          error: 'Invalid path: path traversal not allowed'
        });
      }

      // Check for null bytes
      if (pathValue.includes('\0')) {
        logger.warn('Null byte injection attempt detected', { 
          path: pathValue, 
          ip: req.ip 
        });
        
        return res.status(400).json({
          success: false,
          error: 'Invalid path: null bytes not allowed'
        });
      }

      next();
    };
  }

  /**
   * Rate limiting per IP
   */
  static rateLimit(maxRequests = 100, windowMs = 60000) {
    const requests = new Map();

    return (req, res, next) => {
      const ip = req.ip;
      const now = Date.now();
      
      if (!requests.has(ip)) {
        requests.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
      }

      const ipData = requests.get(ip);
      
      if (now > ipData.resetTime) {
        ipData.count = 1;
        ipData.resetTime = now + windowMs;
        return next();
      }

      if (ipData.count >= maxRequests) {
        logger.warn('Rate limit exceeded', { ip, count: ipData.count });
        
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.'
        });
      }

      ipData.count++;
      next();
    };
  }
}

module.exports = ValidationMiddleware;