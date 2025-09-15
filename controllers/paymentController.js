// controllers/paymentController.js - Payment Controller
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Order, Sale, Cart } = require('../models');
const Product = require('../models/Product');
const { sendOrderConfirmationEmail, sendTestEmail } = require('../utils/emailService');

// PayPal configuration
const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

// Get PayPal access token
const getPayPalToken = async () => {
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
};

// Create Stripe payment intent
const createPaymentIntent = async (req, res) => {
    try {
        const { amount, currency = 'usd', orderId, userId } = req.body;

        console.log('Creating payment intent for:', { amount, orderId, userId });

        if (!amount || !orderId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Amount, orderId, and userId are required'
            });
        }

        const amountInCents = Math.round(amount * 100);

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
};

// Confirm Stripe payment
const confirmPayment = async (req, res) => {
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
                // Clear cart
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

                // Send email asynchronously
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
                    }
                });

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
};

// Create PayPal order
const createPayPalOrder = async (req, res) => {
    try {
        const { amount, orderId, userId, items } = req.body;
        
        console.log('Creating PayPal order:', { 
            amount, 
            orderId, 
            userId, 
            itemCount: items?.length 
        });

        if (!amount || !orderId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: amount, orderId, userId'
            });
        }

        const accessToken = await getPayPalToken();
        
        const itemTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shipping = itemTotal > 75 ? 0 : 9.99;
        const tax = itemTotal * 0.08;
        const totalAmount = itemTotal + shipping + tax;

        const orderPayload = {
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: orderId,
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
                    name: item.name.substring(0, 127),
                    unit_amount: { currency_code: 'USD', value: item.price.toFixed(2) },
                    quantity: item.quantity.toString(),
                    category: 'PHYSICAL_GOODS'
                })),
                description: `Order #${orderId} from Pink Dreams Store`
            }],
            application_context: {
                brand_name: 'Pink Dreams Fashion Store',
                landing_page: 'BILLING',
                user_action: 'PAY_NOW',
                shipping_preference: 'NO_SHIPPING'
            }
        };

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
            console.log('PayPal order created:', paypalOrder.id);
            
            res.json({
                success: true,
                orderID: paypalOrder.id,
                message: 'PayPal order created successfully'
            });
        } else {
            console.error('PayPal order creation failed:', paypalOrder);
            throw new Error(paypalOrder.message || 'PayPal order creation failed');
        }

    } catch (error) {
        console.error('PayPal create order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create PayPal order',
            error: error.message
        });
    }
};

// Capture PayPal payment
const capturePayPalOrder = async (req, res) => {
    try {
        const { orderID, orderId, userId, items, shippingAddress, amount } = req.body;

        console.log('Capturing PayPal payment:', { orderID, orderId, userId });

        if (!orderID) {
            return res.status(400).json({
                success: false,
                message: 'PayPal Order ID is required'
            });
        }

        const accessToken = await getPayPalToken();

        const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const captureResult = await response.json();

        if (response.ok && captureResult.status === 'COMPLETED') {
            console.log('PayPal payment captured successfully');

            const finalOrderId = orderId || `PAYPAL_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            const newOrder = new Order({
                userId: userId || 'guest',
                orderId: finalOrderId,
                stripePaymentIntentId: `paypal_${orderID}`,
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
            console.log('Order saved to database:', finalOrderId);

            // Clear user's cart
            if (userId !== 'guest') {
                await Cart.findOneAndUpdate(
                    { userId: userId },
                    { items: [], updatedAt: new Date() }
                );
                console.log('Cart cleared for user:', userId);
            }

            // Update product inventory and sales
            for (const item of items) {
                await Product.findOneAndUpdate(
                    { id: item.id },
                    { 
                        $inc: { 
                            stock_quantity: -item.quantity,
                            sales_count: item.quantity
                        }
                    }
                );

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

            console.log('Inventory and sales updated');

            // Send order confirmation email
            try {
                await sendOrderConfirmationEmail(newOrder);
                console.log(`Order confirmation email sent for PayPal order: ${finalOrderId}`);
            } catch (emailError) {
                console.error('Email sending failed:', emailError);
            }

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
            console.error('PayPal capture failed:', captureResult);
            res.status(400).json({
                success: false,
                message: 'PayPal payment capture failed',
                details: captureResult
            });
        }

    } catch (error) {
        console.error('PayPal capture error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to capture PayPal payment',
            error: error.message
        });
    }
};

// Test PayPal connection
const testPayPal = async (req, res) => {
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
};

// Test email service
const testEmail = async (req, res) => {
    try {
        const { to = 'test@example.com', subject = 'Test Email from Pink Dreams Railway' } = req.body;
        
        console.log('Testing email service configuration...');
        console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'Configured' : 'Missing');
        console.log('EMAIL_FROM:', process.env.EMAIL_FROM || 'Using default');
        
        const result = await sendTestEmail(to, subject);
        
        res.json({
            success: true,
            message: 'Email sent successfully from Railway using Resend!',
            messageId: result.messageId,
            service: 'Resend',
            from: process.env.EMAIL_FROM || 'noreply@resend.dev',
            to: to,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Email test failed:', error);
        res.status(500).json({
            success: false,
            message: 'Email test failed',
            error: error.message,
            service: process.env.RESEND_API_KEY ? 'Resend (configured)' : 'Gmail (fallback - will fail)'
        });
    }
};

module.exports = {
    createPaymentIntent,
    confirmPayment,
    createPayPalOrder,
    capturePayPalOrder,
    testPayPal,
    testEmail
};