const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const pool = require('../config/db');

// POST /api/chat
router.post('/chat', auth , async (req, res) => {
    try {
        const { message} = req.body;

        if (!message) {
            return res.json({
                status: false,
                message: 'Message is required.'
            });
        }

        // User ID from JWT token
        const userId = req.user.id;

        const response = await fetch('https://travel-ai-90909570354.us-central1.run.app/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                session_id: String(userId) // Use user ID as session ID
            })
        });

        const data = await response.json();

        res.json({
            status: true,
            data: {itinerary: data.itinerary}
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
});
// router.post('/chat', async (req, res) => {
//     try {
//         const { message, session_id } = req.body;

//         if (!message) {
//             return res.json({ status: false, message: 'Message is required.' });
//         }

//         const payload = {
//             message,
//             session_id: session_id || '11'
//         };

//         const response = await fetch('https://travel-ai-448797169926.us-central1.run.app/chat', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             body: JSON.stringify(payload)
//         });

//         const data = await response.json();
        
//         // You can structure the response however you like based on the external API output
//         res.json({
//             status: true,
//             data: data
//         });
//     } catch (error) {
//         console.error('Chat error:', error);
//         res.json({ status: false, message: error.message });
//     }
// });

// POST /api/like-place
router.post('/like-place', auth, async (req, res) => {
    try {
        const { place_data } = req.body; // The mobile app sends the JSON of the place

        if (!place_data || !place_data.place_id) {
            return res.json({ status: false, message: 'place_data with place_id is required' });
        }

        const { db } = require('../config/firebase');
        const userRef = db.collection('users').doc(req.user.id.toString());
        const likedPlaceRef = userRef.collection('liked_places').doc(place_data.place_id.toString());

        await likedPlaceRef.set({
            place_id: place_data.place_id,
            place_data: place_data,
            created_at: new Date()
        });

        res.json({ success: true, message: 'Place added to liked list!' });
    } catch (error) {
        console.error('Like Place error:', error);
        res.json({ status: false, message: error.message });
    }
});

// POST /api/unlike-place
router.post('/unlike-place', auth, async (req, res) => {
    try {

        const { place_id } = req.body;

        if (!place_id) {
            return res.json({
                status: false,
                message: "place_id is required"
            });
        }

        const { db } = require('../config/firebase');

        const userId = req.user.id.toString();

        const likedPlaceRef = db
            .collection('users')
            .doc(userId)
            .collection('liked_places')
            .doc(place_id);

        const doc = await likedPlaceRef.get();

        if (!doc.exists) {
            return res.json({
                status: false,
                message: "Place not found in liked list"
            });
        }

        await likedPlaceRef.delete();

        res.json({
            status: true,
            message: "Place removed successfully"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// POST /api/toggle-like-place
router.post('/toggle-like-place', auth, async (req, res) => {
    try {
        const { place_id, is_like } = req.body;

        if (!place_id) {
            return res.json({
                status: false,
                message: "place_id is required"
            });
        }

        if (is_like !== 0 && is_like !== 1) {
            return res.json({
                status: false,
                message: "is_like must be 0 or 1"
            });
        }

        const { db } = require('../config/firebase');

        const likedPlaceRef = db
            .collection('users')
            .doc(req.user.id.toString())
            .collection('liked_places')
            .doc(place_id.toString());

        // Unlike
        if (is_like === 0) {
            await likedPlaceRef.delete();

            return res.json({
                status: true,
                is_liked: 0,
                message: "Place removed from liked list."
            });
        }

        // Like
        const cacheSnapshot = await db.collection('api_cache').get();

        let foundPlace = null;

        for (const cacheDoc of cacheSnapshot.docs) {
            const cacheData = cacheDoc.data().data || {};
            const aiFeed = cacheData.data || {};

            const allPlaces = [
                ...(aiFeed.popular_places || []),
                ...(aiFeed.trending_places || []),
                ...(aiFeed.hotels_and_stays || []),
                ...(aiFeed.restaurants_and_cafes || [])
            ];

            foundPlace = allPlaces.find(
                place => place.place_id == place_id
            );

            if (foundPlace) break;
        }

        if (!foundPlace) {
            return res.json({
                status: false,
                message: "Place not found."
            });
        }

        await likedPlaceRef.set({
            place_id: foundPlace.place_id,
            place_data: foundPlace,
            created_at: new Date()
        });

        return res.json({
            status: true,
            is_liked: 1,
            message: "Place added to liked list."
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// GET /api/liked-places
router.get('/liked-places', auth, async (req, res) => {
    try {
        const { db } = require('../config/firebase');
        const userRef = db.collection('users').doc(req.user.id.toString());
        const likedPlacesSnapshot = await userRef.collection('liked_places').orderBy('created_at', 'desc').get();

        const data = [];
        likedPlacesSnapshot.forEach(doc => {
            data.push(doc.data().place_data);
        });

        res.json({ success: true, data });
    } catch (error) {
        console.error('Get Liked Places error:', error);
        res.json({ status: false, message: error.message });
    }
});

// POST /api/clear-chat  (clears the AI session so conversation starts fresh)
router.post('/clear-chat', auth, async (req, res) => {
    try {
        const { session_id } = req.body;

        if (!session_id) {
            return res.json({ status: false, message: 'session_id is required' });
        }

        const { db } = require('../config/firebase');
        const sessionRef = db.collection('sessions').doc(session_id.toString());

        await sessionRef.delete();

        res.json({ success: true, message: 'Chat history cleared successfully!' });
    } catch (error) {
        console.error('Clear Chat error:', error);
        res.json({ status: false, message: error.message });
    }
});

module.exports = router;
