// routes/newsletterRoutes.js - Newsletter Routes
const express = require('express');
const newsletterRouter = express.Router();
const { Newsletter } = require('../models');

// Newsletter subscription
newsletterRouter.post('/subscribe', async (req, res) => {
    try {
        const { email, name = '', source = 'website' } = req.body;

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

        const existingSubscriber = await Newsletter.findOne({ email: email.toLowerCase() });
        
        if (existingSubscriber) {
            if (existingSubscriber.status === 'active') {
                return res.json({
                    success: true,
                    message: 'You are already subscribed to our newsletter!',
                    alreadySubscribed: true
                });
            } else if (existingSubscriber.status === 'unsubscribed') {
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

        const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        const subscriber = new Newsletter({
            email: email.toLowerCase(),
            name: name,
            status: 'active',
            subscriptionSource: source,
            ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
            userAgent: req.headers['user-agent'] || '',
            verificationToken: verificationToken,
            emailVerified: false
        });

        await subscriber.save();

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

// Newsletter unsubscribe
newsletterRouter.post('/unsubscribe', async (req, res) => {
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

// Get newsletter statistics (admin)
newsletterRouter.get('/stats', async (req, res) => {
    try {
        const totalSubscribers = await Newsletter.countDocuments();
        const activeSubscribers = await Newsletter.countDocuments({ status: 'active' });
        const unsubscribedCount = await Newsletter.countDocuments({ status: 'unsubscribed' });

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

module.exports = newsletterRouter;