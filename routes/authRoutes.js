// routes/authRoutes.js - Authentication Routes
const express = require('express');
const passport = require('passport');
const router = express.Router();

// Import controllers
const authController = require('../controllers/authController');

// Import middleware
const { verifyToken } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');

// Authentication routes
router.post('/register', 
    rateLimiter.registrationLimiter, 
    authController.register
);

router.post('/login', 
    rateLimiter.loginLimiter,
    rateLimiter.loginSlowDown,
    authController.login
);

router.post('/forgot-password', 
    rateLimiter.passwordResetLimiter,
    authController.forgotPassword
);

router.get('/verify-reset-token/:token', authController.verifyResetToken);
router.post('/reset-password', authController.resetPassword);

// Protected routes
router.get('/profile', verifyToken, authController.getProfile);
router.put('/profile', verifyToken, authController.updateProfile);
router.post('/change-password', verifyToken, authController.changePassword);
router.post('/logout', verifyToken, authController.logout);

// Utility routes
router.post('/check-email', authController.checkEmail);

// OAuth routes
router.get('/google',
    passport.authenticate('google', { 
        scope: ['profile', 'email'] 
    })
);

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed' }),
    authController.oauthCallback
);

router.get('/facebook',
    passport.authenticate('facebook', { 
        scope: ['email'] 
    })
);

router.get('/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/login?error=facebook_auth_failed' }),
    authController.oauthCallback
);

// OAuth management routes
router.post('/oauth/logout', authController.oauthLogout);
router.get('/oauth/status', verifyToken, authController.getOAuthStatus);
router.delete('/oauth/unlink/:provider', verifyToken, authController.unlinkOAuth);

// Rate limit status (for testing)
router.get('/rate-limit-status', (req, res) => {
    res.json({
        success: true,
        message: 'Rate limiting is active',
        ip: req.ip,
        rateLimits: {
            login: '5 attempts per 15 minutes',
            registration: '3 attempts per hour', 
            passwordReset: '3 attempts per hour'
        }
    });
});

module.exports = router;