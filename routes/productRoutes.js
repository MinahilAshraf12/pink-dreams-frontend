// routes/productRoutes.js - Fixed Product Routes
const express = require('express');
const router = express.Router();

// Import controllers
const productController = require('../controllers/productController');

// Import middleware
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// Public routes - ORDER MATTERS (specific routes before parameterized ones)
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Product routes working',
        endpoints: [
            'GET /',
            'GET /featured', 
            'GET /categories',
            'GET /filters',
            'GET /search',
            'GET /category/:category',
            'GET /:id'
        ]
    });
});

// Specific routes BEFORE parameterized routes
router.get('/featured', productController.getFeaturedProducts);
router.get('/categories', productController.getCategories);
router.get('/filters', productController.getProductFilters);
router.get('/product-filters', productController.getProductFilters); // Alternative endpoint
router.get('/search', productController.searchProducts);

// Category routes
router.get('/category/:category', productController.getProductsByCategory);

// Product-specific routes (before general :id route)
router.get('/:id/recommendations', productController.getProductRecommendations);
router.get('/slug/:slug', productController.getProductBySlug);

// General routes
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProductById);

// Legacy routes for backward compatibility
router.get('/allproducts', productController.getAllProducts);

// Admin routes (protected)
router.post('/add', verifyToken, verifyAdmin, productController.addProduct);
router.post('/addproduct', verifyToken, verifyAdmin, productController.addProduct);
router.put('/update', verifyToken, verifyAdmin, productController.updateProduct);
router.post('/updateproduct', verifyToken, verifyAdmin, productController.updateProduct);
router.delete('/remove', verifyToken, verifyAdmin, productController.removeProduct);
router.post('/removeproduct', verifyToken, verifyAdmin, productController.removeProduct);

module.exports = router;