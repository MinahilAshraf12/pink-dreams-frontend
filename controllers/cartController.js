// controllers/cartController.js - Cart Controller
const { Cart } = require('../models');
const Product = require('../models/Product');

// Get user's cart
const getCart = async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Fetching cart for user:', userId);
        
        let cart = await Cart.findOne({ userId });
        
        if (!cart) {
            cart = new Cart({ userId, items: [] });
            await cart.save();
            console.log('Created new cart for user:', userId);
        }
        
        if (cart.items.length === 0) {
            return res.json({
                success: true,
                cart: [],
                totalItems: 0,
                totalPrice: 0
            });
        }
        
        // Get full product details for cart items
        const productIds = cart.items.map(item => item.productId);
        const products = await Product.find({ 
            id: { $in: productIds },
            available: true 
        });
        
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
                    price: item.price,
                    quantity: item.quantity,
                    image: product.image,
                    category: product.category,
                    available: product.available,
                    stock_quantity: product.stock_quantity,
                    addedAt: item.addedAt
                });
            } else {
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
};

// Add item to cart
const addToCart = async (req, res) => {
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
};

// Update item quantity in cart
const updateCartItem = async (req, res) => {
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
};

// Remove item from cart
const removeFromCart = async (req, res) => {
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
};

// Clear entire cart
const clearCart = async (req, res) => {
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
};

// Sync cart from sessionStorage to backend
const syncCart = async (req, res) => {
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
        
        const syncResults = {
            syncedItems: [],
            failedItems: [],
            mergedItems: []
        };
        
        if (localCartItems && localCartItems.length > 0) {
            for (const localItem of localCartItems) {
                try {
                    if (!localItem.id || !localItem.quantity || localItem.quantity <= 0) {
                        syncResults.failedItems.push({
                            item: localItem,
                            reason: 'Invalid item data'
                        });
                        continue;
                    }
                    
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
                        const existingQuantity = cart.items[existingItemIndex].quantity;
                        const totalQuantity = existingQuantity + finalQuantity;
                        
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
                        
                        cart.items[existingItemIndex].price = product.new_price;
                    } else {
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
};

// Get cart summary
const getCartSummary = async (req, res) => {
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
};

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    syncCart,
    getCartSummary
};