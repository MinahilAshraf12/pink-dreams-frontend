// routes/orderRoutes.js - Order Routes
const express = require('express');
const router = express.Router();

// Import controllers
const orderController = require('../controllers/orderController');

// Import middleware
const { verifyToken } = require('../middleware/auth');

// Order creation (public for guest users)
router.post('/create', orderController.createOrder);

// Protected order routes
router.get('/', verifyToken, orderController.getUserOrders);
router.get('/stats/summary', verifyToken, orderController.getOrderStats);
router.get('/:orderId', verifyToken, orderController.getOrderById);
router.post('/:orderId/cancel', verifyToken, orderController.cancelOrder);

// Internal order status update
router.post('/:orderId/status', orderController.updateOrderStatus);

module.exports = router;