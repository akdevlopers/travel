const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const pool = require('../config/db');
//ai
// POST /api/itinerary/smart-plan
router.post('/itinerary/smart-plan', auth, async (req, res) => {
    try {
        const { title, destination, duration_days, theme, start_date } = req.body|| {};
        if(!title || !destination || !duration_days || !theme || !start_date) {
            return res.json({
                status: false,
                message: "All fields are required"
            },200);
        }

        // Fetch from AI
        const aiResponse = await fetch('https://travel-ai-90909570354.us-central1.run.app/smart-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, destination, duration_days, theme, start_date })
        });

        const aiData = await aiResponse.json();

        res.json({ success: true, source: 'ai_api', data: aiData.data });
    } catch (error) {
        console.error('Smart Plan error:', error);
        res.json({ status: false, message: error.message });
    }
});
//ai
// GET /api/itinerary/list
router.get('/itinerary/list', auth, async (req, res) => {
    try {
        res.json({ success: true, data: [] });
    } catch (error) {
        console.error('Get Itineraries error:', error);
        res.json({ status: false, message: error.message });
    }
});

// GET /api/get-travel-modes
router.get('/get-travel-modes', auth, async (req, res) => {
    try {

        const [rows] = await pool.execute(`
            SELECT id, name, icon
            FROM travel_modes
            WHERE status = 1
            ORDER BY id ASC
        `);

        res.json({
            status: true,
            message: "Travel modes fetched successfully",
            data: rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            status: false,
            message: err.message
        });
    }
});

// GET /api/popular-places
router.get('/popular-places', auth, async (req, res) => {
    try {
        const city = req.query.city || 'Chennai';

        const { db } = require('../config/firebase');

        const cacheDoc = await db
            .collection('api_cache')
            .doc(`explore_${city.toLowerCase()}`)
            .get();

        if (!cacheDoc.exists) {
            return res.json({
                status: true,
                message: 'No popular places found',
                data: []
            });
        }

        const cachedData = cacheDoc.data().data || {};
        const aiFeed = cachedData.data || {};

        const popularPlaces = aiFeed.popular_places || [];

        // Remove duplicate places
        const uniqueMap = new Map();

        popularPlaces.forEach(place => {
            if (place.place_id && !uniqueMap.has(place.place_id)) {
                uniqueMap.set(place.place_id, place);
            }
        });

        const result = Array.from(uniqueMap.values());

        res.json({
            status: true,
            message: "Popular places fetched successfully",
            data: result
        });

    } catch (error) {
        console.error("Popular places error:", error);

        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// GET /api/get-trip-preferences
router.get('/get-trip-preferences', auth, async (req, res) => {
    try {

        const [rows] = await pool.execute(`
            SELECT
                id,
                name,
                icon
            FROM trip_preferences
            WHERE status = 1
            ORDER BY display_order ASC, id ASC
        `);

        res.json({
            status: true,
            message: "Trip preferences fetched successfully",
            data: rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// POST /api/preference-places
router.post('/preference-places', auth, async (req, res) => {
    try {
        const { city, preferences } = req.body|| {};

        if (!city || !preferences) {
            return res.json({
                status: false,
                message: "All fields are required"
            },200);
        }

        if (!preferences || preferences.length === 0) {
            return res.json({
                status: false,
                message: "preferences are required"
            },200);
        }

        const cityName = city || "Chennai";

        const { db } = require("../config/firebase");

        const cacheDoc = await db
            .collection("api_cache")
            .doc(`explore_${cityName.toLowerCase()}`)
            .get();

        if (!cacheDoc.exists) {
            return res.json({
                status: true,
                data: []
            });
        }

        const cachedData = cacheDoc.data().data || {};
        const aiFeed = cachedData.data || {};

        const allPlaces = [
            ...(aiFeed.popular_places || []),
            ...(aiFeed.trending_places || []),
            ...(aiFeed.hotels_and_stays || [])
        ];

        // Remove duplicates
        const uniquePlaces = Array.from(
            new Map(
                allPlaces.map(place => [place.place_id, place])
            ).values()
        );

        // Filter by selected preferences
        const filtered = uniquePlaces.filter(place =>
            preferences.some(pref =>
                place.category &&
                place.category.toLowerCase().includes(pref.toLowerCase())
            )
        );

        res.json({
            status: true,
            data: filtered
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// POST /api/create-trip-plan
router.post('/create-trip-plan', auth, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const {
            travel_mode_id,
            preference_ids,
            title,
            from_place,
            to_place,
            duration,
            start_date,
            end_date,
            selected_places
        } = req.body || {};

        if (!travel_mode_id ||!from_place || !title || !to_place ||!duration ||!start_date ||!end_date) 
        {
            return res.status(200).json({
                status: false,
                message: "All required fields are mandatory."
            });
        }

        // Create Trip Plan
        const [planResult] = await connection.execute(
            `INSERT INTO smart_trip_plans
            (
                user_id,
                travel_mode_id,
                preference_ids,
                title,
                from_place,
                to_place,
                duration,
                start_date,
                end_date
            )
            VALUES (?, ?, ?, ?, ?,?, ?, ?, ?)`,
            [
                req.user.id,
                travel_mode_id,
                JSON.stringify(preference_ids || []),
                title,
                from_place,
                to_place,
                duration,
                start_date,
                end_date
            ]
        );

        const trip_plan_id = planResult.insertId;

        // Save Selected Places
        if (Array.isArray(selected_places) && selected_places.length > 0) {

            for (const place of selected_places) {

                await connection.execute(
                    `INSERT INTO smart_trip_plan_places
                    (
                        trip_plan_id,
                        place_id,
                        place_name,
                        category,
                        image
                    )
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        trip_plan_id,
                        place.place_id,
                        place.name,
                        place.category || null,
                        place.image || null
                    ]
                );
            }
        }

        await connection.commit();

        res.json({
            status: true,
            message: "Trip plan created successfully.",
            data: { trip_plan_id }
        });

    } catch (error) {

        await connection.rollback();

        console.error(error);

        res.status(500).json({
            status: false,
            message: error.message
        });

    } finally {

        connection.release();

    }
});

// GET /api/get-trip-plan-list
router.get('/get-trip-plan-list', auth, async (req, res) => {
    try {

        const [plans] = await pool.execute(`
            SELECT
                sp.id,
                sp.travel_mode_id,
                tm.name AS travel_mode,
                sp.preference_ids,
                sp.from_place,
                sp.to_place,
                sp.duration,
                sp.start_date,
                sp.end_date,
                sp.status,
                sp.created_at
            FROM smart_trip_plans sp
            LEFT JOIN travel_modes tm
                ON tm.id = sp.travel_mode_id
            WHERE sp.user_id = ?
            ORDER BY sp.id DESC
        `, [req.user.id]);

        for (const plan of plans) {

            // Convert JSON string to array
            plan.preference_ids = JSON.parse(plan.preference_ids || '[]');

            // Get selected places
            const [places] = await pool.execute(`
                SELECT
                    place_id,
                    place_name,
                    category,
                    image
                FROM smart_trip_plan_places
                WHERE trip_plan_id = ?
            `, [plan.id]);

            plan.selected_places = places;
        }

        res.json({
            status: true,
            message: "Trip plans fetched successfully",
            data: plans
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});





module.exports = router;
