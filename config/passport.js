// config/passport.js - Passport OAuth Configuration
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const bcrypt = require('bcrypt');
const User = require('../models/User');

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

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
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
    
    console.log('🔍 Google OAuth strategy configured');
} else {
    console.warn('⚠️ Google OAuth not configured - missing CLIENT_ID or CLIENT_SECRET');
}

// Facebook OAuth Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
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
    
    console.log('📘 Facebook OAuth strategy configured');
} else {
    console.warn('⚠️ Facebook OAuth not configured - missing APP_ID or APP_SECRET');
}

module.exports = passport;