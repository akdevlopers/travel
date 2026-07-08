const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const { profileUpload } = require('../middleware/upload');

// GET /api/user
router.get('/user', auth, async (req, res) => {
    res.json({ status: true, user: req.user });
});

// POST /api/profile-update
router.post('/profile-update', auth, profileUpload.single('profile_image'), async (req, res) => {
    try {
        const user = req.user;
        const { name, email, contact_number, country, bio } = req.body;

        // Build update fields dynamically (only update provided fields)
        const updates = {};

        if (name !== undefined && name !== null && name !== '') updates.name = name;
        if (email !== undefined && email !== null && email !== '') updates.email = email;
        if (contact_number !== undefined && contact_number !== null && contact_number !== '') updates.contact_number = contact_number;
        if (country !== undefined && country !== null && country !== '') updates.country = country;
        if (bio !== undefined && bio !== null && bio !== '') updates.bio = bio;

        // Handle profile image upload
        if (req.file) {
            updates.profile_image = 'uploads/profiles/' + req.file.filename;
        }

        if (Object.keys(updates).length === 0) {
            return res.json({ status: false, message: 'No fields to update.' });
        }

        // Check uniqueness for email if being changed
        if (updates.email && updates.email !== user.email) {
            const [existing] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [updates.email, user.id]);
            if (existing.length > 0) {
                return res.json({ status: false, message: 'The email has already been taken.' });
            }
        }

        // Check uniqueness for contact_number if being changed
        if (updates.contact_number && updates.contact_number !== user.contact_number) {
            const [existing] = await pool.query('SELECT id FROM users WHERE contact_number = ? AND id != ?', [updates.contact_number, user.id]);
            if (existing.length > 0) {
                return res.json({ status: false, message: 'The contact number has already been taken.' });
            }
        }

        // Build the SET clause
        const setClauses = Object.keys(updates).map(key => `${key} = ?`);
        const values = Object.values(updates);
        values.push(user.id);

        await pool.query(
            `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = ?`,
            values
        );

        // Fetch updated user
        const [updatedUsers] = await pool.query('SELECT * FROM users WHERE id = ?', [user.id]);
        const updatedUser = { ...updatedUsers[0] };
        delete updatedUser.password;

        res.json({
            status: true,
            message: 'Profile updated successfully.',
            user: updatedUser
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.json({ status: false, message: error.message });
    }
});

module.exports = router;
