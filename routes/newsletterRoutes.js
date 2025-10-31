const express = require('express');
const router = express.Router();
const Newsletter = require('../models/newsletterModel');

router.post('/newsletter/subscribe', async (req, res) => {
    try {
        const { email, name = '', source = 'website' } = req.body;

        // Validation
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        // Check if already subscribed
        const existingSubscriber = await Newsletter.findOne({ email: email.toLowerCase() });
        
        if (existingSubscriber) {
            if (existingSubscriber.status === 'active') {
                return res.json({
                    success: true,
                    message: 'You are already subscribed to our newsletter!',
                    alreadySubscribed: true
                });
            } else if (existingSubscriber.status === 'unsubscribed') {
                // Resubscribe
                existingSubscriber.status = 'active';
                existingSubscriber.subscribedAt = new Date();
                existingSubscriber.unsubscribedAt = undefined;
                if (name) existingSubscriber.name = name;
                await existingSubscriber.save();

                return res.json({
                    success: true,
                    message: 'Welcome back! You have been resubscribed to our newsletter.',
                    resubscribed: true
                });
            }
        }

        // Generate verification token
        const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        // Create new subscriber
        const subscriber = new Newsletter({
            email: email.toLowerCase(),
            name: name,
            status: 'active', // For now, we'll set as active immediately
            subscriptionSource: source,
            ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
            userAgent: req.headers['user-agent'] || '',
            verificationToken: verificationToken,
            emailVerified: false // In production, send verification email
        });

        await subscriber.save();

        // In production, you would send a welcome email here
        // console.log('New newsletter subscriber:', email);

        res.json({
            success: true,
            message: 'Thank you for subscribing! Welcome to Pink Dreams newsletter.',
            subscriber: {
                email: subscriber.email,
                name: subscriber.name,
                subscribedAt: subscriber.subscribedAt
            }
        });

    } catch (error) {
        console.error('Newsletter subscription error:', error);
        
        if (error.code === 11000) {
            // Duplicate email error
            return res.status(400).json({
                success: false,
                message: 'This email is already subscribed to our newsletter'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Sorry, there was an error processing your subscription. Please try again.'
        });
    }
});

// Newsletter unsubscribe endpoint
router.post('/newsletter/unsubscribe', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const subscriber = await Newsletter.findOne({ email: email.toLowerCase() });
        
        if (!subscriber) {
            return res.status(404).json({
                success: false,
                message: 'Email not found in our newsletter list'
            });
        }

        if (subscriber.status === 'unsubscribed') {
            return res.json({
                success: true,
                message: 'You are already unsubscribed from our newsletter'
            });
        }

        // Update subscription status
        subscriber.status = 'unsubscribed';
        subscriber.unsubscribedAt = new Date();
        await subscriber.save();

        res.json({
            success: true,
            message: 'You have been successfully unsubscribed from our newsletter'
        });

    } catch (error) {
        console.error('Newsletter unsubscribe error:', error);
        res.status(500).json({
            success: false,
            message: 'Sorry, there was an error processing your request. Please try again.'
        });
    }
});

// Get newsletter statistics (admin endpoint)
router.get('/newsletter/stats', async (req, res) => {
    try {
        const totalSubscribers = await Newsletter.countDocuments();
        const activeSubscribers = await Newsletter.countDocuments({ status: 'active' });
        const unsubscribedCount = await Newsletter.countDocuments({ status: 'unsubscribed' });
        const pendingCount = await Newsletter.countDocuments({ status: 'pending' });

        // Monthly subscription growth
        const monthlyGrowth = await Newsletter.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: '$subscribedAt' },
                        month: { $month: '$subscribedAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 12 }
        ]);

        // Subscription sources
        const sourceStats = await Newsletter.aggregate([
            { $group: { _id: '$subscriptionSource', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.json({
            success: true,
            stats: {
                totalSubscribers,
                activeSubscribers,
                unsubscribedCount,
                pendingCount,
                monthlyGrowth,
                sourceStats
            }
        });

    } catch (error) {
        console.error('Newsletter stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching newsletter statistics'
        });
    }
});

// Get all subscribers (admin endpoint)
router.get('/newsletter/subscribers', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        const status = req.query.status || 'all';

        let query = {};
        if (status !== 'all') {
            query.status = status;
        }

        const totalCount = await Newsletter.countDocuments(query);
        const subscribers = await Newsletter.find(query)
            .sort({ subscribedAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-verificationToken'); // Don't expose verification tokens

        res.json({
            success: true,
            subscribers: subscribers,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalCount: totalCount
            }
        });

    } catch (error) {
        console.error('Newsletter subscribers error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching subscribers'
        });
    }
});

// Newsletter preferences update endpoint
router.put('/newsletter/preferences', async (req, res) => {
    try {
        const { email, preferences } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const subscriber = await Newsletter.findOne({ email: email.toLowerCase() });
        
        if (!subscriber) {
            return res.status(404).json({
                success: false,
                message: 'Email not found in our newsletter list'
            });
        }

        // Update preferences
        if (preferences) {
            subscriber.preferences = { ...subscriber.preferences, ...preferences };
            await subscriber.save();
        }

        res.json({
            success: true,
            message: 'Your preferences have been updated successfully',
            preferences: subscriber.preferences
        });

    } catch (error) {
        console.error('Newsletter preferences error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating preferences'
        });
    }
});

// ADD THESE ORDERS API ENDPOINTS TO YOUR EXISTING index.js FILE
// Place these after your existing Order schema and before app.listen()

// =============================================
// ORDERS API ENDPOINTS - ADD TO EXISTING CODE
// =============================================

// Get all orders for a user with pagination, filtering, and search
router.get('/orders', verifyToken, async (req, res) => {
    try {
        console.log('📋 Fetching orders for user:', req.user.id);
        
        const { 
            page = 1, 
            limit = 10, 
            status = '', 
            search = '',
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = { userId: req.user.id };
        
        // Add status filter
        if (status && status !== '') {
            query.status = status;
        }
        
        // Add search filter (search by order ID)
        if (search && search !== '') {
            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { 'items.name': { $regex: search, $options: 'i' } }
            ];
        }

        // Calculate pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Get total count for pagination
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limitNum);

        // Fetch orders with sorting
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const orders = await Order.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean(); // Use lean() for better performance

        console.log(`📋 Found ${orders.length} orders out of ${totalOrders} total`);

        // Transform orders for frontend
        const transformedOrders = orders.map(order => ({
            id: order._id,
            orderId: order.orderId,
            orderNumber: order.orderId, // For compatibility with frontend
            status: order.status || 'pending',
            totalAmount: order.amount?.total || order.totalAmount || 0,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            paymentMethod: order.paymentMethod === 'stripe' ? 'Credit Card' : 
                         order.paymentMethod === 'paypal' ? 'PayPal' : 
                         order.paymentMethod || 'Credit Card',
            paymentStatus: order.paymentStatus || 'completed',
            items: order.items.map(item => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image
            })),
            shippingAddress: order.shippingAddress || {},
            billingAddress: order.billingAddress || {}
        }));

        res.json({
            success: true,
            orders: transformedOrders,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalOrders,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1,
                limit: limitNum
            }
        });

    } catch (error) {
        console.error('❌ Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
});

// Get single order details by ID
router.get('/orders/:orderId', verifyToken, async (req, res) => {
    try {
        console.log('📋 Fetching order details:', req.params.orderId);
        
        const order = await Order.findOne({
            $or: [
                { _id: req.params.orderId },
                { orderId: req.params.orderId }
            ],
            userId: req.user.id
        }).lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Transform order for frontend with detailed info
        const transformedOrder = {
            id: order._id,
            orderId: order.orderId,
            orderNumber: order.orderId,
            status: order.status || 'pending',
            totalAmount: order.amount?.total || order.totalAmount || 0,
            subtotal: order.amount?.subtotal || 0,
            shipping: order.amount?.shipping || 0,
            tax: order.amount?.tax || 0,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            paymentMethod: order.paymentMethod === 'stripe' ? 'Credit Card' : 
                         order.paymentMethod === 'paypal' ? 'PayPal' : 
                         order.paymentMethod || 'Credit Card',
            paymentStatus: order.paymentStatus || 'completed',
            items: order.items.map(item => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image,
                productId: item.productId
            })),
            shippingAddress: order.shippingAddress || {},
            billingAddress: order.billingAddress || {},
            // Create a basic timeline based on order status
            timeline: createOrderTimeline(order)
        };

        console.log('✅ Order details retrieved successfully');

        res.json({
            success: true,
            order: transformedOrder
        });

    } catch (error) {
        console.error('❌ Error fetching order details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order details',
            error: error.message
        });
    }
});

// Cancel an order (if it's still cancellable)
router.post('/orders/:orderId/cancel', verifyToken, async (req, res) => {
    try {
        console.log('❌ Cancelling order:', req.params.orderId);
        
        const order = await Order.findOne({
            $or: [
                { _id: req.params.orderId },
                { orderId: req.params.orderId }
            ],
            userId: req.user.id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order can be cancelled
        const cancellableStatuses = ['pending', 'confirmed', 'processing'];
        if (!cancellableStatuses.includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel order with status: ${order.status}`
            });
        }

        // Update order status to cancelled
        order.status = 'cancelled';
        order.updatedAt = new Date();
        await order.save();

        console.log('✅ Order cancelled successfully');

        res.json({
            success: true,
            message: 'Order cancelled successfully',
            order: {
                id: order._id,
                orderId: order.orderId,
                status: order.status
            }
        });

    } catch (error) {
        console.error('❌ Error cancelling order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order',
            error: error.message
        });
    }
});

// Get user's order statistics
router.get('/orders/stats/summary', verifyToken, async (req, res) => {
    try {
        console.log('📊 Fetching order stats for user:', req.user.id);
        
        const stats = await Order.aggregate([
            { $match: { userId: req.user.id } },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalSpent: { $sum: { $ifNull: ['$amount.total', '$totalAmount'] } },
                    statusCounts: {
                        $push: '$status'
                    }
                }
            }
        ]);

        const statusCounts = {};
        if (stats.length > 0 && stats[0].statusCounts) {
            stats[0].statusCounts.forEach(status => {
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
        }

        const summary = {
            totalOrders: stats.length > 0 ? stats[0].totalOrders : 0,
            totalSpent: stats.length > 0 ? stats[0].totalSpent : 0,
            statusCounts,
            recentOrdersCount: await Order.countDocuments({
                userId: req.user.id,
                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
            })
        };

        res.json({
            success: true,
            stats: summary
        });

    } catch (error) {
        console.error('❌ Error fetching order stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order statistics',
            error: error.message
        });
    }
});

// Helper function to create order timeline
function createOrderTimeline(order) {
    const timeline = [];
    const now = new Date();
    
    // Order placed
    timeline.push({
        title: 'Order Placed',
        description: 'Your order has been successfully placed',
        date: order.createdAt,
        completed: true
    });

    // Order confirmed
    if (['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)) {
        timeline.push({
            title: 'Order Confirmed',
            description: 'Your order has been confirmed and is being prepared',
            date: order.updatedAt,
            completed: true
        });
    }

    // Processing
    if (['processing', 'shipped', 'delivered'].includes(order.status)) {
        timeline.push({
            title: 'Processing',
            description: 'Your order is being processed and prepared for shipping',
            date: order.status === 'processing' ? order.updatedAt : null,
            completed: ['processing', 'shipped', 'delivered'].includes(order.status)
        });
    }

    // Shipped
    if (['shipped', 'delivered'].includes(order.status)) {
        timeline.push({
            title: 'Shipped',
            description: 'Your order has been shipped and is on the way',
            date: order.status === 'shipped' ? order.updatedAt : null,
            completed: ['shipped', 'delivered'].includes(order.status)
        });
    }

    // Delivered
    timeline.push({
        title: 'Delivered',
        description: 'Your order has been delivered',
        date: order.status === 'delivered' ? order.updatedAt : null,
        completed: order.status === 'delivered'
    });

    // Handle cancelled orders
    if (order.status === 'cancelled') {
        timeline.push({
            title: 'Order Cancelled',
            description: 'Your order has been cancelled',
            date: order.updatedAt,
            completed: true
        });
    }

    return timeline;
}

// ===== UPDATE YOUR EXISTING CART/WISHLIST SUMMARY ROUTES =====
// These should REPLACE or be added to your existing cart/wishlist summary routes

// Enhanced cart summary route (ADD THIS IF NOT EXISTS)
router.get('/cart/summary/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Verify user can access this cart
        if (req.user.id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const cart = await Cart.findOne({ userId });
        
        if (!cart || cart.items.length === 0) {
            return res.json({
                success: true,
                totalItems: 0,
                totalValue: 0,
                itemCount: 0
            });
        }

        // Get product details for accurate pricing
        const productIds = cart.items.map(item => item.productId);
        const products = await Product.find({ id: { $in: productIds } });
        const productMap = new Map(products.map(p => [p.id, p]));

        let totalItems = 0;
        let totalValue = 0;

        cart.items.forEach(item => {
            const product = productMap.get(item.productId);
            if (product) {
                totalItems += item.quantity;
                totalValue += (item.price * item.quantity);
            }
        });

        res.json({
            success: true,
            totalItems,
            totalValue: parseFloat(totalValue.toFixed(2)),
            itemCount: cart.items.length
        });

    } catch (error) {
        console.error('Error getting cart summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get cart summary',
            error: error.message,
            totalItems: 0,
            totalValue: 0,
            itemCount: 0
        });
    }
});

// Enhanced wishlist summary route (ADD THIS IF NOT EXISTS)
router.get('/wishlist/summary/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Verify user can access this wishlist
        if (req.user.id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const wishlist = await Wishlist.findOne({ userId });
        
        if (!wishlist || wishlist.items.length === 0) {
            return res.json({
                success: true,
                totalItems: 0,
                totalValue: 0,
                itemCount: 0
            });
        }

        // Get product details for current pricing
        const productIds = wishlist.items.map(item => item.productId);
        const products = await Product.find({ 
            id: { $in: productIds },
            available: true 
        });

        const totalValue = products.reduce((sum, product) => sum + product.new_price, 0);

        res.json({
            success: true,
            totalItems: wishlist.items.length,
            totalValue: parseFloat(totalValue.toFixed(2)),
            itemCount: wishlist.items.length
        });

    } catch (error) {
        console.error('Error getting wishlist summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get wishlist summary',
            error: error.message,
            totalItems: 0,
            totalValue: 0,
            itemCount: 0
        });
    }
});

// Test endpoint to verify orders system is working
router.get('/test/orders', async (req, res) => {
    try {
        const orderCount = await Order.countDocuments();
        
        // Get a sample order to show structure
        const sampleOrder = await Order.findOne().lean();
        
        res.json({
            success: true,
            message: 'Orders API is working',
            totalOrders: orderCount,
            sampleOrderStructure: sampleOrder ? {
                id: sampleOrder._id,
                orderId: sampleOrder.orderId,
                userId: sampleOrder.userId,
                status: sampleOrder.status,
                createdAt: sampleOrder.createdAt,
                hasItems: Array.isArray(sampleOrder.items),
                itemCount: sampleOrder.items ? sampleOrder.items.length : 0,
                hasShippingAddress: !!sampleOrder.shippingAddress,
                paymentMethod: sampleOrder.paymentMethod
            } : 'No orders found'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

console.log('📋 Orders API routes loaded successfully');
console.log('📋 Available order endpoints:');
console.log('   GET  /orders - Get user orders with pagination');
console.log('   GET  /orders/:orderId - Get single order details'); 
console.log('   POST /orders/:orderId/cancel - Cancel an order');
console.log('   GET  /orders/stats/summary - Get user order statistics');
console.log('   GET  /cart/summary/:userId - Get cart summary');
console.log('   GET  /wishlist/summary/:userId - Get wishlist summary');
console.log('   GET  /test/orders - Test orders system');

// =============================================
// END OF ORDERS API INTEGRATION
// =============================================
// =============================================
// ADMIN ORDERS API ENDPOINTS - ADD TO YOUR index.js
// Add these after your existing Order schema and before app.listen()
// =============================================

// =============================================
// FIXED ADMIN ORDERS API ENDPOINTS - REPLACE YOUR EXISTING ADMIN ORDER ENDPOINTS
// ================

// =============================================
// FIXED ADMIN ORDERS API ENDPOINTS - CORRECT ROUTE ORDER
// Replace your existing admin order endpoints with this version
// =============================================

// Admin: Get all orders with pagination, filtering, and search


module.exports = router;