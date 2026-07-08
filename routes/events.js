const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const { communityUpload } = require('../middleware/upload');


// POST /api/live-event/create
router.post('/live-event/create', auth, communityUpload.single('image'), async (req, res) => {
    try {

        const { title, description, date, time, location } = req.body;

        if (!title || !date || !time || !location) {
            return res.json({
                status: false,
                message: 'Title, date, time and location are required.'
            });
        }

        let posterImage = null;

        if (req.file) {
            posterImage = `${req.protocol}://${req.get('host')}/uploads/community/${req.file.filename}`;
        }

        const scheduledAt = `${date} ${time}`;

        const [result] = await pool.query(
            `INSERT INTO travel_live_events
            (user_id, event_type, title, description, location, poster_image, scheduled_at, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                req.user.id,
                2, // Upcoming Event
                title,
                description || null,
                location,
                posterImage,
                scheduledAt,
                1
            ]
        );
        res.json({
            status: true,
            message: 'Live event created successfully.',
            data: {
                event_id: result.insertId,
                poster_image: posterImage
            }
        });
    } catch (error) {
        console.error('Create live event error:', error);

        res.json({
            status: false,
            message: error.message
        });
    }
});

// GET /api/live-event/list
router.get('/live-event/list', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const [events] = await pool.execute(
            'SELECT * FROM travel_live_events LIMIT ? OFFSET ?',
            [parseInt(limit), parseInt(offset)]
        );

        res.json({ events });
    } catch (error) {
        console.error('Error fetching live events:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /api/live-event/list
// router.get('/live-event/list', auth, async (req, res) => {
//     try {
//         const page = parseInt(req.query.page || 1);
//         const limit = parseInt(req.query.limit || 10);
//         const offset = (page - 1) * limit;

//         const [events] = await pool.query(
//             `SELECT
//                 e.*,
//                 u.name AS user_name,
//                 u.profile_image
//             FROM travel_live_events e
//             JOIN users u ON u.id = e.user_id
//             ORDER BY e.id DESC
//             LIMIT ? OFFSET ?`,
//             [limit, offset]
//         );

//         const [[{ total }]] = await pool.query(
//             `SELECT COUNT(*) AS total
//              FROM travel_live_events`
//         );

//         res.json({
//             status: true,
//             message: 'Live events fetched successfully.',
//             current_page: page,
//             total,
//             data: events
//         });

//     } catch (error) {
//         console.error('Live event list error:', error);

//         res.json({
//             status: false,
//             message: error.message
//         });
//     }
// });
//GET /api/live-event/:id
router.get('/live-event/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;

        const [event] = await pool.execute(
            'SELECT * FROM travel_live_events WHERE id = ?',
            [parseInt(id)]
        );

        if (event.length === 0) {
            return res.status(200).json({ message: 'Event not found' });
        }

        res.json({ event: event[0] });
    } catch (error) {
        console.error('Error fetching live event:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


//POST /api/live-event/like
router.post('/live-event/like', auth, async (req, res) => {
    try {
        const { eventId } = req.body;
        const userId = req.user.id;

        // Check if the user has already liked the event
        const [existingLike] = await pool.execute(
            'SELECT * FROM travel_live_likes WHERE user_id = ? AND event_id = ?',
            [userId, parseInt(eventId)]
        );

        if (existingLike.length > 0) {
            return res.status(200).json({ message: 'You have already liked this event' });
        }

        // Insert the like into the database
        await pool.execute(
            'INSERT INTO travel_live_likes (user_id, event_id) VALUES (?, ?)',
            [userId, parseInt(eventId)]
        );

        res.json({ message: 'Event liked successfully' });
    } catch (error) {
        console.error('Error liking live event:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

//POST /api/live-event/comment
router.post('/live-event/comment', auth, async (req, res) => {
    try {
        const { eventId, comment } = req.body;
        const userId = req.user.id;

        // Insert the comment into the database
        await pool.execute(
            'INSERT INTO travel_live_comments (user_id, event_id, comment) VALUES (?, ?, ?)',
            [userId, parseInt(eventId), comment]
        );

        res.json({ message: 'Comment added successfully' });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

//GET /api/live-event/comments/:id
router.get('/live-event/comments/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;

        const [comments] = await pool.execute(
            'SELECT * FROM travel_live_comments WHERE event_id = ?',
            [parseInt(id)]
        );

        res.json({ comments });
    } catch (error) {
        console.error('Error fetching event comments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

//DELETE /api/live-event/:id
router.delete('/live-event/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if the event exists and belongs to the current user
        const [event] = await pool.execute(
            'SELECT * FROM travel_live_events WHERE id = ? AND user_id = ?',
            [parseInt(id), userId]
        );

        if (event.length === 0) {
            return res.status(200).json({ message: 'Event not found or not owned by user' });
        }

        // Delete the event
        await pool.execute(
            'DELETE FROM travel_live_events WHERE id = ?',
            [parseInt(id)]
        );

        res.json({ message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Error deleting live event:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

//POST /api/live-event/start
router.post('/live-event/start', auth, async (req, res) => {
    try {
        const { eventId } = req.body;
        const userId = req.user.id;

        // Check if the user is the owner of the event
        const [event] = await pool.execute(
            'SELECT * FROM travel_live_events WHERE id = ? AND user_id = ?',
            [parseInt(eventId), userId]
        );

        if (event.length === 0) {
            return res.status(200).json({ message: 'Event not found or not owned by user' });
        }

        // Update the event to mark it as started
        await pool.execute(
            'UPDATE travel_live_events SET is_started = 1 WHERE id = ?',
            [parseInt(eventId)]
        );

        res.json({ message: 'Event started successfully' });
    } catch (error) {
        console.error('Error starting live event:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

//POST /api/live-event/end
router.post('/live-event/end', auth, async (req, res) => {
    try {
        const { eventId } = req.body;
        const userId = req.user.id;

        // Check if the user is the owner of the event
        const [event] = await pool.execute(
            'SELECT * FROM travel_live_events WHERE id = ? AND user_id = ?',
            [parseInt(eventId), userId]
        );

        if (event.length === 0) {
            return res.status(200).json({ message: 'Event not found or not owned by user' });
        }

        // Update the event to mark it as ended
        await pool.execute(
            'UPDATE travel_live_events SET is_ended = 1 WHERE id = ?',
            [parseInt(eventId)]
        );

        res.json({ message: 'Event ended successfully' });
    } catch (error) {
        console.error('Error ending live event:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

//POST /api/live-event/view
router.post('/live-event/view', auth, async (req, res) => {
    try {
        const { eventId } = req.body;
        const userId = req.user.id;

        // Check if the user is the owner of the event
        const [event] = await pool.execute(
            'SELECT * FROM travel_live_events WHERE id = ? AND user_id = ?',
            [parseInt(eventId), userId]
        );

        if (event.length === 0) {
            return res.status(200).json({ message: 'Event not found or not owned by user' });
        }

        // Update the event to increment the view count
        await pool.execute(
            'UPDATE travel_live_events SET view_count = view_count + 1 WHERE id = ?',
            [parseInt(eventId)]
        );

        res.json({ message: 'Event view count updated successfully' });
    } catch (error) {
        console.error('Error updating live event view count:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;