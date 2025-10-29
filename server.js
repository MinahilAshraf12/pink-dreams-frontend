const { sendOrderConfirmationEmail, sendOrderStatusEmail, sendTestEmail, createTransporter, sendWithResendAPI } = require('./utils/emailService');
const express = require('express');
const app = express();
const port = 4000 ;
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paypal = require('@paypal/checkout-server-sdk');
const cors = require('cors');
// Add crypto module at the top with other imports
const crypto = require('crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const session = require('express-session');
const MongoStore = require('connect-mongo');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');


// 1. FIRST: Configure trust proxy (IMPORTANT for correct IP detection)
app.set('trust proxy', 1); // Trust first proxy (essential for rate limiting)

// 2. Rate limiting configurations
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 minutes
    message: {
        success: false,
        error: 'Too many login attempts. Please try again in 15 minutes.',
        retryAfter: 15 * 60,
        type: 'login_rate_limit'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
    handler: (req, res) => {
        console.log(`🚨 Login rate limit exceeded for IP: ${req.ip}, Email: ${req.body?.email}`);
        res.status(429).json({
            success: false,
            error: 'Too many login attempts. Please try again in 15 minutes.',
            retryAfter: 15 * 60,
            type: 'login_rate_limit'
        });
    }
});

// Progressive slowdown for login attempts
const loginSlowDown = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 2, // Allow 2 requests without delay
    delayMs: (hits) => hits * 500, // 500ms delay per request after 2nd
    maxDelayMs: 20000, // Max 20 second delay
    skipSuccessfulRequests: true
});

// General auth rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 auth attempts per 15 minutes
    message: {
        success: false,
        error: 'Too many authentication attempts. Please try again later.',
        retryAfter: 15 * 60
    }
});

// Registration rate limiting
const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registration attempts per hour
    message: {
        success: false,
        error: 'Too many registration attempts. Please try again in 1 hour.',
        retryAfter: 60 * 60
    }
});

// Password reset rate limiting
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password reset attempts per hour
    message: {
        success: false,
        error: 'Too many password reset attempts. Please try again in 1 hour.',
        retryAfter: 60 * 60
    }
});

// General API rate limiting (optional - apply to all routes)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes per IP
    message: {
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: 15 * 60
    },
    skip: (req) => {
        // Skip rate limiting for static files
        return req.path.startsWith('/images') || req.path.startsWith('/upload');
    }
});

// 3. Apply general rate limiting to all routes (optional)
// app.use(generalLimiter);

console.log('🛡️ Rate limiting configured and ready to apply to auth routes');

app.use(express.json());
// Replace your CORS configuration with this
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://pink-dreams-ikftech.vercel.app',
            'https://pink-dreams-store.onrender.com',
        
            process.env.FRONTEND_URL
        ].filter(Boolean);

        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
    exposedHeaders: ['set-cookie']
};

// Remove the duplicate CORS lines and use only this:
app.use(cors(corsOptions));
console.log('CORS origins configured:', [
    'http://localhost:3000',
    'http://localhost:3001', 
    'https://pink-dreams-ikftech.vercel.app',
    'https://pink-dreams-ikftech.vercel.app/',
   
    process.env.FRONTEND_URL
].filter(Boolean));

// JWT Secret - In production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB Connected"))
.catch((err) => console.error("❌ MongoDB connection error:", err));


// Add these endpoints to your existing index.js file



// Order Schema
// =============================================
// PROMO CODE SYSTEM - COMPLETE BACKEND
// =============================================
// Add this to your server.js file



// Promo Code Schema
const promoCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    minPurchaseAmount: {
        type: Number,
        default: 0
    },
    maxDiscountAmount: {
        type: Number,
        default: null // null means no limit
    },
    usageLimit: {
        type: Number,
        default: null // null means unlimited
    },
    usageCount: {
        type: Number,
        default: 0
    },
    usagePerUser: {
        type: Number,
        default: 1 // How many times one user can use
    },
    validFrom: {
        type: Date,
        required: true
    },
    validUntil: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    applicableCategories: [{
        type: String
    }],
    excludedProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    userRestrictions: {
        newUsersOnly: {
            type: Boolean,
            default: false
        },
        specificUsers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }]
    },
    usedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        usedAt: {
            type: Date,
            default: Date.now
        },
        orderAmount: Number
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
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

// Index for faster queries
promoCodeSchema.index({ code: 1 });
promoCodeSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });

// Virtual for checking if code is expired
promoCodeSchema.virtual('isExpired').get(function() {
    return new Date() > this.validUntil;
});

// Virtual for checking if code is valid now
promoCodeSchema.virtual('isValidNow').get(function() {
    const now = new Date();
    return this.isActive && now >= this.validFrom && now <= this.validUntil;
});

// Pre-save middleware to update updatedAt
promoCodeSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const PromoCode = mongoose.model('PromoCode', promoCodeSchema);

// =============================================
// PROMO CODE API ENDPOINTS
// =============================================

// 1. CREATE PROMO CODE
app.post('/api/promo-codes/create', async (req, res) => {
    try {
        const {
            code,
            title,
            description,
            discountType,
            discountValue,
            minPurchaseAmount,
            maxDiscountAmount,
            usageLimit,
            usagePerUser,
            validFrom,
            validUntil,
            isActive,
            applicableCategories,
            excludedProducts,
            userRestrictions
        } = req.body;

        // Validate required fields
        if (!code || !title || !discountValue || !validFrom || !validUntil) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: code, title, discountValue, validFrom, validUntil'
            });
        }

        // Check if code already exists
        const existingCode = await PromoCode.findOne({ code: code.toUpperCase() });
        if (existingCode) {
            return res.status(400).json({
                success: false,
                message: 'Promo code already exists'
            });
        }

        // Validate discount value
        if (discountType === 'percentage' && discountValue > 100) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount cannot exceed 100%'
            });
        }

        // Validate dates
        const startDate = new Date(validFrom);
        const endDate = new Date(validUntil);
        
        if (endDate <= startDate) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Create new promo code
        const promoCode = new PromoCode({
            code: code.toUpperCase(),
            title,
            description,
            discountType: discountType || 'percentage',
            discountValue,
            minPurchaseAmount: minPurchaseAmount || 0,
            maxDiscountAmount,
            usageLimit,
            usagePerUser: usagePerUser || 1,
            validFrom: startDate,
            validUntil: endDate,
            isActive: isActive !== undefined ? isActive : true,
            applicableCategories: applicableCategories || [],
            excludedProducts: excludedProducts || [],
            userRestrictions: userRestrictions || { newUsersOnly: false, specificUsers: [] }
        });

        await promoCode.save();

        console.log('✅ Promo code created:', code);

        res.json({
            success: true,
            message: 'Promo code created successfully',
            promoCode
        });

    } catch (error) {
        console.error('❌ Error creating promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create promo code',
            error: error.message
        });
    }
});

// 2. GET ALL PROMO CODES (Admin)
app.get('/api/promo-codes/all', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            status = 'all', // all, active, inactive, expired
            search = '' 
        } = req.query;

        const query = {};

        // Filter by status
        if (status === 'active') {
            query.isActive = true;
            query.validFrom = { $lte: new Date() };
            query.validUntil = { $gte: new Date() };
        } else if (status === 'inactive') {
            query.isActive = false;
        } else if (status === 'expired') {
            query.validUntil = { $lt: new Date() };
        }

        // Search filter
        if (search) {
            query.$or = [
                { code: { $regex: search, $options: 'i' } },
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const promoCodes = await PromoCode.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const count = await PromoCode.countDocuments(query);

        // Add computed fields
        const now = new Date();
        const enrichedPromoCodes = promoCodes.map(code => ({
            ...code,
            isExpired: now > new Date(code.validUntil),
            isValidNow: code.isActive && now >= new Date(code.validFrom) && now <= new Date(code.validUntil),
            remainingUses: code.usageLimit ? code.usageLimit - code.usageCount : null,
            usagePercentage: code.usageLimit ? ((code.usageCount / code.usageLimit) * 100).toFixed(1) : 0
        }));

        res.json({
            success: true,
            promoCodes: enrichedPromoCodes,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            total: count
        });

    } catch (error) {
        console.error('❌ Error fetching promo codes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch promo codes',
            error: error.message
        });
    }
});



// 4. UPDATE PROMO CODE
app.put('/api/promo-codes/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Validate dates if provided
        if (updates.validFrom && updates.validUntil) {
            const startDate = new Date(updates.validFrom);
            const endDate = new Date(updates.validUntil);
            
            if (endDate <= startDate) {
                return res.status(400).json({
                    success: false,
                    message: 'End date must be after start date'
                });
            }
        }

        // Validate discount value if provided
        if (updates.discountType === 'percentage' && updates.discountValue > 100) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount cannot exceed 100%'
            });
        }

        const promoCode = await PromoCode.findByIdAndUpdate(
            id,
            { ...updates, updatedAt: new Date() },
            { new: true, runValidators: true }
        );

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        console.log('✅ Promo code updated:', promoCode.code);

        res.json({
            success: true,
            message: 'Promo code updated successfully',
            promoCode
        });

    } catch (error) {
        console.error('❌ Error updating promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update promo code',
            error: error.message
        });
    }
});

// 5. DELETE PROMO CODE
app.delete('/api/promo-codes/delete/:id', async (req, res) => {
    try {
        const promoCode = await PromoCode.findByIdAndDelete(req.params.id);

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        console.log('✅ Promo code deleted:', promoCode.code);

        res.json({
            success: true,
            message: 'Promo code deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete promo code',
            error: error.message
        });
    }
});

// 6. TOGGLE PROMO CODE STATUS
app.patch('/api/promo-codes/toggle-status/:id', async (req, res) => {
    try {
        const promoCode = await PromoCode.findById(req.params.id);

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        promoCode.isActive = !promoCode.isActive;
        promoCode.updatedAt = new Date();
        await promoCode.save();

        console.log(`✅ Promo code ${promoCode.isActive ? 'activated' : 'deactivated'}:`, promoCode.code);

        res.json({
            success: true,
            message: `Promo code ${promoCode.isActive ? 'activated' : 'deactivated'} successfully`,
            promoCode
        });

    } catch (error) {
        console.error('❌ Error toggling promo code status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle promo code status',
            error: error.message
        });
    }
});

// 7. VALIDATE & APPLY PROMO CODE (For Customers)
app.post('/api/promo-codes/validate', async (req, res) => {
    try {
        const { code, userId, cartTotal, cartItems } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Promo code is required'
            });
        }

        // Find promo code
        const promoCode = await PromoCode.findOne({ 
            code: code.toUpperCase() 
        });

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Invalid promo code'
            });
        }

        const now = new Date();

        // Check if active
        if (!promoCode.isActive) {
            return res.status(400).json({
                success: false,
                message: 'This promo code is currently inactive'
            });
        }

        // Check if expired
        if (now < promoCode.validFrom) {
            return res.status(400).json({
                success: false,
                message: `This promo code will be valid from ${promoCode.validFrom.toLocaleDateString()}`
            });
        }

        if (now > promoCode.validUntil) {
            return res.status(400).json({
                success: false,
                message: 'This promo code has expired'
            });
        }

        // Check usage limit
        if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) {
            return res.status(400).json({
                success: false,
                message: 'This promo code has reached its usage limit'
            });
        }

        // Check minimum purchase amount
        if (cartTotal < promoCode.minPurchaseAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase amount of $${promoCode.minPurchaseAmount} required`
            });
        }

        // Check user-specific usage
        if (userId && promoCode.usagePerUser) {
            const userUsageCount = promoCode.usedBy.filter(
                usage => usage.userId.toString() === userId
            ).length;

            if (userUsageCount >= promoCode.usagePerUser) {
                return res.status(400).json({
                    success: false,
                    message: 'You have already used this promo code the maximum number of times'
                });
            }
        }

        // Calculate discount
        let discountAmount = 0;
        
        if (promoCode.discountType === 'percentage') {
            discountAmount = (cartTotal * promoCode.discountValue) / 100;
        } else {
            discountAmount = promoCode.discountValue;
        }

        // Apply max discount limit if set
        if (promoCode.maxDiscountAmount && discountAmount > promoCode.maxDiscountAmount) {
            discountAmount = promoCode.maxDiscountAmount;
        }

        // Ensure discount doesn't exceed cart total
        if (discountAmount > cartTotal) {
            discountAmount = cartTotal;
        }

        const finalAmount = cartTotal - discountAmount;

        console.log('✅ Promo code validated:', code, `Discount: $${discountAmount}`);

        res.json({
            success: true,
            message: 'Promo code applied successfully',
            promoCode: {
                code: promoCode.code,
                title: promoCode.title,
                description: promoCode.description,
                discountType: promoCode.discountType,
                discountValue: promoCode.discountValue
            },
            discount: {
                amount: discountAmount,
                type: promoCode.discountType,
                value: promoCode.discountValue
            },
            originalAmount: cartTotal,
            finalAmount: finalAmount,
            savings: discountAmount
        });

    } catch (error) {
        console.error('❌ Error validating promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate promo code',
            error: error.message
        });
    }
});

// 8. APPLY PROMO CODE TO ORDER (Called after order is placed)
app.post('/api/promo-codes/apply/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const { userId, orderAmount } = req.body;

        const promoCode = await PromoCode.findOne({ 
            code: code.toUpperCase() 
        });

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        // Add to usage tracking
        promoCode.usageCount += 1;
        
        if (userId) {
            promoCode.usedBy.push({
                userId,
                usedAt: new Date(),
                orderAmount
            });
        }

        await promoCode.save();

        console.log('✅ Promo code usage tracked:', code);

        res.json({
            success: true,
            message: 'Promo code applied to order'
        });

    } catch (error) {
        console.error('❌ Error applying promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to apply promo code',
            error: error.message
        });
    }
});

// 9. GET PROMO CODE STATISTICS (Admin Dashboard)
app.get('/api/promo-codes/stats', async (req, res) => {
    try {
        const now = new Date();

        const [
            totalCodes,
            activeCodes,
            expiredCodes,
            totalUsage,
            topCodes
        ] = await Promise.all([
            PromoCode.countDocuments(),
            PromoCode.countDocuments({
                isActive: true,
                validFrom: { $lte: now },
                validUntil: { $gte: now }
            }),
            PromoCode.countDocuments({
                validUntil: { $lt: now }
            }),
            PromoCode.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsage: { $sum: '$usageCount' }
                    }
                }
            ]),
            PromoCode.find()
                .sort({ usageCount: -1 })
                .limit(5)
                .select('code title usageCount discountType discountValue')
        ]);

        res.json({
            success: true,
            stats: {
                total: totalCodes,
                active: activeCodes,
                expired: expiredCodes,
                totalUsage: totalUsage[0]?.totalUsage || 0,
                topPerformingCodes: topCodes
            }
        });

    } catch (error) {
        console.error('❌ Error fetching promo code stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
            error: error.message
        });
    }
});

// 10. GET ACTIVE PROMO CODES (Public - for display on website)
app.get('/api/promo-codes/active', async (req, res) => {
    try {
        const now = new Date();

        const activeCodes = await PromoCode.find({
            isActive: true,
            validFrom: { $lte: now },
            validUntil: { $gte: now }
        })
        .select('code title description discountType discountValue minPurchaseAmount validUntil')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            promoCodes: activeCodes
        });

    } catch (error) {
        console.error('❌ Error fetching active promo codes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active promo codes',
            error: error.message
        });
    }
});
// 3. GET SINGLE PROMO CODE
app.get('/api/promo-codes/:id', async (req, res) => {
    try {
        const promoCode = await PromoCode.findById(req.params.id);

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        res.json({
            success: true,
            promoCode
        });

    } 
    catch (error) {
        console.error('❌ Error fetching promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch promo code',
            error: error.message
        });
    }
});
console.log(' Promo Code System API loaded successfully');
console.log('   POST   /api/promo-codes/create - Create promo code');
console.log('   GET    /api/promo-codes/all - Get all promo codes');
console.log('   GET    /api/promo-codes/:id - Get single promo code');
console.log('   PUT    /api/promo-codes/update/:id - Update promo code');
console.log('   DELETE /api/promo-codes/delete/:id - Delete promo code');
console.log('   PATCH  /api/promo-codes/toggle-status/:id - Toggle active/inactive');
console.log('   POST   /api/promo-codes/validate - Validate & calculate discount');
console.log('   POST   /api/promo-codes/apply/:code - Apply to order');
console.log('   GET    /api/promo-codes/stats - Get statistics');
console.log('   GET    /api/promo-codes/active - Get active codes (public)');


// Category Schema
const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    description: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    image: {
        type: String,
        default: ''
    },
    icon: {
        type: String,
        default: ''
    },
    order: {
        type: Number,
        default: 0
    },
    parentCategory: {
        type: String,
        default: null
    },
    metaTitle: {
        type: String,
        default: ''
    },
    metaDescription: {
        type: String,
        default: ''
    },
    productCount: {
        type: Number,
        default: 0
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

// Auto-update timestamp on save
categorySchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Category = mongoose.model('Category', categorySchema);

// =============================================
// CATEGORY CRUD ENDPOINTS
// =============================================

// GET - Fetch all categories
app.get('/categories', async (req, res) => {
    try {
        const { active, search } = req.query;
        
        let query = {};
        
        // Filter by active status if specified
        if (active !== undefined) {
            query.isActive = active === 'true';
        }
        
        // Search by name if specified
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        
        const categories = await Category.find(query).sort({ order: 1, name: 1 });
        
        res.json({
            success: true,
            categories
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch categories',
            error: error.message
        });
    }
});

// GET - Fetch single category by ID
app.get('/categories/:id', async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }
        
        res.json({
            success: true,
            category
        });
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch category',
            error: error.message
        });
    }
});

// POST - Create new category
app.post('/categories', async (req, res) => {
    try {
        const { name, description, image, icon, isActive, parentCategory, metaTitle, metaDescription } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Category name is required'
            });
        }
        
        // Generate slug from name
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9 -]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
        
        // Check if category with same name or slug exists
        const existingCategory = await Category.findOne({
            $or: [{ name }, { slug }]
        });
        
        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists'
            });
        }
        
        // Get the highest order number
        const lastCategory = await Category.findOne().sort({ order: -1 });
        const order = lastCategory ? lastCategory.order + 1 : 1;
        
        const category = new Category({
            name,
            slug,
            description: description || '',
            image: image || '',
            icon: icon || '',
            isActive: isActive !== undefined ? isActive : true,
            parentCategory: parentCategory || null,
            metaTitle: metaTitle || name,
            metaDescription: metaDescription || description || '',
            order
        });
        
        await category.save();
        
        console.log('✅ Category created:', category.name);
        
        res.json({
            success: true,
            message: 'Category created successfully',
            category
        });
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create category',
            error: error.message
        });
    }
});

// PUT - Update category
app.put('/categories/:id', async (req, res) => {
    try {
        const { name, description, image, icon, isActive, parentCategory, metaTitle, metaDescription, order } = req.body;
        
        const category = await Category.findById(req.params.id);
        
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }
        
        // If name is being updated, generate new slug
        if (name && name !== category.name) {
            const slug = name
                .toLowerCase()
                .replace(/[^a-z0-9 -]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .trim();
            
            // Check if new name/slug is already taken
            const existingCategory = await Category.findOne({
                _id: { $ne: req.params.id },
                $or: [{ name }, { slug }]
            });
            
            if (existingCategory) {
                return res.status(400).json({
                    success: false,
                    message: 'Category with this name already exists'
                });
            }
            
            category.name = name;
            category.slug = slug;
        }
        
        // Update other fields
        if (description !== undefined) category.description = description;
        if (image !== undefined) category.image = image;
        if (icon !== undefined) category.icon = icon;
        if (isActive !== undefined) category.isActive = isActive;
        if (parentCategory !== undefined) category.parentCategory = parentCategory;
        if (metaTitle !== undefined) category.metaTitle = metaTitle;
        if (metaDescription !== undefined) category.metaDescription = metaDescription;
        if (order !== undefined) category.order = order;
        
        await category.save();
        
        console.log('✅ Category updated:', category.name);
        
        res.json({
            success: true,
            message: 'Category updated successfully',
            category
        });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update category',
            error: error.message
        });
    }
});

// PATCH - Toggle category active status
app.patch('/categories/:id/toggle-active', async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }
        
        category.isActive = !category.isActive;
        await category.save();
        
        console.log(`✅ Category ${category.isActive ? 'activated' : 'deactivated'}:`, category.name);
        
        res.json({
            success: true,
            message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
            category
        });
    } catch (error) {
        console.error('Error toggling category status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle category status',
            error: error.message
        });
    }
});

// DELETE - Delete category
app.delete('/categories/:id', async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }
        
        // Check if category has products
        const productCount = await Product.countDocuments({ category: category.name });
        
        if (productCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete category. It has ${productCount} products. Please reassign or delete products first.`
            });
        }
        
        await Category.findByIdAndDelete(req.params.id);
        
        console.log('✅ Category deleted:', category.name);
        
        res.json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete category',
            error: error.message
        });
    }
});

// POST - Reorder categories
app.post('/categories/reorder', async (req, res) => {
    try {
        const { categoryIds } = req.body;
        
        if (!Array.isArray(categoryIds)) {
            return res.status(400).json({
                success: false,
                message: 'Category IDs must be an array'
            });
        }
        
        // Update order for each category
        const updatePromises = categoryIds.map((id, index) => 
            Category.findByIdAndUpdate(id, { order: index })
        );
        
        await Promise.all(updatePromises);
        
        console.log('✅ Categories reordered successfully');
        
        res.json({
            success: true,
            message: 'Categories reordered successfully'
        });
    } catch (error) {
        console.error('Error reordering categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reorder categories',
            error: error.message
        });
    }
});

// GET - Get category statistics
app.get('/categories/stats/overview', async (req, res) => {
    try {
        const totalCategories = await Category.countDocuments();
        const activeCategories = await Category.countDocuments({ isActive: true });
        const inactiveCategories = await Category.countDocuments({ isActive: false });
        
        // Get categories with product counts
        const categories = await Category.find();
        
        // Update product counts for each category
        const categoriesWithCounts = await Promise.all(
            categories.map(async (category) => {
                const productCount = await Product.countDocuments({ 
                    category: category.name,
                    available: true 
                });
                return {
                    ...category.toObject(),
                    productCount
                };
            })
        );
        
        res.json({
            success: true,
            stats: {
                total: totalCategories,
                active: activeCategories,
                inactive: inactiveCategories
            },
            categories: categoriesWithCounts
        });
    } catch (error) {
        console.error('Error fetching category stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch category statistics',
            error: error.message
        });
    }
});

console.log('📁 Categories Management API loaded successfully');
console.log('   GET    /categories - Get all categories');
console.log('   GET    /categories/:id - Get single category');
console.log('   POST   /categories - Create new category');
console.log('   PUT    /categories/:id - Update category');
console.log('   PATCH  /categories/:id/toggle-active - Toggle active status');
console.log('   DELETE /categories/:id - Delete category');
console.log('   POST   /categories/reorder - Reorder categories');
console.log('   GET    /categories/stats/overview - Get category statistics');


// Create Payment Intent
app.post('/payment/create-payment-intent', async (req, res) => {
    try {
        const { amount, currency = 'usd', orderId, userId } = req.body;

        console.log('Creating payment intent for:', { amount, orderId, userId });

        // Validate required fields
        if (!amount || !orderId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Amount, orderId, and userId are required'
            });
        }

        // Convert amount to cents (Stripe requires amount in smallest currency unit)
        const amountInCents = Math.round(amount * 100);

        // Create payment intent
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
});

// Enhanced backend endpoints - ADD THESE TO YOUR EXISTING index.js

// Enhanced Order Creation with billing address
app.post('/order/create', async (req, res) => {
    try {
        const { 
            userId, 
            items, 
            shippingAddress, 
            billingAddress,
            amount,
            paymentIntentId,
            paymentMethod = 'stripe'
        } = req.body;

        console.log('📦 Creating order:', { userId, itemCount: items?.length, paymentMethod });

        // Generate unique order ID
        const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const order = new Order({
            userId,
            orderId,
            stripePaymentIntentId: paymentIntentId,
            items: items.map(item => ({
                productId: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image
            })),
            shippingAddress,
            billingAddress: billingAddress || shippingAddress, // Use shipping if billing not provided
            amount,
            status: 'pending',
            paymentStatus: 'pending',
            paymentMethod
        });

        await order.save();
        console.log('✅ Order created successfully:', orderId);

        res.json({
            success: true,
            order: order,
            orderId: orderId
        });

    } catch (error) {
        console.error('❌ Order creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            error: error.message
        });
    }
});

// Enhanced Order Schema - UPDATE YOUR EXISTING Order SCHEMA
const Order = mongoose.model("Order", {
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

console.log('💳 Enhanced checkout system loaded');
console.log('🔵 Stripe integration ready');
console.log('🔵 PayPal integration ready');

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
const User = mongoose.model("User", {
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    avatar: {
        type: String,
        default: ''
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
        // Add these OAuth fields:
    googleId: {
        type: String,
        sparse: true // Allows multiple null values
    },
    facebookId: {
        type: String,
        sparse: true
    },
    authProvider: {
        type: String,
        enum: ['local', 'google', 'facebook'],
        default: 'local'
    },
});
// Add this before your existing static middleware
app.use('/images', (req, res, next) => {
    console.log('Image request:', req.url);
    next();
}, express.static(path.join(__dirname, 'upload/images')));

// Also ensure the upload directory exists
const fs = require('fs');
const uploadDir = path.join(__dirname, 'upload/images');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('Created upload directory:', uploadDir);
}
// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Invalid token.'
        });
    }
};

// REPLACE your existing Register endpoint
app.post('/auth/register', 
    registrationLimiter,   // Apply registration rate limiting
    async (req, res) => {
        try {
            const { name, email, password } = req.body;

            console.log(`📝 Registration attempt for email: ${email} from IP: ${req.ip}`);

            // Validation
            if (!name || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide all required fields'
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters long'
                });
            }

            // Check if user already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                console.log(`❌ Registration failed - user exists: ${email} from IP: ${req.ip}`);
                return res.status(400).json({
                    success: false,
                    message: 'User already exists with this email'
                });
            }

            // Hash password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Create user
            const user = new User({
                name,
                email,
                password: hashedPassword
            });

            await user.save();

            // Generate JWT token
            const token = jwt.sign(
                { id: user._id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            console.log(`✅ Registration successful for: ${email} from IP: ${req.ip}`);

            res.status(201).json({
                success: true,
                message: 'User created successfully',
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    avatar: user.avatar,
                    role: user.role
                }
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

// REPLACE your existing Login endpoint
app.post('/auth/login', 
    loginLimiter,      // Apply login-specific rate limiting
    loginSlowDown,     // Apply progressive delay
    async (req, res) => {
        const startTime = Date.now();
        
        try {
            const { email, password } = req.body;

            console.log(`🔐 Login attempt for email: ${email} from IP: ${req.ip}`);

            // Validation
            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide email and password'
                });
            }

            // Find user
            const user = await User.findOne({ email });
            if (!user) {
                console.log(`❌ Login failed - user not found: ${email} from IP: ${req.ip}`);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

            // Check password
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                console.log(`❌ Login failed - invalid password: ${email} from IP: ${req.ip}`);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password'
                });
            }

            // Update last login
            user.lastLogin = new Date();
            await user.save();

            // Generate JWT token
            const token = jwt.sign(
                { id: user._id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            const duration = Date.now() - startTime;
            console.log(`✅ Login successful for: ${email} from IP: ${req.ip} (${duration}ms)`);

            res.json({
                success: true,
                message: 'Login successful',
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    avatar: user.avatar,
                    role: user.role
                }
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);



// FIXED: Forgot Password - Send Reset Email
app.post('/auth/forgot-password', 
    passwordResetLimiter,  // Apply password reset rate limiting
    async (req, res) => {
        try {
            const { email } = req.body;

            console.log(`🔄 Password reset request for: ${email} from IP: ${req.ip}`);

            // Validation
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

            // Find user by email
            const user = await User.findOne({ email: email.toLowerCase() });
            
            if (!user) {
                // For security, don't reveal if email exists or not
                return res.json({
                    success: true,
                    message: 'If an account with this email exists, you will receive a password reset link shortly.'
                });
            }

            // Generate reset token
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

            // Save reset token to user
            user.resetPasswordToken = resetToken;
            user.resetPasswordExpires = resetTokenExpiry;
            await user.save();

            // Create reset URL
            const resetURL = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

            // FIXED: Send reset email using Resend
            try {
                // Use Resend HTTP API directly (since you have it configured)
                if (process.env.RESEND_API_KEY) {
                    console.log('📧 Using Resend API for password reset email');
                    
                    const emailHtml = `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Password Reset - Pink Dreams</title>
                        </head>
                        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9fafb;">
                            <div style="max-width: 600px; margin: 0 auto; background: white;">
                                <!-- Header -->
                                <div style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0;">
                                    <div style="background: rgba(255,255,255,0.2); width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
                                        <span style="font-size: 24px; font-weight: bold;">🔐</span>
                                    </div>
                                    <h1 style="margin: 0; font-size: 24px;">Reset Your Password</h1>
                                    <p style="margin: 8px 0 0; opacity: 0.9; font-size: 16px;">Pink Dreams Fashion Store</p>
                                </div>
                                
                                <!-- Content -->
                                <div style="padding: 30px 20px;">
                                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">Hi ${user.name},</p>
                                    
                                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                                        We received a request to reset your password for your Pink Dreams account. If you didn't make this request, you can safely ignore this email.
                                    </p>
                                    
                                    <!-- Reset Button -->
                                    <div style="text-align: center; margin: 30px 0;">
                                        <a href="${resetURL}" style="display: inline-block; background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);">
                                            Reset My Password
                                        </a>
                                    </div>
                                    
                                    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 25px 0 0;">
                                        If the button doesn't work, you can copy and paste this link into your browser:
                                    </p>
                                    <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; color: #374151; margin: 10px 0 20px;">
                                        ${resetURL}
                                    </p>
                                    
                                    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
                                        <p style="color: #6b7280; font-size: 12px; line-height: 1.5; margin: 0;">
                                            <strong>Security Note:</strong> This link will expire in 1 hour for your security. If you didn't request this password reset, your account is still secure and no action is needed.
                                        </p>
                                        <p style="color: #6b7280; font-size: 12px; line-height: 1.5; margin: 10px 0 0;">
                                            Sent on: ${new Date().toLocaleString()}<br>
                                            Request from IP: ${req.ip}
                                        </p>
                                    </div>
                                </div>
                                
                                <!-- Footer -->
                                <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px; background-color: #f9fafb;">
                                    <p style="margin: 0 0 10px;">© 2024 Pink Dreams Fashion Store. All rights reserved.</p>
                                    <p style="margin: 0;">Need help? Contact us at ${process.env.EMAIL_FROM || 'support@pink-dreams.com'}</p>
                                </div>
                            </div>
                        </body>
                        </html>
                    `;

                    // Send email using Resend HTTP API
                    const response = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            from: `"Pink Dreams Store" <${process.env.EMAIL_FROM || 'noreply@resend.dev'}>`,
                            to: email,
                            subject: 'Reset Your Pink Dreams Password',
                            html: emailHtml
                        })
                    });

                    if (!response.ok) {
                        const error = await response.text();
                        throw new Error(`Resend API error: ${response.status} - ${error}`);
                    }

                    const result = await response.json();
                    console.log(`✅ Password reset email sent successfully via Resend API. Message ID: ${result.id}`);
                    
                } else {
                    // Fallback to SMTP transporter
                    console.log('📧 Using SMTP fallback for password reset email');
                    const transporter = createTransporter(); // FIXED: Correct function name
                    
                    const mailOptions = {
                        from: `"Pink Dreams Store" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@pink-dreams.com'}>`,
                        to: email,
                        subject: 'Reset Your Pink Dreams Password',
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                <div style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                                    <h2 style="margin: 0;">Reset Your Password</h2>
                                </div>
                                
                                <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                                    <p>Hi ${user.name},</p>
                                    <p>We received a request to reset your password. Click the button below to reset it:</p>
                                    
                                    <div style="text-align: center; margin: 30px 0;">
                                        <a href="${resetURL}" style="display: inline-block; background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                                            Reset My Password
                                        </a>
                                    </div>
                                    
                                    <p style="font-size: 12px; color: #6b7280;">This link will expire in 1 hour for security.</p>
                                    <p style="font-size: 12px; color: #6b7280;">Request from IP: ${req.ip}</p>
                                </div>
                            </div>
                        `
                    };

                    await transporter.sendMail(mailOptions);
                    console.log(`✅ Password reset email sent via SMTP to: ${email}`);
                }

            } catch (emailError) {
                console.error('❌ Error sending reset email:', emailError);
                
                // Clear reset token if email fails
                user.resetPasswordToken = undefined;
                user.resetPasswordExpires = undefined;
                await user.save();
                
                return res.status(500).json({
                    success: false,
                    message: 'Unable to send reset email. Please try again later.',
                    error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
                });
            }

            res.json({
                success: true,
                message: 'If an account with this email exists, you will receive a password reset link shortly.'
            });

        } catch (error) {
            console.error('❌ Forgot password error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error. Please try again later.',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// KEEP all your other existing routes unchanged:
// - /auth/profile (GET)
// - /auth/profile (PUT) 
// - /auth/change-password
// - /auth/logout
// - /auth/check-email

// Add a test endpoint to verify rate limiting is working
app.get('/auth/rate-limit-status', (req, res) => {
    res.json({
        success: true,
        message: 'Rate limiting is active',
        ip: req.ip,
        rateLimits: {
            login: '5 attempts per 15 minutes',
            registration: '3 attempts per hour', 
            passwordReset: '3 attempts per hour'
        },
        testInstructions: {
            login: 'Try logging in with wrong credentials 6 times to test login rate limiting',
            registration: 'Try registering 4 times in an hour to test registration rate limiting'
        }
    });
});

console.log('🛡️ Rate limiting applied to auth routes');
console.log('🛡️ Test at: GET /auth/rate-limit-status');

// Get current user profile
app.get('/auth/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                role: user.role,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Update user profile
app.put('/auth/profile', verifyToken, async (req, res) => {
    try {
        const { name, avatar } = req.body;
        
        const updateData = {};
        if (name) updateData.name = name;
        if (avatar) updateData.avatar = avatar;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true }
        ).select('-password');

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Change password
app.post('/auth/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide current and new password'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        const user = await User.findById(req.user.id);
        
        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const saltRounds = 10;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        user.password = hashedNewPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Logout endpoint (optional - mainly for token blacklisting if implemented)
app.post('/auth/logout', verifyToken, async (req, res) => {
    try {
        // In a real implementation, you might want to blacklist the token
        // For now, we'll just send a success response
        res.json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
// Add this endpoint to your existing index.js file

// Check if email exists (for real-time validation during registration)
app.post('/auth/check-email', async (req, res) => {
    try {
        const { email } = req.body;

        // Validation
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

        // Check if user exists with this email
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        
        res.json({
            success: true,
            exists: !!existingUser,
            message: existingUser ? 'Email already exists' : 'Email is available'
        });

    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-session-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,  // ✅ only from .env
        touchAfter: 24 * 3600 // lazy session update
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// ==============================================
// PASSPORT CONFIGURATION
// ==============================================

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id).select('-password');
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// ==============================================
// GOOGLE OAUTH STRATEGY
// ==============================================

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:4000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        console.log('🔍 Google OAuth - Processing user:', profile.emails[0].value);
        
        // Check if user already exists with this Google ID
        let user = await User.findOne({ googleId: profile.id });
        
        if (user) {
            console.log('✅ Existing Google user found');
            return done(null, user);
        }
        
        // Check if user exists with the same email
        const email = profile.emails[0].value;
        user = await User.findOne({ email: email.toLowerCase() });
        
        if (user) {
            // Link Google account to existing user
            console.log('🔗 Linking Google account to existing user');
            user.googleId = profile.id;
            user.avatar = user.avatar || profile.photos[0]?.value || '';
            await user.save();
            return done(null, user);
        }
        
        // Create new user
        console.log('👤 Creating new Google user');
        const newUser = new User({
            googleId: profile.id,
            name: profile.displayName,
            email: email.toLowerCase(),
            avatar: profile.photos[0]?.value || '',
            emailVerified: true, // Google emails are pre-verified
            authProvider: 'google',
            // Generate a random password for security (user won't use it)
            password: await bcrypt.hash(Math.random().toString(36).substring(2, 15), 10)
        });
        
        await newUser.save();
        console.log('✅ New Google user created successfully');
        
        done(null, newUser);
    } catch (error) {
        console.error('❌ Google OAuth error:', error);
        done(error, null);
    }
}));

// ==============================================
// FACEBOOK OAUTH STRATEGY
// ==============================================

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL || "http://localhost:4000/auth/facebook/callback",
    profileFields: ['id', 'displayName', 'photos', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        console.log('🔍 Facebook OAuth - Processing user:', profile.emails?.[0]?.value || 'No email');
        
        // Check if user already exists with this Facebook ID
        let user = await User.findOne({ facebookId: profile.id });
        
        if (user) {
            console.log('✅ Existing Facebook user found');
            return done(null, user);
        }
        
        // Check if user exists with the same email (if email is available)
        let email = profile.emails?.[0]?.value;
        if (email) {
            user = await User.findOne({ email: email.toLowerCase() });
            
            if (user) {
                // Link Facebook account to existing user
                console.log('🔗 Linking Facebook account to existing user');
                user.facebookId = profile.id;
                user.avatar = user.avatar || profile.photos[0]?.value || '';
                await user.save();
                return done(null, user);
            }
        }
        
        // Create new user
        console.log('👤 Creating new Facebook user');
        
        // If no email from Facebook, create a placeholder
        if (!email) {
            email = `${profile.id}@facebook.placeholder.com`;
        }
        
        const newUser = new User({
            facebookId: profile.id,
            name: profile.displayName,
            email: email.toLowerCase(),
            avatar: profile.photos[0]?.value || '',
            emailVerified: !!profile.emails?.[0]?.value, // Only verify if real email
            authProvider: 'facebook',
            // Generate a random password for security
            password: await bcrypt.hash(Math.random().toString(36).substring(2, 15), 10)
        });
        
        await newUser.save();
        console.log('✅ New Facebook user created successfully');
        
        done(null, newUser);
    } catch (error) {
        console.error('❌ Facebook OAuth error:', error);
        done(error, null);
    }
}));

// API creation
app.get('/', (req, res) => {
    res.send('Hello World!')
})

// Google OAuth routes
app.get('/auth/google',
    passport.authenticate('google', { 
        scope: ['profile', 'email'] 
    })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed' }),
    async (req, res) => {
        try {
            console.log('✅ Google OAuth callback successful');
            
            // Generate JWT token for the user
            const token = jwt.sign(
                { 
                    id: req.user._id, 
                    email: req.user.email, 
                    role: req.user.role 
                },
                JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            // Redirect to frontend with token
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            res.redirect(`${frontendUrl}/auth/callback?token=${token}&provider=google&success=true`);
        } catch (error) {
            console.error('❌ Google OAuth callback error:', error);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            res.redirect(`${frontendUrl}/auth/callback?error=google_callback_failed`);
        }
    }
);

// Facebook OAuth routes
app.get('/auth/facebook',
    passport.authenticate('facebook', { 
        scope: ['email'] 
    })
);

app.get('/auth/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/login?error=facebook_auth_failed' }),
    async (req, res) => {
        try {
            console.log('✅ Facebook OAuth callback successful');
            
            // Generate JWT token for the user
            const token = jwt.sign(
                { 
                    id: req.user._id, 
                    email: req.user.email, 
                    role: req.user.role 
                },
                JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            // Redirect to frontend with token
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            res.redirect(`${frontendUrl}/auth/callback?token=${token}&provider=facebook&success=true`);
        } catch (error) {
            console.error('❌ Facebook OAuth callback error:', error);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            res.redirect(`${frontendUrl}/auth/callback?error=facebook_callback_failed`);
        }
    }
);

// OAuth logout route
app.post('/auth/oauth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error logging out'
            });
        }
        
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error destroying session'
                });
            }
            
            res.json({
                success: true,
                message: 'Logged out successfully'
            });
        });
    });
});

// Check OAuth link status
app.get('/auth/oauth/status', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('googleId facebookId authProvider');
        
        res.json({
            success: true,
            oauth: {
                hasGoogle: !!user.googleId,
                hasFacebook: !!user.facebookId,
                authProvider: user.authProvider,
                canUnlink: user.authProvider === 'local' // Only allow unlinking if user has local auth
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error checking OAuth status'
        });
    }
});

// Link OAuth account to existing user
app.post('/auth/oauth/link/:provider', verifyToken, async (req, res) => {
    try {
        const { provider } = req.params;
        
        if (!['google', 'facebook'].includes(provider)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OAuth provider'
            });
        }
        
        // Store user ID in session for linking
        req.session.linkUserId = req.user.id;
        
        // Redirect to OAuth provider
        const authUrl = `/auth/${provider}?link=true`;
        res.json({
            success: true,
            redirectUrl: authUrl
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error initiating OAuth link'
        });
    }
});

// Unlink OAuth account
app.delete('/auth/oauth/unlink/:provider', verifyToken, async (req, res) => {
    try {
        const { provider } = req.params;
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Don't allow unlinking if it's the only auth method
        if (user.authProvider === provider && !user.password) {
            return res.status(400).json({
                success: false,
                message: 'Cannot unlink the only authentication method. Please set a password first.'
            });
        }
        
        // Remove OAuth ID
        if (provider === 'google') {
            user.googleId = undefined;
        } else if (provider === 'facebook') {
            user.facebookId = undefined;
        }
        
        await user.save();
        
        res.json({
            success: true,
            message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} account unlinked successfully`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error unlinking OAuth account'
        });
    }
});

console.log('🔐 OAuth2 routes loaded successfully');
console.log('🔐 Available OAuth endpoints:');
console.log('   GET  /auth/google - Initiate Google OAuth');
console.log('   GET  /auth/google/callback - Google OAuth callback');
console.log('   GET  /auth/facebook - Initiate Facebook OAuth');
console.log('   GET  /auth/facebook/callback - Facebook OAuth callback');
console.log('   POST /auth/oauth/logout - OAuth logout');
console.log('   GET  /auth/oauth/status - Check OAuth link status');
console.log('   POST /auth/oauth/link/:provider - Link OAuth account');
console.log('   DELETE /auth/oauth/unlink/:provider - Unlink OAuth account');

// Image storage engine
const storage = multer.diskStorage({
    destination: './upload/images',
    filename: (req, file, cb) => {
        return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
    }
})

const upload = multer({ storage: storage })

// Upload endpoint for img
app.use('/images', express.static('upload/images'));

app.post("/upload", upload.single('product'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: 0,
                message: 'No file uploaded'
            });
        }

        // Use environment variable for base URL
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const imageUrl = `${baseUrl}/images/${req.file.filename}`;
        
        console.log('Image uploaded:', {
            filename: req.file.filename,
            path: req.file.path,
            url: imageUrl
        });

        res.json({
            success: 1,
            image_url: imageUrl
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: 0,
            message: 'Upload failed'
        });
    }
});
// Add this endpoint to fix existing product images
app.post('/fix-image-urls', async (req, res) => {
    try {
        const baseUrl = process.env.BASE_URL || 'https://pink-dreams-store.onrender.com';
        
        // Update all products with localhost URLs
        const result = await Product.updateMany(
            { 
                image: { $regex: 'localhost:4000' }
            },
            [{
                $set: {
                    image: {
                        $replaceOne: {
                            input: "$image",
                            find: "http://localhost:4000",
                            replacement: baseUrl
                        }
                    }
                }
            }]
        );

        // Also update images array if you have multiple images
        const result2 = await Product.updateMany(
            { 
                images: { $elemMatch: { $regex: 'localhost:4000' } }
            },
            [{
                $set: {
                    images: {
                        $map: {
                            input: "$images",
                            as: "img",
                            in: {
                                $replaceOne: {
                                    input: "$$img",
                                    find: "http://localhost:4000",
                                    replacement: baseUrl
                                }
                            }
                        }
                    }
                }
            }]
        );

        res.json({
            success: true,
            message: `Updated ${result.modifiedCount} products and ${result2.modifiedCount} image arrays`,
            baseUrl: baseUrl
        });

    } catch (error) {
        console.error('Error fixing image URLs:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Enhanced Schema for creating products with all e-commerce features
const productSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true
    },
    // Basic Information
    name: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    brand: {
        type: String,
        default: '',
    },
    sku: {
        type: String,
        default: '',
    },
    description: {
        type: String,
        default: '',
    },
    short_description: {
        type: String,
        default: '',
    },
    
    // Images
    image: {
        type: String,
        required: true,
    },
    images: {
        type: [String],
        default: [],
    },
    
    // Pricing
    new_price: {
        type: Number,
        required: true,
    },
    old_price: {
        type: Number,
        required: true,
    },
    discount_type: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage',
    },
    discount_value: {
        type: Number,
        default: 0,
    },
    sale_start_date: {
        type: Date,
    },
    sale_end_date: {
        type: Date,
    },
    
    // Product Details
    features: {
        type: [String],
        default: [],
    },
    specifications: [{
        key: String,
        value: String,
    }],
    materials: {
        type: String,
        default: '',
    },
    care_instructions: {
        type: String,
        default: '',
    },
    size_chart: {
        type: String,
        default: '',
    },
    colors: {
        type: [String],
        default: [],
    },
    sizes: {
        type: [String],
        default: [],
    },
    weight: {
        type: Number,
        default: 0,
    },
    dimensions: {
        length: {
            type: Number,
            default: 0,
        },
        width: {
            type: Number,
            default: 0,
        },
        height: {
            type: Number,
            default: 0,
        },
    },
    
    // Inventory
    stock_quantity: {
        type: Number,
        default: 0,
    },
    low_stock_threshold: {
        type: Number,
        default: 10,
    },
    
    // SEO & Meta Data
    meta_title: {
        type: String,
        default: '',
    },
    meta_description: {
        type: String,
        default: '',
    },
    meta_keywords: {
        type: String,
        default: '',
    },
    slug: {
        type: String,
        default: '',
    },
    
    // Additional Fields
    tags: {
        type: [String],
        default: [],
    },
    related_products: {
        type: [Number],
        default: [],
    },
    shipping_class: {
        type: String,
        enum: ['standard', 'express', 'overnight', 'free'],
        default: 'standard',
    },
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft',
    },
    
    // System Fields
    date: {
        type: Date,
        default: Date.now,
    },
    available: {
        type: Boolean,
        default: true,
    },
    featured: {
        type: Boolean,
        default: false,
    },
    views: {
        type: Number,
        default: 0,
    },
    sales_count: {
        type: Number,
        default: 0,
    }
}, {
    timestamps: true // This adds createdAt and updatedAt automatically
});

// Add virtual for conversion rate calculation
productSchema.virtual('conversion_rate').get(function() {
    return this.views > 0 ? ((this.sales_count / this.views) * 100).toFixed(2) : 0;
});

// Auto-generate SKU and slug if not provided
productSchema.pre('save', function(next) {
    if (!this.sku || this.sku === '') {
        this.sku = `${this.category.substring(0, 3).toUpperCase()}-${this.id}`;
    }
    
    if (!this.slug || this.slug === '') {
        this.slug = this.name.toLowerCase()
            .replace(/[^a-z0-9 -]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
    }
    
    next();
});

// Ensure virtuals are included in JSON output
productSchema.set('toJSON', { virtuals: true });

const Product = mongoose.model("Product", productSchema);

// Sales Schema for tracking sales data (keeping existing)
const Sale = mongoose.model("Sale", {
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
    },
    quantity: {
        type: Number,
        default: 1,
    },
    total_amount: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    month: {
        type: Number,
        required: true,
    },
    year: {
        type: Number,
        required: true,
    }
});

// Enhanced API for add product with all new fields
app.post('/addproduct', async (req, res) => {
    try {
        let products = await Product.find({});
        let id;
        if (products.length > 0) {
            let last_product_array = products.slice(-1);
            let last_product = last_product_array[0];
            id = last_product.id + 1
        } else {
            id = 1;
        }

        // Auto-generate slug if not provided
        const slug = req.body.slug || req.body.name.toLowerCase()
            .replace(/[^a-z0-9 -]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();

        // Auto-generate meta title if not provided
        const meta_title = req.body.meta_title || `${req.body.name} - ${req.body.category} | Your Store`;

        const product = new Product({
            id: id,
            // Basic Information
            name: req.body.name,
            category: req.body.category,
            brand: req.body.brand || '',
            sku: req.body.sku || `SKU-${id}`,
            description: req.body.description || '',
            short_description: req.body.short_description || '',
            
            // Images
            image: req.body.image,
            images: req.body.images || [],
            
            // Pricing
            new_price: req.body.new_price,
            old_price: req.body.old_price,
            discount_type: req.body.discount_type || 'percentage',
            discount_value: req.body.discount_value || 0,
            sale_start_date: req.body.sale_start_date || null,
            sale_end_date: req.body.sale_end_date || null,
            
            // Product Details
            features: req.body.features || [],
            specifications: req.body.specifications || [],
            materials: req.body.materials || '',
            care_instructions: req.body.care_instructions || '',
            size_chart: req.body.size_chart || '',
            colors: req.body.colors || [],
            sizes: req.body.sizes || [],
            weight: req.body.weight || 0,
            dimensions: req.body.dimensions || { length: 0, width: 0, height: 0 },
            
            // Inventory
            stock_quantity: req.body.stock_quantity || 0,
            low_stock_threshold: req.body.low_stock_threshold || 10,
            
            // SEO & Meta Data
            meta_title: meta_title,
            meta_description: req.body.meta_description || '',
            meta_keywords: req.body.meta_keywords || '',
            slug: slug,
            
            // Additional Fields
            tags: req.body.tags || [],
            related_products: req.body.related_products || [],
            shipping_class: req.body.shipping_class || 'standard',
            status: req.body.status || 'draft',
            
            // System Fields
            available: req.body.available !== undefined ? req.body.available : true,
            featured: req.body.featured || false,
        });

        console.log('Adding product:', product.name);
        await product.save();
        console.log("Product saved successfully");
        
        res.json({
            success: true,
            name: req.body.name,
            id: id,
            product: product
        })
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({
            success: false,
            error: error.message
        })
    }
})

// Enhanced API for updating products
app.post('/updateproduct', async (req, res) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }
        
        // Build update object with all possible fields
        const updateData = {};
        
        // Basic Information
        if (req.body.name !== undefined) updateData.name = req.body.name;
        if (req.body.category !== undefined) updateData.category = req.body.category;
        if (req.body.brand !== undefined) updateData.brand = req.body.brand;
        if (req.body.sku !== undefined) updateData.sku = req.body.sku;
        if (req.body.description !== undefined) updateData.description = req.body.description;
        if (req.body.short_description !== undefined) updateData.short_description = req.body.short_description;
        
        // Images
        if (req.body.image !== undefined) updateData.image = req.body.image;
        if (req.body.images !== undefined) updateData.images = req.body.images;
        
        // Pricing
        if (req.body.new_price !== undefined) updateData.new_price = req.body.new_price;
        if (req.body.old_price !== undefined) updateData.old_price = req.body.old_price;
        if (req.body.discount_type !== undefined) updateData.discount_type = req.body.discount_type;
        if (req.body.discount_value !== undefined) updateData.discount_value = req.body.discount_value;
        if (req.body.sale_start_date !== undefined) updateData.sale_start_date = req.body.sale_start_date;
        if (req.body.sale_end_date !== undefined) updateData.sale_end_date = req.body.sale_end_date;
        
        // Product Details
        if (req.body.features !== undefined) updateData.features = req.body.features;
        if (req.body.specifications !== undefined) updateData.specifications = req.body.specifications;
        if (req.body.materials !== undefined) updateData.materials = req.body.materials;
        if (req.body.care_instructions !== undefined) updateData.care_instructions = req.body.care_instructions;
        if (req.body.size_chart !== undefined) updateData.size_chart = req.body.size_chart;
        if (req.body.colors !== undefined) updateData.colors = req.body.colors;
        if (req.body.sizes !== undefined) updateData.sizes = req.body.sizes;
        if (req.body.weight !== undefined) updateData.weight = req.body.weight;
        if (req.body.dimensions !== undefined) updateData.dimensions = req.body.dimensions;
        
        // Inventory
        if (req.body.stock_quantity !== undefined) updateData.stock_quantity = req.body.stock_quantity;
        if (req.body.low_stock_threshold !== undefined) updateData.low_stock_threshold = req.body.low_stock_threshold;
        
        // SEO & Meta Data
        if (req.body.meta_title !== undefined) updateData.meta_title = req.body.meta_title;
        if (req.body.meta_description !== undefined) updateData.meta_description = req.body.meta_description;
        if (req.body.meta_keywords !== undefined) updateData.meta_keywords = req.body.meta_keywords;
        if (req.body.slug !== undefined) updateData.slug = req.body.slug;
        
        // Additional Fields
        if (req.body.tags !== undefined) updateData.tags = req.body.tags;
        if (req.body.related_products !== undefined) updateData.related_products = req.body.related_products;
        if (req.body.shipping_class !== undefined) updateData.shipping_class = req.body.shipping_class;
        if (req.body.status !== undefined) updateData.status = req.body.status;
        
        // System Fields
        if (req.body.available !== undefined) updateData.available = req.body.available;
        if (req.body.featured !== undefined) updateData.featured = req.body.featured;

        const updatedProduct = await Product.findOneAndUpdate(
            { id: id },
            updateData,
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        console.log("Product updated:", updatedProduct.name);
        res.json({
            success: true,
            message: 'Product updated successfully',
            product: updatedProduct
        })
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product',
            error: error.message
        })
    }
})

// Enhanced API for getting single product with all fields and view tracking
app.get('/product/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        
        // Find product and increment view count atomically
        const product = await Product.findOneAndUpdate(
            { id: productId },
            { $inc: { views: 1 } },
            { new: true }
        );
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        // Convert to JSON to include virtuals (like conversion_rate)
        const productData = product.toJSON();
        
        // Ensure SKU is generated if missing
        if (!productData.sku || productData.sku === '') {
            productData.sku = `${product.category.substring(0, 3).toUpperCase()}-${product.id}`;
        }
        
        // Calculate stock status
        const stockStatus = {
            current_stock: product.stock_quantity || 0,
            low_stock_threshold: product.low_stock_threshold || 10,
            is_low_stock: (product.stock_quantity || 0) <= (product.low_stock_threshold || 10),
            is_out_of_stock: (product.stock_quantity || 0) === 0
        };
        
        // Add computed fields
        productData.stock_status = stockStatus;
        productData.discount_percentage = 0;
        
        // Calculate discount percentage
        if (product.old_price && product.old_price > product.new_price) {
            productData.discount_percentage = Math.round(((product.old_price - product.new_price) / product.old_price) * 100);
        }
        
        console.log(`Product ${productId} viewed. Total views: ${product.views}`);
        
        res.json({
            success: true,
            product: productData
        });
        
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Enhanced API for getting products by slug (SEO-friendly URLs)
app.get('/product/slug/:slug', async (req, res) => {
    try {
        const product = await Product.findOneAndUpdate(
            { slug: req.params.slug },
            { $inc: { views: 1 } },
            { new: true }
        );
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }
        
        // Convert to JSON to include virtuals
        const productData = product.toJSON();
        
        res.json({
            success: true,
            product: productData
        });
    } catch (error) {
        console.error('Error fetching product by slug:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
})

// API for getting featured products
app.get('/featured-products', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const products = await Product.find({ featured: true, available: true })
            .sort({ date: -1 })
            .limit(limit);

        res.json({
            success: true,
            products: products
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
})

// API for getting products by category with enhanced filtering
app.get('/category/:category', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const sortBy = req.query.sortBy || 'date';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        const query = { 
            category: req.params.category, 
            available: true,
            status: 'published'
        };

        const totalProducts = await Product.countDocuments(query);
        const products = await Product.find(query)
            .sort({ [sortBy]: sortOrder })
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            products: products,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalProducts / limit),
                totalProducts: totalProducts
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
})

// Enhanced search API with more filters
app.get('/search', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        const searchTerm = req.query.q || '';
        const category = req.query.category || '';
        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || Number.MAX_VALUE;
        const brand = req.query.brand || '';
        const color = req.query.color || '';
        const size = req.query.size || '';
        const inStock = req.query.inStock === 'true';
        const featured = req.query.featured === 'true';
        const sortBy = req.query.sortBy || 'date';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        // Build search query
        let query = { 
            available: true,
            status: 'published'
        };
        
        if (searchTerm) {
            query.$or = [
                { name: { $regex: searchTerm, $options: 'i' } },
                { description: { $regex: searchTerm, $options: 'i' } },
                { tags: { $in: [new RegExp(searchTerm, 'i')] } },
                { brand: { $regex: searchTerm, $options: 'i' } }
            ];
        }
        
        if (category) query.category = category;
        if (brand) query.brand = { $regex: brand, $options: 'i' };
        if (color) query.colors = { $in: [new RegExp(color, 'i')] };
        if (size) query.sizes = { $in: [new RegExp(size, 'i')] };
        if (inStock) query.stock_quantity = { $gt: 0 };
        if (featured) query.featured = true;
        
        if (minPrice > 0 || maxPrice < Number.MAX_VALUE) {
            query.new_price = { $gte: minPrice, $lte: maxPrice };
        }

        const totalProducts = await Product.countDocuments(query);
        const products = await Product.find(query)
            .sort({ [sortBy]: sortOrder })
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            products: products,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalProducts / limit),
                totalProducts: totalProducts
            },
            searchTerm: searchTerm
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
})

// API for getting product filters (brands, colors, sizes, price range)
app.get('/product-filters', async (req, res) => {
    try {
        const [brands, priceRange] = await Promise.all([
            Product.distinct('brand', { 
                available: true, 
                brand: { $ne: '', $exists: true } 
            }),
            Product.aggregate([
                { $match: { available: true, new_price: { $exists: true, $ne: null } } },
                { 
                    $group: { 
                        _id: null, 
                        minPrice: { $min: '$new_price' }, 
                        maxPrice: { $max: '$new_price' } 
                    }
                }
            ])
        ]);

        const colors = await Product.aggregate([
            { $match: { available: true } },
            { $unwind: { path: '$colors', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$colors' } },
            { $sort: { _id: 1 } }
        ]);

        const sizes = await Product.aggregate([
            { $match: { available: true } },
            { $unwind: { path: '$sizes', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$sizes' } },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            filters: {
                brands: brands.filter(brand => brand && brand.trim() !== ''),
                colors: colors.map(c => c._id).filter(color => color && color.trim() !== ''),
                sizes: sizes.map(s => s._id).filter(size => size && size.trim() !== ''),
                priceRange: priceRange[0] || { minPrice: 0, maxPrice: 1000 }
            }
        });
    } catch (error) {
        console.error('Error fetching filters:', error);
        res.json({
            success: false,
            error: error.message,
            filters: {
                brands: [],
                colors: [],
                sizes: [],
                priceRange: { minPrice: 0, maxPrice: 1000 }
            }
        });
    }
});

// Enhanced removeproduct API
app.post('/removeproduct', async (req, res) => {
    try {
        const { id, name } = req.body;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }
        
        const deletedProduct = await Product.findOneAndDelete({ id: id });
        
        if (!deletedProduct) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        console.log("Product deleted:", deletedProduct.name);
        res.json({
            success: true,
            message: `Product "${name || deletedProduct.name}" deleted successfully`,
            name: name || deletedProduct.name
        });
        
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete product',
            error: error.message
        });
    }
})

// Enhanced allproducts API (IMPORTANT: Remove available: true filter for admin panel)
app.get('/allproducts', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        const search = req.query.search || '';
        const category = req.query.category || '';
        const minPrice = parseFloat(req.query.minPrice);
        const maxPrice = parseFloat(req.query.maxPrice);
        const sortBy = req.query.sortBy || 'date';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        // Build query object - REMOVED available: true filter for admin panel
        let query = {};
        
        // Add search filter
        if (search && search.trim() !== '') {
            query.$or = [
                { name: { $regex: search.trim(), $options: 'i' } },
                { description: { $regex: search.trim(), $options: 'i' } },
                { category: { $regex: search.trim(), $options: 'i' } },
                { brand: { $regex: search.trim(), $options: 'i' } }
            ];
        }
        
        // Add category filter (only if not empty and not 'All')
        if (category && category.trim() !== '' && category.toLowerCase() !== 'all') {
            query.category = { $regex: new RegExp(`^${category}$`, 'i') };
        }
        
        // Add price range filter (only if valid numbers)
        if (!isNaN(minPrice) && !isNaN(maxPrice)) {
            query.new_price = { $gte: minPrice, $lte: maxPrice };
        } else if (!isNaN(minPrice)) {
            query.new_price = { $gte: minPrice };
        } else if (!isNaN(maxPrice)) {
            query.new_price = { $lte: maxPrice };
        }

        // Build sort object
        let sortObj = {};
        if (sortBy === 'name') {
            sortObj.name = sortOrder;
        } else if (sortBy === 'new_price') {
            sortObj.new_price = sortOrder;
        } else {
            sortObj.date = sortOrder;
        }

        // Execute queries
        const [products, totalProducts] = await Promise.all([
            Product.find(query)
                .sort(sortObj)
                .skip(skip)
                .limit(limit)
                .lean(), // Use lean() for better performance
            Product.countDocuments(query)
        ]);

        const totalPages = Math.ceil(totalProducts / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        console.log(`Found ${products.length} products out of ${totalProducts} total`);

        res.json({
            success: true,
            products: products,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalProducts: totalProducts,
                hasNextPage: hasNextPage,
                hasPrevPage: hasPrevPage,
                limit: limit
            }
        });
    } catch (error) {
        console.error('Error in /allproducts:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Internal server error'
        });
    }
});

app.get('/categories', async (req, res) => {
    try {
        const categories = await Product.distinct('category');
        res.json({
            success: true,
            categories: ['All', ...categories]
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
})

// =============================================
// NEW ENDPOINTS FOR PRODUCT DETAILS SUPPORT
// =============================================

// Get product analytics
app.get('/product/:id/analytics', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        
        const product = await Product.findOne({ id: productId });
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        // Get sales data from Sale model
        const salesData = await Sale.aggregate([
            { $match: { product_id: productId } },
            {
                $group: {
                    _id: null,
                    total_sales: { $sum: '$total_amount' },
                    total_quantity: { $sum: '$quantity' },
                    total_orders: { $sum: 1 },
                    avg_order_value: { $avg: '$total_amount' }
                }
            }
        ]);
        
        const sales = salesData[0] || {
            total_sales: 0,
            total_quantity: 0,
            total_orders: 0,
            avg_order_value: 0
        };
        
        const analytics = {
            views: product.views || 0,
            sales_count: product.sales_count || 0,
            conversion_rate: product.views > 0 ? ((product.sales_count / product.views) * 100).toFixed(2) : 0,
            stock_status: {
                current_stock: product.stock_quantity || 0,
                low_stock_threshold: product.low_stock_threshold || 10,
                is_low_stock: (product.stock_quantity || 0) <= (product.low_stock_threshold || 10),
                is_out_of_stock: (product.stock_quantity || 0) === 0
            },
            sales_metrics: sales
        };
        
        res.json({
            success: true,
            analytics: analytics
        });
        
    } catch (error) {
        console.error('Error fetching product analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics',
            error: error.message
        });
    }
});

// Update product inventory
app.put('/product/:id/inventory', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { stock_quantity, low_stock_threshold } = req.body;
        
        const updateData = {};
        
        if (stock_quantity !== undefined) {
            updateData.stock_quantity = stock_quantity;
        }
        
        if (low_stock_threshold !== undefined) {
            updateData.low_stock_threshold = low_stock_threshold;
        }
        
        const product = await Product.findOneAndUpdate(
            { id: productId },
            updateData,
            { new: true }
        );
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Inventory updated successfully',
            inventory: {
                stock_quantity: product.stock_quantity,
                low_stock_threshold: product.low_stock_threshold,
                is_low_stock: product.stock_quantity <= product.low_stock_threshold
            }
        });
        
    } catch (error) {
        console.error('Error updating inventory:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update inventory',
            error: error.message
        });
    }
});

// Increment sales count when a sale is made
app.post('/product/:id/sale', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { quantity = 1 } = req.body;
        
        const product = await Product.findOneAndUpdate(
            { id: productId },
            { 
                $inc: { 
                    sales_count: quantity,
                    stock_quantity: -quantity 
                }
            },
            { new: true }
        );
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Sales count updated',
            sales_count: product.sales_count,
            remaining_stock: product.stock_quantity
        });
        
    } catch (error) {
        console.error('Error updating sales count:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update sales count',
            error: error.message
        });
    }
});

// Get product recommendations
app.get('/product/:id/recommendations', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        
        const product = await Product.findOne({ id: productId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Get related products based on category, tags, and brand
        const relatedProducts = await Product.find({
            $and: [
                { id: { $ne: product.id } },
                { available: true },
                { status: 'published' },
                {
                    $or: [
                        { category: product.category },
                        { tags: { $in: product.tags || [] } },
                        { brand: product.brand }
                    ]
                }
            ]
        }).limit(8).sort({ views: -1 });

        res.json({
            success: true,
            recommendations: relatedProducts
        });
        
    } catch (error) {
        console.error('Error fetching recommendations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recommendations',
            error: error.message
        });
    }
});

// Bulk operations for admin efficiency
app.post('/products/bulk-status', async (req, res) => {
    try {
        const { productIds, available } = req.body;
        
        if (!productIds || !Array.isArray(productIds)) {
            return res.status(400).json({
                success: false,
                message: 'Product IDs array is required'
            });
        }
        
        const result = await Product.updateMany(
            { id: { $in: productIds } },
            { available: available }
        );
        
        res.json({
            success: true,
            message: `Updated ${result.modifiedCount} products`,
            modifiedCount: result.modifiedCount
        });
        
    } catch (error) {
        console.error('Error in bulk status update:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update products',
            error: error.message
        });
    }
});

// Bulk delete products
app.post('/products/bulk-delete', async (req, res) => {
    try {
        const { productIds } = req.body;
        
        if (!productIds || !Array.isArray(productIds)) {
            return res.status(400).json({
                success: false,
                message: 'Product IDs array is required'
            });
        }
        
        const result = await Product.deleteMany({
            id: { $in: productIds }
        });
        
        res.json({
            success: true,
            message: `Deleted ${result.deletedCount} products`,
            deletedCount: result.deletedCount
        });
        
    } catch (error) {
        console.error('Error in bulk delete:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete products',
            error: error.message
        });
    }
});
            
// Add this to your index.js file after your existing Product schemas and endpoints

// Cart Schema for logged-in users (unchanged)
const Cart = mongoose.model("Cart", {
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
            required: true
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

// Get user's cart (enhanced with better performance)
app.get('/cart/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Fetching cart for user:', userId);
        
        let cart = await Cart.findOne({ userId });
        
        if (!cart) {
            // Create empty cart if none exists
            cart = new Cart({ userId, items: [] });
            await cart.save();
            console.log('Created new cart for user:', userId);
        }
        
        // If cart is empty, return immediately
        if (cart.items.length === 0) {
            return res.json({
                success: true,
                cart: [],
                totalItems: 0,
                totalPrice: 0
            });
        }
        
        // Get full product details for cart items using single query
        const productIds = cart.items.map(item => item.productId);
        const products = await Product.find({ 
            id: { $in: productIds },
            available: true 
        });
        
        // Create product lookup map for better performance
        const productMap = new Map(products.map(p => [p.id, p]));
        
        const cartItemsWithDetails = [];
        const validItems = [];
        const removedItems = [];
        
        for (const item of cart.items) {
            const product = productMap.get(item.productId);
            if (product) {
                validItems.push(item);
                cartItemsWithDetails.push({
                    id: product.id,
                    name: product.name,
                    price: item.price, // Use price from when it was added to cart
                    quantity: item.quantity,
                    image: product.image,
                    category: product.category,
                    available: product.available,
                    stock_quantity: product.stock_quantity,
                    addedAt: item.addedAt
                });
            } else {
                // Track removed items for logging
                removedItems.push({
                    productId: item.productId,
                    quantity: item.quantity
                });
            }
        }
        
        // Save cart if items were removed
        if (validItems.length !== cart.items.length) {
            cart.items = validItems;
            cart.updatedAt = new Date();
            await cart.save();
            console.log(`Removed ${removedItems.length} unavailable items from cart for user ${userId}`);
        }
        
        const totalItems = cartItemsWithDetails.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = cartItemsWithDetails.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        console.log(`Cart loaded: ${cartItemsWithDetails.length} unique items, ${totalItems} total items`);
        
        res.json({
            success: true,
            cart: cartItemsWithDetails,
            totalItems: totalItems,
            totalPrice: totalPrice,
            removedItems: removedItems.length > 0 ? removedItems : undefined
        });
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            cart: [],
            totalItems: 0,
            totalPrice: 0
        });
    }
});

// Add item to cart (enhanced with better validation)
app.post('/cart/add', async (req, res) => {
    try {
        const { userId, productId, quantity = 1 } = req.body;
        console.log('Adding to cart:', { userId, productId, quantity });
        
        if (!userId || !productId) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Product ID are required'
            });
        }

        if (quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be greater than 0'
            });
        }
        
        // Get product details
        const product = await Product.findOne({ id: productId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        if (!product.available) {
            return res.status(400).json({
                success: false,
                message: 'Product is not available'
            });
        }
        
        // Check stock
        if (product.stock_quantity !== undefined && product.stock_quantity < quantity) {
            return res.status(400).json({
                success: false,
                message: `Not enough stock available. Only ${product.stock_quantity} items left.`
            });
        }
        
        // Find or create cart
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }
        
        // Check if item already exists in cart
        const existingItemIndex = cart.items.findIndex(item => item.productId === productId);
        
        if (existingItemIndex > -1) {
            // Update quantity
            const newQuantity = cart.items[existingItemIndex].quantity + quantity;
            
            // Check stock for new quantity
            if (product.stock_quantity !== undefined && product.stock_quantity < newQuantity) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock available. Only ${product.stock_quantity} items left. You currently have ${cart.items[existingItemIndex].quantity} in your cart.`
                });
            }
            
            cart.items[existingItemIndex].quantity = newQuantity;
            console.log(`Updated quantity for product ${productId} to ${newQuantity}`);
        } else {
            // Add new item
            cart.items.push({
                productId: productId,
                quantity: quantity,
                price: product.new_price,
                addedAt: new Date()
            });
            console.log(`Added new item ${productId} with quantity ${quantity}`);
        }
        
        cart.updatedAt = new Date();
        await cart.save();
        
        res.json({
            success: true,
            message: 'Item added to cart successfully',
            cart: cart
        });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to add item to cart'
        });
    }
});

// Update item quantity in cart (enhanced)
app.put('/cart/update', async (req, res) => {
    try {
        const { userId, productId, quantity } = req.body;
        console.log('Updating cart:', { userId, productId, quantity });
        
        if (!userId || !productId || quantity < 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid parameters'
            });
        }
        
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }
        
        const itemIndex = cart.items.findIndex(item => item.productId === productId);
        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }
        
        if (quantity === 0) {
            // Remove item
            cart.items.splice(itemIndex, 1);
            console.log(`Removed product ${productId} from cart`);
        } else {
            // Check stock
            const product = await Product.findOne({ id: productId });
            if (product && product.stock_quantity !== undefined && product.stock_quantity < quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock available. Only ${product.stock_quantity} items left.`
                });
            }
            
            // Update quantity
            cart.items[itemIndex].quantity = quantity;
            console.log(`Updated product ${productId} quantity to ${quantity}`);
        }
        
        cart.updatedAt = new Date();
        await cart.save();
        
        res.json({
            success: true,
            message: 'Cart updated successfully',
            cart: cart
        });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to update cart'
        });
    }
});

// Remove item from cart (unchanged)
app.delete('/cart/remove', async (req, res) => {
    try {
        const { userId, productId } = req.body;
        console.log('Removing from cart:', { userId, productId });
        
        if (!userId || !productId) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Product ID are required'
            });
        }
        
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }
        
        const initialLength = cart.items.length;
        cart.items = cart.items.filter(item => item.productId !== productId);
        
        if (cart.items.length === initialLength) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }
        
        cart.updatedAt = new Date();
        await cart.save();
        
        console.log(`Removed product ${productId} from cart`);
        
        res.json({
            success: true,
            message: 'Item removed from cart successfully',
            cart: cart
        });
    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to remove item from cart'
        });
    }
});

// Clear entire cart (enhanced with better response)
app.delete('/cart/clear/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Clearing cart for user:', userId);
        
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.json({
                success: true,
                message: 'Cart was already empty'
            });
        }
        
        const itemCount = cart.items.length;
        cart.items = [];
        cart.updatedAt = new Date();
        await cart.save();
        
        console.log(`Cleared ${itemCount} items from cart for user ${userId}`);
        
        res.json({
            success: true,
            message: 'Cart cleared successfully',
            clearedItems: itemCount
        });
    } catch (error) {
        console.error('Error clearing cart:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to clear cart'
        });
    }
});

// Enhanced sync cart from sessionStorage to backend (for when user logs in)
app.post('/cart/sync', async (req, res) => {
    try {
        const { userId, localCartItems } = req.body;
        console.log('Syncing session cart for user:', userId, 'Items:', localCartItems?.length || 0);
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }
        
        // Find or create cart
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }
        
        // Track sync results
        const syncResults = {
            syncedItems: [],
            failedItems: [],
            mergedItems: []
        };
        
        // Merge session cart items with server cart
        if (localCartItems && localCartItems.length > 0) {
            for (const localItem of localCartItems) {
                try {
                    // Validate session item
                    if (!localItem.id || !localItem.quantity || localItem.quantity <= 0) {
                        syncResults.failedItems.push({
                            item: localItem,
                            reason: 'Invalid item data'
                        });
                        continue;
                    }
                    
                    // Validate product still exists and is available
                    const product = await Product.findOne({ 
                        id: localItem.id,
                        available: true 
                    });
                    
                    if (!product) {
                        syncResults.failedItems.push({
                            item: localItem,
                            reason: 'Product no longer available'
                        });
                        continue;
                    }
                    
                    // Check stock availability
                    let finalQuantity = localItem.quantity;
                    if (product.stock_quantity !== undefined && product.stock_quantity < localItem.quantity) {
                        if (product.stock_quantity > 0) {
                            finalQuantity = product.stock_quantity;
                            syncResults.failedItems.push({
                                item: localItem,
                                reason: `Quantity reduced from ${localItem.quantity} to ${finalQuantity} due to stock availability`
                            });
                        } else {
                            syncResults.failedItems.push({
                                item: localItem,
                                reason: 'Out of stock'
                            });
                            continue;
                        }
                    }
                    
                    const existingItemIndex = cart.items.findIndex(item => item.productId === localItem.id);
                    
                    if (existingItemIndex > -1) {
                        // Item already exists in backend cart - merge quantities
                        const existingQuantity = cart.items[existingItemIndex].quantity;
                        const totalQuantity = existingQuantity + finalQuantity;
                        
                        // Check if total quantity exceeds stock
                        if (product.stock_quantity !== undefined && totalQuantity > product.stock_quantity) {
                            cart.items[existingItemIndex].quantity = product.stock_quantity;
                            syncResults.mergedItems.push({
                                productId: localItem.id,
                                productName: product.name,
                                sessionQuantity: finalQuantity,
                                existingQuantity: existingQuantity,
                                finalQuantity: product.stock_quantity,
                                note: `Total quantity limited by stock (${product.stock_quantity})`
                            });
                        } else {
                            cart.items[existingItemIndex].quantity = totalQuantity;
                            syncResults.mergedItems.push({
                                productId: localItem.id,
                                productName: product.name,
                                sessionQuantity: finalQuantity,
                                existingQuantity: existingQuantity,
                                finalQuantity: totalQuantity
                            });
                        }
                        
                        // Update price to current price
                        cart.items[existingItemIndex].price = product.new_price;
                    } else {
                        // Add new item from session cart
                        cart.items.push({
                            productId: localItem.id,
                            quantity: finalQuantity,
                            price: product.new_price,
                            addedAt: new Date()
                        });
                        
                        syncResults.syncedItems.push({
                            productId: localItem.id,
                            productName: product.name,
                            quantity: finalQuantity
                        });
                    }
                } catch (itemError) {
                    console.error(`Error processing session item ${localItem.id}:`, itemError);
                    syncResults.failedItems.push({
                        item: localItem,
                        reason: 'Processing error'
                    });
                }
            }
        }
        
        cart.updatedAt = new Date();
        await cart.save();
        
        console.log(`Session cart sync completed for user ${userId}:`);
        console.log(`- New items synced: ${syncResults.syncedItems.length}`);
        console.log(`- Items merged: ${syncResults.mergedItems.length}`);
        console.log(`- Failed items: ${syncResults.failedItems.length}`);
        console.log(`- Total cart items: ${cart.items.length}`);
        
        res.json({
            success: true,
            message: 'Session cart synced successfully',
            syncResults: {
                totalCartItems: cart.items.length,
                newItemsSynced: syncResults.syncedItems.length,
                itemsMerged: syncResults.mergedItems.length,
                failedItems: syncResults.failedItems.length,
                details: {
                    syncedItems: syncResults.syncedItems,
                    mergedItems: syncResults.mergedItems,
                    failedItems: syncResults.failedItems
                }
            }
        });
    } catch (error) {
        console.error('Error syncing session cart:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to sync session cart'
        });
    }
});

// Get cart summary (for header badge) - enhanced
app.get('/cart/summary/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const cart = await Cart.findOne({ userId });
        
        if (!cart || cart.items.length === 0) {
            return res.json({
                success: true,
                totalItems: 0,
                totalPrice: 0
            });
        }
        
        const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        res.json({
            success: true,
            totalItems: totalItems,
            totalPrice: totalPrice
        });
    } catch (error) {
        console.error('Error getting cart summary:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            totalItems: 0,
            totalPrice: 0
        });
    }
});

app.get('/dashboard/stats', async (req, res) => {
    try {
        const totalProducts = await Product.countDocuments();
        const activeProducts = await Product.countDocuments({ available: true });
        const inactiveProducts = await Product.countDocuments({ available: false });
        const publishedProducts = await Product.countDocuments({ status: 'published' });
        const draftProducts = await Product.countDocuments({ status: 'draft' });
        const featuredProducts = await Product.countDocuments({ featured: true });
        const lowStockProducts = await Product.countDocuments({ 
            $expr: { $lte: ['$stock_quantity', '$low_stock_threshold'] }
        });
        
        const categoryStats = await Product.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        const brandStats = await Product.aggregate([
            { $match: { brand: { $ne: '' } } },
            { $group: { _id: '$brand', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        
        const recentProducts = await Product.find({})
            .sort({ date: -1 })
            .limit(5);

        res.json({
            success: true,
            stats: {
                totalProducts,
                activeProducts,
                inactiveProducts,
                publishedProducts,
                draftProducts,
                featuredProducts,
                lowStockProducts,
                categoryStats,
                brandStats,
                recentProducts
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
})

// API to simulate a sale (for testing analytics)
app.post('/simulate-sale', async (req, res) => {
    try {
        const { product_id, quantity = 1 } = req.body;
        
        const product = await Product.findOne({ id: product_id });
        if (!product) {
            return res.json({ success: false, message: "Product not found" });
        }

        const saleDate = new Date();
        const total_amount = product.new_price * quantity;

        const sale = new Sale({
            product_id: product.id,
            product_name: product.name,
            category: product.category,
            price: product.new_price,
            quantity: quantity,
            total_amount: total_amount,
            date: saleDate,
            month: saleDate.getMonth() + 1,
            year: saleDate.getFullYear()
        });

        await sale.save();

        // Update product sales count and reduce stock
        await Product.findOneAndUpdate(
            { id: product_id },
            { 
                $inc: { 
                    sales_count: quantity,
                    stock_quantity: -quantity 
                }
            }
        );

        res.json({
            success: true,
            message: "Sale recorded successfully",
            sale: sale
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Analytics API - Sales Overview
app.get('/analytics/sales-overview', async (req, res) => {
    try {
        const { period = 'monthly', year = new Date().getFullYear() } = req.query;
        
        let groupBy, sortBy;
        let matchConditions = { year: parseInt(year) };

        if (period === 'daily') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            matchConditions = { date: { $gte: thirtyDaysAgo } };
            
            groupBy = {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                    total_sales: { $sum: "$total_amount" },
                    total_orders: { $sum: 1 },
                    total_quantity: { $sum: "$quantity" }
                }
            };
            sortBy = { $sort: { "_id": 1 } };
        } else if (period === 'weekly') {
            const twelveWeeksAgo = new Date();
            twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
            matchConditions = { date: { $gte: twelveWeeksAgo } };
            
            groupBy = {
                $group: {
                    _id: { 
                        week: { $week: "$date" },
                        year: { $year: "$date" }
                    },
                    total_sales: { $sum: "$total_amount" },
                    total_orders: { $sum: 1 },
                    total_quantity: { $sum: "$quantity" }
                }
            };
            sortBy = { $sort: { "_id.year": 1, "_id.week": 1 } };
        } else if (period === 'monthly') {
            groupBy = {
                $group: {
                    _id: "$month",
                    total_sales: { $sum: "$total_amount" },
                    total_orders: { $sum: 1 },
                    total_quantity: { $sum: "$quantity" }
                }
            };
            sortBy = { $sort: { "_id": 1 } };
        } else if (period === 'yearly') {
            matchConditions = {};
            groupBy = {
                $group: {
                    _id: "$year",
                    total_sales: { $sum: "$total_amount" },
                    total_orders: { $sum: 1 },
                    total_quantity: { $sum: "$quantity" }
                }
            };
            sortBy = { $sort: { "_id": 1 } };
        }

        const salesData = await Sale.aggregate([
            { $match: matchConditions },
            groupBy,
            sortBy
        ]);

        res.json({
            success: true,
            data: salesData,
            period: period,
            year: year
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Analytics API - Product Performance
app.get('/analytics/product-performance', async (req, res) => {
    try {
        const { month, year = new Date().getFullYear() } = req.query;
        
        let matchConditions = { year: parseInt(year) };
        if (month) {
            matchConditions.month = parseInt(month);
        }

        const productPerformance = await Sale.aggregate([
            { $match: matchConditions },
            {
                $group: {
                    _id: {
                        product_id: "$product_id",
                        product_name: "$product_name",
                        category: "$category"
                    },
                    total_sales: { $sum: "$total_amount" },
                    total_quantity: { $sum: "$quantity" },
                    total_orders: { $sum: 1 },
                    avg_price: { $avg: "$price" }
                }
            },
            { $sort: { total_sales: -1 } },
            { $limit: 20 }
        ]);

        const products = await Product.find({}, 'id name views sales_count');
        const productViews = {};
        products.forEach(product => {
            productViews[product.id] = {
                views: product.views || 0,
                sales_count: product.sales_count || 0
            };
        });

        const enhancedPerformance = productPerformance.map(item => ({
            ...item,
            views: productViews[item._id.product_id]?.views || 0,
            conversion_rate: productViews[item._id.product_id]?.views > 0 
                ? ((item.total_quantity / productViews[item._id.product_id].views) * 100).toFixed(2)
                : 0
        }));

        res.json({
            success: true,
            data: enhancedPerformance,
            month: month,
            year: year
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Analytics API - Category Performance
app.get('/analytics/category-performance', async (req, res) => {
    try {
        const { year = new Date().getFullYear() } = req.query;
        
        const categoryPerformance = await Sale.aggregate([
            { $match: { year: parseInt(year) } },
            {
                $group: {
                    _id: "$category",
                    total_sales: { $sum: "$total_amount" },
                    total_quantity: { $sum: "$quantity" },
                    total_orders: { $sum: 1 },
                    avg_order_value: { $avg: "$total_amount" }
                }
            },
            { $sort: { total_sales: -1 } }
        ]);

        res.json({
            success: true,
            data: categoryPerformance,
            year: year
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Analytics API - Revenue Metrics
app.get('/analytics/revenue-metrics', async (req, res) => {
    try {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        const todayStart = new Date(currentDate.setHours(0, 0, 0, 0));
        const todayEnd = new Date(currentDate.setHours(23, 59, 59, 999));
        
        const todayRevenue = await Sale.aggregate([
            { $match: { date: { $gte: todayStart, $lte: todayEnd } } },
            { $group: { _id: null, total: { $sum: "$total_amount" } } }
        ]);

        const monthRevenue = await Sale.aggregate([
            { $match: { year: currentYear, month: currentMonth } },
            { $group: { _id: null, total: { $sum: "$total_amount" } } }
        ]);

        const yearRevenue = await Sale.aggregate([
            { $match: { year: currentYear } },
            { $group: { _id: null, total: { $sum: "$total_amount" } } }
        ]);

        const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
        
        const lastMonthRevenue = await Sale.aggregate([
            { $match: { year: lastMonthYear, month: lastMonth } },
            { $group: { _id: null, total: { $sum: "$total_amount" } } }
        ]);

        const todayTotal = todayRevenue[0]?.total || 0;
        const monthTotal = monthRevenue[0]?.total || 0;
        const yearTotal = yearRevenue[0]?.total || 0;
        const lastMonthTotal = lastMonthRevenue[0]?.total || 0;

        const monthGrowth = lastMonthTotal > 0 
            ? (((monthTotal - lastMonthTotal) / lastMonthTotal) * 100).toFixed(2)
            : 0;

        res.json({
            success: true,
            metrics: {
                today: todayTotal,
                month: monthTotal,
                year: yearTotal,
                monthGrowth: parseFloat(monthGrowth)
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Generate sample sales data for testing
app.post('/generate-sample-data', async (req, res) => {
    try {
        const products = await Product.find({ available: true });
        if (products.length === 0) {
            return res.json({ success: false, message: "No products found. Add products first." });
        }

        const sales = [];
        const currentDate = new Date();
        
        for (let i = 0; i < 12; i++) {
            const saleDate = new Date(currentDate);
            saleDate.setMonth(saleDate.getMonth() - i);
            
            const salesCount = Math.floor(Math.random() * 11) + 5;
            
            for (let j = 0; j < salesCount; j++) {
                const randomProduct = products[Math.floor(Math.random() * products.length)];
                const quantity = Math.floor(Math.random() * 3) + 1;
                const randomDay = Math.floor(Math.random() * 28) + 1;
                
                const specificDate = new Date(saleDate.getFullYear(), saleDate.getMonth(), randomDay);
                
                const sale = new Sale({
                    product_id: randomProduct.id,
                    product_name: randomProduct.name,
                    category: randomProduct.category,
                    price: randomProduct.new_price,
                    quantity: quantity,
                    total_amount: randomProduct.new_price * quantity,
                    date: specificDate,
                    month: specificDate.getMonth() + 1,
                    year: specificDate.getFullYear()
                });
                
                sales.push(sale);
            }
        }

        await Sale.insertMany(sales);
        
        for (const product of products) {
            const totalSales = await Sale.aggregate([
                { $match: { product_id: product.id } },
                { $group: { _id: null, total: { $sum: "$quantity" } } }
            ]);
            
            await Product.findOneAndUpdate(
                { id: product.id },
                { 
                    sales_count: totalSales[0]?.total || 0,
                    views: Math.floor(Math.random() * 1000) + 100
                }
            );
        }

        res.json({
            success: true,
            message: `Generated ${sales.length} sample sales records`,
            salesGenerated: sales.length
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API for inventory management
app.get('/inventory/low-stock', async (req, res) => {
    try {
        const lowStockProducts = await Product.find({
            $expr: { $lte: ['$stock_quantity', '$low_stock_threshold'] },
            available: true
        }).sort({ stock_quantity: 1 });

        res.json({
            success: true,
            products: lowStockProducts
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API for updating stock quantity
app.post('/inventory/update-stock', async (req, res) => {
    try {
        const { product_id, quantity, operation = 'set' } = req.body;
        
        let updateOperation;
        if (operation === 'add') {
            updateOperation = { $inc: { stock_quantity: quantity } };
        } else if (operation === 'subtract') {
            updateOperation = { $inc: { stock_quantity: -quantity } };
        } else {
            updateOperation = { stock_quantity: quantity };
        }

        const updatedProduct = await Product.findOneAndUpdate(
            { id: product_id },
            updateOperation,
            { new: true }
        );

        if (!updatedProduct) {
            return res.json({
                success: false,
                message: "Product not found"
            });
        }

        res.json({
            success: true,
            product: updatedProduct
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API for bulk operations
app.post('/products/bulk-update', async (req, res) => {
    try {
        const { product_ids, updates } = req.body;
        
        const result = await Product.updateMany(
            { id: { $in: product_ids } },
            updates
        );

        res.json({
            success: true,
            message: `Updated ${result.modifiedCount} products`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API for product recommendations
app.get('/product/:id/recommendations', async (req, res) => {
    try {
        const product = await Product.findOne({ id: parseInt(req.params.id) });
        if (!product) {
            return res.json({
                success: false,
                message: "Product not found"
            });
        }

        // Get related products based on category and tags
        const relatedProducts = await Product.find({
            $and: [
                { id: { $ne: product.id } },
                { available: true },
                { status: 'published' },
                {
                    $or: [
                        { category: product.category },
                        { tags: { $in: product.tags } },
                        { brand: product.brand }
                    ]
                }
            ]
        }).limit(8).sort({ views: -1 });

        res.json({
            success: true,
            recommendations: relatedProducts
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// API for SEO sitemap
app.get('/sitemap/products', async (req, res) => {
    try {
        const products = await Product.find(
            { available: true, status: 'published' },
            'slug date'
        ).sort({ date: -1 });

        const sitemap = products.map(product => ({
            url: `/products/${product.slug}`,
            lastModified: product.date,
            priority: 0.8
        }));

        res.json({
            success: true,
            sitemap: sitemap
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Add these endpoints to your existing index.js file after your existing APIs

// Enhanced Wishlist Schema (you already have a basic one, but this is more complete)
const Wishlist = mongoose.model("Wishlist", {
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
        // Optional: Store product info at time of adding to wishlist
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

// Get user's wishlist
app.get('/wishlist/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Fetching wishlist for user:', userId);
        
        let wishlist = await Wishlist.findOne({ userId });
        
        if (!wishlist) {
            // Create empty wishlist if none exists
            wishlist = new Wishlist({ userId, items: [] });
            await wishlist.save();
            console.log('Created new wishlist for user:', userId);
        }
        
        // Get full product details for wishlist items
        const wishlistItemsWithDetails = [];
        
        for (const item of wishlist.items) {
            const product = await Product.findOne({ id: item.productId });
            if (product && product.available) {
                wishlistItemsWithDetails.push({
                    id: product.id,
                    name: product.name,
                    new_price: product.new_price,
                    old_price: product.old_price,
                    image: product.image,
                    category: product.category,
                    brand: product.brand,
                    available: product.available,
                    stock_quantity: product.stock_quantity,
                    featured: product.featured,
                    slug: product.slug,
                    addedAt: item.addedAt,
                    hasDiscount: product.old_price > product.new_price,
                    discountPercentage: product.old_price > product.new_price 
                        ? Math.round(((product.old_price - product.new_price) / product.old_price) * 100)
                        : 0
                });
            } else {
                // Remove unavailable products from wishlist
                wishlist.items = wishlist.items.filter(wishlistItem => wishlistItem.productId !== item.productId);
            }
        }
        
        // Save wishlist if items were removed
        if (wishlistItemsWithDetails.length !== wishlist.items.length) {
            wishlist.updatedAt = new Date();
            await wishlist.save();
        }
        
        console.log(`Wishlist loaded: ${wishlistItemsWithDetails.length} items`);
        
        res.json({
            success: true,
            wishlist: wishlistItemsWithDetails,
            totalItems: wishlistItemsWithDetails.length
        });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            wishlist: [],
            totalItems: 0
        });
    }
});

// Add item to wishlist
app.post('/wishlist/add', async (req, res) => {
    try {
        const { userId, productId } = req.body;
        console.log('Adding to wishlist:', { userId, productId });
        
        if (!userId || !productId) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Product ID are required'
            });
        }
        
        // Get product details
        const product = await Product.findOne({ id: productId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        if (!product.available) {
            return res.status(400).json({
                success: false,
                message: 'Product is not available'
            });
        }
        
        // Find or create wishlist
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, items: [] });
        }
        
        // Check if item already exists in wishlist
        const existingItemIndex = wishlist.items.findIndex(item => item.productId === productId);
        
        if (existingItemIndex > -1) {
            return res.status(400).json({
                success: false,
                message: 'Item is already in your wishlist',
                alreadyExists: true
            });
        }
        
        // Add new item with product snapshot
        wishlist.items.push({
            productId: productId,
            addedAt: new Date(),
            productSnapshot: {
                name: product.name,
                price: product.new_price,
                image: product.image,
                category: product.category
            }
        });
        
        wishlist.updatedAt = new Date();
        await wishlist.save();
        
        console.log(`Added product ${productId} to wishlist for user ${userId}`);
        
        res.json({
            success: true,
            message: 'Item added to wishlist successfully',
            totalItems: wishlist.items.length
        });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to add item to wishlist'
        });
    }
});

// Remove item from wishlist
app.delete('/wishlist/remove', async (req, res) => {
    try {
        const { userId, productId } = req.body;
        console.log('Removing from wishlist:', { userId, productId });
        
        if (!userId || !productId) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Product ID are required'
            });
        }
        
        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }
        
        const initialLength = wishlist.items.length;
        wishlist.items = wishlist.items.filter(item => item.productId !== productId);
        
        if (wishlist.items.length === initialLength) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in wishlist'
            });
        }
        
        wishlist.updatedAt = new Date();
        await wishlist.save();
        
        console.log(`Removed product ${productId} from wishlist for user ${userId}`);
        
        res.json({
            success: true,
            message: 'Item removed from wishlist successfully',
            totalItems: wishlist.items.length
        });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to remove item from wishlist'
        });
    }
});

// Clear entire wishlist
app.delete('/wishlist/clear/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Clearing wishlist for user:', userId);
        
        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }
        
        wishlist.items = [];
        wishlist.updatedAt = new Date();
        await wishlist.save();
        
        console.log(`Cleared wishlist for user ${userId}`);
        
        res.json({
            success: true,
            message: 'Wishlist cleared successfully'
        });
    } catch (error) {
        console.error('Error clearing wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to clear wishlist'
        });
    }
});

// Check if item is in wishlist
app.get('/wishlist/check/:userId/:productId', async (req, res) => {
    try {
        const { userId, productId } = req.params;
        
        const wishlist = await Wishlist.findOne({ userId });
        
        if (!wishlist) {
            return res.json({
                success: true,
                isInWishlist: false
            });
        }
        
        const isInWishlist = wishlist.items.some(item => item.productId === parseInt(productId));
        
        res.json({
            success: true,
            isInWishlist: isInWishlist
        });
    } catch (error) {
        console.error('Error checking wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            isInWishlist: false
        });
    }
});

// Get wishlist summary (for header badge)
app.get('/wishlist/summary/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const wishlist = await Wishlist.findOne({ userId });
        
        if (!wishlist) {
            return res.json({
                success: true,
                totalItems: 0
            });
        }
        
        res.json({
            success: true,
            totalItems: wishlist.items.length
        });
    } catch (error) {
        console.error('Error getting wishlist summary:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            totalItems: 0
        });
    }
});

// Sync wishlist from localStorage to backend (for when user logs in)
app.post('/wishlist/sync', async (req, res) => {
    try {
        const { userId, localWishlistItems } = req.body;
        console.log('Syncing wishlist for user:', userId, 'Items:', localWishlistItems?.length || 0);
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }
        
        // Find or create wishlist
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, items: [] });
        }
        
        // Merge local wishlist items with server wishlist
        if (localWishlistItems && localWishlistItems.length > 0) {
            for (const localItemId of localWishlistItems) {
                const existingItemIndex = wishlist.items.findIndex(item => item.productId === localItemId);
                
                if (existingItemIndex === -1) {
                    // Get product details for snapshot
                    const product = await Product.findOne({ id: localItemId });
                    if (product && product.available) {
                        wishlist.items.push({
                            productId: localItemId,
                            addedAt: new Date(),
                            productSnapshot: {
                                name: product.name,
                                price: product.new_price,
                                image: product.image,
                                category: product.category
                            }
                        });
                    }
                }
            }
        }
        
        wishlist.updatedAt = new Date();
        await wishlist.save();
        
        console.log(`Synced wishlist for user ${userId}, total items: ${wishlist.items.length}`);
        
        res.json({
            success: true,
            message: 'Wishlist synced successfully',
            totalItems: wishlist.items.length
        });
    } catch (error) {
        console.error('Error syncing wishlist:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to sync wishlist'
        });
    }
});

// Move items from wishlist to cart
app.post('/wishlist/move-to-cart', async (req, res) => {
    try {
        const { userId, productIds, quantity = 1 } = req.body;
        
        if (!userId || !productIds || !Array.isArray(productIds)) {
            return res.status(400).json({
                success: false,
                message: 'User ID and Product IDs array are required'
            });
        }
        
        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }
        
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }
        
        const movedItems = [];
        const failedItems = [];
        
        for (const productId of productIds) {
            const product = await Product.findOne({ id: productId });
            
            if (!product || !product.available) {
                failedItems.push({ productId, reason: 'Product not available' });
                continue;
            }
            
            // Check stock
            if (product.stock_quantity !== undefined && product.stock_quantity < quantity) {
                failedItems.push({ productId, reason: 'Not enough stock' });
                continue;
            }
            
            // Add to cart
            const existingCartItemIndex = cart.items.findIndex(item => item.productId === productId);
            
            if (existingCartItemIndex > -1) {
                cart.items[existingCartItemIndex].quantity += quantity;
            } else {
                cart.items.push({
                    productId: productId,
                    quantity: quantity,
                    price: product.new_price,
                    addedAt: new Date()
                });
            }
            
            // Remove from wishlist
            wishlist.items = wishlist.items.filter(item => item.productId !== productId);
            movedItems.push(productId);
        }
        
        // Save both cart and wishlist
        cart.updatedAt = new Date();
        wishlist.updatedAt = new Date();
        
        await Promise.all([cart.save(), wishlist.save()]);
        
        res.json({
            success: true,
            message: `Successfully moved ${movedItems.length} items to cart`,
            movedItems: movedItems,
            failedItems: failedItems,
            cartTotalItems: cart.items.length,
            wishlistTotalItems: wishlist.items.length
        });
        
    } catch (error) {
        console.error('Error moving items to cart:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to move items to cart'
        });
    }
});

// Get wishlist analytics for admin
app.get('/admin/wishlist/analytics', async (req, res) => {
    try {
        const totalWishlists = await Wishlist.countDocuments();
        const activeWishlists = await Wishlist.countDocuments({ 'items.0': { $exists: true } });
        
        // Most wishlisted products
        const mostWishlisted = await Wishlist.aggregate([
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        
        // Get product details for most wishlisted
        const productIds = mostWishlisted.map(item => item._id);
        const products = await Product.find({ id: { $in: productIds } });
        
        const wishlistAnalytics = mostWishlisted.map(item => {
            const product = products.find(p => p.id === item._id);
            return {
                productId: item._id,
                productName: product?.name || 'Unknown',
                category: product?.category || 'Unknown',
                wishlistCount: item.count,
                currentPrice: product?.new_price || 0,
                image: product?.image || ''
            };
        });
        
        // Average items per wishlist
        const avgItemsResult = await Wishlist.aggregate([
            { $project: { itemCount: { $size: '$items' } } },
            { $group: { _id: null, avgItems: { $avg: '$itemCount' } } }
        ]);
        
        const avgItemsPerWishlist = avgItemsResult[0]?.avgItems || 0;
        
        res.json({
            success: true,
            analytics: {
                totalWishlists,
                activeWishlists,
                emptyWishlists: totalWishlists - activeWishlists,
                avgItemsPerWishlist: Math.round(avgItemsPerWishlist * 100) / 100,
                mostWishlisted: wishlistAnalytics
            }
        });
    } catch (error) {
        console.error('Error fetching wishlist analytics:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Add these to your index.js file after your existing schemas and before app.listen()

// Install required packages first:
// npm install nodemailer
// npm install dotenv (if not already installed)

const nodemailer = require('nodemailer');
require('dotenv').config();

// Contact Form Schema
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
const Newsletter = mongoose.model("Newsletter", {
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
    lastEmailSent: {
        type: Date
    },
    unsubscribedAt: {
        type: Date
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: {
        type: String
    }
});

// Newsletter subscription endpoint
app.post('/newsletter/subscribe', async (req, res) => {
    try {
        const { email, name = '', source = 'website' } = req.body;

        // Validation
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

        // Check if already subscribed
        const existingSubscriber = await Newsletter.findOne({ email: email.toLowerCase() });
        
        if (existingSubscriber) {
            if (existingSubscriber.status === 'active') {
                return res.json({
                    success: true,
                    message: 'You are already subscribed to our newsletter!',
                    alreadySubscribed: true
                });
            } else if (existingSubscriber.status === 'unsubscribed') {
                // Resubscribe
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

        // Generate verification token
        const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        // Create new subscriber
        const subscriber = new Newsletter({
            email: email.toLowerCase(),
            name: name,
            status: 'active', // For now, we'll set as active immediately
            subscriptionSource: source,
            ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
            userAgent: req.headers['user-agent'] || '',
            verificationToken: verificationToken,
            emailVerified: false // In production, send verification email
        });

        await subscriber.save();

        // In production, you would send a welcome email here
        // console.log('New newsletter subscriber:', email);

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
            // Duplicate email error
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

// Newsletter unsubscribe endpoint
app.post('/newsletter/unsubscribe', async (req, res) => {
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

        // Update subscription status
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

// Get newsletter statistics (admin endpoint)
app.get('/newsletter/stats', async (req, res) => {
    try {
        const totalSubscribers = await Newsletter.countDocuments();
        const activeSubscribers = await Newsletter.countDocuments({ status: 'active' });
        const unsubscribedCount = await Newsletter.countDocuments({ status: 'unsubscribed' });
        const pendingCount = await Newsletter.countDocuments({ status: 'pending' });

        // Monthly subscription growth
        const monthlyGrowth = await Newsletter.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: '$subscribedAt' },
                        month: { $month: '$subscribedAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 12 }
        ]);

        // Subscription sources
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
                pendingCount,
                monthlyGrowth,
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

// Get all subscribers (admin endpoint)
app.get('/newsletter/subscribers', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        const status = req.query.status || 'all';

        let query = {};
        if (status !== 'all') {
            query.status = status;
        }

        const totalCount = await Newsletter.countDocuments(query);
        const subscribers = await Newsletter.find(query)
            .sort({ subscribedAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-verificationToken'); // Don't expose verification tokens

        res.json({
            success: true,
            subscribers: subscribers,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalCount: totalCount
            }
        });

    } catch (error) {
        console.error('Newsletter subscribers error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching subscribers'
        });
    }
});

// Newsletter preferences update endpoint
app.put('/newsletter/preferences', async (req, res) => {
    try {
        const { email, preferences } = req.body;

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

        // Update preferences
        if (preferences) {
            subscriber.preferences = { ...subscriber.preferences, ...preferences };
            await subscriber.save();
        }

        res.json({
            success: true,
            message: 'Your preferences have been updated successfully',
            preferences: subscriber.preferences
        });

    } catch (error) {
        console.error('Newsletter preferences error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating preferences'
        });
    }
});

// ADD THESE ORDERS API ENDPOINTS TO YOUR EXISTING index.js FILE
// Place these after your existing Order schema and before app.listen()

// =============================================
// ORDERS API ENDPOINTS - ADD TO EXISTING CODE
// =============================================

// Get all orders for a user with pagination, filtering, and search
app.get('/orders', verifyToken, async (req, res) => {
    try {
        console.log('📋 Fetching orders for user:', req.user.id);
        
        const { 
            page = 1, 
            limit = 10, 
            status = '', 
            search = '',
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = { userId: req.user.id };
        
        // Add status filter
        if (status && status !== '') {
            query.status = status;
        }
        
        // Add search filter (search by order ID)
        if (search && search !== '') {
            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { 'items.name': { $regex: search, $options: 'i' } }
            ];
        }

        // Calculate pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Get total count for pagination
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limitNum);

        // Fetch orders with sorting
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const orders = await Order.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean(); // Use lean() for better performance

        console.log(`📋 Found ${orders.length} orders out of ${totalOrders} total`);

        // Transform orders for frontend
        const transformedOrders = orders.map(order => ({
            id: order._id,
            orderId: order.orderId,
            orderNumber: order.orderId, // For compatibility with frontend
            status: order.status || 'pending',
            totalAmount: order.amount?.total || order.totalAmount || 0,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            paymentMethod: order.paymentMethod === 'stripe' ? 'Credit Card' : 
                         order.paymentMethod === 'paypal' ? 'PayPal' : 
                         order.paymentMethod || 'Credit Card',
            paymentStatus: order.paymentStatus || 'completed',
            items: order.items.map(item => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image
            })),
            shippingAddress: order.shippingAddress || {},
            billingAddress: order.billingAddress || {}
        }));

        res.json({
            success: true,
            orders: transformedOrders,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalOrders,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1,
                limit: limitNum
            }
        });

    } catch (error) {
        console.error('❌ Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
});

// Get single order details by ID
app.get('/orders/:orderId', verifyToken, async (req, res) => {
    try {
        console.log('📋 Fetching order details:', req.params.orderId);
        
        const order = await Order.findOne({
            $or: [
                { _id: req.params.orderId },
                { orderId: req.params.orderId }
            ],
            userId: req.user.id
        }).lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Transform order for frontend with detailed info
        const transformedOrder = {
            id: order._id,
            orderId: order.orderId,
            orderNumber: order.orderId,
            status: order.status || 'pending',
            totalAmount: order.amount?.total || order.totalAmount || 0,
            subtotal: order.amount?.subtotal || 0,
            shipping: order.amount?.shipping || 0,
            tax: order.amount?.tax || 0,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            paymentMethod: order.paymentMethod === 'stripe' ? 'Credit Card' : 
                         order.paymentMethod === 'paypal' ? 'PayPal' : 
                         order.paymentMethod || 'Credit Card',
            paymentStatus: order.paymentStatus || 'completed',
            items: order.items.map(item => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image,
                productId: item.productId
            })),
            shippingAddress: order.shippingAddress || {},
            billingAddress: order.billingAddress || {},
            // Create a basic timeline based on order status
            timeline: createOrderTimeline(order)
        };

        console.log('✅ Order details retrieved successfully');

        res.json({
            success: true,
            order: transformedOrder
        });

    } catch (error) {
        console.error('❌ Error fetching order details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order details',
            error: error.message
        });
    }
});

// Cancel an order (if it's still cancellable)
app.post('/orders/:orderId/cancel', verifyToken, async (req, res) => {
    try {
        console.log('❌ Cancelling order:', req.params.orderId);
        
        const order = await Order.findOne({
            $or: [
                { _id: req.params.orderId },
                { orderId: req.params.orderId }
            ],
            userId: req.user.id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order can be cancelled
        const cancellableStatuses = ['pending', 'confirmed', 'processing'];
        if (!cancellableStatuses.includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel order with status: ${order.status}`
            });
        }

        // Update order status to cancelled
        order.status = 'cancelled';
        order.updatedAt = new Date();
        await order.save();

        console.log('✅ Order cancelled successfully');

        res.json({
            success: true,
            message: 'Order cancelled successfully',
            order: {
                id: order._id,
                orderId: order.orderId,
                status: order.status
            }
        });

    } catch (error) {
        console.error('❌ Error cancelling order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order',
            error: error.message
        });
    }
});

// Get user's order statistics
app.get('/orders/stats/summary', verifyToken, async (req, res) => {
    try {
        console.log('📊 Fetching order stats for user:', req.user.id);
        
        const stats = await Order.aggregate([
            { $match: { userId: req.user.id } },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalSpent: { $sum: { $ifNull: ['$amount.total', '$totalAmount'] } },
                    statusCounts: {
                        $push: '$status'
                    }
                }
            }
        ]);

        const statusCounts = {};
        if (stats.length > 0 && stats[0].statusCounts) {
            stats[0].statusCounts.forEach(status => {
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
        }

        const summary = {
            totalOrders: stats.length > 0 ? stats[0].totalOrders : 0,
            totalSpent: stats.length > 0 ? stats[0].totalSpent : 0,
            statusCounts,
            recentOrdersCount: await Order.countDocuments({
                userId: req.user.id,
                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
            })
        };

        res.json({
            success: true,
            stats: summary
        });

    } catch (error) {
        console.error('❌ Error fetching order stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order statistics',
            error: error.message
        });
    }
});

// Helper function to create order timeline
function createOrderTimeline(order) {
    const timeline = [];
    const now = new Date();
    
    // Order placed
    timeline.push({
        title: 'Order Placed',
        description: 'Your order has been successfully placed',
        date: order.createdAt,
        completed: true
    });

    // Order confirmed
    if (['confirmed', 'processing', 'shipped', 'delivered'].includes(order.status)) {
        timeline.push({
            title: 'Order Confirmed',
            description: 'Your order has been confirmed and is being prepared',
            date: order.updatedAt,
            completed: true
        });
    }

    // Processing
    if (['processing', 'shipped', 'delivered'].includes(order.status)) {
        timeline.push({
            title: 'Processing',
            description: 'Your order is being processed and prepared for shipping',
            date: order.status === 'processing' ? order.updatedAt : null,
            completed: ['processing', 'shipped', 'delivered'].includes(order.status)
        });
    }

    // Shipped
    if (['shipped', 'delivered'].includes(order.status)) {
        timeline.push({
            title: 'Shipped',
            description: 'Your order has been shipped and is on the way',
            date: order.status === 'shipped' ? order.updatedAt : null,
            completed: ['shipped', 'delivered'].includes(order.status)
        });
    }

    // Delivered
    timeline.push({
        title: 'Delivered',
        description: 'Your order has been delivered',
        date: order.status === 'delivered' ? order.updatedAt : null,
        completed: order.status === 'delivered'
    });

    // Handle cancelled orders
    if (order.status === 'cancelled') {
        timeline.push({
            title: 'Order Cancelled',
            description: 'Your order has been cancelled',
            date: order.updatedAt,
            completed: true
        });
    }

    return timeline;
}

// ===== UPDATE YOUR EXISTING CART/WISHLIST SUMMARY ROUTES =====
// These should REPLACE or be added to your existing cart/wishlist summary routes

// Enhanced cart summary route (ADD THIS IF NOT EXISTS)
app.get('/cart/summary/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Verify user can access this cart
        if (req.user.id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const cart = await Cart.findOne({ userId });
        
        if (!cart || cart.items.length === 0) {
            return res.json({
                success: true,
                totalItems: 0,
                totalValue: 0,
                itemCount: 0
            });
        }

        // Get product details for accurate pricing
        const productIds = cart.items.map(item => item.productId);
        const products = await Product.find({ id: { $in: productIds } });
        const productMap = new Map(products.map(p => [p.id, p]));

        let totalItems = 0;
        let totalValue = 0;

        cart.items.forEach(item => {
            const product = productMap.get(item.productId);
            if (product) {
                totalItems += item.quantity;
                totalValue += (item.price * item.quantity);
            }
        });

        res.json({
            success: true,
            totalItems,
            totalValue: parseFloat(totalValue.toFixed(2)),
            itemCount: cart.items.length
        });

    } catch (error) {
        console.error('Error getting cart summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get cart summary',
            error: error.message,
            totalItems: 0,
            totalValue: 0,
            itemCount: 0
        });
    }
});

// Enhanced wishlist summary route (ADD THIS IF NOT EXISTS)
app.get('/wishlist/summary/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Verify user can access this wishlist
        if (req.user.id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const wishlist = await Wishlist.findOne({ userId });
        
        if (!wishlist || wishlist.items.length === 0) {
            return res.json({
                success: true,
                totalItems: 0,
                totalValue: 0,
                itemCount: 0
            });
        }

        // Get product details for current pricing
        const productIds = wishlist.items.map(item => item.productId);
        const products = await Product.find({ 
            id: { $in: productIds },
            available: true 
        });

        const totalValue = products.reduce((sum, product) => sum + product.new_price, 0);

        res.json({
            success: true,
            totalItems: wishlist.items.length,
            totalValue: parseFloat(totalValue.toFixed(2)),
            itemCount: wishlist.items.length
        });

    } catch (error) {
        console.error('Error getting wishlist summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get wishlist summary',
            error: error.message,
            totalItems: 0,
            totalValue: 0,
            itemCount: 0
        });
    }
});

// Test endpoint to verify orders system is working
app.get('/test/orders', async (req, res) => {
    try {
        const orderCount = await Order.countDocuments();
        
        // Get a sample order to show structure
        const sampleOrder = await Order.findOne().lean();
        
        res.json({
            success: true,
            message: 'Orders API is working',
            totalOrders: orderCount,
            sampleOrderStructure: sampleOrder ? {
                id: sampleOrder._id,
                orderId: sampleOrder.orderId,
                userId: sampleOrder.userId,
                status: sampleOrder.status,
                createdAt: sampleOrder.createdAt,
                hasItems: Array.isArray(sampleOrder.items),
                itemCount: sampleOrder.items ? sampleOrder.items.length : 0,
                hasShippingAddress: !!sampleOrder.shippingAddress,
                paymentMethod: sampleOrder.paymentMethod
            } : 'No orders found'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

console.log('📋 Orders API routes loaded successfully');
console.log('📋 Available order endpoints:');
console.log('   GET  /orders - Get user orders with pagination');
console.log('   GET  /orders/:orderId - Get single order details'); 
console.log('   POST /orders/:orderId/cancel - Cancel an order');
console.log('   GET  /orders/stats/summary - Get user order statistics');
console.log('   GET  /cart/summary/:userId - Get cart summary');
console.log('   GET  /wishlist/summary/:userId - Get wishlist summary');
console.log('   GET  /test/orders - Test orders system');

// =============================================
// END OF ORDERS API INTEGRATION
// =============================================
// =============================================
// ADMIN ORDERS API ENDPOINTS - ADD TO YOUR index.js
// Add these after your existing Order schema and before app.listen()
// =============================================

// =============================================
// FIXED ADMIN ORDERS API ENDPOINTS - REPLACE YOUR EXISTING ADMIN ORDER ENDPOINTS
// ================

// =============================================
// FIXED ADMIN ORDERS API ENDPOINTS - CORRECT ROUTE ORDER
// Replace your existing admin order endpoints with this version
// =============================================

// Admin: Get all orders with pagination, filtering, and search
app.get('/admin/orders', async (req, res) => {
    try {
        console.log('📋 Admin fetching all orders');
        
        const { 
            page = 1, 
            limit = 10, 
            status = '', 
            search = '',
            date = '',
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = {};
        
        // Add status filter
        if (status && status !== '') {
            query.status = status;
        }
        
        // Add search filter (search by order ID, customer name, or email)
        if (search && search !== '') {
            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { 'shippingAddress.name': { $regex: search, $options: 'i' } },
                { 'shippingAddress.email': { $regex: search, $options: 'i' } },
                { 'items.name': { $regex: search, $options: 'i' } }
            ];
        }

        // Add date filter
        if (date && date !== '') {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            
            query.createdAt = {
                $gte: startDate,
                $lt: endDate
            };
        }

        // Calculate pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Get total count for pagination
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limitNum);

        // Fetch orders with sorting
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const orders = await Order.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean(); // Use lean() for better performance

        console.log(`📋 Admin found ${orders.length} orders out of ${totalOrders} total`);

        res.json({
            success: true,
            orders: orders,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalOrders,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1,
                limit: limitNum
            }
        });

    } catch (error) {
        console.error('❌ Error fetching admin orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
});

// IMPORTANT: Stats route MUST come BEFORE the /:orderId route
// Admin: Get order statistics
app.get('/admin/orders/stats', async (req, res) => {
    try {
        console.log('📊 Admin fetching order statistics');
        
        // Get total orders count
        const totalOrders = await Order.countDocuments();
        console.log(`Total orders in database: ${totalOrders}`);

        // Get order counts by status
        const statusCounts = await Order.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        console.log('Status counts from database:', statusCounts);

        // Create status counts object with defaults
        const statusBreakdown = {
            pending: 0,
            confirmed: 0,
            processing: 0,
            shipped: 0,
            delivered: 0,
            cancelled: 0
        };

        // Fill in actual counts
        statusCounts.forEach(stat => {
            if (stat._id && statusBreakdown.hasOwnProperty(stat._id)) {
                statusBreakdown[stat._id] = stat.count;
            }
        });

        // Calculate total revenue
        const revenueResult = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    totalRevenue: { 
                        $sum: { 
                            $ifNull: [
                                { $toDouble: '$amount.total' },
                                { $toDouble: '$totalAmount' }
                            ]
                        } 
                    },
                    avgOrderValue: { 
                        $avg: { 
                            $ifNull: [
                                { $toDouble: '$amount.total' },
                                { $toDouble: '$totalAmount' }
                            ]
                        } 
                    }
                }
            }
        ]);

        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue || 0 : 0;
        const avgOrderValue = revenueResult.length > 0 ? revenueResult[0].avgOrderValue || 0 : 0;

        // Get recent orders count (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentOrdersCount = await Order.countDocuments({
            createdAt: { $gte: thirtyDaysAgo }
        });

        // Calculate completed orders (delivered + shipped)
        const completedOrders = statusBreakdown.delivered + statusBreakdown.shipped;

        // Get monthly growth
        const currentMonth = new Date();
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        
        const thisMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastMonthStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
        const lastMonthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        
        const thisMonthOrders = await Order.countDocuments({
            createdAt: { $gte: thisMonthStart }
        });
        
        const lastMonthOrders = await Order.countDocuments({
            createdAt: { 
                $gte: lastMonthStart,
                $lt: lastMonthEnd
            }
        });

        const monthlyGrowth = lastMonthOrders > 0 
            ? ((thisMonthOrders - lastMonthOrders) / lastMonthOrders * 100).toFixed(2)
            : thisMonthOrders > 0 ? 100 : 0;

        const stats = {
            totalOrders: totalOrders,
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
            pendingOrders: statusBreakdown.pending,
            confirmedOrders: statusBreakdown.confirmed,
            processingOrders: statusBreakdown.processing,
            shippedOrders: statusBreakdown.shipped,
            deliveredOrders: statusBreakdown.delivered,
            cancelledOrders: statusBreakdown.cancelled,
            completedOrders: completedOrders,
            recentOrdersCount,
            monthlyGrowth: parseFloat(monthlyGrowth),
            statusBreakdown: statusBreakdown
        };

        console.log('✅ Order statistics calculated:', stats);

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('❌ Error fetching order statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order statistics',
            error: error.message
        });
    }
});

// Admin: Get orders by date range (for reports) - MUST come before /:orderId
app.get('/admin/orders/report', async (req, res) => {
    try {
        const { startDate, endDate, status = '', format = 'json' } = req.query;
        
        console.log(`📊 Admin generating orders report: ${startDate} to ${endDate}`);

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }

        // Build query
        const query = {
            createdAt: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        };

        if (status) {
            query.status = status;
        }

        // Fetch orders
        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .lean();

        // Calculate summary
        const summary = {
            totalOrders: orders.length,
            totalRevenue: orders.reduce((sum, order) => {
                const orderTotal = order.amount?.total || order.totalAmount || 0;
                return sum + parseFloat(orderTotal);
            }, 0),
            statusBreakdown: {}
        };

        // Count by status
        orders.forEach(order => {
            const status = order.status || 'unknown';
            summary.statusBreakdown[status] = (summary.statusBreakdown[status] || 0) + 1;
        });

        console.log(`✅ Orders report generated: ${orders.length} orders`);

        res.json({
            success: true,
            report: {
                period: {
                    startDate,
                    endDate
                },
                summary,
                orders: format === 'summary' ? [] : orders
            }
        });

    } catch (error) {
        console.error('❌ Error generating orders report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate orders report',
            error: error.message
        });
    }
});

// Admin: Bulk update order status - MUST come before /:orderId
app.patch('/admin/orders/bulk-status', async (req, res) => {
    try {
        const { orderIds, status } = req.body;
        
        console.log(`📋 Admin bulk updating ${orderIds?.length} orders to ${status}`);

        // Validation
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Order IDs array is required'
            });
        }

        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order status'
            });
        }

        // Update multiple orders
        const result = await Order.updateMany(
            { 
                $or: [
                    { _id: { $in: orderIds } },
                    { orderId: { $in: orderIds } }
                ]
            },
            { 
                status: status,
                updatedAt: new Date()
            }
        );

        console.log(`✅ Bulk updated ${result.modifiedCount} orders to ${status}`);

        res.json({
            success: true,
            message: `Updated ${result.modifiedCount} orders to ${status}`,
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        console.error('❌ Error bulk updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to bulk update orders',
            error: error.message
        });
    }
});

// Admin: Get single order details by ID - MUST come AFTER specific routes
app.get('/admin/orders/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('📋 Admin fetching order details for ID:', orderId);
        
        // Validate that orderId is not a reserved keyword
        const reservedPaths = ['stats', 'report', 'bulk-status'];
        if (reservedPaths.includes(orderId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID: reserved keyword'
            });
        }
        
        const order = await Order.findOne({
            $or: [
                { _id: orderId },
                { orderId: orderId }
            ]
        }).lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        console.log('✅ Admin order details retrieved successfully');

        res.json({
            success: true,
            order: order
        });

    } catch (error) {
        console.error('❌ Error fetching admin order details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order details',
            error: error.message
        });
    }
});

// Admin: Update order status - MUST come AFTER the GET route
app.patch('/admin/orders/:orderId/status', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        
        console.log(`📋 Admin updating order ${orderId} status to ${status}`);

        // Validate status
        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order status'
            });
        }

        // Find and update order
        const order = await Order.findOneAndUpdate(
            {
                $or: [
                    { _id: orderId },
                    { orderId: orderId }
                ]
            },
            { 
                status: status,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        console.log(`✅ Order ${orderId} status updated to ${status}`);

        // Send status update email to customer (if email service is configured)
        try {
            if (order.shippingAddress?.email && typeof sendOrderStatusEmail === 'function') {
                await sendOrderStatusEmail(order, status);
                console.log(`📧 Status update email sent to customer for order: ${orderId}`);
            }
        } catch (emailError) {
            console.error('❌ Status update email failed:', emailError);
            // Don't fail the entire request if email fails
        }

        res.json({
            success: true,
            message: `Order status updated to ${status}`,
            order: order
        });

    } catch (error) {
        console.error('❌ Error updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status',
            error: error.message
        });
    }
});

// Admin: Delete order (use with caution) - MUST come AFTER other routes
app.delete('/admin/orders/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        console.log(`🗑️ Admin deleting order: ${orderId}`);

        // Validate that orderId is not a reserved keyword
        const reservedPaths = ['stats', 'report', 'bulk-status'];
        if (reservedPaths.includes(orderId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID: reserved keyword'
            });
        }

        const deletedOrder = await Order.findOneAndDelete({
            $or: [
                { _id: orderId },
                { orderId: orderId }
            ]
        });

        if (!deletedOrder) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        console.log(`✅ Order ${orderId} deleted successfully`);

        res.json({
            success: true,
            message: 'Order deleted successfully',
            deletedOrder: {
                id: deletedOrder._id,
                orderId: deletedOrder.orderId
            }
        });

    } catch (error) {
        console.error('❌ Error deleting order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete order',
            error: error.message
        });
    }
});

console.log('📋 Admin Orders API routes loaded successfully');
console.log('📋 Available admin order endpoints:');
console.log('   GET    /admin/orders - Get all orders with filters');
console.log('   GET    /admin/orders/stats - Get order statistics');
console.log('   GET    /admin/orders/report - Generate orders report');
console.log('   PATCH  /admin/orders/bulk-status - Bulk update order status');
console.log('   GET    /admin/orders/:orderId - Get single order details'); 
console.log('   PATCH  /admin/orders/:orderId/status - Update order status');
console.log('   DELETE /admin/orders/:orderId - Delete order');

// =============================================
// END OF ADMIN ORDERS API INTEGRATION
// =============================================

// =============================================
// BULK PRODUCT UPLOAD API
// =============================================

const csvParser = require('csv-parser');
const XLSX = require('xlsx');

// Configure multer for bulk uploads
const bulkStorage = multer.diskStorage({
    destination: './upload/bulk',
    filename: (req, file, cb) => {
        return cb(null, `bulk_${Date.now()}${path.extname(file.originalname)}`)
    }
});

const bulkUpload = multer({
    storage: bulkStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/csv'
        ];
        const allowedExtensions = ['.csv', '.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
        }
    }
});

// Create upload directory if it doesn't exist
const bulkUploadDir = './upload/bulk';
if (!fs.existsSync(bulkUploadDir)) {
    fs.mkdirSync(bulkUploadDir, { recursive: true });
}

// Bulk Upload Endpoint
app.post('/products/bulk-upload', bulkUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        console.log('📦 Processing bulk upload:', req.file.originalname);
        
        const filePath = req.file.path;
        const products = [];
        const errors = [];
        const ext = path.extname(req.file.originalname).toLowerCase();

        // Parse CSV file
        if (ext === '.csv') {
            await new Promise((resolve, reject) => {
                const results = [];
                fs.createReadStream(filePath)
                    .pipe(csvParser())
                    .on('data', (data) => results.push(data))
                    .on('end', () => {
                        products.push(...results);
                        resolve();
                    })
                    .on('error', reject);
            });
        }
        // Parse Excel file
        else if (ext === '.xlsx' || ext === '.xls') {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);
            products.push(...data);
        }

        console.log(`📊 Parsed ${products.length} products from file`);

        // Validate and insert products
        let addedCount = 0;
        let failedCount = 0;

        for (let i = 0; i < products.length; i++) {
            const row = products[i];
            const rowNumber = i + 2;

            try {
                // Validate required fields
                if (!row.name || !row.new_price) {
                    errors.push(`Row ${rowNumber}: Missing required fields (name, new_price)`);
                    failedCount++;
                    continue;
                }

                // Generate unique ID
                const lastProduct = await Product.findOne().sort({ id: -1 });
                const newId = lastProduct ? lastProduct.id + 1 : 1;

                // Parse boolean values
                const parseBoolean = (value) => {
                    if (typeof value === 'boolean') return value;
                    if (typeof value === 'string') {
                        return value.toLowerCase() === 'true' || value === '1';
                    }
                    return false;
                };

                // Parse arrays (comma-separated strings)
                const parseArray = (value) => {
                    if (Array.isArray(value)) return value;
                    if (typeof value === 'string') {
                        return value.split(',').map(item => item.trim()).filter(item => item);
                    }
                    return [];
                };

                // Create product object
                const productData = {
                    id: newId,
                    name: row.name,
                    category: row.category || 'Dresses',
                    new_price: parseFloat(row.new_price),
                    old_price: row.old_price ? parseFloat(row.old_price) : parseFloat(row.new_price), // Use new_price as default
                    brand: row.brand || '',
                    sku: row.sku || `SKU-${newId}`,
                    description: row.description || '',
                    short_description: row.short_description || '',
                    available: parseBoolean(row.available !== undefined ? row.available : true),
                    featured: parseBoolean(row.featured || false),
                    // Use placeholder image if no image provided
                    image: row.image || 'https://placehold.co/400x400/FFB6C1/FFFFFF?text=No+Image',
                    images: parseArray(row.images || row.image || ''),
                    features: parseArray(row.features || ''),
                    colors: parseArray(row.colors || ''),
                    sizes: parseArray(row.sizes || ''),
                    materials: row.materials || '',
                    care_instructions: row.care_instructions || '',
                    stock_quantity: row.stock_quantity ? parseInt(row.stock_quantity) : 0,
                    low_stock_threshold: row.low_stock_threshold ? parseInt(row.low_stock_threshold) : 5,
                    meta_title: row.meta_title || `${row.name} - ${row.category || 'Products'}`,
                    meta_description: row.meta_description || '',
                    meta_keywords: row.meta_keywords || '',
                    slug: row.slug || row.name.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-'),
                    weight: row.weight || '',
                    discount_value: row.discount_value ? parseFloat(row.discount_value) : 0,
                    shipping_class: row.shipping_class || 'standard',
                    status: row.status || 'published',
                    tags: parseArray(row.tags || ''),
                    date: new Date()
                };

                // Save product
                const product = new Product(productData);
                await product.save();
                addedCount++;
                console.log(`✅ Added product ${addedCount}: ${row.name}`);

            } catch (error) {
                console.error(`❌ Error adding product at row ${rowNumber}:`, error.message);
                errors.push(`Row ${rowNumber} (${row.name || 'Unknown'}): ${error.message}`);
                failedCount++;
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        console.log(`📊 Bulk upload complete: ${addedCount} added, ${failedCount} failed`);

        res.json({
            success: true,
            message: `Successfully processed bulk upload`,
            added: addedCount,
            failed: failedCount,
            total: products.length,
            errors: errors.slice(0, 10)
        });

    } catch (error) {
        console.error('❌ Bulk upload error:', error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: 'Bulk upload failed',
            error: error.message,
            errors: [error.message]
        });
    }
});

console.log('📦 Bulk Product Upload API loaded successfully');
console.log('   POST /products/bulk-upload - Upload products via CSV/Excel');

// =============================================
// END OF BULK PRODUCT UPLOAD API
// =============================================







app.listen(port, (error) => {
    if (!error) {
        console.log(`Enhanced E-commerce Server running on port ${port}`)
    } else {
        console.log("Error: " + error);
    }
})