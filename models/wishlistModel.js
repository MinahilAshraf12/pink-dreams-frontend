const mongoose = require('mongoose');

const Wishlist = mongoose.model("Wishlist", {
    userId: {
        type: String,
        required: true,
    },
    items: [{
        productId: {
            type: Number,
            required: true,
        },
        addedAt: {
            type: Date,
            default: Date.now
        },
        // Optional: Store product info at time of adding to wishlist
        productSnapshot: {
            name: String,
            price: Number,
            image: String,
            category: String
        }
    }],
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Get user's wishlist
app.get('/wishlist/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Fetching wishlist for user:', userId);
        
        let wishlist = await Wishlist.findOne({ userId });
        
        if (!wishlist) {
            // Create empty wishlist if none exists
            wishlist = new Wishlist({ userId, items: [] });
            await wishlist.save();
            console.log('Created new wishlist for user:', userId);
        }
        
        // Get full product details for wishlist items
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
                // Remove unavailable products from wishlist
                wishlist.items = wishlist.items.filter(wishlistItem => wishlistItem.productId !== item.productId);
            }
        }
        
        // Save wishlist if items were removed
        if (wishlistItemsWithDetails.length !== wishlist.items.length) {
            wishlist.updatedAt = new Date();
            await wishlist.save();
        }
        
        console.log(`Wishlist loaded: ${wishlistItemsWithDetails.length} items`);
        
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
app.post('/wishlist/add', async (req, res) => {
    try {
        const { userId, productId } = req.body;
        console.log('Adding to wishlist:', { userId, productId });
        
        if (!userId || !productId) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Product ID are required'
            });
        }
        
        // Get product details
        const product = await Product.findOne({ id: productId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        if (!product.available) {
            return res.status(400).json({
                success: false,
                message: 'Product is not available'
            });
        }
        
        // Find or create wishlist
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, items: [] });
        }
        
        // Check if item already exists in wishlist
        const existingItemIndex = wishlist.items.findIndex(item => item.productId === productId);
        
        if (existingItemIndex > -1) {
            return res.status(400).json({
                success: false,
                message: 'Item is already in your wishlist',
                alreadyExists: true
            });
        }
        
        // Add new item with product snapshot
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
        
        console.log(`Added product ${productId} to wishlist for user ${userId}`);
        
        res.json({
            success: true,
            message: 'Item added to wishlist successfully',
            totalItems: wishlist.items.length
        });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to add item to wishlist'
        });
    }
});

// Remove item from wishlist
app.delete('/wishlist/remove', async (req, res) => {
    try {
        const { userId, productId } = req.body;
        console.log('Removing from wishlist:', { userId, productId });
        
        if (!userId || !productId) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Product ID are required'
            });
        }
        
        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }
        
        const initialLength = wishlist.items.length;
        wishlist.items = wishlist.items.filter(item => item.productId !== productId);
        
        if (wishlist.items.length === initialLength) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in wishlist'
            });
        }
        
        wishlist.updatedAt = new Date();
        await wishlist.save();
        
        console.log(`Removed product ${productId} from wishlist for user ${userId}`);
        
        res.json({
            success: true,
            message: 'Item removed from wishlist successfully',
            totalItems: wishlist.items.length
        });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to remove item from wishlist'
        });
    }
});

// Clear entire wishlist
app.delete('/wishlist/clear/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Clearing wishlist for user:', userId);
        
        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }
        
        wishlist.items = [];
        wishlist.updatedAt = new Date();
        await wishlist.save();
        
        console.log(`Cleared wishlist for user ${userId}`);
        
        res.json({
            success: true,
            message: 'Wishlist cleared successfully'
        });
    } catch (error) {
        console.error('Error clearing wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to clear wishlist'
        });
    }
});

// Check if item is in wishlist
app.get('/wishlist/check/:userId/:productId', async (req, res) => {
    try {
        const { userId, productId } = req.params;
        
        const wishlist = await Wishlist.findOne({ userId });
        
        if (!wishlist) {
            return res.json({
                success: true,
                isInWishlist: false
            });
        }
        
        const isInWishlist = wishlist.items.some(item => item.productId === parseInt(productId));
        
        res.json({
            success: true,
            isInWishlist: isInWishlist
        });
    } catch (error) {
        console.error('Error checking wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            isInWishlist: false
        });
    }
});

// Get wishlist summary (for header badge)
app.get('/wishlist/summary/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const wishlist = await Wishlist.findOne({ userId });
        
        if (!wishlist) {
            return res.json({
                success: true,
                totalItems: 0
            });
        }
        
        res.json({
            success: true,
            totalItems: wishlist.items.length
        });
    } catch (error) {
        console.error('Error getting wishlist summary:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            totalItems: 0
        });
    }
});

// Sync wishlist from localStorage to backend (for when user logs in)
app.post('/wishlist/sync', async (req, res) => {
    try {
        const { userId, localWishlistItems } = req.body;
        console.log('Syncing wishlist for user:', userId, 'Items:', localWishlistItems?.length || 0);
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }
        
        // Find or create wishlist
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, items: [] });
        }
        
        // Merge local wishlist items with server wishlist
        if (localWishlistItems && localWishlistItems.length > 0) {
            for (const localItemId of localWishlistItems) {
                const existingItemIndex = wishlist.items.findIndex(item => item.productId === localItemId);
                
                if (existingItemIndex === -1) {
                    // Get product details for snapshot
                    const product = await Product.findOne({ id: localItemId });
                    if (product && product.available) {
                        wishlist.items.push({
                            productId: localItemId,
                            addedAt: new Date(),
                            productSnapshot: {
                                name: product.name,
                                price: product.new_price,
                                image: product.image,
                                category: product.category
                            }
                        });
                    }
                }
            }
        }
        
        wishlist.updatedAt = new Date();
        await wishlist.save();
        
        console.log(`Synced wishlist for user ${userId}, total items: ${wishlist.items.length}`);
        
        res.json({
            success: true,
            message: 'Wishlist synced successfully',
            totalItems: wishlist.items.length
        });
    } catch (error) {
        console.error('Error syncing wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to sync wishlist'
        });
    }
});

// Move items from wishlist to cart
app.post('/wishlist/move-to-cart', async (req, res) => {
    try {
        const { userId, productIds, quantity = 1 } = req.body;
        
        if (!userId || !productIds || !Array.isArray(productIds)) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Product IDs array are required'
            });
        }
        
        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }
        
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }
        
        const movedItems = [];
        const failedItems = [];
        
        for (const productId of productIds) {
            const product = await Product.findOne({ id: productId });
            
            if (!product || !product.available) {
                failedItems.push({ productId, reason: 'Product not available' });
                continue;
            }
            
            // Check stock
            if (product.stock_quantity !== undefined && product.stock_quantity < quantity) {
                failedItems.push({ productId, reason: 'Not enough stock' });
                continue;
            }
            
            // Add to cart
            const existingCartItemIndex = cart.items.findIndex(item => item.productId === productId);
            
            if (existingCartItemIndex > -1) {
                cart.items[existingCartItemIndex].quantity += quantity;
            } else {
                cart.items.push({
                    productId: productId,
                    quantity: quantity,
                    price: product.new_price,
                    addedAt: new Date()
                });
            }
            
            // Remove from wishlist
            wishlist.items = wishlist.items.filter(item => item.productId !== productId);
            movedItems.push(productId);
        }
        
        // Save both cart and wishlist
        cart.updatedAt = new Date();
        wishlist.updatedAt = new Date();
        
        await Promise.all([cart.save(), wishlist.save()]);
        
        res.json({
            success: true,
            message: `Successfully moved ${movedItems.length} items to cart`,
            movedItems: movedItems,
            failedItems: failedItems,
            cartTotalItems: cart.items.length,
            wishlistTotalItems: wishlist.items.length
        });
        
    } catch (error) {
        console.error('Error moving items to cart:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to move items to cart'
        });
    }
});

// Get wishlist analytics for admin
app.get('/admin/wishlist/analytics', async (req, res) => {
    try {
        const totalWishlists = await Wishlist.countDocuments();
        const activeWishlists = await Wishlist.countDocuments({ 'items.0': { $exists: true } });
        
        // Most wishlisted products
        const mostWishlisted = await Wishlist.aggregate([
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        
        // Get product details for most wishlisted
        const productIds = mostWishlisted.map(item => item._id);
        const products = await Product.find({ id: { $in: productIds } });
        
        const wishlistAnalytics = mostWishlisted.map(item => {
            const product = products.find(p => p.id === item._id);
            return {
                productId: item._id,
                productName: product?.name || 'Unknown',
                category: product?.category || 'Unknown',
                wishlistCount: item.count,
                currentPrice: product?.new_price || 0,
                image: product?.image || ''
            };
        });
        
        // Average items per wishlist
        const avgItemsResult = await Wishlist.aggregate([
            { $project: { itemCount: { $size: '$items' } } },
            { $group: { _id: null, avgItems: { $avg: '$itemCount' } } }
        ]);
        
        const avgItemsPerWishlist = avgItemsResult[0]?.avgItems || 0;
        
        res.json({
            success: true,
            analytics: {
                totalWishlists,
                activeWishlists,
                emptyWishlists: totalWishlists - activeWishlists,
                avgItemsPerWishlist: Math.round(avgItemsPerWishlist * 100) / 100,
                mostWishlisted: wishlistAnalytics
            }
        });
    } catch (error) {
        console.error('Error fetching wishlist analytics:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Add these to your index.js file after your existing schemas and before app.listen()

// Install required packages first:
// npm install nodemailer
// npm install dotenv (if not already installed)

const nodemailer = require('nodemailer');
require('dotenv').config();

// Contact Form Schema