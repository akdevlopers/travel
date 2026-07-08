const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

// GET /api/home
router.get('/home', auth, async (req, res) => {
    try {
        const typeId = req.query.tourist_place_type_id;

        // Categories from tourist_place_types table
        const [categories] = await pool.query(
            'SELECT * FROM tourist_place_types WHERE status = 1'
        );

        // Build filter clause
        let filterClause = '';
        const filterParams = [];
        if (typeId && typeId.toLowerCase() !== 'all') {
            filterClause = ' AND tourist_place_type_id = ?';
            filterParams.push(typeId);
        }

        // Popular Places (formerly Hidden Gems)
        const [hiddenGems] = await pool.query(
            `SELECT * FROM tourist_places WHERE popular_places = 1 AND status = 1${filterClause} ORDER BY RAND() LIMIT 5`,
            filterParams
        );

        // Hotels & Stays (formerly Travel Recommendations)
        const [recommendations] = await pool.query(
            `SELECT * FROM tourist_places WHERE hotels_stays = 1 AND status = 1${filterClause} ORDER BY RAND() LIMIT 5`,
            filterParams
        );

        // Trending Places
        const [trendingPlaces] = await pool.query(
            `SELECT * FROM tourist_places WHERE trending_places = 1 AND status = 1${filterClause} ORDER BY RAND() LIMIT 5`,
            filterParams
        );

        // Add rank to trending places
        const rankedTrending = trendingPlaces.map((place, index) => ({
            ...place,
            rank: index + 1
        }));

        const user = req.user;

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    contact_number: user.contact_number,
                    role: user.role,
                    location: 'Chennai' // Placeholder
                },
                categories,
                hidden_gems: hiddenGems,
                recommendations,
                trending_places: rankedTrending
            }
        });
    } catch (error) {
        console.error('Home error:', error);
        res.json({ status: false, message: error.message });
    }
});

// POST /api/ai/home  (AI-powered home - calls AI explore endpoint)
router.post('/ai/home', auth, async (req, res) => {
    try {
        const { city = 'Chennai', category = 'all' } = req.body;

        const aiResponse = await fetch('https://travel-ai-90909570354.us-central1.run.app/explore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ city, category })
        });

        if (!aiResponse.ok) {
            return res.json({
                status: false,
                message: 'AI service unavailable'
            });
        }

        const aiData = await aiResponse.json();

        const { db } = require('../config/firebase');

        // Get all liked places for this user
        const likedSnapshot = await db
            .collection('users')
            .doc(req.user.id.toString())
            .collection('liked_places')
            .get();

        const likedPlaceIds = new Set();

        likedSnapshot.forEach(doc => {
            likedPlaceIds.add(doc.id);
        });


        // Get all saved places for this user
        const savedSnapshot = await db
            .collection('users')
            .doc(req.user.id.toString())
            .collection('saved_places')
            .get();

        const savedPlaceIds = new Set();

        savedSnapshot.forEach(doc => {
            savedPlaceIds.add(doc.id);
        });

        const homeData = aiData.data;

        const addStatus = (places = []) => {
            return places.map(place => ({
                ...place,
                is_saved: savedPlaceIds.has(place.place_id) ? 1 : 0,
                is_like: likedPlaceIds.has(place.place_id) ? 1 : 0
            }));
        };

        homeData.popular_places = addStatus(homeData.popular_places);
        homeData.trending_places = addStatus(homeData.trending_places);
        homeData.hotels_and_stays = addStatus(homeData.hotels_and_stays);
        homeData.restaurants_and_cafes = addStatus(homeData.restaurants_and_cafes);


        res.json({
            status: true,
            message: 'AI home data fetched successfully.',
            data: homeData
        });

    } catch (error) {
        console.error('AI Home error:', error);

        res.json({
            status: false,
            message: error.message
        });
    }
});


// // POST /api/get-place
// router.post('/get-place', auth, async (req, res) => {
//     try {
//         const { id } = req.body;

//         const [places] = await pool.query(
//             `SELECT tp.*, tpt.name as category_name
//              FROM tourist_places tp
//              LEFT JOIN tourist_place_types tpt ON tpt.id = tp.tourist_place_type_id
//              WHERE tp.id = ?`,
//             [id]
//         );

//         if (places.length === 0) {
//             return res.json({ status: false, message: 'Place not found' });
//         }

//         const place = places[0];

//         // Mock fields for UI
//         place.rating = 4.8;
//         place.distance = '6.2 km from center';

//         // Location string
//         const locationParts = [place.district, place.city].filter(Boolean);
//         place.location_string = locationParts.length > 0 ? locationParts.join(', ') : 'Unknown Location';

//         place.image_url = place.image_url || null;

//         res.json({ status: true, data: place });
//     } catch (error) {
//         console.error('Get place error:', error);
//         res.json({ status: false, message: error.message });
// Helper function to calculate distance between two coordinates in km
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// POST /api/category-places
router.post('/category-places', auth, async (req, res) => {
    try {
        const { category, city } = req.body;

        if (!category) {
            return res.json({ status: false, message: 'category is required' });
        }

        const cityName = city || 'Chennai';

        // 1. Fetch places from Firestore api_cache
        const { db } = require('../config/firebase');
        const cacheDoc = await db.collection('api_cache').doc(`explore_${cityName.toLowerCase()}`).get();

        let aiFeed = {};
        if (cacheDoc.exists) {
            const cachedData = cacheDoc.data().data || {};
            aiFeed = cachedData.data || {};
        }
        if (!cacheDoc.exists) {
            return res.json({ success: true, data: [] });
        }

        // 2. Combine all lists into one
        const allPlaces = [
            ...(aiFeed.popular_places || []),
            ...(aiFeed.trending_places || []),
            ...(aiFeed.hotels_and_stays || [])
        ];

        // 3. Remove duplicates
        const uniqueMap = new Map();
        allPlaces.forEach(p => {
            if (p.place_id && !uniqueMap.has(p.place_id)) {
                uniqueMap.set(p.place_id, p);
            }
        });
        const uniquePlaces = Array.from(uniqueMap.values());

        // 4. Filter strictly by category
        const categoryPlaces = uniquePlaces.filter(p =>
            p.category && p.category.toLowerCase().includes(category.toLowerCase())
        );

        res.json({ success: true, data: categoryPlaces });
    } catch (error) {
        console.error('Category places error:', error);
        res.json({ status: false, message: error.message });
    }
});
//get /api/category-list
router.get('/category-list', auth, async (req, res) => {
    try {
        const [categories] = await pool.query(
            'SELECT * FROM tourist_place_types WHERE status = 1'
        );

        res.json({ success: true, data: categories });
    } catch (error) {
        console.error('Category list error:', error);
        res.json({ status: false, message: error.message });
    }
});

// POST /api/nearby-places
router.post('/nearby-places', auth, async (req, res) => {
    try {
        const { latitude, longitude, radius_km, city, category } = req.body;

        if (!latitude || !longitude) {
            return res.json({ status: false, message: 'latitude and longitude are required' });
        }

        const cityName = city || 'Chennai';
        const radius = radius_km || 25; // default 25km
        const categoryFilter = category ? category.toLowerCase() : null;

        // 1. Fetch places from Firestore api_cache instead of asking frontend!
        const { db } = require('../config/firebase');
        const cacheDoc = await db.collection('api_cache').doc(`explore_${cityName.toLowerCase()}`).get();

        let aiFeed = {};
        if (cacheDoc.exists) {
            // The Firebase doc has 'data' -> 'data' -> 'popular_places'
            const cachedData = cacheDoc.data().data || {};
            aiFeed = cachedData.data || {};
        }
        if (!cacheDoc.exists) {
            return res.json({
                success: true,
                data: []
            });
        }

        // 2. Combine all lists into one
        const allPlaces = [
            ...(aiFeed.popular_places || []),
            ...(aiFeed.trending_places || []),
            ...(aiFeed.hotels_and_stays || [])
        ];

        // 3. Remove duplicates (some places might be in both popular and trending)
        const uniqueMap = new Map();
        allPlaces.forEach(p => {
            if (p.place_id && !uniqueMap.has(p.place_id)) {
                uniqueMap.set(p.place_id, p);
            }
        });
        const uniquePlaces = Array.from(uniqueMap.values());

        // 4. Calculate distance and filter by radius + category
        const nearbyPlaces = uniquePlaces
            .map(place => {
                const distance = getDistanceFromLatLonInKm(
                    parseFloat(latitude),
                    parseFloat(longitude),
                    parseFloat(place.latitude),
                    parseFloat(place.longitude)
                );

                return {
                    ...place,
                    distance: distance.toFixed(1)
                };
            })
            .filter(place => {
                // Distance filter
                if (parseFloat(place.distance) > radius) {
                    return false;
                }

                // Category filter (if provided)
                if (categoryFilter) {
                    return (
                        place.category &&
                        place.category.toLowerCase() === categoryFilter
                    );
                }

                return true;
            });

        // 5. Sort closest first
        nearbyPlaces.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

        res.json({ success: true, data: nearbyPlaces });
    } catch (error) {
        console.error('Nearby places error:', error);
        res.json({ status: false, message: error.message });
    }
});

// POST /api/save-place  (save a place from home page)
router.post('/save-place', auth, async (req, res) => {
    try {
        const { place_data } = req.body;

        if (!place_data || !place_data.place_id) {
            return res.json({ status: false, message: 'place_data with place_id is required' });
        }

        const { db } = require('../config/firebase');
        const userRef = db.collection('users').doc(req.user.id.toString());
        const savedPlaceRef = userRef.collection('saved_places').doc(place_data.place_id.toString());

        await savedPlaceRef.set({
            place_id: place_data.place_id,
            place_data: place_data,
            created_at: new Date()
        });

        res.json({ success: true, message: 'Place saved successfully!' });
    } catch (error) {
        console.error('Save Place error:', error);
        res.json({ status: false, message: error.message });
    }
});

// DELETE /api/unsave-place  (remove a saved place)
router.post('/unsave-place', auth, async (req, res) => {
    try {
        const { place_id } = req.body;

        if (!place_id) {
            return res.json({ status: false, message: 'place_id is required' });
        }

        const { db } = require('../config/firebase');
        const userRef = db.collection('users').doc(req.user.id.toString());
        await userRef.collection('saved_places').doc(place_id.toString()).delete();

        res.json({ success: true, message: 'Place removed from saved list.' });
    } catch (error) {
        console.error('Unsave Place error:', error);
        res.json({ status: false, message: error.message });
    }
});
// POST /api/toggle-save-place
router.post('/toggle-save-place', auth, async (req, res) => {
    try {

        const { place_id, is_save } = req.body;

        if (!place_id) {
            return res.json({
                status: false,
                message: "place_id is required"
            });
        }

        if (is_save !== 0 && is_save !== 1) {
            return res.json({
                status: false,
                message: "is_save must be 0 or 1"
            });
        }

        const { db } = require('../config/firebase');

        const savedPlaceRef = db
            .collection('users')
            .doc(req.user.id.toString())
            .collection('saved_places')
            .doc(place_id.toString());

        // Unsave
        if (is_save === 0) {
            await savedPlaceRef.delete();

            return res.json({
                status: true,
                is_saved: 0,
                message: "Place removed from saved list."
            });
        }

        // Search all api_cache documents
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
                place => place.place_id === place_id
            );

            if (foundPlace) break;
        }

        if (!foundPlace) {
            return res.json({
                status: false,
                message: "Place not found."
            });
        }

        // Save full place details
        await savedPlaceRef.set({
            place_id: foundPlace.place_id,
            place_data: foundPlace,
            created_at: new Date()
        });

        return res.json({
            status: true,
            is_saved: 1,
            message: "Place saved successfully."
        });

    } catch (error) {

        console.error("Toggle Save Place Error:", error);

        return res.status(500).json({
            status: false,
            message: error.message
        });

    }
});
// GET /api/saved-places  (list all home-saved places)
router.get('/saved-places', auth, async (req, res) => {
    try {
        const { db } = require('../config/firebase');
        const userRef = db.collection('users').doc(req.user.id.toString());
        const snapshot = await userRef.collection('saved_places').orderBy('created_at', 'desc').get();

        const data = [];
        snapshot.forEach(doc => {
            data.push(doc.data().place_data);
        });

        res.json({ success: true, data });
    } catch (error) {
        console.error('Get Saved Places error:', error);
        res.json({ status: false, message: error.message });
    }
});

module.exports = router;
