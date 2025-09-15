// routes/productRoutes.js - Fixed to prevent path-to-regexp errors
const express = require('express');
const router = express.Router();

// Import controllers
const productController = require('../controllers/productController');

// Import middleware
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// Test route
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Product routes working',
        timestamp: new Date().toISOString()
    });
});

// Specific routes MUST come before parameterized routes
router.get('/featured', productController.getFeaturedProducts);
router.get('/categories', productController.getCategories);
router.get('/filters', productController.getProductFilters);
router.get('/search', productController.searchProducts);

// Category routes with specific pattern
router.get('/category/:category([a-zA-Z0-9-_%]+)', productController.getProductsByCategory);

// Product-specific routes (BEFORE general :id route)
router.get('/:id([0-9a-fA-F]{24})/recommendations', productController.getProductRecommendations);
router.get('/slug/:slug([a-zA-Z0-9-_]+)', productController.getProductBySlug);

// General routes with parameter validation
router.get('/', productController.getAllProducts);
router.get('/:id([0-9a-fA-F]{24})', productController.getProductById);

// Legacy compatibility routes
router.get('/allproducts', productController.getAllProducts);
router.get('/product-filters', productController.getProductFilters);

// Admin routes (protected)
router.post('/add', verifyToken, verifyAdmin, productController.addProduct);
router.post('/addproduct', verifyToken, verifyAdmin, productController.addProduct);
router.put('/update', verifyToken, verifyAdmin, productController.updateProduct);
router.post('/updateproduct', verifyToken, verifyAdmin, productController.updateProduct);
router.delete('/remove', verifyToken, verifyAdmin, productController.removeProduct);
router.post('/removeproduct', verifyToken, verifyAdmin, productController.removeProduct);

// Error handling middleware for this router
router.use((err, req, res, next) => {
    console.error('Product route error:', err);
    res.status(500).json({
        success: false,
        message: 'Product route error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

module.exports = router;