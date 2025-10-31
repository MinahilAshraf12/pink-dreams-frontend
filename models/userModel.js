const mongoose = require('mongoose');

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