const PromoCode = require('../models/PromoCode');

// Create promo code
exports.createPromoCode = async (req, res) => {
    try {
        const {
            code, title, description, discountType, discountValue,
            minPurchaseAmount, maxDiscountAmount, usageLimit, usagePerUser,
            validFrom, validUntil, isActive, applicableCategories,
            excludedProducts, userRestrictions
        } = req.body;

        if (!code || !title || !discountValue || !validFrom || !validUntil) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        const existingCode = await PromoCode.findOne({ code: code.toUpperCase() });
        if (existingCode) {
            return res.status(400).json({
                success: false,
                message: 'Promo code already exists'
            });
        }

        if (discountType === 'percentage' && discountValue > 100) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount cannot exceed 100%'
            });
        }

        const startDate = new Date(validFrom);
        const endDate = new Date(validUntil);
        
        if (endDate <= startDate) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

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

        res.json({
            success: true,
            message: 'Promo code created successfully',
            promoCode
        });
    } catch (error) {
        console.error('Error creating promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create promo code',
            error: error.message
        });
    }
};

// Get all promo codes
exports.getAllPromoCodes = async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all', search = '' } = req.query;
        const query = {};

        if (status === 'active') {
            query.isActive = true;
            query.validFrom = { $lte: new Date() };
            query.validUntil = { $gte: new Date() };
        } else if (status === 'inactive') {
            query.isActive = false;
        } else if (status === 'expired') {
            query.validUntil = { $lt: new Date() };
        }

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
        console.error('Error fetching promo codes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch promo codes',
            error: error.message
        });
    }
};

// Get single promo code
exports.getPromoCode = async (req, res) => {
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
    } catch (error) {
        console.error('Error fetching promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch promo code',
            error: error.message
        });
    }
};

// Update promo code
exports.updatePromoCode = async (req, res) => {
    try {
        const updates = req.body;
        const promoCode = await PromoCode.findByIdAndUpdate(
            req.params.id,
            { ...updates, updatedAt: new Date() },
            { new: true, runValidators: true }
        );

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        res.json({
            success: true,
            message: 'Promo code updated successfully',
            promoCode
        });
    } catch (error) {
        console.error('Error updating promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update promo code',
            error: error.message
        });
    }
};

// Delete promo code
exports.deletePromoCode = async (req, res) => {
    try {
        const promoCode = await PromoCode.findByIdAndDelete(req.params.id);

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        res.json({
            success: true,
            message: 'Promo code deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete promo code',
            error: error.message
        });
    }
};

// Toggle promo code status
exports.togglePromoCodeStatus = async (req, res) => {
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

        res.json({
            success: true,
            message: `Promo code ${promoCode.isActive ? 'activated' : 'deactivated'} successfully`,
            promoCode
        });
    } catch (error) {
        console.error('Error toggling promo code status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle promo code status',
            error: error.message
        });
    }
};

// Validate promo code
exports.validatePromoCode = async (req, res) => {
    try {
        const { code, userId, cartTotal } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Promo code is required'
            });
        }

        const promoCode = await PromoCode.findOne({ code: code.toUpperCase() });

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Invalid promo code'
            });
        }

        const now = new Date();

        if (!promoCode.isActive) {
            return res.status(400).json({
                success: false,
                message: 'This promo code is currently inactive'
            });
        }

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

        if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) {
            return res.status(400).json({
                success: false,
                message: 'This promo code has reached its usage limit'
            });
        }

        if (cartTotal < promoCode.minPurchaseAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase amount of $${promoCode.minPurchaseAmount} required`
            });
        }

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

        let discountAmount = 0;
        
        if (promoCode.discountType === 'percentage') {
            discountAmount = (cartTotal * promoCode.discountValue) / 100;
        } else {
            discountAmount = promoCode.discountValue;
        }

        if (promoCode.maxDiscountAmount && discountAmount > promoCode.maxDiscountAmount) {
            discountAmount = promoCode.maxDiscountAmount;
        }

        if (discountAmount > cartTotal) {
            discountAmount = cartTotal;
        }

        const finalAmount = cartTotal - discountAmount;

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
        console.error('Error validating promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate promo code',
            error: error.message
        });
    }
};

// Apply promo code to order
exports.applyPromoCode = async (req, res) => {
    try {
        const { code } = req.params;
        const { userId, orderAmount } = req.body;

        const promoCode = await PromoCode.findOne({ code: code.toUpperCase() });

        if (!promoCode) {
            return res.status(404).json({
                success: false,
                message: 'Promo code not found'
            });
        }

        promoCode.usageCount += 1;
        
        if (userId) {
            promoCode.usedBy.push({
                userId,
                usedAt: new Date(),
                orderAmount
            });
        }

        await promoCode.save();

        res.json({
            success: true,
            message: 'Promo code applied to order'
        });
    } catch (error) {
        console.error('Error applying promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to apply promo code',
            error: error.message
        });
    }
};

// Get promo code statistics
exports.getPromoCodeStats = async (req, res) => {
    try {
        const now = new Date();

        const [totalCodes, activeCodes, expiredCodes, totalUsage, topCodes] = await Promise.all([
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
        console.error('Error fetching promo code stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
            error: error.message
        });
    }
};

// Get active promo codes
exports.getActivePromoCodes = async (req, res) => {
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
        console.error('Error fetching active promo codes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active promo codes',
            error: error.message
        });
    }
};

module.exports = exports;