const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        default: '',
        trim: true
    },
    status: {
        type: String,
        enum: ['active', 'unsubscribed', 'pending'],
        default: 'pending'
    },
    subscriptionSource: {
        type: String,
        enum: ['website', 'checkout', 'popup', 'social'],
        default: 'website'
    },
    preferences: {
        promotions: {
            type: Boolean,
            default: true
        },
        newProducts: {
            type: Boolean,
            default: true
        },
        styleGuides: {
            type: Boolean,
            default: true
        }
    },
    ipAddress: {
        type: String,
        default: ''
    },
    userAgent: {
        type: String,
        default: ''
    },
    subscribedAt: {
        type: Date,
        default: Date.now
    },
    unsubscribedAt: {
        type: Date
    }
});

module.exports = mongoose.model('Newsletter', newsletterSchema);