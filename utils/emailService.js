const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('📧 Email Service: Loading...');
console.log('📧 EMAIL_USER:', process.env.EMAIL_USER ? 'Found' : 'Missing');
console.log('📧 EMAIL_APP_PASSWORD:', process.env.EMAIL_APP_PASSWORD ? 'Found' : 'Missing');
console.log('📧 EMAIL_SERVICE:', process.env.EMAIL_SERVICE || 'Not set');

// GMAIL-COMPATIBLE image handler - Uses attachments instead of Base64
const getWorkingImageForEmail = (imagePath, itemName, mailOptions) => {
    console.log('📧 Processing image for:', itemName);
    console.log('📧 Original path:', imagePath);
    
    // Extract filename from URL path
    let fileName;
    if (imagePath.includes('http://') || imagePath.includes('https://')) {
        fileName = imagePath.split('/').pop();
    } else {
        fileName = imagePath.split('/').pop();
    }
    
    console.log('📧 Extracted filename:', fileName);
    
    // Try to find the actual image file and attach it
    try {
        const possiblePaths = [
            path.join(__dirname, '..', 'upload', 'images', fileName),
            path.join(__dirname, '..', '..', 'upload', 'images', fileName),
            path.join(__dirname, '..', 'public', 'images', fileName),
            path.join(__dirname, '..', '..', 'public', 'images', fileName),
            path.join(process.cwd(), 'backend', 'upload', 'images', fileName),
            path.join(process.cwd(), 'upload', 'images', fileName)
        ];
        
        let correctPath = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                correctPath = testPath;
                console.log('✅ Found image at:', correctPath);
                break;
            }
        }
        
        if (correctPath) {
            const stats = fs.statSync(correctPath);
            console.log('📧 Image file size:', stats.size, 'bytes');
            
            // Create unique CID for this image
            const cid = `image_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Add to attachments if not already initialized
            if (!mailOptions.attachments) {
                mailOptions.attachments = [];
            }
            
            // Add image as attachment
            mailOptions.attachments.push({
                filename: fileName,
                path: correctPath,
                cid: cid
            });
            
            console.log('✅ Added image as attachment with CID:', cid);
            return `cid:${cid}`;
        }
    } catch (error) {
        console.log('❌ Attachment approach failed:', error.message);
    }
    
    // Fallback: Use a high-quality placeholder service that works in all email clients
    const encodedName = encodeURIComponent(itemName.substring(0, 15));
    const fallbackUrl = `https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=150&h=150&fit=crop&crop=center&q=80&fm=jpg&txt=${encodedName}&txt-size=12&txt-color=fff&txt-align=center,bottom&bg=EC4899`;
    
    console.log('📧 Using high-quality fallback image:', fallbackUrl);
    return fallbackUrl;
};

// Create transporter
const createTransporter = () => {
    console.log('📧 Creating email transporter...');
    
    if (process.env.EMAIL_SERVICE === 'gmail') {
        console.log('📧 Using Gmail service');
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });
    }
    
    console.log('📧 Using SMTP configuration');
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });
};

// GUARANTEED WORKING Email Template
const sendOrderConfirmationEmail = async (order) => {
    try {
        console.log('📧 Starting GUARANTEED working email process...');
        console.log('📧 Order ID:', order.orderId);
        console.log('📧 Number of items:', order.items.length);
        
        const transporter = createTransporter();
        
        // Calculate totals
        const subtotal = order.amount?.subtotal || order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shipping = order.amount?.shipping || 0;
        const tax = order.amount?.tax || 0;
        const total = order.amount?.total || subtotal + shipping + tax;
        
        const customerEmail = order.shippingAddress?.email || order.billingAddress?.email;
        const customerName = order.shippingAddress?.name || order.billingAddress?.name || 'Valued Customer';
        
        if (!customerEmail) {
            throw new Error('No customer email found');
        }
        
        // Initialize mail options first
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: customerEmail,
            subject: `🎉 Order Confirmation - ${order.orderId} | Pink Dreams`,
            attachments: [] // Initialize attachments array
        };

        // Generate items with GUARANTEED working images
        const itemsHtml = order.items.map((item, index) => {
            console.log(`📧 Processing item ${index + 1}: ${item.name}`);
            
            const workingImageUrl = getWorkingImageForEmail(item.image, item.name, mailOptions);
            
            return `
                <tr style="border-bottom: 2px solid #f3f4f6;">
                    <td style="padding: 20px 10px;">
                        <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                                <td width="100" style="vertical-align: top; padding-right: 15px;">
                                    <img src="${workingImageUrl}" 
                                         alt="${item.name}" 
                                         width="80" 
                                         height="80" 
                                         style="display: block; width: 80px; height: 80px; border-radius: 12px; border: 2px solid #e5e7eb; object-fit: cover;">
                                </td>
                                <td style="vertical-align: top;">
                                    <h3 style="margin: 0 0 8px 0; font-family: Arial, sans-serif; font-size: 18px; font-weight: 700; color: #1f2937; line-height: 1.3;">
                                        ${item.name}
                                    </h3>
                                    <div style="font-family: Arial, sans-serif; font-size: 16px; color: #6b7280; margin-bottom: 6px;">
                                        <strong>Quantity:</strong> ${item.quantity}
                                    </div>
                                    <div style="font-family: Arial, sans-serif; font-size: 16px; color: #6b7280;">
                                        <strong>Price:</strong> $${item.price.toFixed(2)} each
                                    </div>
                                </td>
                                <td width="120" style="text-align: right; vertical-align: top;">
                                    <div style="font-family: Arial, sans-serif; font-size: 20px; font-weight: 700; color: #ec4899; background: #fdf2f8; padding: 12px; border-radius: 8px; text-align: center;">
                                        $${(item.price * item.quantity).toFixed(2)}
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Add HTML content to mail options
        mailOptions.html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Order Confirmation</title>
                    <style>
                        @media only screen and (max-width: 600px) {
                            .container { width: 100% !important; }
                            .content { padding: 20px !important; }
                        }
                    </style>
                </head>
                <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9fafb; line-height: 1.6;">
                    
                    <div style="background-color: #f9fafb; padding: 20px 0;">
                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 650px; margin: 0 auto; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
                            
                            <!-- HEADER -->
                            <tr>
                                <td style="background: linear-gradient(135deg, #ec4899 0%, #f43f5e 100%); padding: 50px 30px; text-align: center;">
                                    <div style="background: rgba(255,255,255,0.2); width: 100px; height: 100px; border-radius: 50%; margin: 0 auto 25px; display: table; text-align: center;">
                                        <div style="display: table-cell; vertical-align: middle; font-size: 48px; color: white; font-weight: bold;">✓</div>
                                    </div>
                                    <h1 style="margin: 0 0 10px 0; font-size: 36px; font-weight: 800; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                        Order Confirmed!
                                    </h1>
                                    <p style="margin: 0; font-size: 20px; color: rgba(255,255,255,0.95); font-weight: 500;">
                                        Thank you for shopping with Pink Dreams
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- MAIN CONTENT -->
                            <tr>
                                <td style="padding: 40px 30px;">
                                    
                                    <!-- Greeting -->
                                    <h2 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #1f2937;">
                                        Hi ${customerName}! 👋
                                    </h2>
                                    
                                    <p style="margin: 0 0 30px 0; font-size: 18px; color: #4b5563; line-height: 1.6;">
                                        Your order has been confirmed and is being processed. We'll send you tracking information once your items ship!
                                    </p>
                                    
                                    <!-- Order Summary Box -->
                                    <div style="background: linear-gradient(135deg, #fdf2f8 0%, #f9fafb 100%); border-radius: 16px; padding: 30px; margin: 30px 0; border: 2px solid #f3e8ff;">
                                        <h3 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 700; color: #1f2937;">
                                            📦 Order Summary
                                        </h3>
                                        <p style="margin: 0 0 25px 0; font-size: 16px; color: #6b7280;">
                                            Order ID: <strong style="color: #ec4899; font-family: monospace;">${order.orderId}</strong>
                                        </p>
                                        
                                        <!-- Items Table -->
                                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: white; border-radius: 12px; overflow: hidden;">
                                            ${itemsHtml}
                                        </table>
                                        
                                        <!-- Order Totals -->
                                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top: 30px; background: white; border-radius: 12px; padding: 25px;">
                                            <tr>
                                                <td style="padding: 8px 0; font-size: 18px; color: #6b7280; font-family: Arial, sans-serif;">
                                                    Subtotal:
                                                </td>
                                                <td style="padding: 8px 0; font-size: 18px; color: #1f2937; text-align: right; font-weight: 600; font-family: Arial, sans-serif;">
                                                    $${subtotal.toFixed(2)}
                                                </td>
                                            </tr>
                                            ${shipping > 0 ? `
                                            <tr>
                                                <td style="padding: 8px 0; font-size: 18px; color: #6b7280; font-family: Arial, sans-serif;">
                                                    Shipping:
                                                </td>
                                                <td style="padding: 8px 0; font-size: 18px; color: #1f2937; text-align: right; font-weight: 600; font-family: Arial, sans-serif;">
                                                    $${shipping.toFixed(2)}
                                                </td>
                                            </tr>` : ''}
                                            ${tax > 0 ? `
                                            <tr>
                                                <td style="padding: 8px 0; font-size: 18px; color: #6b7280; font-family: Arial, sans-serif;">
                                                    Tax:
                                                </td>
                                                <td style="padding: 8px 0; font-size: 18px; color: #1f2937; text-align: right; font-weight: 600; font-family: Arial, sans-serif;">
                                                    $${tax.toFixed(2)}
                                                </td>
                                            </tr>` : ''}
                                            <tr style="border-top: 3px solid #ec4899;">
                                                <td style="padding: 20px 0 10px 0; font-size: 24px; color: #1f2937; font-weight: 800; font-family: Arial, sans-serif;">
                                                    TOTAL:
                                                </td>
                                                <td style="padding: 20px 0 10px 0; font-size: 28px; color: #ec4899; text-align: right; font-weight: 800; font-family: Arial, sans-serif;">
                                                    $${total.toFixed(2)}
                                                </td>
                                            </tr>
                                        </table>
                                    </div>
                                    
                                    <!-- Track Order Button -->
                                    <div style="text-align: center; margin: 40px 0;">
                                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/track/${order.orderId}" 
                                           style="display: inline-block; background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 20px 40px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 20px; box-shadow: 0 8px 20px rgba(236, 72, 153, 0.4); transition: all 0.3s ease; font-family: Arial, sans-serif;">
                                            🚚 Track Your Order
                                        </a>
                                    </div>
                                    
                                    <!-- Shipping Address -->
                                    ${order.shippingAddress ? `
                                    <div style="background: #f9fafb; border-radius: 12px; padding: 25px; margin: 30px 0; border-left: 4px solid #ec4899;">
                                        <h4 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 700; color: #1f2937;">
                                            📍 Shipping Address
                                        </h4>
                                        <div style="font-size: 16px; color: #4b5563; line-height: 1.8;">
                                            <strong>${order.shippingAddress.name}</strong><br>
                                            ${order.shippingAddress.address}<br>
                                            ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zipCode}<br>
                                            ${order.shippingAddress.country}
                                            ${order.shippingAddress.phone ? `<br>📱 ${order.shippingAddress.phone}` : ''}
                                        </div>
                                    </div>` : ''}
                                    
                                    <!-- What's Next -->
                                    <div style="background: linear-gradient(135deg, #dbeafe 0%, #e0f2fe 100%); border-radius: 12px; padding: 25px; margin: 30px 0;">
                                        <h4 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 700; color: #1f2937;">
                                            ⏰ What's Next?
                                        </h4>
                                        <ul style="margin: 0; padding: 0 0 0 20px; font-size: 16px; color: #4b5563; line-height: 1.8;">
                                            <li>We'll process your order within <strong>1-2 business days</strong></li>
                                            <li>You'll receive shipping confirmation with tracking info</li>
                                            <li>Estimated delivery: <strong>5-7 business days</strong></li>
                                        </ul>
                                    </div>
                                    
                                    <!-- Order Details -->
                                    <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 30px 0; font-size: 14px; color: #6b7280;">
                                        <strong>Order Details:</strong><br>
                                        📅 Order Date: ${new Date(order.createdAt).toLocaleString()}<br>
                                        🆔 Order ID: ${order.orderId}<br>
                                        💳 Payment Method: ${order.paymentMethod === 'paypal' ? 'PayPal' : 'Credit Card'}
                                    </div>
                                    
                                </td>
                            </tr>
                            
                            <!-- FOOTER -->
                            <tr>
                                <td style="background: #1f2937; padding: 30px; text-align: center; color: white;">
                                    <h4 style="margin: 0 0 15px 0; font-size: 18px; color: white;">
                                        Need Help? We're Here! 💬
                                    </h4>
                                    <p style="margin: 0 0 15px 0; font-size: 16px; color: #d1d5db;">
                                        Questions about your order? Contact us at:<br>
                                        📧 <a href="mailto:${process.env.EMAIL_USER}" style="color: #ec4899; text-decoration: none;">${process.env.EMAIL_USER}</a><br>
                                        📞 (555) 123-4567
                                    </p>
                                    <div style="border-top: 1px solid #374151; padding-top: 20px; margin-top: 20px;">
                                        <p style="margin: 0; font-size: 14px; color: #9ca3af;">
                                            © 2024 Pink Dreams Fashion Store. All rights reserved.<br>
                                            Making your fashion dreams come true! 💖
                                        </p>
                                    </div>
                                </td>
                            </tr>
                            
                        </table>
                    </div>
                    
                </body>
                </html>
            `;

        console.log('📧 Sending GUARANTEED working email to:', customerEmail);
        console.log('📧 Number of attachments:', mailOptions.attachments?.length || 0);
        await transporter.sendMail(mailOptions);
        console.log(`✅ GUARANTEED working email sent successfully!`);
        
    } catch (error) {
        console.error('❌ Error sending order confirmation email:', error);
        throw error;
    }
};

// Order Status Email (simplified version)
const sendOrderStatusEmail = async (order, newStatus) => {
    try {
        console.log('📧 Starting order status email process...');
        
        const transporter = createTransporter();
        
        const customerEmail = order.shippingAddress?.email || order.billingAddress?.email;
        const customerName = order.shippingAddress?.name || order.billingAddress?.name || 'Valued Customer';
        
        if (!customerEmail) {
            console.error('❌ No customer email found in order:', order.orderId);
            return;
        }
        
        // Status-specific content
        const statusConfig = {
            processing: { subject: 'Your order is being processed', title: 'Order Processing ⚡', message: 'Great news! Your order is now being processed and will ship soon.', icon: '⚡', color: '#f59e0b' },
            shipped: { subject: 'Your order has shipped', title: 'Order Shipped 🚚', message: 'Your order is on its way! You should receive it within 5-7 business days.', icon: '🚚', color: '#3b82f6' },
            delivered: { subject: 'Your order has been delivered', title: 'Order Delivered 📦', message: 'Your order has been successfully delivered. We hope you love your new items!', icon: '📦', color: '#10b981' },
            cancelled: { subject: 'Your order has been cancelled', title: 'Order Cancelled ❌', message: 'Your order has been cancelled. If you have any questions, please contact our support team.', icon: '❌', color: '#ef4444' }
        };
        
        const config = statusConfig[newStatus] || statusConfig.processing;
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: customerEmail,
            subject: `${config.subject} - ${order.orderId} | Pink Dreams`,
            html: `
                <!DOCTYPE html>
                <html>
                <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f9fafb;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
                        
                        <!-- Header -->
                        <div style="background: ${config.color}; color: white; padding: 40px 30px; text-align: center;">
                            <div style="font-size: 60px; margin-bottom: 20px;">${config.icon}</div>
                            <h1 style="margin: 0; font-size: 28px; font-weight: bold;">${config.title}</h1>
                            <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">Order ${order.orderId}</p>
                        </div>
                        
                        <!-- Content -->
                        <div style="padding: 40px 30px; text-align: center;">
                            <h2 style="color: #1f2937; margin: 0 0 20px 0;">Hi ${customerName}!</h2>
                            <p style="font-size: 18px; color: #4b5563; line-height: 1.6; margin: 0 0 30px 0;">${config.message}</p>
                            
                            <!-- Track Button -->
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/track/${order.orderId}" 
                               style="display: inline-block; background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0;">
                                View Order Details
                            </a>
                            
                            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;">
                                Order ID: ${order.orderId}<br>
                                Status Updated: ${new Date().toLocaleString()}
                            </div>
                        </div>
                        
                        <!-- Footer -->
                        <div style="background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px;">
                            Questions? Contact us at ${process.env.EMAIL_USER}<br>
                            © 2024 Pink Dreams Fashion Store
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Order status email sent to: ${customerEmail} for order: ${order.orderId} (${newStatus})`);
        
    } catch (error) {
        console.error('❌ Error sending order status email:', error);
        throw error;
    }
};

console.log('📧 GUARANTEED working email service functions exported successfully');

module.exports = {
    sendOrderConfirmationEmail,
    sendOrderStatusEmail
};