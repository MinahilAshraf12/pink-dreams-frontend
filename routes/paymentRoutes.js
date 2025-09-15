// routes/paymentRoutes.js - Payment Routes
const express = require('express');
const router = express.Router();

// Import controllers
const paymentController = require('../controllers/paymentController');

// Stripe payment routes
router.post('/create-payment-intent', paymentController.createPaymentIntent);
router.post('/confirm', paymentController.confirmPayment);

// PayPal payment routes
router.post('/paypal/create-order', paymentController.createPayPalOrder);
router.post('/paypal/capture-order', paymentController.capturePayPalOrder);
router.get('/paypal/test', paymentController.testPayPal);

// Test routes
router.post('/test/email', paymentController.testEmail);

module.exports = router;