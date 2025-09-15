// routes/analyticsRoutes.js - Analytics Routes
const express = require('express');
const router = express.Router();
const { Sale } = require('../models');
const Product = require('../models/Product');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

// Protect all analytics routes (admin only)
router.use(verifyToken, verifyAdmin);

// Sales overview
router.get('/sales-overview', async (req, res) => {
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

// Product performance
router.get('/product-performance', async (req, res) => {
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

// Category performance
router.get('/category-performance', async (req, res) => {
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

// Revenue metrics
router.get('/revenue-metrics', async (req, res) => {
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

        const todayTotal = todayRevenue[0]?.total || 0;
        const monthTotal = monthRevenue[0]?.total || 0;
        const yearTotal = yearRevenue[0]?.total || 0;

        res.json({
            success: true,
            metrics: {
                today: todayTotal,
                month: monthTotal,
                year: yearTotal
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Generate sample sales data
router.post('/generate-sample-data', async (req, res) => {
    try {
        const products = await Product.find({ available: true });
        if (products.length === 0) {
            return res.json({ 
                success: false, 
                message: "No products found. Add products first." 
            });
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
        
        // Update product sales counts
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

// Inventory management
router.get('/inventory/low-stock', async (req, res) => {
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

// Update stock quantity
router.post('/inventory/update-stock', async (req, res) => {
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

module.exports = router;