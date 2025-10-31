const express = require('express');
const router = express.Router();

// Import all route modules
const productRoutes = require('./productRoutes');
const userRoutes = require('./userRoutes');
const adminRoutes = require('./adminRoutes');
const orderRoutes = require('./orderRoutes');
const cartRoutes = require('./cartRoutes');
const wishlistRoutes = require('./wishlistRoutes');
const promoCodeRoutes = require('./promoCodeRoutes');
const categoryRoutes = require('./categoryRoutes');
const contactRoutes = require('./contactRoutes');
const newsletterRoutes = require('./newsletterRoutes');
const checkoutRoutes = require('./checkoutRoutes');
const authRoutes = require('./authRoutes');

// Use routes
router.use('/products', productRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/orders', orderRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/promo-codes', promoCodeRoutes);
router.use('/categories', categoryRoutes);
router.use('/contact', contactRoutes);
router.use('/newsletter', newsletterRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/auth', authRoutes);

module.exports = router;