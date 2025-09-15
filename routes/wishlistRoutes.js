// routes/wishlistRoutes.js - Wishlist Routes
const express = require('express');
const router = express.Router();
const { Wishlist } = require('../models');
const Product = require('../models/Product');
const { Cart } = require('../models');

// Get user's wishlist
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Fetching wishlist for user:', userId);
        
        let wishlist = await Wishlist.findOne({ userId });
        
        if (!wishlist) {
            wishlist = new Wishlist({ userId, items: [] });
            await wishlist.save();
        }
        
        const wishlistItemsWithDetails = [];
        
        for (const item of wishlist.items) {
            const product = await Product.findOne({ id: item.productId });
            if (product && product.available) {
                wishlistItemsWithDetails.push({
                    id: product.id,
                    name: product.name,
                    new_price: product.new_price,
                    old_price: product.old_price,
                    image: product.image,
                    category: product.category,
                    brand: product.brand,
                    available: product.available,
                    stock_quantity: product.stock_quantity,
                    featured: product.featured,
                    slug: product.slug,
                    addedAt: item.addedAt,
                    hasDiscount: product.old_price > product.new_price,
                    discountPercentage: product.old_price > product.new_price 
                        ? Math.round(((product.old_price - product.new_price) / product.old_price) * 100)
                        : 0
                });
            } else {
                wishlist.items = wishlist.items.filter(wishlistItem => wishlistItem.productId !== item.productId);
            }
        }
        
        if (wishlistItemsWithDetails.length !== wishlist.items.length) {
            wishlist.updatedAt = new Date();
            await wishlist.save();
        }
        
        res.json({
            success: true,
            wishlist: wishlistItemsWithDetails,
            totalItems: wishlistItemsWithDetails.length
        });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            wishlist: [],
            totalItems: 0
        });
    }
});

// Add item to wishlist
router.post('/add', async (req, res) => {
    try {
        const { userId, productId } = req.body;
        
        if (!userId || !productId) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Product ID are required'
            });
        }
        
        const product = await Product.findOne({ id: productId });
        if (!product || !product.available) {
            return res.status(404).json({
                success: false,
                message: 'Product not available'
            });
        }
        
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, items: [] });
        }
        
        const existingItemIndex = wishlist.items.findIndex(item => item.productId === productId);
        
        if (existingItemIndex > -1) {
            return res.status(400).json({
                success: false,
                message: 'Item is already in your wishlist',
                alreadyExists: true
            });
        }
        
        wishlist.items.push({
            productId: productId,
            addedAt: new Date(),
            productSnapshot: {
                name: product.name,
                price: product.new_price,
                image: product.image,
                category: product.category
            }
        });
        
        wishlist.updatedAt = new Date();
        await wishlist.save();
        
        res.json({
            success: true,
            message: 'Item added to wishlist successfully',
            totalItems: wishlist.items.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to add item to wishlist'
        });
    }
});

// Remove from wishlist
router.delete('/remove', async (req, res) => {
    try {
        const { userId, productId } = req.body;
        
        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }
        
        wishlist.items = wishlist.items.filter(item => item.productId !== productId);
        wishlist.updatedAt = new Date();
        await wishlist.save();
        
        res.json({
            success: true,
            message: 'Item removed from wishlist successfully',
            totalItems: wishlist.items.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Clear wishlist
router.delete('/clear/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const wishlist = await Wishlist.findOne({ userId });
        if (wishlist) {
            wishlist.items = [];
            wishlist.updatedAt = new Date();
            await wishlist.save();
        }
        
        res.json({
            success: true,
            message: 'Wishlist cleared successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get wishlist summary
router.get('/summary/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const wishlist = await Wishlist.findOne({ userId });
        
        res.json({
            success: true,
            totalItems: wishlist ? wishlist.items.length : 0
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            totalItems: 0
        });
    }
});

module.exports = router;
