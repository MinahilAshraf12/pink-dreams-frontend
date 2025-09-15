// routes/contactRoutes.js - Contact Routes
const express = require('express');
const router = express.Router();
const { Contact } = require('../models');
const { createTransporter } = require('../utils/emailService');

const getClientIP = (req) => {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null);
};

// Submit contact form
router.post('/submit', async (req, res) => {
    try {
        const { name, email, subject, message, inquiryType } = req.body;

        if (!name || !email || !subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        const contact = new Contact({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            subject: subject.trim(),
            message: message.trim(),
            inquiryType: inquiryType || 'general',
            ipAddress: getClientIP(req),
            userAgent: req.headers['user-agent'] || ''
        });

        await contact.save();

        // Send emails
        try {
            const transporter = createTransporter();
            
            const adminMailOptions = {
                from: process.env.EMAIL_USER,
                to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
                subject: `New Contact Form Submission: ${subject}`,
                html: `
                    <h2>New Contact Form Submission</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Type:</strong> ${inquiryType}</p>
                    <p><strong>Message:</strong></p>
                    <div style="background: #f9fafb; padding: 15px; border-radius: 4px;">
                        ${message}
                    </div>
                    <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
                `
            };

            const customerReplyOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: `Thank you for contacting us - ${subject}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Thank You for Contacting Us!</h2>
                        <p>Dear ${name},</p>
                        <p>Thank you for reaching out to us! We have received your message and will get back to you as soon as possible.</p>
                        <div style="background: #f9fafb; padding: 15px; border-radius: 4px; margin: 20px 0;">
                            <h3>Your Message Summary:</h3>
                            <p><strong>Subject:</strong> ${subject}</p>
                            <p><strong>Type:</strong> ${inquiryType}</p>
                            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        <p>Our typical response time is within 24 hours during business days.</p>
                        <p>Best regards,<br>The Pink Dreams Team</p>
                    </div>
                `
            };

            await transporter.sendMail(adminMailOptions);
            await transporter.sendMail(customerReplyOptions);
            
            res.json({
                success: true,
                message: 'Thank you for your message! We will get back to you soon.',
                contactId: contact._id
            });

        } catch (emailError) {
            console.error('Email sending error:', emailError);
            res.json({
                success: true,
                message: 'Thank you for your message! We will get back to you soon.',
                contactId: contact._id,
                emailStatus: 'Email notification failed, but your message was received.'
            });
        }

    } catch (error) {
        console.error('Contact form submission error:', error);
        res.status(500).json({
            success: false,
            message: 'Sorry, there was an error submitting your message. Please try again.'
        });
    }
});

// Get all contact submissions (admin)
router.get('/submissions', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const status = req.query.status || 'all';

        let query = {};
        if (status !== 'all') {
            query.status = status;
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

// Get contact statistics
router.get('/stats', async (req, res) => {
    try {
        const totalSubmissions = await Contact.countDocuments();
        const newSubmissions = await Contact.countDocuments({ status: 'new' });
        const resolvedSubmissions = await Contact.countDocuments({ status: 'resolved' });
        
        const inquiryTypeStats = await Contact.aggregate([
            { $group: { _id: '$inquiryType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.json({
            success: true,
            stats: {
                totalSubmissions,
                newSubmissions,
                resolvedSubmissions,
                inquiryTypeStats
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;