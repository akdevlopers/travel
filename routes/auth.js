const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { auth, verifyOtpToken } = require('../middleware/auth');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/register
router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password, password_confirmation } = req.body;

        // Validation
        if (!name || !email || !phone || !password) {
            return res.json({ status: false, message: 'Name, email, phone, and password are required.' });
        }

        if (password !== password_confirmation) {
            return res.json({ status: false, message: 'Password confirmation does not match.' });
        }

        // Check if email already exists
        const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0) {
            return res.json({ status: false, message: 'The email has already been taken.' });
        }

        // Check if phone already exists
        const [existingPhone] = await pool.query('SELECT id FROM users WHERE contact_number = ?', [phone]);
        if (existingPhone.length > 0) {
            return res.json({ status: false, message: 'The phone has already been taken.' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Insert user
        const [result] = await pool.query(
            'INSERT INTO users (name, email, contact_number, password, status, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
            [name, email, phone, hashedPassword, 1, 'user']
        );

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000);

        await pool.query(
            'UPDATE users SET otp = ? WHERE id = ?',
            [otp, result.insertId]
        );

        // Generate temporary token
        const tempToken = jwt.sign(
            {
                userId: result.insertId,
                type: 'otp'
            },
            process.env.JWT_SECRET,
            { expiresIn: '10m' }
        );

        // Send OTP via email

        res.json({
            status: true,
            message: 'OTP sent.',
            access_token: tempToken,
            token_type: 'Bearer',
            otp: otp // For testing purposes, remove this in production
        });
    } catch (error) {
        console.error('Register error:', error);
        res.json({ status: false, message: error.message });
    }
});

// POST /api/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.json({ status: false, message: 'Email and password are required.' });
        }

        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.json({ status: false, message: 'User not found' });
        }

        const user = users[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.json({ status: false, message: 'Invalid password' });
        }

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000);

        await pool.query('UPDATE users SET otp = ? WHERE id = ?', [otp, user.id]);

        // TODO: Send OTP via email (Mail::to($user->email)->send(new OtpMail($otp)))

        const tempToken = jwt.sign(
            {
                userId: user.id,
                type: 'otp'
            },
            process.env.JWT_SECRET,
            { expiresIn: '10m' }
        );

        res.json({
            status: true,
            message: 'OTP sent.',
            access_token: tempToken,
            token_type: 'Bearer',
            otp: otp // For testing purposes, remove this in production
        });
    } catch (error) {
        console.error('Login error:', error);
        res.json({ status: false, message: error.message });
    }
});

// POST /api/verify-otp
router.post('/verify-otp', verifyOtpToken, async (req, res) => {

    try {

        const { otp } = req.body;

        if (!otp) {
            return res.json({
                status: false,
                message: 'OTP is required.'
            });
        }

        const [users] = await pool.query(
            'SELECT * FROM users WHERE id=?',
            [req.user.userId]
        );

        if (!users.length) {
            return res.json({
                status: false,
                message: 'User not found.'
            });
        }

        const user = users[0];

        if (user.otp != otp) {
            return res.json({
                status: false,
                message: 'Invalid OTP.'
            });
        }

        await pool.query(
            'UPDATE users SET otp=NULL WHERE id=?',
            [user.id]
        );

        // Final Login Token
        const loginToken = jwt.sign(
            {
                userId: user.id,
                type: 'login'
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '30d'
            }
        );

        delete user.password;
        delete user.otp;

        res.json({
            status: true,
            message: 'Login successful.',
            access_token: loginToken,
            token_type: 'Bearer',
            user
        });

    } catch (err) {

        res.json({
            status: false,
            message: err.message
        });

    }

});

// POST /api/google-login
router.post('/google-login', async (req, res) => {
    try {
        const { token, email, name } = req.body;

        if (!token) {
            return res.json({ status: false, message: 'Token is required.' });
        }

        let verifiedEmail;
        let verifiedName;

        try {
            const ticket = await googleClient.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            verifiedEmail = payload.email;
            verifiedName = payload.name;
        } catch (verifyError) {
            return res.json({ status: false, message: 'Invalid Google token: ' + verifyError.message });
        }

        if (!verifiedEmail) {
            return res.json({ status: false, message: 'Invalid Google token payload' });
        }

        // Check if user exists
        const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [verifiedEmail]);

        let user;
        if (existingUsers.length > 0) {
            // Update existing user
            await pool.query('UPDATE users SET name = ?, status = 1, role = ? WHERE email = ?', [
                verifiedName || existingUsers[0].name,
                existingUsers[0].role || 'user',
                verifiedEmail
            ]);
            const [updated] = await pool.query('SELECT * FROM users WHERE email = ?', [verifiedEmail]);
            user = updated[0];
        } else {
            // Create new user
            const [result] = await pool.query(
                'INSERT INTO users (name, email, status, role, created_at, updated_at) VALUES (?, ?, 1, ?, NOW(), NOW())',
                [verifiedName || '', verifiedEmail, 'user']
            );
            const [created] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
            user = created[0];
        }

        // Generate JWT
        const jwtToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

        delete user.password;

        res.json({
            status: true,
            message: 'Google login successful',
            token: jwtToken,
            user: user
        });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(500).json({ status: false, message: error.message });
    }
});

// POST /api/logout (requires auth)
router.post('/logout', auth, async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader.split(' ')[1];
        
        // Add token to blacklist so it cannot be used again
        await pool.query('INSERT INTO blacklisted_tokens (token, created_at) VALUES (?, NOW())', [token]);
        
        res.json({ status: true, message: 'Logged out successfully.' });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

module.exports = router;
