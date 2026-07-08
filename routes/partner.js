const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Setup multer for place uploads (images + videos)
const placeDir = path.join(__dirname, '..', 'public', 'uploads', 'places');
if (!fs.existsSync(placeDir)) {
    fs.mkdirSync(placeDir, { recursive: true });
}
const placeStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, placeDir),
    filename: (req, file, cb) => cb(null, Date.now() + '_' + Math.round(Math.random() * 1000) + path.extname(file.originalname))
});
// No fileFilter - accept any file type (images, videos, etc.)
const placeUpload = multer({ storage: placeStorage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max

// POST /api/partner/request
router.post('/partner/request', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // Check user partner status directly from req.user
        if (req.user.partner_status === 1) {
            return res.json({ status: false, message: 'You have already submitted a partner request.' });
        }
        if (req.user.partner_status === 2) {
            return res.json({ status: false, message: 'You are already a partner.' });
        }

        // Update partner_status to 1 in users table
        await pool.query(
            'UPDATE users SET partner_status = 1 WHERE id = ?',
            [userId]
        );

        res.json({
            status: true,
            message: 'Partner request submitted successfully. Waiting for admin approval.'
        });
    } catch (error) {
        console.error('Partner request error:', error);
        res.json({ status: false, message: error.message });
    }
});

// POST /api/partner/get-places
router.get('/partner/get-places', auth, async (req, res) => {
    try {

        // Must be a partner or admin
        if (req.user.is_partner !== 1 && req.user.role !== 'admin') {
            return res.status(200).json({
                status: false,
                message: 'Unauthorized. Must be a partner.'
            });
        }

        const [places] = await pool.query(
            'SELECT * FROM tourist_places WHERE created_by = ? AND hidden_gem = 1',
            [req.user.id]
        );

        // Helper to parse image/video field
        const parseMedia = (value) => {
            if (!value) return [];

            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch (err) {
                // If it's already a single file path
                return [value];
            }
        };

        // Parse image_url and video_url
        const parsedPlaces = await Promise.all(
            places.map(async (place) => {

                // Get additional images
                const [images] = await pool.query(
                    'SELECT image_url FROM tourist_place_images WHERE place_id = ?',
                    [place.id]
                );

                // Get additional videos
                const [videos] = await pool.query(
                    'SELECT video_url FROM tourist_place_videos WHERE place_id = ?',
                    [place.id]
                );

                const allImages = [];
                const allVideos = [];

                // Primary image
                if (place.image_url) {
                    allImages.push(place.image_url);
                }

                // Additional images
                images.forEach(img => {
                    allImages.push(img.image_url);
                });

                // Primary video
                if (place.video_url) {
                    allVideos.push(place.video_url);
                }

                // Additional videos
                videos.forEach(video => {
                    allVideos.push(video.video_url);
                });

                return {
                    ...place,
                    image_url: allImages,
                    video_url: allVideos
                };
            })
        );

        return res.json({
            status: true,
            data: parsedPlaces
        });

    } catch (error) {
        console.error('Get places error:', error);

        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// POST /api/partner/add-places
router.post('/partner/add-places', auth, (req, res) => {
    // Call multer manually inside the handler to catch all errors
    const upload = placeUpload.any();
    upload(req, res, async function (uploadErr) {
        if (uploadErr) {
            console.error('Upload error:', uploadErr);
            return res.json({ status: false, message: 'Upload error: ' + uploadErr.message });
        }

        try {
            // Must be a partner (is_partner === 1) or an admin
            if (req.user.is_partner !== 1 && req.user.role !== 'admin') {
                return res.json({ status: false, message: 'Unauthorized. Must be a partner.' });
            }

            const { name, location, category_id, description, latitude, longitude } = req.body;

            if (!name || !location || !category_id || !description) {
                return res.json({ status: false, message: 'Name, location, category_id, and description are required.' });
            }

            // Separate images and videos
            let imagePaths = [];
            let videoPaths = [];
            if (req.files && req.files.length > 0) {
                req.files.forEach(f => {
                    const filePath = 'uploads/places/' + f.filename;
                    if (f.mimetype.startsWith('video/')) {
                        videoPaths.push(filePath);
                    } else {
                        imagePaths.push(filePath);
                    }
                });
            }

            const primaryImage = imagePaths.length > 0 ? imagePaths[0] : null;
            const primaryVideo = videoPaths.length > 0 ? videoPaths[0] : null;

            const [result] = await pool.query(
                `INSERT INTO tourist_places (tourist_place_type_id, name, city, latitude, longitude, overview, hidden_gem, trending_places, popular_places, hotels_stays, status, approval_status, created_by, image_url, video_url, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, 0, 1, 0, ?, ?, ?, NOW(), NOW())`,
                [category_id, name, location, latitude || null, longitude || null, description, req.user.id, primaryImage, primaryVideo]
            );

            const placeId = result.insertId;

            // Insert additional images into tourist_place_images table
            if (imagePaths.length > 1) {
                for (let i = 1; i < imagePaths.length; i++) {
                    await pool.query(
                        'INSERT INTO tourist_place_images (place_id, image_url, created_at) VALUES (?, ?, NOW())',
                        [placeId, imagePaths[i]]
                    );
                }
            }

            // Insert additional videos into tourist_place_videos table
            if (videoPaths.length > 1) {
                for (let i = 1; i < videoPaths.length; i++) {
                    await pool.query(
                        'INSERT INTO tourist_place_videos (place_id, video_url, created_at) VALUES (?, ?, NOW())',
                        [placeId, videoPaths[i]]
                    );
                }
            }

            res.json({
                status: true,
                message: 'Hidden spot published successfully. Waiting for admin approval.',
                data: {
                    place_id: placeId,
                    images: imagePaths,
                    videos: videoPaths
                }
            });
        } catch (error) {
            console.error('Add place error:', error);
            res.json({ status: false, message: error.message });
        }
    });
});

module.exports = router;
