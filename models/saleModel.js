const mongoose = require('mongoose');

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