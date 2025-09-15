// controllers/productController.js - Fixed version with flexible ID handling
const Product = require('../models/Product');
const mongoose = require('mongoose');

// Helper function to validate product ID (supports both numeric and ObjectId)
const validateProductId = (id) => {
    // Check if it's a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(id)) {
        return { isValid: true, type: 'objectId', value: id };
    }
    
    // Check if it's a numeric ID
    const numId = parseInt(id);
    if (!isNaN(numId) && numId > 0) {
        return { isValid: true, type: 'numeric', value: numId };
    }
    
    return { isValid: false, type: null, value: null };
};

// Get all products with filtering and pagination
const getAllProducts = async (req, res) => {
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

        let query = {};
        
        if (search && search.trim() !== '') {
            query.$or = [
                { name: { $regex: search.trim(), $options: 'i' } },
                { description: { $regex: search.trim(), $options: 'i' } },
                { category: { $regex: search.trim(), $options: 'i' } },
                { brand: { $regex: search.trim(), $options: 'i' } }
            ];
        }
        
        if (category && category.trim() !== '' && category.toLowerCase() !== 'all') {
            query.category = { $regex: new RegExp(`^${category}$`, 'i') };
        }
        
        if (!isNaN(minPrice) && !isNaN(maxPrice)) {
            query.new_price = { $gte: minPrice, $lte: maxPrice };
        } else if (!isNaN(minPrice)) {
            query.new_price = { $gte: minPrice };
        } else if (!isNaN(maxPrice)) {
            query.new_price = { $lte: maxPrice };
        }

        let sortObj = {};
        if (sortBy === 'name') {
            sortObj.name = sortOrder;
        } else if (sortBy === 'new_price') {
            sortObj.new_price = sortOrder;
        } else {
            sortObj.date = sortOrder;
        }

        const [products, totalProducts] = await Promise.all([
            Product.find(query)
                .sort(sortObj)
                .skip(skip)
                .limit(limit)
                .lean(),
            Product.countDocuments(query)
        ]);

        const totalPages = Math.ceil(totalProducts / limit);

        res.json({
            success: true,
            products: products,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalProducts: totalProducts,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                limit: limit
            }
        });
    } catch (error) {
        console.error('Error in getAllProducts:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Internal server error'
        });
    }
};

// Get single product by ID - FIXED to handle both ObjectId and numeric IDs
const getProductById = async (req, res) => {
    try {
        const productIdParam = req.params.id;
        console.log(`Received product ID: ${productIdParam}`);
        
        const validation = validateProductId(productIdParam);
        
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID format. Must be a valid MongoDB ObjectId or numeric ID.',
                provided: productIdParam
            });
        }
        
        let query = {};
        
        // Build query based on ID type
        if (validation.type === 'objectId') {
            query._id = validation.value;
        } else if (validation.type === 'numeric') {
            query.id = validation.value;
        }
        
        console.log(`Searching for product with query:`, query);
        
        // Find product and increment view count
        const product = await Product.findOneAndUpdate(
            query,
            { $inc: { views: 1 } },
            { new: true }
        );
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found',
                searchedId: productIdParam,
                queryUsed: query
            });
        }
        
        // Convert to JSON to include virtuals
        const productData = product.toJSON();
        
        // Ensure SKU is generated if missing
        if (!productData.sku || productData.sku === '') {
            productData.sku = `${product.category.substring(0, 3).toUpperCase()}-${product.id || product._id}`;
        }
        
        // Calculate stock status
        const stockStatus = {
            current_stock: product.stock_quantity || 0,
            low_stock_threshold: product.low_stock_threshold || 10,
            is_low_stock: (product.stock_quantity || 0) <= (product.low_stock_threshold || 10),
            is_out_of_stock: (product.stock_quantity || 0) === 0
        };
        
        productData.stock_status = stockStatus;
        productData.discount_percentage = 0;
        
        // Calculate discount percentage
        if (product.old_price && product.old_price > product.new_price) {
            productData.discount_percentage = Math.round(((product.old_price - product.new_price) / product.old_price) * 100);
        }
        
        console.log(`Product found: ${product.name}. Total views: ${product.views}`);
        
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
};

// Get product recommendations - FIXED to handle both ID types
const getProductRecommendations = async (req, res) => {
    try {
        const productIdParam = req.params.id;
        console.log(`Getting recommendations for product ID: ${productIdParam}`);
        
        const validation = validateProductId(productIdParam);
        
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID for recommendations'
            });
        }
        
        let query = {};
        
        // Build query based on ID type
        if (validation.type === 'objectId') {
            query._id = validation.value;
        } else if (validation.type === 'numeric') {
            query.id = validation.value;
        }
        
        const product = await Product.findOne(query);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found for recommendations"
            });
        }

        // Build exclusion query based on the found product's ID type
        let excludeQuery = {};
        if (product.id) {
            excludeQuery.id = { $ne: product.id };
        } else {
            excludeQuery._id = { $ne: product._id };
        }

        const relatedProducts = await Product.find({
            $and: [
                excludeQuery,
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

        console.log(`Found ${relatedProducts.length} recommendations for ${product.name}`);

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
};

// Add new product
const addProduct = async (req, res) => {
    try {
        let products = await Product.find({});
        let id;
        if (products.length > 0) {
            let last_product_array = products.slice(-1);
            let last_product = last_product_array[0];
            id = (last_product.id || 0) + 1;
        } else {
            id = 1;
        }

        const slug = req.body.slug || req.body.name.toLowerCase()
            .replace(/[^a-z0-9 -]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();

        const meta_title = req.body.meta_title || `${req.body.name} - ${req.body.category} | Your Store`;

        const product = new Product({
            id: id,
            name: req.body.name,
            category: req.body.category,
            brand: req.body.brand || '',
            sku: req.body.sku || `SKU-${id}`,
            description: req.body.description || '',
            short_description: req.body.short_description || '',
            image: req.body.image,
            images: req.body.images || [],
            new_price: req.body.new_price,
            old_price: req.body.old_price,
            discount_type: req.body.discount_type || 'percentage',
            discount_value: req.body.discount_value || 0,
            sale_start_date: req.body.sale_start_date || null,
            sale_end_date: req.body.sale_end_date || null,
            features: req.body.features || [],
            specifications: req.body.specifications || [],
            materials: req.body.materials || '',
            care_instructions: req.body.care_instructions || '',
            size_chart: req.body.size_chart || '',
            colors: req.body.colors || [],
            sizes: req.body.sizes || [],
            weight: req.body.weight || 0,
            dimensions: req.body.dimensions || { length: 0, width: 0, height: 0 },
            stock_quantity: req.body.stock_quantity || 0,
            low_stock_threshold: req.body.low_stock_threshold || 10,
            meta_title: meta_title,
            meta_description: req.body.meta_description || '',
            meta_keywords: req.body.meta_keywords || '',
            slug: slug,
            tags: req.body.tags || [],
            related_products: req.body.related_products || [],
            shipping_class: req.body.shipping_class || 'standard',
            status: req.body.status || 'published',
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
        });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Update product - FIXED to handle both ID types
const updateProduct = async (req, res) => {
    try {
        const { id } = req.body;
        
        const validation = validateProductId(id);
        
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Valid Product ID is required'
            });
        }
        
        const updateData = {};
        
        // Build update object with validation
        if (req.body.name !== undefined) updateData.name = req.body.name;
        if (req.body.category !== undefined) updateData.category = req.body.category;
        if (req.body.brand !== undefined) updateData.brand = req.body.brand;
        if (req.body.sku !== undefined) updateData.sku = req.body.sku;
        if (req.body.description !== undefined) updateData.description = req.body.description;
        if (req.body.short_description !== undefined) updateData.short_description = req.body.short_description;
        if (req.body.image !== undefined) updateData.image = req.body.image;
        if (req.body.images !== undefined) updateData.images = req.body.images;
        if (req.body.new_price !== undefined) updateData.new_price = req.body.new_price;
        if (req.body.old_price !== undefined) updateData.old_price = req.body.old_price;
        if (req.body.stock_quantity !== undefined) updateData.stock_quantity = req.body.stock_quantity;
        if (req.body.available !== undefined) updateData.available = req.body.available;
        if (req.body.featured !== undefined) updateData.featured = req.body.featured;

        let query = {};
        if (validation.type === 'objectId') {
            query._id = validation.value;
        } else if (validation.type === 'numeric') {
            query.id = validation.value;
        }

        const updatedProduct = await Product.findOneAndUpdate(
            query,
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
        });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product',
            error: error.message
        });
    }
};

// Remove product - FIXED to handle both ID types
const removeProduct = async (req, res) => {
    try {
        const { id, name } = req.body;
        
        const validation = validateProductId(id);
        
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Valid Product ID is required'
            });
        }
        
        let query = {};
        if (validation.type === 'objectId') {
            query._id = validation.value;
        } else if (validation.type === 'numeric') {
            query.id = validation.value;
        }
        
        const deletedProduct = await Product.findOneAndDelete(query);
        
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
};

// Get product by slug
const getProductBySlug = async (req, res) => {
    try {
        const slug = req.params.slug;
        
        if (!slug || slug.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Product slug is required'
            });
        }
        
        const product = await Product.findOneAndUpdate(
            { slug: slug },
            { $inc: { views: 1 } },
            { new: true }
        );
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }
        
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
};

// Get featured products
const getFeaturedProducts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const products = await Product.find({ 
            featured: true, 
            available: true,
            $or: [
                { status: 'published' },
                { status: { $exists: false } }
            ]
        })
        .sort({ date: -1 })
        .limit(limit);

        res.json({
            success: true,
            products: products
        });
    } catch (error) {
        console.error('Error fetching featured products:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
};

// Get products by category
const getProductsByCategory = async (req, res) => {
    try {
        const category = req.params.category;
        
        if (!category || category.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Category is required'
            });
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const sortBy = req.query.sortBy || 'date';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        const query = { 
            category: category, 
            available: true,
            $or: [
                { status: 'published' },
                { status: { $exists: false } }
            ]
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
};

// Search products
const searchProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        const searchTerm = req.query.q || '';
        const category = req.query.category || '';
        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || Number.MAX_VALUE;
        const sortBy = req.query.sortBy || 'date';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        let query = { 
            available: true,
            $or: [
                { status: 'published' },
                { status: { $exists: false } }
            ]
        };
        
        if (searchTerm) {
            query.$and = [
                query.$or || {},
                {
                    $or: [
                        { name: { $regex: searchTerm, $options: 'i' } },
                        { description: { $regex: searchTerm, $options: 'i' } },
                        { tags: { $in: [new RegExp(searchTerm, 'i')] } },
                        { brand: { $regex: searchTerm, $options: 'i' } }
                    ]
                }
            ];
        }
        
        if (category) query.category = category;
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
};

// Get all categories
const getCategories = async (req, res) => {
    try {
        const categories = await Product.distinct('category');
        res.json({
            success: true,
            categories: categories.filter(cat => cat && cat.trim() !== '')
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
};

// Get product filters
const getProductFilters = async (req, res) => {
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
};

module.exports = {
    getAllProducts,
    addProduct,
    updateProduct,
    removeProduct,
    getProductById,
    getProductBySlug,
    getFeaturedProducts,
    getProductsByCategory,
    searchProducts,
    getCategories,
    getProductFilters,
    getProductRecommendations
};