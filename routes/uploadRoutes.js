// routes/uploadRoutes.js - Upload Routes
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

// Image storage engine
const storage = multer.diskStorage({
    destination: './upload/images',
    filename: (req, file, cb) => {
        return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
    }
});

const upload = multer({ storage: storage });

// Upload endpoint for images
router.post('/', upload.single('product'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: 0,
                message: 'No file uploaded'
            });
        }

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

// Fix image URLs (for migration)
router.post('/fix-image-urls', async (req, res) => {
    try {
        const Product = require('../models/Product');
        const baseUrl = process.env.BASE_URL || 'https://your-railway-app.railway.app';
        
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

        res.json({
            success: true,
            message: `Updated ${result.modifiedCount} products`,
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

module.exports = router;