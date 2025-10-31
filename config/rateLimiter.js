const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 minutes
    message: {
        success: false,
        error: 'Too many login attempts. Please try again in 15 minutes.',
        retryAfter: 15 * 60,
        type: 'login_rate_limit'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
    handler: (req, res) => {
        console.log(`🚨 Login rate limit exceeded for IP: ${req.ip}, Email: ${req.body?.email}`);
        res.status(429).json({
            success: false,
            error: 'Too many login attempts. Please try again in 15 minutes.',
            retryAfter: 15 * 60,
            type: 'login_rate_limit'
        });
    }
});

// Progressive slowdown for login attempts
const loginSlowDown = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 2, // Allow 2 requests without delay
    delayMs: (hits) => hits * 500, // 500ms delay per request after 2nd
    maxDelayMs: 20000, // Max 20 second delay
    skipSuccessfulRequests: true
});

// General auth rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 auth attempts per 15 minutes
    message: {
        success: false,
        error: 'Too many authentication attempts. Please try again later.',
        retryAfter: 15 * 60
    }
});

// Registration rate limiting
const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registration attempts per hour
    message: {
        success: false,
        error: 'Too many registration attempts. Please try again in 1 hour.',
        retryAfter: 60 * 60
    }
});

// Password reset rate limiting
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password reset attempts per hour
    message: {
        success: false,
        error: 'Too many password reset attempts. Please try again in 1 hour.',
        retryAfter: 60 * 60
    }
});

// General API rate limiting (optional - apply to all routes)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes per IP
    message: {
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: 15 * 60
    },
    skip: (req) => {
        // Skip rate limiting for static files
        return req.path.startsWith('/images') || req.path.startsWith('/upload');
    }
});

module.exports = {
    loginLimiter,
    loginSlowDown,
    authLimiter,
    registrationLimiter,
    passwordResetLimiter,
    generalLimiter
};