const express = require('express');
const router = express.Router();
const { stripe, paypalClient } = require('../config/payment');
const Order = require('../models/orderModel');
const { sendOrderConfirmationEmail } = require('../utils/emailService');

router.post('/payment/create-payment-intent', async (req, res) => {
    try {
        const { amount, currency = 'usd', orderId, userId } = req.body;

        console.log('Creating payment intent for:', { amount, orderId, userId });

        // Validate required fields
        if (!amount || !orderId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Amount, orderId, and userId are required'
            });
        }

        // Convert amount to cents (Stripe requires amount in smallest currency unit)
        const amountInCents = Math.round(amount * 100);

        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: currency,
            metadata: {
                orderId: orderId,
                userId: userId
            },
            automatic_payment_methods: {
                enabled: true,
            },
        });

        console.log('Payment intent created:', paymentIntent.id);

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        console.error('Payment intent creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment intent',
            error: error.message
        });
    }
});

// Enhanced backend endpoints - ADD THESE TO YOUR EXISTING index.js

// Enhanced Order Creation with billing address
router.post('/order/create', async (req, res) => {
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
            billingAddress: billingAddress || shippingAddress, // Use shipping if billing not provided
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
});

// Enhanced Order Schema - UPDATE YOUR EXISTING Order SCHEMA
const Order = mongoose.model("Order", {
    userId: {
        type: String,
        required: true,
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    stripePaymentIntentId: {
        type: String,
        required: true
    },
    items: [{
        productId: Number,
        name: String,
        price: Number,
        quantity: Number,
        image: String
    }],
    shippingAddress: {
        name: String,
        email: String,
        phone: String,
        address: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    billingAddress: {
        name: String,
        email: String,
        phone: String,
        address: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    amount: {
        subtotal: Number,
        shipping: Number,
        tax: Number,
        discount: Number,
        total: Number
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'succeeded', 'failed', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['stripe', 'paypal'],
        default: 'stripe'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

console.log('💳 Enhanced checkout system loaded');
console.log('🔵 Stripe integration ready');
console.log('🔵 PayPal integration ready');

const Admin = mongoose.model("Admin", {
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['admin', 'super_admin'],
        default: 'admin'
    },
    lastLogin: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware to verify admin token
const verifyAdminToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if it's an admin token
        if (decoded.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required.'
            });
        }
        
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Invalid token.'
        });
    }
};

// Admin Login
router.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('Admin login attempt:', username);

        // Validation
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Find admin
        const admin = await Admin.findOne({ username: username });
        
        if (!admin) {
            console.log('Admin not found:', username);
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Check password (simple comparison for now)
        const isPasswordValid = await bcrypt.compare(password, admin.password);
        
        if (!isPasswordValid) {
            console.log('Invalid password for admin:', username);
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Update last login
        admin.lastLogin = new Date();
        await admin.save();

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: admin._id, 
                username: admin.username, 
                role: admin.role,
                type: 'admin' // Important: mark as admin token
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        console.log('Admin login successful:', username);

        res.json({
            success: true,
            message: 'Admin login successful',
            token,
            admin: {
                id: admin._id,
                username: admin.username,
                name: admin.name,
                role: admin.role,
                lastLogin: admin.lastLogin
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Get admin profile
router.get('/admin/profile', verifyAdminToken, async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin.id).select('-password');
        
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        res.json({
            success: true,
            admin: {
                id: admin._id,
                username: admin.username,
                name: admin.name,
                role: admin.role,
                lastLogin: admin.lastLogin,
                createdAt: admin.createdAt
            }
        });
    } catch (error) {
        console.error('Admin profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Admin logout
router.post('/admin/logout', verifyAdminToken, (req, res) => {
    res.json({
        success: true,
        message: 'Admin logout successful'
    });
});

// Create default admin if none exists
const createDefaultAdmin = async () => {
    try {
        const adminCount = await Admin.countDocuments();
        
        if (adminCount === 0) {
            console.log('Creating default admin...');
            
            const defaultPassword = 'admin123';
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            
            const defaultAdmin = new Admin({
                username: 'admin',
                password: hashedPassword,
                name: 'Administrator',
                role: 'super_admin'
            });
            
            await defaultAdmin.save();
            
            console.log('✅ Default admin created:');
            console.log('   Username: admin');
            console.log('   Password: admin123');
        }
    } catch (error) {
        console.error('Error creating default admin:', error);
    }
};

// Initialize default admin on server start
createDefaultAdmin();

console.log('🔐 Simple admin login system loaded');
console.log('📝 Admin endpoints:');
console.log('   POST /admin/login - Admin login');
console.log('   GET /admin/profile - Get admin profile');
console.log('   POST /admin/logout - Admin logout');


// REPLACE YOUR EXISTING /payment/confirm ENDPOINT WITH THIS:


// Update your payment confirmation to use non-blocking email
router.post('/payment/confirm', async (req, res) => {
    try {
        const { paymentIntentId, orderId } = req.body;
        console.log('Processing payment confirmation for order:', orderId);

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === 'succeeded') {
            console.log('Payment succeeded, updating order...');
            
            const order = await Order.findOneAndUpdate(
                { orderId: orderId },
                { 
                    paymentStatus: 'succeeded',
                    status: 'processing',
                    updatedAt: new Date()
                },
                { new: true }
            );

            if (order) {
                // Clear cart and update inventory first
                if (order.userId !== 'guest') {
                    await Cart.findOneAndUpdate(
                        { userId: order.userId },
                        { items: [], updatedAt: new Date() }
                    );
                }

                // Update product stock and sales
                for (const item of order.items) {
                    await Product.findOneAndUpdate(
                        { id: item.productId },
                        { 
                            $inc: { 
                                stock_quantity: -item.quantity,
                                sales_count: item.quantity
                            }
                        }
                    );

                    const product = await Product.findOne({ id: item.productId });
                    if (product) {
                        const sale = new Sale({
                            product_id: item.productId,
                            product_name: item.name,
                            category: product.category,
                            price: item.price,
                            quantity: item.quantity,
                            total_amount: item.price * item.quantity,
                            date: new Date(),
                            month: new Date().getMonth() + 1,
                            year: new Date().getFullYear()
                        });
                        await sale.save();
                    }
                }

                // SEND EMAIL ASYNCHRONOUSLY (non-blocking)
                // Don't wait for email to complete before responding
                setImmediate(async () => {
                    try {
                        console.log('Attempting to send order confirmation email...');
                        
                        if (typeof sendOrderConfirmationEmail === 'function') {
                            await Promise.race([
                                sendOrderConfirmationEmail(order),
                                new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('Email timeout')), 20000)
                                )
                            ]);
                            console.log(`Order confirmation email sent successfully for order: ${orderId}`);
                        } else {
                            console.log('sendOrderConfirmationEmail function not available');
                        }
                    } catch (emailError) {
                        console.error('Email sending failed (non-blocking):', emailError.message);
                        // Could store failed email attempts in database for retry later
                    }
                });

                // Respond immediately without waiting for email
                console.log(`Payment confirmed for order ${orderId}`);
            }

            res.json({
                success: true,
                message: 'Payment confirmed successfully',
                order: order
            });
        } else {
            console.log('Payment not succeeded, status:', paymentIntent.status);
            res.status(400).json({
                success: false,
                message: 'Payment not completed',
                status: paymentIntent.status
            });
        }

    } catch (error) {
        console.error('Payment confirmation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to confirm payment',
            error: error.message
        });
    }
});

// Add a separate endpoint to retry failed emails
router.post('/admin/retry-email/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findOne({ orderId });
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        await sendEmailWithTimeout({
            from: process.env.EMAIL_USER,
            to: order.shippingAddress?.email,
            subject: `Order Confirmation - ${orderId}`,
            html: `<h1>Your order ${orderId} has been confirmed!</h1>`
        });

        res.json({
            success: true,
            message: 'Email sent successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send email',
            error: error.message
        });
    }
});

// Get Order by ID
router.get('/order/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const order = await Order.findOne({ orderId });
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        res.json({
            success: true,
            order: order
        });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order'
        });
    }
});

// Get User Orders
router.get('/orders/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalOrders = await Order.countDocuments({ userId });

        res.json({
            success: true,
            orders: orders,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalOrders / limit),
                totalOrders: totalOrders
            }
        });
    } catch (error) {
        console.error('Error fetching user orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders'
        });
    }
});

// ==========================================
// PAYPAL INTEGRATION - ADD THIS TO index.js
// ==========================================

// PayPal API Base URL
// ==========================================
// PAYMENT ENDPOINTS - FIXED VERSION
// ==========================================

// PayPal API Base URL
const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

// Function to get PayPal access token
async function getPayPalToken() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
        throw new Error('PayPal credentials not found in environment variables');
    }
    
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    try {
        const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });
        
        if (!response.ok) {
            throw new Error(`PayPal token request failed: ${response.status}`);
        }
        
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('Error getting PayPal token:', error);
        throw error;
    }
}

// CREATE PAYPAL ORDER - This runs when user clicks PayPal button
router.post('/payment/paypal/create-order', async (req, res) => {
    try {
        const { amount, orderId, userId, items } = req.body;
        
        console.log('📦 Creating PayPal order:', { 
            amount, 
            orderId, 
            userId, 
            itemCount: items?.length 
        });

        // Validate required data
        if (!amount || !orderId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: amount, orderId, userId'
            });
        }

        // Get PayPal access token
        const accessToken = await getPayPalToken();
        
        // Calculate order breakdown
        const itemTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shipping = itemTotal > 75 ? 0 : 9.99;
        const tax = itemTotal * 0.08;
        const totalAmount = itemTotal + shipping + tax;

        // Create order payload for PayPal
        const orderPayload = {
            intent: 'CAPTURE', // We want to capture payment immediately
            purchase_units: [{
                reference_id: orderId, // Your internal order ID
                amount: {
                    currency_code: 'USD',
                    value: totalAmount.toFixed(2),
                    breakdown: {
                        item_total: { currency_code: 'USD', value: itemTotal.toFixed(2) },
                        shipping: { currency_code: 'USD', value: shipping.toFixed(2) },
                        tax_total: { currency_code: 'USD', value: tax.toFixed(2) }
                    }
                },
                items: items.map(item => ({
                    name: item.name.substring(0, 127), // PayPal limit
                    unit_amount: { currency_code: 'USD', value: item.price.toFixed(2) },
                    quantity: item.quantity.toString(),
                    category: 'PHYSICAL_GOODS'
                })),
                description: `Order #${orderId} from Pink Dreams Store`
            }],
            // 🎯 THIS IS KEY: No return_url or cancel_url = stays on your site!
            application_context: {
                brand_name: 'Pink Dreams Fashion Store',
                landing_page: 'BILLING',
                user_action: 'PAY_NOW', // Shows "Pay Now" instead of "Continue"
                shipping_preference: 'NO_SHIPPING' // We collect shipping ourselves
            }
        };

        // Send order to PayPal
        const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderPayload)
        });

        const paypalOrder = await response.json();

        if (response.ok && paypalOrder.id) {
            console.log('✅ PayPal order created:', paypalOrder.id);
            
            res.json({
                success: true,
                orderID: paypalOrder.id, // PayPal's order ID
                message: 'PayPal order created successfully'
            });
        } else {
            console.error('❌ PayPal order creation failed:', paypalOrder);
            throw new Error(paypalOrder.message || 'PayPal order creation failed');
        }

    } catch (error) {
        console.error('❌ PayPal create order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create PayPal order',
            error: error.message
        });
    }
});

// CAPTURE PAYPAL PAYMENT - This runs when PayPal payment is approved
router.post('/payment/paypal/capture-order', async (req, res) => {
    try {
        const { orderID, orderId, userId, items, shippingAddress, amount } = req.body;

        console.log('💰 Capturing PayPal payment:', { orderID, orderId, userId });

        if (!orderID) {
            return res.status(400).json({
                success: false,
                message: 'PayPal Order ID is required'
            });
        }

        // Get PayPal access token
        const accessToken = await getPayPalToken();

        // Capture the payment from PayPal
        const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const captureResult = await response.json();

        if (response.ok && captureResult.status === 'COMPLETED') {
            console.log('✅ PayPal payment captured successfully');

            // Generate final order ID
            const finalOrderId = orderId || `PAYPAL_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            // Save order to your database
            const newOrder = new Order({
                userId: userId || 'guest',
                orderId: finalOrderId,
                stripePaymentIntentId: `paypal_${orderID}`, // Store PayPal ID here
                items: items.map(item => ({
                    productId: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    image: item.image
                })),
                shippingAddress: shippingAddress || {},
                amount: {
                    subtotal: amount.subtotal || 0,
                    shipping: amount.shipping || 0,
                    tax: amount.tax || 0,
                    discount: amount.discount || 0,
                    total: amount.total || 0
                },
                paymentStatus: 'succeeded',
                status: 'processing',
                paymentMethod: 'paypal'
            });

            await newOrder.save();
            console.log('💾 Order saved to database:', finalOrderId);

            // Clear user's cart
            if (userId !== 'guest') {
                await Cart.findOneAndUpdate(
                    { userId: userId },
                    { items: [], updatedAt: new Date() }
                );
                console.log('🛒 Cart cleared for user:', userId);
            }

            // Update product inventory and sales
            for (const item of items) {
                // Reduce stock, increase sales count
                await Product.findOneAndUpdate(
                    { id: item.id },
                    { 
                        $inc: { 
                            stock_quantity: -item.quantity,
                            sales_count: item.quantity
                        }
                    }
                );

                // Record sale for analytics
                const product = await Product.findOne({ id: item.id });
                if (product) {
                    const sale = new Sale({
                        product_id: item.id,
                        product_name: item.name,
                        category: product.category,
                        price: item.price,
                        quantity: item.quantity,
                        total_amount: item.price * item.quantity,
                        date: new Date(),
                        month: new Date().getMonth() + 1,
                        year: new Date().getFullYear()
                    });
                    await sale.save();
                }
            }

            console.log('📊 Inventory and sales updated');

            // 📧 SEND ORDER CONFIRMATION EMAIL
            try {
                await sendOrderConfirmationEmail(newOrder);
                console.log(`✅ Order confirmation email sent for PayPal order: ${finalOrderId}`);
            } catch (emailError) {
                console.error('❌ Email sending failed:', emailError);
                // Don't fail the entire request if email fails
            }

            // Send success response
            res.json({
                success: true,
                message: 'PayPal payment completed successfully',
                order: newOrder,
                paypalDetails: {
                    captureId: captureResult.id,
                    status: captureResult.status,
                    orderID: orderID
                }
            });

        } else {
            console.error('❌ PayPal capture failed:', captureResult);
            res.status(400).json({
                success: false,
                message: 'PayPal payment capture failed',
                details: captureResult
            });
        }

    } catch (error) {
        console.error('❌ PayPal capture error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to capture PayPal payment',
            error: error.message
        });
    }
});

// STRIPE PAYMENT CONFIRMATION - Debug Version
// router.post('/payment/confirm', async (req, res) => {
//     try {
//         const { paymentIntentId, orderId } = req.body;
//         console.log('🔄 Processing payment confirmation for order:', orderId);

//         // Retrieve payment intent from Stripe
//         const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

//         if (paymentIntent.status === 'succeeded') {
//             console.log('✅ Payment succeeded, updating order...');
            
//             // Update order status
//             const order = await Order.findOneAndUpdate(
//                 { orderId: orderId },
//                 { 
//                     paymentStatus: 'succeeded',
//                     status: 'processing',
//                     updatedAt: new Date()
//                 },
//                 { new: true }
//             );

//             if (order) {
//                 console.log('✅ Order updated successfully:', order.orderId);
//                 console.log('📧 Order details for email:', {
//                     orderId: order.orderId,
//                     hasShippingAddress: !!order.shippingAddress,
//                     hasEmail: !!(order.shippingAddress?.email || order.billingAddress?.email),
//                     itemCount: order.items?.length || 0
//                 });

//                 // Clear user's cart
//                 if (order.userId !== 'guest') {
//                     await Cart.findOneAndUpdate(
//                         { userId: order.userId },
//                         { items: [], updatedAt: new Date() }
//                     );
//                 }

//                 // Update product stock and sales
//                 for (const item of order.items) {
//                     await Product.findOneAndUpdate(
//                         { id: item.productId },
//                         { 
//                             $inc: { 
//                                 stock_quantity: -item.quantity,
//                                 sales_count: item.quantity
//                             }
//                         }
//                     );

//                     // Create sales record
//                     const product = await Product.findOne({ id: item.productId });
//                     if (product) {
//                         const sale = new Sale({
//                             product_id: item.productId,
//                             product_name: item.name,
//                             category: product.category,
//                             price: item.price,
//                             quantity: item.quantity,
//                             total_amount: item.price * item.quantity,
//                             date: new Date(),
//                             month: new Date().getMonth() + 1,
//                             year: new Date().getFullYear()
//                         });
//                         await sale.save();
//                     }
//                 }

//                 console.log(`✅ Payment confirmed for order ${orderId}`);

//                 // 📧 SEND ORDER CONFIRMATION EMAIL
//                 console.log('📧 Attempting to send order confirmation email...');
//                 try {
//                     await sendOrderConfirmationEmail(order);
//                     console.log(`✅ Order confirmation email sent successfully for order: ${orderId}`);
//                 } catch (emailError) {
//                     console.error('❌ Email sending failed:', emailError);
//                     console.error('❌ Email error details:', emailError.message);
//                     console.error('❌ Email error stack:', emailError.stack);
//                     // Don't fail the entire request if email fails
//                 }
//             } else {
//                 console.error('❌ Order not found in database:', orderId);
//             }

//             res.json({
//                 success: true,
//                 message: 'Payment confirmed successfully',
//                 order: order
//             });
//         } else {
//             console.log('❌ Payment not succeeded, status:', paymentIntent.status);
//             res.status(400).json({
//                 success: false,
//                 message: 'Payment not completed',
//                 status: paymentIntent.status
//             });
//         }

//     } catch (error) {
//         console.error('❌ Payment confirmation error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to confirm payment',
//             error: error.message
//         });
//     }
// });

// Test endpoint to verify PayPal connection
router.get('/payment/paypal/test', async (req, res) => {
    try {
        const token = await getPayPalToken();
        res.json({
            success: true,
            message: 'PayPal connection successful',
            hasToken: !!token
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'PayPal connection failed',
            error: error.message
        });
    }
});

// New endpoint to update order status and send email

module.exports = router;