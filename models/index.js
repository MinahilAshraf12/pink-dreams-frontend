// models/index.js - All Models Export
const mongoose = require('mongoose');

// Cart Schema
const cartSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    items: [{
        productId: {
            type: Number,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }],
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Wishlist Schema
const wishlistSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    items: [{
        productId: {
            type: Number,
            required: true,
        },
        addedAt: {
            type: Date,
            default: Date.now
        },
        productSnapshot: {
            name: String,
            price: Number,
            image: String,
            category: String
        }
    }],
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Order Schema
const orderSchema = new mongoose.Schema({
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

// Sales Schema
const salesSchema = new mongoose.Schema({
    product_id: {
        type: Number,
        required: true,
    },
    product_name: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1
    },
    total_amount: {
        type: Number,
        required: true,
        min: 0
    },
    date: {
        type: Date,
        default: Date.now,
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    year: {
        type: Number,
        required: true,
    }
});

// Contact Schema
const contactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email']
    },
    subject: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000
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
    repliedAt: Date
});

// Newsletter Schema
const newsletterSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email']
    },
    name: {
        type: String,
        default: '',
        trim: true,
        maxlength: 100
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
    lastEmailSent: Date,
    unsubscribedAt: Date,
    emailVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: String
});

// Add indexes for better performance
cartSchema.index({ userId: 1 });
wishlistSchema.index({ userId: 1 });
orderSchema.index({ userId: 1 });
orderSchema.index({ orderId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
salesSchema.index({ product_id: 1 });
salesSchema.index({ date: -1 });
salesSchema.index({ year: 1, month: 1 });
contactSchema.index({ status: 1 });
contactSchema.index({ createdAt: -1 });
newsletterSchema.index({ email: 1 });
newsletterSchema.index({ status: 1 });

// Create and export models
const Cart = mongoose.model('Cart', cartSchema);
const Wishlist = mongoose.model('Wishlist', wishlistSchema);
const Order = mongoose.model('Order', orderSchema);
const Sale = mongoose.model('Sale', salesSchema);
const Contact = mongoose.model('Contact', contactSchema);
const Newsletter = mongoose.model('Newsletter', newsletterSchema);

module.exports = {
    Cart,
    Wishlist,
    Order,
    Sale,
    Contact,
    Newsletter
};