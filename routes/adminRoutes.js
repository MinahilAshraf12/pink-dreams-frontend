// routes/adminRoutes.js - Admin Routes
const express = require('express');
const router = express.Router();

// Import controllers
const adminController = require('../controllers/adminController');

// Import middleware
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// Protect all admin routes
router.use(verifyToken, verifyAdmin);

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);

// Order management
router.get('/orders', adminController.getAllOrders);
router.get('/orders/stats', adminController.getOrderStats);
router.get('/orders/report', adminController.getOrdersReport);
router.patch('/orders/bulk-status', adminController.bulkUpdateOrderStatus);
router.get('/orders/:orderId', adminController.getOrderById);
router.patch('/orders/:orderId/status', adminController.updateOrderStatus);
router.delete('/orders/:orderId', adminController.deleteOrder);

module.exports = router;