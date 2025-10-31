const mongoose = require('mongoose');

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
app.post('/admin/login', async (req, res) => {
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
app.get('/admin/profile', verifyAdminToken, async (req, res) => {
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
app.post('/admin/logout', verifyAdminToken, (req, res) => {
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
app.post('/payment/confirm', async (req, res) => {
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
app.post('/admin/retry-email/:orderId', async (req, res) => {
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
app.get('/order/:orderId', async (req, res) => {
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
app.get('/orders/user/:userId', async (req, res) => {
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
app.post('/payment/paypal/create-order', async (req, res) => {
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
app.post('/payment/paypal/capture-order', async (req, res) => {
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
// app.post('/payment/confirm', async (req, res) => {
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
app.get('/payment/paypal/test', async (req, res) => {
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
app.post('/order/:orderId/status', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const order = await Order.findOneAndUpdate(
            { orderId },
            { status, updatedAt: new Date() },
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
            await sendOrderStatusEmail(order, status);
            console.log(`✅ Order status email sent for order: ${orderId} (${status})`);
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
});

console.log('🔵 PayPal integration loaded');
console.log('🔵 PayPal Client ID:', process.env.PAYPAL_CLIENT_ID ? 'Found' : 'Missing');
console.log('🔵 PayPal Base URL:', PAYPAL_BASE_URL);
console.log('📧 Email service loaded and ready');



// Verify Reset Token
app.get('/auth/verify-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Reset token is required'
            });
        }

        // Find user with valid reset token
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token',
                expired: true
            });
        }

        res.json({
            success: true,
            message: 'Reset token is valid',
            user: {
                email: user.email,
                name: user.name
            }
        });

    } catch (error) {
        console.error('Verify reset token error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Reset Password
app.post('/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        // Validation
        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Reset token and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        if (newPassword.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Password must not exceed 100 characters'
            });
        }

        // Find user with valid reset token
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token',
                expired: true
            });
        }

        // Hash new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update user password and clear reset token
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.lastLogin = new Date();
        await user.save();

        // Send confirmation email
        try {
            const transporter = createTransport();
            
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: 'Password Reset Successful - Pink Dreams',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h2 style="margin: 0;">Password Reset Successful</h2>
                        </div>
                        
                        <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                            <p>Hi ${user.name},</p>
                            <p>Your password has been successfully reset for your Pink Dreams account.</p>
                            <p>If you didn't make this change, please contact our support team immediately.</p>
                            <p>For security, we recommend:</p>
                            <ul>
                                <li>Using a unique password for your account</li>
                                <li>Enabling two-factor authentication if available</li>
                                <li>Not sharing your password with anyone</li>
                            </ul>
                            <p>Best regards,<br>The Pink Dreams Team</p>
                            
                            <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 20px; font-size: 12px; color: #6b7280;">
                                <p>Reset completed on: ${new Date().toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
            // Don't fail the request if confirmation email fails
        }

        res.json({
            success: true,
            message: 'Password reset successfully. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error. Please try again.'
        });
    }
});

// User Schema