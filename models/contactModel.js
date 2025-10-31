const mongoose = require('mongoose');

const Contact = mongoose.model("Contact", {
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    inquiryType: {
        type: String,
        enum: ['general', 'support', 'business', 'feedback'],
        default: 'general'
    },
    status: {
        type: String,
        enum: ['new', 'read', 'replied', 'resolved'],
        default: 'new'
    },
    ipAddress: {
        type: String,
        default: ''
    },
    userAgent: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    repliedAt: {
        type: Date
    }
});



// Replace your existing /test/email endpoint with this enhanced version
app.post('/test/email', async (req, res) => {
    try {
        const { to = 'test@example.com', subject = 'Test Email from Pink Dreams Railway' } = req.body;
        
        console.log('🧪 Testing email service configuration...');
        console.log('📧 RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'Configured ✅' : 'Missing ❌');
        console.log('📧 EMAIL_FROM:', process.env.EMAIL_FROM || 'Using default');
        
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
        console.error('❌ Email test failed:', error);
        res.status(500).json({
            success: false,
            message: 'Email test failed',
            error: error.message,
            service: process.env.RESEND_API_KEY ? 'Resend (configured)' : 'Gmail (fallback - will fail)'
        });
    }
});

// Middleware to get client IP
const getClientIP = (req) => {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null);
};

// API endpoint to handle contact form submissions
app.post('/contact/submit', async (req, res) => {
    try {
        const { name, email, subject, message, inquiryType } = req.body;

        console.log('📧 Processing contact form submission from:', email);

        // Validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        // Message length validation
        if (message.length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Message must be at least 10 characters long'
            });
        }

        // Create contact record in database
        const contact = new Contact({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            subject: subject.trim(),
            message: message.trim(),
            inquiryType: inquiryType || 'general',
            ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
            userAgent: req.headers['user-agent'] || ''
        });

        await contact.save();
        console.log('✅ Contact form saved to database:', contact._id);

        // Send emails using Resend HTTP API (same as order confirmations)
        try {
            console.log('📧 Sending contact form emails using Resend API...');

            // Email to admin/business owner
            const adminMailOptions = {
                from: `"Pink Dreams Store" <${process.env.EMAIL_FROM || 'noreply@resend.dev'}>`,
                to: process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || 'admin@pink-dreams.com',
                subject: `New Contact Form Submission: ${subject}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>New Contact Form Submission</title>
                    </head>
                    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9fafb;">
                        <div style="max-width: 600px; margin: 0 auto; background-color: white;">
                            <!-- Header -->
                            <div style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 30px 20px; text-align: center;">
                                <h1 style="margin: 0; font-size: 24px;">📩 New Contact Form Submission</h1>
                                <p style="margin: 10px 0 0; opacity: 0.9;">Someone has sent you a message</p>
                            </div>
                            
                            <!-- Content -->
                            <div style="padding: 30px 20px;">
                                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ec4899;">
                                    <h2 style="color: #ec4899; margin: 0 0 15px 0; font-size: 18px;">Contact Details</h2>
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Name:</td>
                                            <td style="padding: 8px 0; color: #374151;">${name}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Email:</td>
                                            <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #ec4899; text-decoration: none;">${email}</a></td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Subject:</td>
                                            <td style="padding: 8px 0; color: #374151;">${subject}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Inquiry Type:</td>
                                            <td style="padding: 8px 0; color: #374151;">
                                                <span style="background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                                                    ${inquiryType.charAt(0).toUpperCase() + inquiryType.slice(1)}
                                                </span>
                                            </td>
                                        </tr>
                                    </table>
                                </div>
                                
                                <!-- Message -->
                                <div style="margin-bottom: 20px;">
                                    <h3 style="color: #374151; margin: 0 0 10px 0; font-size: 16px;">Message:</h3>
                                    <div style="background: #f9fafb; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
                                        <p style="color: #374151; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message}</p>
                                    </div>
                                </div>
                                
                                <!-- Quick Actions -->
                                <div style="text-align: center; margin: 25px 0;">
                                    <a href="mailto:${email}?subject=Re: ${subject}" 
                                       style="display: inline-block; background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 0 10px;">
                                        Reply to Customer
                                    </a>
                                </div>
                                
                                <!-- Admin Info -->
                                <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; font-size: 12px; color: #6b7280;">
                                    <p style="margin: 5px 0;"><strong>Submission Details:</strong></p>
                                    <p style="margin: 5px 0;">📅 Date: ${new Date().toLocaleString()}</p>
                                    <p style="margin: 5px 0;">🌐 IP Address: ${req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown'}</p>
                                    <p style="margin: 5px 0;">🆔 Contact ID: ${contact._id}</p>
                                </div>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
New Contact Form Submission

Name: ${name}
Email: ${email}
Subject: ${subject}
Inquiry Type: ${inquiryType}

Message:
${message}

Submitted: ${new Date().toLocaleString()}
Contact ID: ${contact._id}
                `
            };

            // Auto-reply email to customer
            const customerReplyOptions = {
                from: `"Pink Dreams Store" <${process.env.EMAIL_FROM || 'noreply@resend.dev'}>`,
                to: email,
                subject: `Thank you for contacting us - ${subject}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Thank You for Contacting Us</title>
                    </head>
                    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9fafb;">
                        <div style="max-width: 600px; margin: 0 auto; background-color: white;">
                            <!-- Header -->
                            <div style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 30px 20px; text-align: center;">
                                <h1 style="margin: 0; font-size: 24px;">💕 Thank You!</h1>
                                <p style="margin: 10px 0 0; opacity: 0.9;">We've received your message</p>
                            </div>
                            
                            <!-- Content -->
                            <div style="padding: 30px 20px;">
                                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                                    Dear ${name},
                                </p>
                                
                                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                                    Thank you for reaching out to us! We have received your message and will get back to you as soon as possible.
                                </p>
                                
                                <!-- Message Summary -->
                                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ec4899;">
                                    <h3 style="margin: 0 0 15px 0; color: #ec4899; font-size: 16px;">Your Message Summary:</h3>
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 5px 0; color: #6b7280; font-weight: bold;">Subject:</td>
                                            <td style="padding: 5px 0; color: #374151;">${subject}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 5px 0; color: #6b7280; font-weight: bold;">Inquiry Type:</td>
                                            <td style="padding: 5px 0; color: #374151;">${inquiryType.charAt(0).toUpperCase() + inquiryType.slice(1)}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 5px 0; color: #6b7280; font-weight: bold;">Submitted:</td>
                                            <td style="padding: 5px 0; color: #374151;">${new Date().toLocaleString()}</td>
                                        </tr>
                                    </table>
                                </div>
                                
                                <!-- Response Time -->
                                <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                                    <h3 style="color: #059669; margin: 0 0 10px 0; font-size: 16px;">⏰ Response Time</h3>
                                    <p style="color: #065f46; margin: 0; line-height: 1.6;">
                                        Our typical response time is within <strong>24 hours</strong> during business days (Monday-Friday, 9AM-6PM EST).
                                    </p>
                                </div>
                                
                                <!-- What to do while waiting -->
                                <div style="margin: 25px 0;">
                                    <h3 style="color: #374151; margin: 0 0 15px 0; font-size: 16px;">In the meantime, you can:</h3>
                                    <div style="color: #6b7280; line-height: 1.8;">
                                        <p style="margin: 8px 0;">🛍️ Browse our latest <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="color: #ec4899; text-decoration: none;">product collection</a></p>
                                        <p style="margin: 8px 0;">❓ Check out our <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/faq" style="color: #ec4899; text-decoration: none;">FAQ section</a></p>
                                        <p style="margin: 8px 0;">📱 Follow us on social media for updates and style tips</p>
                                        <p style="margin: 8px 0;">📞 Call us at <strong>+1 (555) 123-4567</strong> for urgent questions</p>
                                    </div>
                                </div>
                                
                                <!-- Closing -->
                                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 25px 0 0 0;">
                                    Best regards,<br>
                                    <strong style="color: #ec4899;">The Pink Dreams Team</strong> 💕
                                </p>
                                
                                <!-- Reference -->
                                <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 30px; font-size: 12px; color: #6b7280;">
                                    <p style="margin: 0;">Reference ID: <strong>${contact._id}</strong></p>
                                    <p style="margin: 5px 0 0 0;">This is an automated response. Please do not reply to this email.</p>
                                </div>
                            </div>
                            
                            <!-- Footer -->
                            <div style="background: #374151; color: #d1d5db; padding: 20px; text-align: center; font-size: 14px;">
                                <p style="margin: 0;">© 2024 Pink Dreams Fashion Store. All rights reserved.</p>
                                <p style="margin: 5px 0 0 0;">Thank you for choosing Pink Dreams! 💕</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
Thank you for contacting us!

Dear ${name},

Thank you for reaching out to us! We have received your message and will get back to you as soon as possible.

Your Message Summary:
- Subject: ${subject}
- Inquiry Type: ${inquiryType}
- Submitted: ${new Date().toLocaleString()}

Response Time:
Our typical response time is within 24 hours during business days (Monday-Friday, 9AM-6PM EST).

Reference ID: ${contact._id}

Best regards,
The Pink Dreams Team

Pink Dreams Fashion Store
                `
            };

            // Send both emails using Resend HTTP API (same method as order confirmations)
            console.log('📧 Sending admin notification email...');
            const adminResult = await sendWithResendAPI(adminMailOptions);
            console.log('✅ Admin email sent successfully. Message ID:', adminResult.messageId);
            
            console.log('📧 Sending customer auto-reply email...');
            const customerResult = await sendWithResendAPI(customerReplyOptions);
            console.log('✅ Customer auto-reply sent successfully. Message ID:', customerResult.messageId);

            // Success response
            res.json({
                success: true,
                message: 'Thank you for your message! We will get back to you soon.',
                contactId: contact._id,
                emailStatus: 'Both emails sent successfully via Resend API'
            });

        } catch (emailError) {
            console.error('❌ Email sending failed:', emailError);
            
            // Still return success since the form was saved to database
            res.json({
                success: true,
                message: 'Thank you for your message! We will get back to you soon.',
                contactId: contact._id,
                emailStatus: 'Form saved but email notification failed. Please check email configuration.',
                emailError: process.env.NODE_ENV === 'development' ? emailError.message : undefined
            });
        }

    } catch (error) {
        console.error('❌ Contact form submission error:', error);
        res.status(500).json({
            success: false,
            message: 'Sorry, there was an error submitting your message. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

console.log('✅ Contact form endpoint updated to use Resend HTTP API');
console.log('📧 Contact form emails will now use the same service as order confirmations');

// API to get all contact submissions (for admin panel)
app.get('/contact/submissions', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const status = req.query.status || 'all';
        const inquiryType = req.query.inquiryType || 'all';

        let query = {};
        if (status !== 'all') {
            query.status = status;
        }
        if (inquiryType !== 'all') {
            query.inquiryType = inquiryType;
        }

        const totalSubmissions = await Contact.countDocuments(query);
        const submissions = await Contact.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            submissions: submissions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalSubmissions / limit),
                totalSubmissions: totalSubmissions
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API to get contact submission by ID
app.get('/contact/submission/:id', async (req, res) => {
    try {
        const submission = await Contact.findById(req.params.id);
        
        if (!submission) {
            return res.json({
                success: false,
                message: 'Submission not found'
            });
        }

        // Mark as read if it's new
        if (submission.status === 'new') {
            submission.status = 'read';
            await submission.save();
        }

        res.json({
            success: true,
            submission: submission
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API to update contact submission status
app.patch('/contact/submission/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!['new', 'read', 'replied', 'resolved'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const submission = await Contact.findByIdAndUpdate(
            req.params.id,
            { 
                status: status,
                repliedAt: status === 'replied' ? new Date() : undefined
            },
            { new: true }
        );

        if (!submission) {
            return res.json({
                success: false,
                message: 'Submission not found'
            });
        }

        res.json({
            success: true,
            submission: submission
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API to get contact statistics
app.get('/contact/stats', async (req, res) => {
    try {
        const totalSubmissions = await Contact.countDocuments();
        const newSubmissions = await Contact.countDocuments({ status: 'new' });
        const resolvedSubmissions = await Contact.countDocuments({ status: 'resolved' });
        
        const inquiryTypeStats = await Contact.aggregate([
            { $group: { _id: '$inquiryType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const monthlyStats = await Contact.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 12 }
        ]);

        res.json({
            success: true,
            stats: {
                totalSubmissions,
                newSubmissions,
                resolvedSubmissions,
                inquiryTypeStats,
                monthlyStats
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API to delete contact submission
app.delete('/contact/submission/:id', async (req, res) => {
    try {
        const submission = await Contact.findByIdAndDelete(req.params.id);
        
        if (!submission) {
            return res.json({
                success: false,
                message: 'Submission not found'
            });
        }

        res.json({
            success: true,
            message: 'Submission deleted successfully'
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Add these endpoints to your backend index.js file

// Newsletter Schema