// routes/productRoutes.js - Product Routes
const express = require('express');
const router = express.Router();

// Import controllers
const productController = require('../controllers/productController');

// Import middleware
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');

// Public routes
router.get('/', productController.getAllProducts);
router.get('/allproducts', productController.getAllProducts); // Legacy route
router.get('/featured', productController.getFeaturedProducts);
router.get('/categories', productController.getCategories);
router.get('/filters', productController.getProductFilters);
router.get('/search', productController.searchProducts);
router.get('/category/:category', productController.getProductsByCategory);
router.get('/:id/recommendations', productController.getProductRecommendations);
router.get('/slug/:slug', productController.getProductBySlug);
router.get('/:id', productController.getProductById);

// Admin routes (protected)
router.post('/add', verifyToken, verifyAdmin, productController.addProduct);
router.post('/addproduct', verifyToken, verifyAdmin, productController.addProduct); // Legacy route
router.put('/update', verifyToken, verifyAdmin, productController.updateProduct);
router.post('/updateproduct', verifyToken, verifyAdmin, productController.updateProduct); // Legacy route
router.delete('/remove', verifyToken, verifyAdmin, productController.removeProduct);
router.post('/removeproduct', verifyToken, verifyAdmin, productController.removeProduct); // Legacy route

module.exports = router;