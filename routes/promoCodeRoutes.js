const express = require('express');
const router = express.Router();
const PromoCode = require('../models/promoCodeModel');

router.post('/api/promo-codes/create', async (req, res) => {
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
router.get('/api/promo-codes/all', async (req, res) => {
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
router.put('/api/promo-codes/update/:id', async (req, res) => {
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
router.delete('/api/promo-codes/delete/:id', async (req, res) => {
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
router.patch('/api/promo-codes/toggle-status/:id', async (req, res) => {
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
router.post('/api/promo-codes/validate', async (req, res) => {
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
router.post('/api/promo-codes/apply/:code', async (req, res) => {
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
router.get('/api/promo-codes/stats', async (req, res) => {
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
router.get('/api/promo-codes/active', async (req, res) => {
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
router.get('/api/promo-codes/:id', async (req, res) => {
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



module.exports = router;