// routes/cartRoutes.js - Cart Routes
const express = require('express');
const router = express.Router();

// Import controllers
const cartController = require('../controllers/cartController');

// Import middleware
const { verifyToken } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');

// Cart routes (both public for guest users and protected for logged-in users)
router.get('/:userId', cartController.getCart);
router.post('/add', cartController.addToCart);
router.put('/update', cartController.updateCartItem);
router.delete('/remove', cartController.removeFromCart);
router.delete('/clear/:userId', cartController.clearCart);
router.post('/sync', cartController.syncCart);
router.get('/summary/:userId', cartController.getCartSummary);

// Protected cart summary route with authentication
router.get('/auth/summary/:userId', verifyToken, cartController.getCartSummary);

module.exports = router;