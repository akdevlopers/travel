const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth, role } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// POST /api/admin/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.json({ status: false, message: 'Email and password are required.' });
        }

        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.json({ status: false, message: 'Admin not found' });
        }

        const user = users[0];

        if (user.role !== 'admin') {
            return res.json({ status: false, message: 'Unauthorized. Only admins can log in here.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.json({ status: false, message: 'Invalid password' });
        }

        // Generate JWT token for admin
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '30d' });

        delete user.password;

        res.json({
            status: true,
            message: 'Admin login successful',
            data: user,
            token: token
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.json({ status: false, message: error.message });
    }
});
// GET /api/admin/stats
// router.get('/stats', auth, role('admin'), async (req, res) => {
//     try {
//         const [userCount] = await pool.query('SELECT COUNT(*) as count FROM users');
//         const [placeCount] = await pool.query('SELECT COUNT(*) as count FROM tourist_places');
//         const [pendingSubmissions] = await pool.query('SELECT COUNT(*) as count FROM users WHERE partner_status = 1');

//         res.json({
//             status: true,
//             data: {
//                 total_users: userCount[0].count,
//                 total_places: placeCount[0].count,
//                 pending_submissions: pendingSubmissions[0].count
//             }
//         });
//     } catch (error) {
//         console.error('Admin stats error:', error);
//         res.json({ status: false, message: error.message });
//     }
// });
// GET /api/admin/stats
router.get('/stats', auth, role('admin'), async (req, res) => {
    try {
        const [[users]] = await pool.query(`
            SELECT COUNT(*) total_users
            FROM users
            WHERE role = 'user'
        `);

        const [[partners]] = await pool.query(`
            SELECT COUNT(*) total_partners
            FROM users
            WHERE is_partner = 1
        `);

        const [[places]] = await pool.query(`
            SELECT COUNT(*) total_places
            FROM tourist_places
        `);

        const [[hiddenPlaces]] = await pool.query(`
            SELECT COUNT(*) hidden_places
            FROM tourist_places
            WHERE status = 0
        `);

        const [[pendingPlaces]] = await pool.query(`
            SELECT COUNT(*) pending_places
            FROM tourist_places
            WHERE approval_status = 0
        `);

        const [[rejectedPlaces]] = await pool.query(`
            SELECT COUNT(*) rejected_places
            FROM tourist_places
            WHERE approval_status = 2
        `);

        const [[pendingPartners]] = await pool.query(`
            SELECT COUNT(*) pending_partners
            FROM users
            WHERE is_partner=1
            AND partner_status=1
        `);

        const [[approvedPartners]] = await pool.query(`
            SELECT COUNT(*) approved_partners
            FROM users
            WHERE is_partner=1
            AND partner_status=2
        `);

        const [[posts]] = await pool.query(`
            SELECT COUNT(*) total_posts
            FROM community_posts
        `);

        res.json({
            status: true,
            data: {
                total_users: users.total_users,
                total_partners: partners.total_partners,
                total_places: places.total_places,
                hidden_places: hiddenPlaces.hidden_places,
                pending_places: pendingPlaces.pending_places,
                rejected_places: rejectedPlaces.rejected_places,
                pending_partners: pendingPartners.pending_partners,
                approved_partners: approvedPartners.approved_partners,
                total_posts: posts.total_posts
            }
        });

    } catch (err) {
        res.json({
            status: false,
            message: err.message
        });
    }
});
//post /api/add-category
router.post('/add-category', auth, role('admin'), async (req, res) => {
    try {
        const { name , image_url } = req.body;
        const [result] = await pool.query(`INSERT INTO tourist_place_types (name, image_url, status, created_at, updated_at) VALUES (?, ?, 1, NOW(), NOW())`, [name, image_url]);
        res.json({
            status: true,
            message: 'Category added successfully'
        });
    } catch (err) {
        res.json({
            status: false,
            message: err.message
        });
    }
});
// GET /api/admin/dashboard
router.get('/dashboard', auth, role('admin'), async (req, res) => {
    try {
        const [[users]] = await pool.query(`SELECT COUNT(*) total_users FROM users WHERE role = 'user'`);
        const [[activePartners]] = await pool.query(`SELECT COUNT(*) active_partners FROM users WHERE is_partner = 1 AND status = 1`);
        const [[hiddenPlaces]] = await pool.query(`SELECT COUNT(*) hidden_places FROM tourist_places WHERE status = 0`);
        const [[livePlaces]] = await pool.query(`SELECT COUNT(*) live_places FROM tourist_places WHERE approval_status = 1`);
        const [[pendingPlacesCount]] = await pool.query(`SELECT COUNT(*) pending_places FROM tourist_places WHERE approval_status = 0`);
        const [[pendingPartnersCount]] = await pool.query(`SELECT COUNT(*) pending_partners FROM users WHERE is_partner = 1 AND partner_status = 1`);
        const [[rejectedPlacesCount]] = await pool.query(`SELECT COUNT(*) rejected_places FROM tourist_places WHERE approval_status = 2`);

        const [actionControlPlaces] = await pool.query(`
            SELECT tp.id, tp.name, tp.city, tp.state, tpt.name as category, u.name as partner_name, tp.image_url 
            FROM tourist_places tp 
            LEFT JOIN tourist_place_types tpt ON tp.tourist_place_type_id = tpt.id 
            LEFT JOIN users u ON tp.created_by = u.id 
            WHERE tp.approval_status = 0 
            ORDER BY tp.created_at DESC 
            LIMIT 5
        `);

        const [actionControlPartners] = await pool.query(`
            SELECT id, name, email, profile_image 
            FROM users 
            WHERE partner_status = 1 
            ORDER BY created_at DESC 
            LIMIT 5
        `);

        const [topPartners] = await pool.query(`
            SELECT u.id, u.name, COUNT(tp.id) as approved_places 
            FROM users u 
            JOIN tourist_places tp ON u.id = tp.created_by 
            WHERE u.is_partner = 1 AND tp.approval_status = 1 
            GROUP BY u.id 
            ORDER BY approved_places DESC 
            LIMIT 5
        `);

        const [categoryAnalytics] = await pool.query(`
            SELECT tpt.name as category, COUNT(tp.id) as count 
            FROM tourist_place_types tpt 
            LEFT JOIN tourist_places tp ON tpt.id = tp.tourist_place_type_id AND tp.approval_status = 1
            GROUP BY tpt.id, tpt.name
        `);

        const [latestPlaces] = await pool.query(`
            SELECT tp.name, tp.created_at, u.name as partner_name 
            FROM tourist_places tp 
            LEFT JOIN users u ON tp.created_by = u.id 
            ORDER BY tp.created_at DESC 
            LIMIT 5
        `);

        const [latestPartners] = await pool.query(`
            SELECT name, created_at 
            FROM users 
            WHERE is_partner = 1 
            ORDER BY created_at DESC 
            LIMIT 5
        `);

        // Build Activity Feed
        let activityFeed = [];
        latestPlaces.forEach(p => {
            activityFeed.push({
                type: 'place',
                message: `New place '${p.name}' uploaded by ${p.partner_name || 'Admin'}`,
                created_at: p.created_at
            });
        });
        latestPartners.forEach(p => {
            activityFeed.push({
                type: 'partner',
                message: `Partner registration: ${p.name}`,
                created_at: p.created_at
            });
        });
        activityFeed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        activityFeed = activityFeed.slice(0, 5);

        res.json({
            status: true,
            data: {
                summary: {
                    registered_users: users.total_users,
                    active_partners: activePartners.active_partners,
                    hidden_places: hiddenPlaces.hidden_places,
                    live_places: livePlaces.live_places,
                    action_backlog: pendingPlacesCount.pending_places + pendingPartnersCount.pending_partners
                },
                action_control_center: {
                    places: actionControlPlaces,
                    partners: actionControlPartners
                },
                top_partners: topPartners,
                approval_analytics: {
                    approved: livePlaces.live_places,
                    pending: pendingPlacesCount.pending_places,
                    rejected: rejectedPlacesCount.rejected_places,
                    total_submissions: livePlaces.live_places + pendingPlacesCount.pending_places + rejectedPlacesCount.rejected_places
                },
                category_analytics: categoryAnalytics,
                activity_feed: activityFeed
            }
        });

    } catch (err) {
        res.json({
            status: false,
            message: err.message
        });
    }
});

// GET /api/admin/partner-requests
router.get('/partner-requests', auth, role('admin'), async (req, res) => {
    try {
        const [requests] = await pool.query(
            `SELECT id as user_id, name, email, partner_status
             FROM users
             WHERE partner_status = 1`
        );

        res.json({ status: true, data: requests });
    } catch (error) {
        console.error('Pending partners error:', error);
        res.json({ status: false, message: error.message });
    }
});

// POST /api/admin/partner-requests/:userId/approve
router.post('/partner-requests/:userId/approve', auth, role('admin'), async (req, res) => {
    try {
        const { userId } = req.params;

        // Find user
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(200).json({ status: false, message: 'User not found.' });
        }

        const user = users[0];
        if (user.partner_status !== 1) {
            return res.status(200).json({ status: false, message: 'No pending partner request found for this user.' });
        }

        // Update user role, partner_status = 2 (Approved), and is_partner = 1
        await pool.query("UPDATE users SET is_partner = 1, partner_status = 2, is_partner = 1 WHERE id = ?", [userId]);

        res.json({ status: true, message: 'User has been approved as a partner.' });
    } catch (error) {
        console.error('Approve partner error:', error);
        res.json({ status: false, message: error.message });
    }
});

// GET /api/admin/partners/stats
router.get('/partners/stats', auth, role('admin'), async (req, res) => {
    try {
        const [users] = await pool.query("SELECT status FROM users WHERE is_partner = 1");
        let active = 0, suspended = 0;
        users.forEach(u => {
            if (u.status === 1) active++;
            else suspended++;
        });
        res.json({
            status: true,
            data: {
                total: users.length,
                active,
                suspended
            }
        });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// GET /api/admin/partners
router.get('/partners', auth, role('admin'), async (req, res) => {
    try {
        const [partners] = await pool.query("SELECT id, name, email, contact_number, status, is_partner, partner_status FROM users WHERE is_partner = 1");
        res.json({ status: true, data: partners });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// GET /api/admin/partners/:id
router.get('/partners/:id', auth, role('admin'), async (req, res) => {
    try {
        const [users] = await pool.query(
            "SELECT id, name, email, contact_number, status, is_partner, partner_status, created_at FROM users WHERE id = ?",
            [req.params.id]
        );
        
        if (users.length === 0) {
            return res.json({ status: false, message: 'Partner not found.' });
        }
        
        const partner = users[0];
        
        const [places] = await pool.query(
            `SELECT tp.id, tp.name, tp.city, tp.state, tp.country, tpt.name as category, tp.image_url, tp.approval_status 
             FROM tourist_places tp 
             LEFT JOIN tourist_place_types tpt ON tp.tourist_place_type_id = tpt.id 
             WHERE tp.created_by = ? 
             ORDER BY tp.created_at DESC`,
            [req.params.id]
        );
        
        res.json({ 
            status: true, 
            data: {
                partner: partner,
                submitted_places: places
            }
        });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// POST /api/admin/partners/:id/suspend
router.post('/partners/:id/suspend', auth, role('admin'), async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
        if (users.length === 0) {
            return res.json({ status: false, message: 'Partner not found.' });
        }
        
        await pool.query('UPDATE users SET status = 0, updated_at = NOW() WHERE id = ?', [req.params.id]);
        res.json({ status: true, message: 'Partner account has been suspended.' });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// POST /api/admin/partners/:id/reapprove
router.post('/partners/:id/reapprove', auth, role('admin'), async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
        if (users.length === 0) {
            return res.json({ status: false, message: 'Partner not found.' });
        }
        
        await pool.query('UPDATE users SET status = 1, updated_at = NOW() WHERE id = ?', [req.params.id]);
        res.json({ status: true, message: 'Partner account has been re-approved and is now active.' });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// GET /api/admin/users
router.get('/users', auth, role('admin'), async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT * FROM users WHERE role != ?',
            ['admin']
        );
        // Remove passwords
        const safeUsers = users.map(u => { const { password, ...rest } = u; return rest; });
        res.json({ status: true, users: safeUsers });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// GET /api/admin/users/:id
router.get('/users/:id', auth, role('admin'), async (req, res) => {
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (users.length === 0) return res.status(200).json({ status: false, message: 'User not found.' });

        const { password, ...user } = users[0];
        res.json({ status: true, user });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// PUT /api/admin/users/:id
router.put('/users/:id', auth, role('admin'), async (req, res) => {
    try {
        const { name, email, contact_number, role: userRole, status } = req.body;
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (users.length === 0) return res.status(200).json({ status: false, message: 'User not found.' });

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (contact_number !== undefined) updates.contact_number = contact_number;
        if (userRole !== undefined) updates.role = userRole;
        if (status !== undefined) updates.status = status;

        if (Object.keys(updates).length > 0) {
            const setClauses = Object.keys(updates).map(key => `\`${key}\` = ?`);
            const values = [...Object.values(updates), req.params.id];
            await pool.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`, values);
        }

        const [updated] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
        const { password, ...user } = updated[0];

        res.json({ status: true, message: 'User updated.', user });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', auth, role('admin'), async (req, res) => {
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (users.length === 0) return res.status(200).json({ status: false, message: 'User not found.' });

        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ status: true, message: 'User deleted.' });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// GET /api/admin/places/stats
router.get('/places/stats', auth, role('admin'), async (req, res) => {
    try {
        const [places] = await pool.query('SELECT approval_status FROM tourist_places');
        let approved = 0, pending = 0, rejected = 0;
        places.forEach(p => {
            if (p.approval_status === 1) approved++;
            else if (p.approval_status === 2) rejected++;
            else pending++;
        });
        res.json({
            status: true,
            data: {
                total: places.length,
                approved,
                pending,
                rejected
            }
        });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// GET /api/admin/places (apiResource index)
router.get('/places', auth, role('admin'), async (req, res) => {
    try {
        const [places] = await pool.query(`
            SELECT tp.*, 
                   u.name as partner_name, 
                   tpt.name as category_name
            FROM tourist_places tp
            LEFT JOIN users u ON tp.created_by = u.id
            LEFT JOIN tourist_place_types tpt ON tp.tourist_place_type_id = tpt.id
            ORDER BY tp.created_at DESC
        `);
        res.json({ status: true, data: places });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// POST /api/admin/places
router.post('/places', auth, role('admin'), async (req, res) => {
    try {
        const { tourist_place_type_id, name, city, district, state, country, latitude, longitude, overview, hidden_gem, popular_places, hotels_stays, trending_places, status } = req.body;

        const [result] = await pool.query(
            `INSERT INTO tourist_places (tourist_place_type_id, name, city, district, state, country, latitude, longitude, overview, hidden_gem, popular_places, hotels_stays, trending_places, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [tourist_place_type_id, name, city, district, state, country, latitude || null, longitude || null, overview, hidden_gem || 0, popular_places || 0, hotels_stays || 0, trending_places || 0, status || 1]
        );

        res.json({ status: true, message: 'Place created.', place_id: result.insertId });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// // POST /api/admin/places
// router.post('/places', auth, role('admin'), async (req, res) => {
//     try {
//         const { tourist_place_type_id, name, city, district, state, country, latitude, longitude, overview, hidden_gem, popular_places, hotels_stays, trending_places, status, best_time, difficulty_level } = req.body;

//         const [result] = await pool.query(
//             `INSERT INTO tourist_places (tourist_place_type_id, name, city, district, state, country, latitude, longitude, overview, hidden_gem, popular_places, hotels_stays, trending_places, status, best_time, difficulty_level, created_at, updated_at)
//              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
//             [tourist_place_type_id, name, city, district, state, country, latitude || null, longitude || null, overview, hidden_gem || 0, popular_places || 0, hotels_stays || 0, trending_places || 0, status || 1, best_time || null, difficulty_level || null]
//         );

//         res.json({ status: true, message: 'Place created.', place_id: result.insertId });
//     } catch (error) {
//         res.json({ status: false, message: error.message });
//     }
// });

// GET /api/admin/places/:id
router.get('/places/:id', auth, role('admin'), async (req, res) => {
    try {
        const [places] = await pool.query(`
            SELECT tp.*, 
                   u.name as partner_name, 
                   tpt.name as category_name
            FROM tourist_places tp
            LEFT JOIN users u ON tp.created_by = u.id
            LEFT JOIN tourist_place_types tpt ON tp.tourist_place_type_id = tpt.id
            WHERE tp.id = ?
        `, [req.params.id]);
        if (places.length === 0) return res.status(200).json({ status: false, message: 'Place not found.' });
        res.json({ status: true, data: places[0] });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// PUT /api/admin/places/:id
router.put('/places/:id', auth, role('admin'), async (req, res) => {
    try {
        const [places] = await pool.query('SELECT * FROM tourist_places WHERE id = ?', [req.params.id]);
        if (places.length === 0) return res.status(200).json({ status: false, message: 'Place not found.' });

        const allowedFields = ['tourist_place_type_id', 'name', 'city', 'district', 'state', 'country', 'latitude', 'longitude', 'overview', 'hidden_gem', 'popular_places', 'hotels_stays', 'trending_places', 'status', 'approval_status'];
        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }

        if (Object.keys(updates).length > 0) {
            const setClauses = Object.keys(updates).map(key => `${key} = ?`);
            const values = [...Object.values(updates), req.params.id];
            await pool.query(`UPDATE tourist_places SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
        }

        const [updated] = await pool.query('SELECT * FROM tourist_places WHERE id = ?', [req.params.id]);
        res.json({ status: true, message: 'Place updated.', data: updated[0] });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// // PUT /api/admin/places/:id
// router.put('/places/:id', auth, role('admin'), async (req, res) => {
//     try {
//         const [places] = await pool.query('SELECT * FROM tourist_places WHERE id = ?', [req.params.id]);
//         if (places.length === 0) return res.status(200).json({ status: false, message: 'Place not found.' });

//         const allowedFields = ['tourist_place_type_id', 'name', 'city', 'district', 'state', 'country', 'latitude', 'longitude', 'overview', 'hidden_gem', 'popular_places', 'hotels_stays', 'trending_places', 'status', 'approval_status', 'best_time', 'difficulty_level'];
//         const updates = {};
//         for (const field of allowedFields) {
//             if (req.body[field] !== undefined) updates[field] = req.body[field];
//         }

//         if (Object.keys(updates).length > 0) {
//             const setClauses = Object.keys(updates).map(key => `${key} = ?`);
//             const values = [...Object.values(updates), req.params.id];
//             await pool.query(`UPDATE tourist_places SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
//         }

//         const [updated] = await pool.query('SELECT * FROM tourist_places WHERE id = ?', [req.params.id]);
//         res.json({ status: true, message: 'Place updated.', data: updated[0] });
//     } catch (error) {
//         res.json({ status: false, message: error.message });
//     }
// });

// POST /api/admin/places/:id/approve
router.post('/places/:id/approve', auth, role('admin'), async (req, res) => {
    try {
        const { approval_status } = req.body;
        // 1 = Approved, 2 = Rejected. Default to 1 if not provided.
        const statusToSet = approval_status !== undefined ? approval_status : 1;

        const [places] = await pool.query('SELECT * FROM tourist_places WHERE id = ?', [req.params.id]);
        if (places.length === 0) return res.status(200).json({ status: false, message: 'Place not found.' });

        await pool.query('UPDATE tourist_places SET approval_status = ?, updated_at = NOW() WHERE id = ?', [statusToSet, req.params.id]);

        const statusText = statusToSet === 1 ? 'approved' : statusToSet === 2 ? 'rejected' : 'pending';
        res.json({ status: true, message: `Place has been ${statusText}.` });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// DELETE /api/admin/places/:id
router.delete('/places/:id', auth, role('admin'), async (req, res) => {
    try {
        const [places] = await pool.query('SELECT * FROM tourist_places WHERE id = ?', [req.params.id]);
        if (places.length === 0) return res.status(200).json({ status: false, message: 'Place not found.' });

        await pool.query('DELETE FROM tourist_places WHERE id = ?', [req.params.id]);
        res.json({ status: true, message: 'Place deleted.' });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// GET /api/admin/submissions
router.get('/submissions', auth, role('admin'), async (req, res) => {
    try {
        const [submissions] = await pool.query('SELECT * FROM submissions');
        res.json({ status: true, data: submissions });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// POST /api/admin/submissions/:id/status
router.post('/submissions/:id/status', auth, role('admin'), async (req, res) => {
    try {
        const { status: newStatus } = req.body;
        await pool.query('UPDATE submissions SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, req.params.id]);
        res.json({ status: true, message: 'Submission status updated.' });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// GET /api/admin/community-posts/stats
router.get('/community-posts/stats', auth, role('admin'), async (req, res) => {
    try {
        const [posts] = await pool.query('SELECT image_url FROM community_posts');
        let images = 0, videos = 0, textOnly = 0;
        posts.forEach(p => {
            if (p.image_url) {
                if (p.image_url.toLowerCase().match(/\.(mp4|mov|avi)$/)) {
                    videos++;
                } else {
                    images++;
                }
            } else {
                textOnly++;
            }
        });
        res.json({
            status: true,
            data: {
                total: posts.length,
                images,
                videos,
                textOnly
            }
        });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// GET /api/admin/community-posts
router.get('/community-posts', auth, role('admin'), async (req, res) => {
    try {
        const [posts] = await pool.query(`
            SELECT cp.id, cp.caption, cp.location, cp.image_url, cp.created_at,
                   u.name as author_name, u.profile_image as author_image,
                   (SELECT COUNT(*) FROM community_post_likes WHERE post_id = cp.id) as likes_count,
                   (SELECT COUNT(*) FROM community_post_comments WHERE post_id = cp.id) as comments_count
            FROM community_posts cp
            JOIN users u ON u.id = cp.user_id
            ORDER BY cp.created_at DESC
        `);
        res.json({ status: true, data: posts });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// DELETE /api/admin/community-posts/:id
router.delete('/community-posts/:id', auth, role('admin'), async (req, res) => {
    try {
        const [posts] = await pool.query('SELECT id FROM community_posts WHERE id = ?', [req.params.id]);
        if (posts.length === 0) return res.status(200).json({ status: false, message: 'Post not found.' });

        // First delete related likes, comments, and saves
        await pool.query('DELETE FROM community_post_likes WHERE post_id = ?', [req.params.id]);
        await pool.query('DELETE FROM community_post_comments WHERE post_id = ?', [req.params.id]);
        await pool.query('DELETE FROM community_post_saves WHERE post_id = ?', [req.params.id]);

        // Delete the post
        await pool.query('DELETE FROM community_posts WHERE id = ?', [req.params.id]);
        res.json({ status: true, message: 'Post removed successfully.' });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

module.exports = router;
