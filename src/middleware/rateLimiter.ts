import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * Rate limiting middleware
 * Prevents abuse by limiting requests per IP/API key
 */
const rateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req: Request) => {
    // Different limits for different endpoints
    if (req.path.includes('/notifications/send')) {
      return 100; // 100 notifications per 15 minutes
    }
    if (req.path.includes('/subscriptions')) {
      return 50; // 50 subscription operations per 15 minutes
    }
    return 200; // General API calls
  },
  message: (req: Request) => ({
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: Math.ceil((req as any).rateLimit.resetTime / 1000)
  }),
  standardHeaders: true, 
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const apiKey = authHeader.substring(7);
      return `api:${apiKey}`;
    }
    return req.ip || 'unknown';
  },
  skip: (req: Request) => req.path === '/health' || req.path === '/health/ready'
});

/**
 * Strict rate limiter for sensitive endpoints
 */
const strictRateLimitMiddleware = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Very limited for sensitive operations
  message: {
    error: 'Too Many Requests',
    message: 'Strict rate limit exceeded for sensitive operation.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export {
  rateLimitMiddleware,
  strictRateLimitMiddleware
};
