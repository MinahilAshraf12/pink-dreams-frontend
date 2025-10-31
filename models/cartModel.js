const mongoose = require('mongoose');

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