const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Middleware: Require authentication (equivalent to auth:sanctum)
const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.json({
                status: false,
                message: 'Unauthenticated. Please provide a valid Bearer token.'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if token is blacklisted
        const [blacklisted] = await pool.query('SELECT id FROM blacklisted_tokens WHERE token = ?', [token]);
        if (blacklisted.length > 0) {
            return res.json({
                status: false,
                message: 'Unauthenticated. Token has been revoked (logged out).'
            });
        }

        // Fetch user from DB
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [decoded.userId]);

        if (users.length === 0) {
            return res.json({ status: false, message: 'User not found.' });
        }

        // Remove password from user object
        const user = { ...users[0] };
        delete user.password;

        req.user = user;
        next();
    } catch (error) {
        return res.json({
            status: false,
            message: 'Unauthenticated. Please provide a valid Bearer token.'
        });
    }
};

// Middleware: Require specific role (equivalent to role:admin)
const role = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                status: false,
                message: 'Unauthorized. Insufficient permissions.'
            });
        }
        next();
    };
};

const verifyOtpToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.json({
            status: false,
            message: 'Token required.'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.json({
            status: false,
            message: 'Invalid token.'
        });
    }
};

module.exports = { auth, role, verifyOtpToken };
