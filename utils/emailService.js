// utils/emailService.js - REPLACE your existing email configuration with this

const nodemailer = require('nodemailer');
require('dotenv').config();

// Multiple email service configurations for production
const createTransport = () => {
    // Check which email service is configured
    if (process.env.SENDGRID_API_KEY) {
        // SendGrid SMTP (Recommended for production)
        return nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            secure: false,
            auth: {
                user: 'apikey',
                pass: process.env.SENDGRID_API_KEY
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }
    
    if (process.env.RESEND_API_KEY) {
        // Resend SMTP (Modern alternative)
        return nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 587,
            secure: false,
            auth: {
                user: 'resend',
                pass: process.env.RESEND_API_KEY
            }
        });
    }
    
    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
        // Mailgun SMTP
        return nodemailer.createTransport({
            host: 'smtp.mailgun.org',
            port: 587,
            secure: false,
            auth: {
                user: `postmaster@${process.env.MAILGUN_DOMAIN}`,
                pass: process.env.MAILGUN_API_KEY
            }
        });
    }
    
    if (process.env.SMTP2GO_API_KEY) {
        // SMTP2GO (Great free tier)
        return nodemailer.createTransport({
            host: 'mail.smtp2go.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.SMTP2GO_USERNAME,
                pass: process.env.SMTP2GO_API_KEY
            }
        });
    }
    
    // Fallback to Gmail (will fail in production)
    console.warn('⚠️ Using Gmail SMTP - this may fail in production. Consider using SendGrid or Resend.');
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
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
    });
};

// Enhanced email sending with retry logic and timeout
const sendEmailWithRetry = async (mailOptions, maxRetries = 2) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`📧 Email attempt ${attempt}/${maxRetries}`);
            
            const transporter = createTransport();
            
            // Set a timeout for the entire send operation
            const sendPromise = transporter.sendMail(mailOptions);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Email sending timeout after 20 seconds')), 20000)
            );
            
            const result = await Promise.race([sendPromise, timeoutPromise]);
            
            console.log(`✅ Email sent successfully on attempt ${attempt}`);
            return result;
            
        } catch (error) {
            console.error(`❌ Email attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                throw new Error(`Email failed after ${maxRetries} attempts: ${error.message}`);
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
    }
};

// Order confirmation email
const sendOrderConfirmationEmail = async (order) => {
    try {
        const customerEmail = order.shippingAddress?.email || order.billingAddress?.email;
        
        if (!customerEmail) {
            throw new Error('No customer email found in order');
        }

        const mailOptions = {
            from: `"Pink Dreams Store" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to: customerEmail,
            subject: `Order Confirmation - ${order.orderId}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 30px 20px; text-align: center;">
                        <h1 style="margin: 0; font-size: 28px;">Order Confirmed! 🎉</h1>
                        <p style="margin: 10px 0 0; font-size: 16px;">Thank you for your purchase</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border: 1px solid #e5e7eb;">
                        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                            <h2 style="color: #ec4899; margin: 0 0 10px 0;">Order Details</h2>
                            <p><strong>Order Number:</strong> ${order.orderId}</p>
                            <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
                            <p><strong>Total Amount:</strong> $${(order.amount?.total || 0).toFixed(2)}</p>
                        </div>

                        <h3 style="color: #374151; margin-bottom: 15px;">Items Ordered:</h3>
                        ${order.items.map(item => `
                            <div style="border-bottom: 1px solid #e5e7eb; padding: 15px 0; display: flex; align-items: center;">
                                <div>
                                    <strong>${item.name}</strong><br>
                                    <span style="color: #6b7280;">Quantity: ${item.quantity} × $${item.price.toFixed(2)}</span>
                                </div>
                            </div>
                        `).join('')}

                        <div style="margin-top: 25px; padding: 20px; background: #f0f9ff; border-radius: 8px;">
                            <h3 style="color: #0369a1; margin: 0 0 10px 0;">What's Next?</h3>
                            <p style="margin: 5px 0;">✅ Order confirmed and payment processed</p>
                            <p style="margin: 5px 0;">📦 Your order is being prepared for shipping</p>
                            <p style="margin: 5px 0;">🚚 You'll receive a tracking number once shipped</p>
                        </div>

                        <div style="text-align: center; margin-top: 30px;">
                            <p style="color: #6b7280;">Questions about your order?</p>
                            <p>Contact us at <a href="mailto:${process.env.EMAIL_FROM || process.env.EMAIL_USER}" style="color: #ec4899;">${process.env.EMAIL_FROM || process.env.EMAIL_USER}</a></p>
                        </div>
                    </div>
                </div>
            `
        };

        await sendEmailWithRetry(mailOptions);
        console.log(`📧 Order confirmation sent to ${customerEmail}`);
        
    } catch (error) {
        console.error('❌ Order confirmation email failed:', error.message);
        throw error;
    }
};

// Order status update email
const sendOrderStatusEmail = async (order, newStatus) => {
    try {
        const customerEmail = order.shippingAddress?.email || order.billingAddress?.email;
        
        if (!customerEmail) {
            console.log('No customer email found for status update');
            return;
        }

        const statusMessages = {
            'confirmed': 'Your order has been confirmed!',
            'processing': 'Your order is being processed',
            'shipped': 'Your order has been shipped!',
            'delivered': 'Your order has been delivered!',
            'cancelled': 'Your order has been cancelled'
        };

        const mailOptions = {
            from: `"Pink Dreams Store" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to: customerEmail,
            subject: `Order Update - ${order.orderId}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 20px; text-align: center;">
                        <h1 style="margin: 0;">Order Update</h1>
                    </div>
                    
                    <div style="background: white; padding: 30px; border: 1px solid #e5e7eb;">
                        <p>Hi ${order.shippingAddress?.name || 'Customer'},</p>
                        
                        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h2 style="color: #0369a1; margin: 0 0 10px 0;">${statusMessages[newStatus] || `Status updated to: ${newStatus}`}</h2>
                            <p><strong>Order:</strong> ${order.orderId}</p>
                            <p><strong>Updated:</strong> ${new Date().toLocaleDateString()}</p>
                        </div>

                        <p>Thank you for choosing Pink Dreams Store!</p>
                    </div>
                </div>
            `
        };

        await sendEmailWithRetry(mailOptions);
        console.log(`📧 Status update email sent to ${customerEmail}`);
        
    } catch (error) {
        console.error('❌ Status update email failed:', error.message);
        // Don't throw error for status updates - they're not critical
    }
};

// Test email function
const sendTestEmail = async (to, subject = 'Test Email') => {
    const mailOptions = {
        from: `"Pink Dreams Store" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: to,
        subject: subject,
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #ec4899;">🎉 Email Service Working!</h1>
                <p>This test email was sent successfully from your Railway production server.</p>
                <p style="color: #6b7280; font-size: 14px;">Sent at: ${new Date().toLocaleString()}</p>
            </div>
        `
    };

    return await sendEmailWithRetry(mailOptions);
};

module.exports = {
    sendOrderConfirmationEmail,
    sendOrderStatusEmail,
    sendTestEmail,
    createTransport
};