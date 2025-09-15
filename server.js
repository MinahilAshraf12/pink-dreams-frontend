// server.js - Enhanced with Better CORS and Security Headers
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 4000;

// Trust proxy
app.set('trust proxy', 1);

// MongoDB connection (without deprecated options)
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// Enhanced CORS Configuration - Updated for your domains
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://localhost:3000',
            'https://localhost:3001',
            process.env.FRONTEND_URL,
            'https://e-commere-pink-dreams.vercel.app', // Your actual Vercel domain
            'https://pink-dreams-frontend-production.up.railway.app',
            // Add any other subdomains you might have
            'https://e-commere-pink-dreams-git-main.vercel.app',
            'https://e-commere-pink-dreams-preview.vercel.app'
        ].filter(Boolean);

        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // Check if origin matches allowed origins
        const isAllowed = allowedOrigins.some(allowedOrigin => {
            if (typeof allowedOrigin === 'string') {
                return origin === allowedOrigin;
            } else if (allowedOrigin instanceof RegExp) {
                return allowedOrigin.test(origin);
            }
            return false;
        });
        
        // Also allow all Vercel and Railway subdomains
        const isVercelDomain = origin && origin.includes('vercel.app');
        const isRailwayDomain = origin && origin.includes('railway.app');
        
        if (isAllowed || isVercelDomain || isRailwayDomain) {
            callback(null, true);
        } else {
            console.log('🚫 Blocked by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'x-csrf-token'
    ],
    exposedHeaders: ['set-cookie'],
    maxAge: 86400 // 24 hours
};

// Session Configuration
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'your-session-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        touchAfter: 24 * 3600
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
});

// Security headers middleware
app.use((req, res, next) => {
    // Basic security headers
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,x-csrf-token');
        return res.status(200).end();
    }
    
    next();
});

// Apply middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors(corsOptions));
app.use(sessionMiddleware);

// Passport configuration
try {
    require('./config/passport');
    app.use(passport.initialize());
    app.use(passport.session());
    console.log('✅ Passport configuration loaded');
} catch (error) {
    console.error('❌ Error loading passport config:', error.message);
}

// Static file serving with proper headers
app.use('/images', (req, res, next) => {
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    res.header('Access-Control-Allow-Origin', '*');
    next();
}, express.static(path.join(__dirname, 'upload/images')));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'upload/images');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Created upload directory:', uploadDir);
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Main API info endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Pink Dreams E-commerce API',
        version: '2.0.0',
        status: 'running',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            auth: '/auth',
            products: '/api/products',
            cart: '/api/cart',
            orders: '/api/orders',
            payment: '/api/payment',
            admin: '/api/admin'
        },
        cors: {
            enabled: true,
            credentials: true
        }
    });
});

// Load routes with error handling
const loadRoutes = () => {
    try {
        console.log('📚 Loading routes...');
        
        // Core routes
        const authRoutes = require('./routes/authRoutes');
        const productRoutes = require('./routes/productRoutes');
        const cartRoutes = require('./routes/cartRoutes');
        const orderRoutes = require('./routes/orderRoutes');
        const paymentRoutes = require('./routes/paymentRoutes');
        
        // Mount core routes
        app.use('/auth', authRoutes);
        app.use('/api/products', productRoutes);
        app.use('/api/cart', cartRoutes);
        app.use('/api/orders', orderRoutes);
        app.use('/api/payment', paymentRoutes);
        
        console.log('✅ Core routes loaded');
        
        // Optional routes
        const optionalRoutes = [
            { name: 'wishlist', path: './routes/wishlistRoutes', mount: '/api/wishlist' },
            { name: 'admin', path: './routes/adminRoutes', mount: '/api/admin' },
            { name: 'contact', path: './routes/contactRoutes', mount: '/api/contact' },
            { name: 'newsletter', path: './routes/newsletterRoutes', mount: '/api/newsletter' },
            { name: 'upload', path: './routes/uploadRoutes', mount: '/api/upload' },
            { name: 'analytics', path: './routes/analyticsRoutes', mount: '/api/analytics' }
        ];
        
        optionalRoutes.forEach(({ name, path, mount }) => {
            try {
                const route = require(path);
                app.use(mount, route);
                console.log(`✅ ${name} routes loaded`);
            } catch (e) {
                console.log(`⚠️ ${name} routes not found, skipping...`);
            }
        });
        
        // Legacy routes for backward compatibility
        console.log('📚 Setting up legacy routes...');
        app.use('/', productRoutes); // For /allproducts, /addproduct, etc.
        app.use('/', cartRoutes); // For /cart routes
        app.use('/', orderRoutes); // For /orders routes
        app.use('/', paymentRoutes); // For /payment routes
        
        // Add direct filter route for legacy support
        app.get('/product-filters', (req, res, next) => {
            req.url = '/api/products/filters';
            productRoutes(req, res, next);
        });
        
        console.log('✅ All routes loaded successfully');
        
    } catch (error) {
        console.error('❌ Error loading routes:', error.message);
    }
};

// Load routes
loadRoutes();

// Global error handler
app.use((err, req, res, next) => {
    console.error('🚨 Global error:', err);
    
    // Handle specific error types
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
            success: false,
            message: 'CORS error: Origin not allowed',
            origin: req.headers.origin
        });
    }
    
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
        suggestion: 'Check available endpoints at /',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Pink Dreams Server running on port ${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📡 Database: Connected to MongoDB`);
    console.log(`🛡️ Security: CORS configured`);
    console.log(`📧 Email: Service ready`);
    console.log(`💳 Payment: Stripe & PayPal integrated`);
    console.log(`🔗 Local: http://localhost:${port}`);
    if (process.env.RAILWAY_STATIC_URL) {
        console.log(`🚀 Production: ${process.env.RAILWAY_STATIC_URL}`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
});