// utils/emailService.js - Complete Resend Integration
const nodemailer = require('nodemailer');
require('dotenv').config();

// Create email transporter with Resend priority
const createTransporter = () => {
    // Check for Resend API key first (recommended)
    if (process.env.RESEND_API_KEY) {
        console.log('📧 Using Resend for email delivery');
        return nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 587,
            secure: false, // Use TLS
            auth: {
                user: 'resend',
                pass: process.env.RESEND_API_KEY
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }
    
    // Fallback to SendGrid if configured
    if (process.env.SENDGRID_API_KEY) {
        console.log('📧 Using SendGrid for email delivery');
        return nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            secure: false,
            auth: {
                user: 'apikey',
                pass: process.env.SENDGRID_API_KEY
            }
        });
    }
    
    // Final fallback to Gmail (will fail in production)
    console.warn('⚠️ No production email service configured. Using Gmail SMTP - this will fail in production.');
    console.warn('⚠️ Add RESEND_API_KEY environment variable for production email delivery.');
    
    return nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD
        },
        tls: {
            rejectUnauthorized: false
        }
    });
};

// Enhanced email sending with retry logic
const sendEmailWithRetry = async (mailOptions, maxRetries = 2) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`📧 Email attempt ${attempt}/${maxRetries} to ${mailOptions.to}`);
            
            const transporter = createTransporter();
            
            // Validate required fields
            if (!mailOptions.from) {
                mailOptions.from = `"Pink Dreams Store" <${process.env.EMAIL_FROM || 'noreply@resend.dev'}>`;
            }
            
            if (!mailOptions.to) {
                throw new Error('No recipient email address provided');
            }
            
            // Set timeout for email sending
            const sendPromise = transporter.sendMail(mailOptions);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Email sending timeout after 15 seconds')), 15000)
            );
            
            const result = await Promise.race([sendPromise, timeoutPromise]);
            
            console.log(`✅ Email sent successfully to ${mailOptions.to} on attempt ${attempt}`);
            console.log(`📧 Message ID: ${result.messageId}`);
            
            return result;
            
        } catch (error) {
            console.error(`❌ Email attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                throw new Error(`Email failed after ${maxRetries} attempts: ${error.message}`);
            }
            
            // Wait before retry (exponential backoff)
            const delay = attempt * 1000;
            console.log(`⏱️ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Order confirmation email template
const sendOrderConfirmationEmail = async (order) => {
    try {
        console.log('📧 Preparing order confirmation email for order:', order.orderId);
        
        // Get customer email
        const customerEmail = order.shippingAddress?.email || order.billingAddress?.email;
        
        if (!customerEmail) {
            throw new Error(`No customer email found in order ${order.orderId}`);
        }
        
        // Calculate totals safely
        const subtotal = order.amount?.subtotal || order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
        const shipping = order.amount?.shipping || 0;
        const tax = order.amount?.tax || 0;
        const total = order.amount?.total || (subtotal + shipping + tax);
        
        const mailOptions = {
            from: `"Pink Dreams Store" <${process.env.EMAIL_FROM || 'noreply@resend.dev'}>`,
            to: customerEmail,
            subject: `Order Confirmation - ${order.orderId} | Pink Dreams`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Order Confirmation</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9fafb;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: white;">
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 40px 20px; text-align: center;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Thank You for Your Order!</h1>
                            <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">Your order has been confirmed and is being processed</p>
                        </div>
                        
                        <!-- Order Summary -->
                        <div style="padding: 30px 20px;">
                            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #ec4899;">
                                <h2 style="color: #ec4899; margin: 0 0 15px 0; font-size: 20px;">Order Details</h2>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 5px 0; color: #6b7280;"><strong>Order Number:</strong></td>
                                        <td style="padding: 5px 0; text-align: right; color: #374151;">${order.orderId}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 5px 0; color: #6b7280;"><strong>Order Date:</strong></td>
                                        <td style="padding: 5px 0; text-align: right; color: #374151;">${new Date(order.createdAt).toLocaleDateString('en-US', { 
                                            year: 'numeric', 
                                            month: 'long', 
                                            day: 'numeric' 
                                        })}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 5px 0; color: #6b7280;"><strong>Payment Method:</strong></td>
                                        <td style="padding: 5px 0; text-align: right; color: #374151;">${order.paymentMethod === 'stripe' ? 'Credit Card' : order.paymentMethod === 'paypal' ? 'PayPal' : 'Credit Card'}</td>
                                    </tr>
                                </table>
                            </div>

                            <!-- Items -->
                            <h3 style="color: #374151; margin: 0 0 15px 0; font-size: 18px;">Items Ordered</h3>
                            <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                                ${order.items?.map((item, index) => `
                                    <div style="padding: 15px; ${index > 0 ? 'border-top: 1px solid #e5e7eb;' : ''} display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <div style="font-weight: bold; color: #374151; margin-bottom: 5px;">${item.name || 'Unknown Item'}</div>
                                            <div style="color: #6b7280; font-size: 14px;">Quantity: ${item.quantity || 1}</div>
                                        </div>
                                        <div style="text-align: right;">
                                            <div style="font-weight: bold; color: #374151;">$${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</div>
                                            <div style="color: #6b7280; font-size: 14px;">$${(item.price || 0).toFixed(2)} each</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>

                            <!-- Order Total -->
                            <div style="margin-top: 20px; padding: 20px; background: #f0f9ff; border-radius: 8px;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 5px 0; color: #6b7280;">Subtotal:</td>
                                        <td style="padding: 5px 0; text-align: right; color: #374151;">$${subtotal.toFixed(2)}</td>
                                    </tr>
                                    ${shipping > 0 ? `
                                    <tr>
                                        <td style="padding: 5px 0; color: #6b7280;">Shipping:</td>
                                        <td style="padding: 5px 0; text-align: right; color: #374151;">$${shipping.toFixed(2)}</td>
                                    </tr>
                                    ` : ''}
                                    ${tax > 0 ? `
                                    <tr>
                                        <td style="padding: 5px 0; color: #6b7280;">Tax:</td>
                                        <td style="padding: 5px 0; text-align: right; color: #374151;">$${tax.toFixed(2)}</td>
                                    </tr>
                                    ` : ''}
                                    <tr style="border-top: 2px solid #e5e7eb;">
                                        <td style="padding: 10px 0 5px 0; font-weight: bold; color: #374151; font-size: 18px;">Total:</td>
                                        <td style="padding: 10px 0 5px 0; text-align: right; font-weight: bold; color: #ec4899; font-size: 18px;">$${total.toFixed(2)}</td>
                                    </tr>
                                </table>
                            </div>

                            <!-- Shipping Address -->
                            ${order.shippingAddress ? `
                            <div style="margin-top: 25px; padding: 20px; background: #f9fafb; border-radius: 8px;">
                                <h3 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">Shipping Address</h3>
                                <div style="color: #6b7280; line-height: 1.5;">
                                    ${order.shippingAddress.name || ''}<br>
                                    ${order.shippingAddress.address || ''}<br>
                                    ${order.shippingAddress.city || ''}, ${order.shippingAddress.state || ''} ${order.shippingAddress.zipCode || ''}<br>
                                    ${order.shippingAddress.country || ''}
                                </div>
                            </div>
                            ` : ''}

                            <!-- Next Steps -->
                            <div style="margin-top: 25px; padding: 20px; background: #ecfdf5; border-radius: 8px; border-left: 4px solid #10b981;">
                                <h3 style="color: #059669; margin: 0 0 15px 0; font-size: 16px;">What Happens Next?</h3>
                                <div style="color: #065f46; line-height: 1.6;">
                                    <p style="margin: 8px 0;">✅ Your payment has been processed successfully</p>
                                    <p style="margin: 8px 0;">📦 Your order is now being prepared for shipment</p>
                                    <p style="margin: 8px 0;">🚚 You'll receive tracking information once your order ships</p>
                                    <p style="margin: 8px 0;">💬 We'll keep you updated on your order status</p>
                                </div>
                            </div>

                            <!-- Contact Info -->
                            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                                <p style="color: #6b7280; margin: 0 0 10px 0;">Questions about your order?</p>
                                <p style="margin: 0;">
                                    Email us at <a href="mailto:${process.env.EMAIL_FROM || 'support@pink-dreams.com'}" style="color: #ec4899; text-decoration: none;">${process.env.EMAIL_FROM || 'support@pink-dreams.com'}</a>
                                </p>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div style="background: #374151; color: #d1d5db; padding: 20px; text-align: center; font-size: 14px;">
                            <p style="margin: 0;">© 2024 Pink Dreams Fashion Store. All rights reserved.</p>
                            <p style="margin: 5px 0 0 0;">Thank you for shopping with us!</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            // Plain text fallback
            text: `
Order Confirmation - ${order.orderId}

Thank you for your order! Your order has been confirmed and is being processed.

Order Details:
- Order Number: ${order.orderId}
- Order Date: ${new Date(order.createdAt).toLocaleDateString()}
- Total: $${total.toFixed(2)}

Items:
${order.items?.map(item => `- ${item.name} (Qty: ${item.quantity}) - $${((item.price || 0) * (item.quantity || 1)).toFixed(2)}`).join('\n')}

We'll send you tracking information once your order ships.

Questions? Contact us at ${process.env.EMAIL_FROM || 'support@pink-dreams.com'}

Pink Dreams Fashion Store
            `
        };

        await sendEmailWithRetry(mailOptions);
        console.log(`✅ Order confirmation email sent successfully to ${customerEmail}`);
        
    } catch (error) {
        console.error('❌ Failed to send order confirmation email:', error);
        throw error;
    }
};

// Order status update email
const sendOrderStatusEmail = async (order, newStatus) => {
    try {
        const customerEmail = order.shippingAddress?.email || order.billingAddress?.email;
        
        if (!customerEmail) {
            console.log('⚠️ No customer email found for status update');
            return;
        }

        const statusInfo = {
            'confirmed': { 
                title: 'Order Confirmed', 
                message: 'Your order has been confirmed and will be processed soon.',
                color: '#0369a1',
                bgcolor: '#eff6ff'
            },
            'processing': { 
                title: 'Order Processing', 
                message: 'Your order is currently being processed and prepared for shipping.',
                color: '#7c3aed',
                bgcolor: '#f3e8ff'
            },
            'shipped': { 
                title: 'Order Shipped', 
                message: 'Great news! Your order has been shipped and is on its way to you.',
                color: '#059669',
                bgcolor: '#ecfdf5'
            },
            'delivered': { 
                title: 'Order Delivered', 
                message: 'Your order has been successfully delivered. We hope you love your purchase!',
                color: '#059669',
                bgcolor: '#ecfdf5'
            },
            'cancelled': { 
                title: 'Order Cancelled', 
                message: 'Your order has been cancelled. If you have any questions, please contact us.',
                color: '#dc2626',
                bgcolor: '#fef2f2'
            }
        };

        const info = statusInfo[newStatus] || {
            title: 'Order Update',
            message: `Your order status has been updated to: ${newStatus}`,
            color: '#6b7280',
            bgcolor: '#f9fafb'
        };

        const mailOptions = {
            from: `"Pink Dreams Store" <${process.env.EMAIL_FROM || 'noreply@resend.dev'}>`,
            to: customerEmail,
            subject: `${info.title} - ${order.orderId} | Pink Dreams`,
            html: `
                <!DOCTYPE html>
                <html>
                <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9fafb;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: white;">
                        <div style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 30px 20px; text-align: center;">
                            <h1 style="margin: 0; font-size: 24px;">${info.title}</h1>
                        </div>
                        
                        <div style="padding: 30px 20px;">
                            <p>Hi ${order.shippingAddress?.name || 'Customer'},</p>
                            
                            <div style="background: ${info.bgcolor}; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${info.color};">
                                <h2 style="color: ${info.color}; margin: 0 0 10px 0; font-size: 18px;">${info.title}</h2>
                                <p style="margin: 0; color: #374151;">${info.message}</p>
                            </div>

                            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p style="margin: 0;"><strong>Order:</strong> ${order.orderId}</p>
                                <p style="margin: 5px 0 0 0;"><strong>Updated:</strong> ${new Date().toLocaleDateString()}</p>
                            </div>

                            <p>Thank you for choosing Pink Dreams Store!</p>
                            
                            <div style="margin-top: 30px; text-align: center;">
                                <p style="color: #6b7280;">Questions? Contact us at <a href="mailto:${process.env.EMAIL_FROM || 'support@pink-dreams.com'}" style="color: #ec4899;">${process.env.EMAIL_FROM || 'support@pink-dreams.com'}</a></p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await sendEmailWithRetry(mailOptions);
        console.log(`✅ Status update email sent to ${customerEmail} for status: ${newStatus}`);
        
    } catch (error) {
        console.error('❌ Failed to send status update email:', error);
        // Don't throw error for status updates - they're not critical
    }
};

// Test email function
const sendTestEmail = async (to, subject = 'Test Email from Pink Dreams') => {
    const mailOptions = {
        from: `"Pink Dreams Store" <${process.env.EMAIL_FROM || 'noreply@resend.dev'}>`,
        to: to,
        subject: subject,
        html: `
            <!DOCTYPE html>
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 40px;">
                <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <div style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 30px; text-align: center;">
                        <h1 style="margin: 0; font-size: 28px;">🎉 Success!</h1>
                        <p style="margin: 10px 0 0; opacity: 0.9;">Email service is working perfectly</p>
                    </div>
                    <div style="padding: 30px; text-align: center;">
                        <p style="color: #374151; font-size: 16px; margin: 0 0 15px 0;">
                            This test email was sent successfully from your Railway production server using Resend!
                        </p>
                        <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="color: #065f46; margin: 0; font-size: 14px;">
                                ✅ Email Service: Active<br>
                                📧 Provider: Resend<br>
                                🚀 Environment: Production<br>
                                🕒 Sent: ${new Date().toLocaleString()}
                            </p>
                        </div>
                        <p style="color: #6b7280; font-size: 14px; margin: 0;">
                            Your Pink Dreams store is ready to send order confirmations!
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `,
        text: `
🎉 Email Service Test - Success!

This test email was sent successfully from your Railway production server using Resend.

✅ Email Service: Active
📧 Provider: Resend  
🚀 Environment: Production
🕒 Sent: ${new Date().toLocaleString()}

Your Pink Dreams store is ready to send order confirmations!
        `
    };

    return await sendEmailWithRetry(mailOptions);
};

module.exports = {
    sendOrderConfirmationEmail,
    sendOrderStatusEmail,
    sendTestEmail,
    createTransporter
};