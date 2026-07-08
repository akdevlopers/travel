const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const { communityUpload } = require('../middleware/upload');

// GET /api/community/posts
router.get('/community/posts', auth, async (req, res) => {
    try {

        const [posts] = await pool.query(`
            SELECT
                cp.id,
                cp.user_id,
                u.name AS user_name,
                u.profile_image,
                cp.caption,
                cp.location,
                cp.post_type,
                cp.created_at,

                (
                    SELECT COUNT(*)
                    FROM community_post_likes l
                    WHERE l.post_id = cp.id
                ) AS like_count,

                (
                    SELECT COUNT(*)
                    FROM community_post_comments c
                    WHERE c.post_id = cp.id
                    AND c.status = 1
                ) AS comment_count,

                (
                    SELECT COUNT(*)
                    FROM community_post_saves s
                    WHERE s.post_id = cp.id
                ) AS save_count,

                EXISTS(
                    SELECT 1
                    FROM community_post_likes l
                    WHERE l.post_id = cp.id
                    AND l.user_id = ?
                ) AS is_liked,

                EXISTS(
                    SELECT 1
                    FROM community_post_saves s
                    WHERE s.post_id = cp.id
                    AND s.user_id = ?
                ) AS is_saved

            FROM community_posts cp
            JOIN users u ON u.id = cp.user_id
            ORDER BY cp.id DESC
        `, [req.user.id, req.user.id]);

        for (const post of posts) {

            if (post.post_type == 0) {

                const [images] = await pool.query(
                    `SELECT id, image
                     FROM community_post_images
                     WHERE community_post_id = ?`,
                    [post.id]
                );

                post.media = images;
            } else {

                const [videos] = await pool.query(
                    `SELECT id, video
                     FROM community_post_videos
                     WHERE community_post_id = ?`,
                    [post.id]
                );

                post.media = videos;
            }
        }

        res.json({
            status: true,
            message: 'Community posts fetched successfully.',
            data: posts
        });

    } catch (error) {
        console.error('Community post list error:', error);
        res.json({
            status: false,
            message: error.message
        });
    }
});
// POST /api/community/post
router.post('/community/post', auth, (req, res) => {

    // Handle upload manually
    const upload = communityUpload.any();

    upload(req, res, async function (uploadErr) {

        if (uploadErr) {
            console.error('Upload error:', uploadErr);
            return res.json({
                status: false,
                message: 'Upload error: ' + uploadErr.message
            });
        }

        try {

            const { caption, location, post_type } = req.body;

            if (!caption || !location || post_type === undefined) {
                return res.json({
                    status: false,
                    message: 'Caption, location and post_type are required.'
                });
            }

            if (!req.files || req.files.length === 0) {
                return res.json({
                    status: false,
                    message: 'Please upload at least one media file.'
                });
            }

            let mediaPaths = [];

            // Validate uploaded files
            for (const file of req.files) {

                // Image Post
                if (parseInt(post_type) === 0) {

                    if (!file.mimetype.startsWith('image/')) {
                        return res.json({
                            status: false,
                            message: 'Only image files are allowed for Image posts.'
                        });
                    }

                }

                // Video Post
                else if (parseInt(post_type) === 1) {

                    if (!file.mimetype.startsWith('video/')) {
                        return res.json({
                            status: false,
                            message: 'Only video files are allowed for Video posts.'
                        });
                    }

                } else {

                    return res.json({
                        status: false,
                        message: 'Invalid post_type. Use 0 for Image and 1 for Video.'
                    });

                }

                const baseUrl = `${req.protocol}://${req.get('host')}`;
                const fileUrl = `${baseUrl}/uploads/community/${file.filename}`;

                mediaPaths.push(fileUrl);
                //mediaPaths.push('uploads/community/' + file.filename);
            }

            // Create Community Post
            const [result] = await pool.query(
                `INSERT INTO community_posts
                (user_id, caption, location, post_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, NOW(), NOW())`,
                [
                    req.user.id,
                    caption,
                    location,
                    post_type
                ]
            );

            const postId = result.insertId;

            // Save Images
            if (parseInt(post_type) === 0) {

                for (const image of mediaPaths) {

                    await pool.query(
                        `INSERT INTO community_post_images
                        (community_post_id, image, created_at, updated_at)
                        VALUES (?, ?, NOW(), NOW())`,
                        [postId, image]
                    );

                }

            }

            // Save Videos
            else {

                for (const video of mediaPaths) {

                    await pool.query(
                        `INSERT INTO community_post_videos
                        (community_post_id, video, created_at, updated_at)
                        VALUES (?, ?, NOW(), NOW())`,
                        [postId, video]
                    );

                }

            }

            res.json({
                status: true,
                message: 'Community post published successfully.',
                data: {
                    post_id: postId,
                    caption,
                    location,
                    post_type: Number(post_type),
                    media_count: mediaPaths.length,
                    media: mediaPaths
                }
            });

        } catch (error) {

            console.error('Community post error:', error);

            res.json({
                status: false,
                message: error.message
            });

        }

    });

});
// POST /api/community/posts/:id/like
router.post('/community/posts/:id/like', auth, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;

        const [existing] = await pool.query('SELECT id FROM community_post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);

        if (existing.length > 0) {
            // Unlike
            await pool.query('DELETE FROM community_post_likes WHERE id = ?', [existing[0].id]);
            res.json({ status: true, message: 'Post unliked successfully.', action: 'unliked' });
        } else {
            // Like
            await pool.query('INSERT INTO community_post_likes (post_id, user_id, created_at) VALUES (?, ?, NOW())', [postId, userId]);
            res.json({ status: true, message: 'Post liked successfully.', action: 'liked' });
        }
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// POST /api/community/posts/:id/save
router.post('/community/posts/:id/save', auth, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;

        const [existing] = await pool.query('SELECT id FROM community_post_saves WHERE post_id = ? AND user_id = ?', [postId, userId]);

        if (existing.length > 0) {
            // Unsave
            await pool.query('DELETE FROM community_post_saves WHERE id = ?', [existing[0].id]);
            res.json({ status: true, message: 'Post unsaved successfully.', action: 'unsaved' });
        } else {
            // Save
            await pool.query('INSERT INTO community_post_saves (post_id, user_id, created_at) VALUES (?, ?, NOW())', [postId, userId]);
            res.json({ status: true, message: 'Post saved successfully.', action: 'saved' });
        }
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// POST /api/community/posts/:id/comment
router.post('/community/posts/:id/comment', auth, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;
        const { comment } = req.body;

        if (!comment) return res.json({ status: false, message: 'Comment text is required.' });

        const [result] = await pool.query(
            'INSERT INTO community_post_comments (post_id, user_id, comment, status, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
            [postId, userId, comment]
        );

        res.json({ status: true, message: 'Comment added successfully.', comment_id: result.insertId });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// GET /api/community/posts/:id/comments
router.get('/community/posts/:id/comments', auth, async (req, res) => {
    try {
        const postId = req.params.id;

        const [comments] = await pool.query(
            `SELECT c.id, c.comment, c.created_at, u.name as user_name, u.profile_image as user_image
             FROM community_post_comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.post_id = ? AND c.status = 1
             ORDER BY c.created_at DESC`,
            [postId]
        );

        res.json({ status: true, data: comments });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

module.exports = router;
