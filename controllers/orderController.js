// controllers/orderController.js - Order Controller
const { Order, Sale, Cart } = require('../models');
const Product = require('../models/Product');
const { sendOrderConfirmationEmail, sendOrderStatusEmail } = require('../utils/emailService');

// Create order timeline helper
const createOrderTimeline = (order) => {
    const timeline = [];
    
    timeline.push({
        title: 'Order Placed',
        description: 'Your order has been successfully placed',
        date: order.createdAt,
        completed: true
    });

    if (['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)) {
        timeline.push({
            title: 'Order Confirmed',
            description: 'Your order has been confirmed and is being prepared',
            date: order.updatedAt,
            completed: true
        });
    }

    if (['processing', 'shipped', 'delivered'].includes(order.status)) {
        timeline.push({
            title: 'Processing',
            description: 'Your order is being processed and prepared for shipping',
            date: order.status === 'processing' ? order.updatedAt : null,
            completed: ['processing', 'shipped', 'delivered'].includes(order.status)
        });
    }

    if (['shipped', 'delivered'].includes(order.status)) {
        timeline.push({
            title: 'Shipped',
            description: 'Your order has been shipped and is on the way',
            date: order.status === 'shipped' ? order.updatedAt : null,
            completed: ['shipped', 'delivered'].includes(order.status)
        });
    }

    timeline.push({
        title: 'Delivered',
        description: 'Your order has been delivered',
        date: order.status === 'delivered' ? order.updatedAt : null,
        completed: order.status === 'delivered'
    });

    if (order.status === 'cancelled') {
        timeline.push({
            title: 'Order Cancelled',
            description: 'Your order has been cancelled',
            date: order.updatedAt,
            completed: true
        });
    }

    return timeline;
};

// Create new order
const createOrder = async (req, res) => {
    try {
        const { 
            userId, 
            items, 
            shippingAddress, 
            billingAddress,
            amount,
            paymentIntentId,
            paymentMethod = 'stripe'
        } = req.body;

        console.log('📦 Creating order:', { userId, itemCount: items?.length, paymentMethod });

        // Generate unique order ID
        const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const order = new Order({
            userId,
            orderId,
            stripePaymentIntentId: paymentIntentId,
            items: items.map(item => ({
                productId: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image
            })),
            shippingAddress,
            billingAddress: billingAddress || shippingAddress,
            amount,
            status: 'pending',
            paymentStatus: 'pending',
            paymentMethod
        });

        await order.save();
        console.log('✅ Order created successfully:', orderId);

        res.json({
            success: true,
            order: order,
            orderId: orderId
        });

    } catch (error) {
        console.error('❌ Order creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            error: error.message
        });
    }
};

// Get user orders
const getUserOrders = async (req, res) => {
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

        const query = { userId: req.user.id };
        
        if (status && status !== '') {
            query.status = status;
        }
        
        if (search && search !== '') {
            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { 'items.name': { $regex: search, $options: 'i' } }
            ];
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limitNum);

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const orders = await Order.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean();

        console.log(`📋 Found ${orders.length} orders out of ${totalOrders} total`);

        const transformedOrders = orders.map(order => ({
            id: order._id,
            orderId: order.orderId,
            orderNumber: order.orderId,
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
};

// Get single order details
const getOrderById = async (req, res) => {
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
};

// Cancel order
const cancelOrder = async (req, res) => {
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

        const cancellableStatuses = ['pending', 'confirmed', 'processing'];
        if (!cancellableStatuses.includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel order with status: ${order.status}`
            });
        }

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
};

// Get order statistics
const getOrderStats = async (req, res) => {
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
                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
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
};

// Update order status (internal use)
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        
        console.log(`📋 Updating order ${orderId} status to ${status}`);

        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order status'
            });
        }

        const order = await Order.findOneAndUpdate(
            { orderId: orderId },
            { 
                status: status,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Send status update email
        try {
            if (order.shippingAddress?.email && typeof sendOrderStatusEmail === 'function') {
                await sendOrderStatusEmail(order, status);
                console.log(`📧 Status update email sent for order: ${orderId}`);
            }
        } catch (emailError) {
            console.error('❌ Status email failed:', emailError);
        }

        res.json({
            success: true,
            message: 'Order status updated successfully',
            order
        });

    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status'
        });
    }
};

module.exports = {
    createOrder,
    getUserOrders,
    getOrderById,
    cancelOrder,
    getOrderStats,
    updateOrderStatus
};