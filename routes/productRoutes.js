// routes/productRoutes.js - Safe route ordering
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

// CRITICAL: All specific routes MUST come before parameterized routes
// Static routes first
router.get('/featured', productController.getFeaturedProducts);
router.get('/categories', productController.getCategories);
router.get('/filters', productController.getProductFilters);
router.get('/product-filters', productController.getProductFilters);
router.get('/search', productController.searchProducts);
router.get('/allproducts', productController.getAllProducts);

// Specific parameterized routes (these have specific patterns)
router.get('/category/:category', productController.getProductsByCategory);
router.get('/slug/:slug', productController.getProductBySlug);

// Product recommendations - MOVED to use product prefix
router.get('/product/:id/recommendations', productController.getProductRecommendations);

// Admin routes (protected) - these should come before general routes too
router.post('/add', verifyToken, verifyAdmin, productController.addProduct);
router.post('/addproduct', verifyToken, verifyAdmin, productController.addProduct);
router.put('/update', verifyToken, verifyAdmin, productController.updateProduct);
router.post('/updateproduct', verifyToken, verifyAdmin, productController.updateProduct);
router.delete('/remove', verifyToken, verifyAdmin, productController.removeProduct);
router.post('/removeproduct', verifyToken, verifyAdmin, productController.removeProduct);

// LAST: General catch-all routes
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProductById);

// Error handling middleware
router.use((err, req, res, next) => {
    console.error('Product route error:', err);
    res.status(500).json({
        success: false,
        message: 'Product route error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

module.exports = router;