const rateLimits = new Map();

/**
 * Custom memory-based rate limiter middleware
 * @param {string} prefix - Unique prefix for the rate limit key
 * @param {number} maxRequests - Maximum allowed requests in window
 * @param {number} windowMs - Timeframe in milliseconds
 */
const rateLimiter = (prefix, maxRequests, windowMs) => {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const email = (req.body.email || '').toLowerCase().trim();
    
    const now = Date.now();
    
    // Check limit for a specific key
    const isAllowed = (key) => {
      if (!key) return true;
      let limitData = rateLimits.get(key);
      
      // If no data or expired window, reset
      if (!limitData || now > limitData.resetTime) {
        rateLimits.set(key, { count: 1, resetTime: now + windowMs });
        return true;
      }
      
      // Increment count
      limitData.count++;
      if (limitData.count > maxRequests) {
        return false;
      }
      return true;
    };

    // 1. IP Limit check
    const ipKey = `${prefix}_ip_${ip}`;
    if (!isAllowed(ipKey)) {
      return res.status(429).json({
        message: 'Too many requests from this device. Please try again later.'
      });
    }

    // 2. Email Limit check (if email is present in body)
    if (email) {
      const emailKey = `${prefix}_email_${email}`;
      if (!isAllowed(emailKey)) {
        return res.status(429).json({
          message: 'Too many requests for this account. Please try again later.'
        });
      }
    }

    next();
  };
};

module.exports = { rateLimiter };
