// controllers/authController.js - Authentication Controller
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendTestEmail, createTransporter } = require('../utils/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Helper function to generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// Register user
const register = async (req, res) => {
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
        const token = generateToken(user);

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
};

// Login user
const login = async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { email, password } = req.body;

        console.log(`🔑 Login attempt for email: ${email} from IP: ${req.ip}`);

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
        const token = generateToken(user);

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
};

// Forgot password
const forgotPassword = async (req, res) => {
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

        // Send reset email
        try {
            if (process.env.RESEND_API_KEY) {
                const emailHtml = `
                    <!DOCTYPE html>
                    <html>
                    <body style="font-family: Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 0;">
                        <div style="max-width: 600px; margin: 0 auto; background: white;">
                            <div style="background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0;">
                                <h1 style="margin: 0; font-size: 24px;">Reset Your Password</h1>
                                <p style="margin: 8px 0 0; opacity: 0.9; font-size: 16px;">Pink Dreams Fashion Store</p>
                            </div>
                            
                            <div style="padding: 30px 20px;">
                                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">Hi ${user.name},</p>
                                
                                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                                    We received a request to reset your password for your Pink Dreams account. If you didn't make this request, you can safely ignore this email.
                                </p>
                                
                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="${resetURL}" style="display: inline-block; background: linear-gradient(135deg, #ec4899, #f43f5e); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);">
                                        Reset My Password
                                    </a>
                                </div>
                                
                                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 25px 0 0;">
                                    If the button doesn't work, copy and paste this link into your browser:
                                </p>
                                <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; color: #374151; margin: 10px 0 20px;">
                                    ${resetURL}
                                </p>
                                
                                <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
                                    <p style="color: #6b7280; font-size: 12px; line-height: 1.5; margin: 0;">
                                        <strong>Security Note:</strong> This link will expire in 1 hour for your security.
                                    </p>
                                    <p style="color: #6b7280; font-size: 12px; line-height: 1.5; margin: 10px 0 0;">
                                        Sent on: ${new Date().toLocaleString()}<br>
                                        Request from IP: ${req.ip}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </body>
                    </html>
                `;

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
                console.log('🔧 Using SMTP fallback for password reset email');
                const transporter = createTransporter();
                
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
};

// Verify reset token
const verifyResetToken = async (req, res) => {
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
};

// Reset password
const resetPassword = async (req, res) => {
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
            const transporter = createTransporter();
            
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
};

// Get current user profile
const getProfile = async (req, res) => {
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
};

// Update user profile
const updateProfile = async (req, res) => {
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
};

// Change password
const changePassword = async (req, res) => {
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
};

// Check if email exists
const checkEmail = async (req, res) => {
    try {
        const { email } = req.body;

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
};

// Logout (for token blacklisting if implemented)
const logout = async (req, res) => {
    try {
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
};

// OAuth callback handler
const oauthCallback = async (req, res) => {
    try {
        console.log('OAuth callback successful for provider');
        
        // Generate JWT token for the user
        const token = generateToken(req.user);
        
        // Redirect to frontend with token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const provider = req.route.path.includes('google') ? 'google' : 'facebook';
        
        res.redirect(`${frontendUrl}/auth/callback?token=${token}&provider=${provider}&success=true`);
    } catch (error) {
        console.error('OAuth callback error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/auth/callback?error=oauth_callback_failed`);
    }
};

// OAuth logout
const oauthLogout = (req, res) => {
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
};

// Check OAuth status
const getOAuthStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('googleId facebookId authProvider');
        
        res.json({
            success: true,
            oauth: {
                hasGoogle: !!user.googleId,
                hasFacebook: !!user.facebookId,
                authProvider: user.authProvider,
                canUnlink: user.authProvider === 'local'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error checking OAuth status'
        });
    }
};

// Unlink OAuth account
const unlinkOAuth = async (req, res) => {
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
};

module.exports = {
    register,
    login,
    forgotPassword,
    verifyResetToken,
    resetPassword,
    getProfile,
    updateProfile,
    changePassword,
    checkEmail,
    logout,
    oauthCallback,
    oauthLogout,
    getOAuthStatus,
    unlinkOAuth
};