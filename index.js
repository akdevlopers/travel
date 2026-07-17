require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Custom health check handler for Accept: application/json requests
app.get('/', (req, res, next) => {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({ status: true, message: 'TravelMap API (Node.js) is running!' });
    }
    next();
});

// Serve static web pages (css, js, images, index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Import routes
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const homeRoutes = require('./routes/home');
const partnerRoutes = require('./routes/partner');
const communityRoutes = require('./routes/community');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const travelplanRoutes = require('./routes/travelplan');
const eventsRoutes = require('./routes/events');

// Mount routes
app.use('/api', authRoutes);
app.use('/api', profileRoutes);
app.use('/api', homeRoutes);
app.use('/api', partnerRoutes);
app.use('/api', communityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', chatRoutes);
app.use('/api', travelplanRoutes);
app.use('/api', eventsRoutes);

// Health check fallback handled at the top

// Global error handler (catches Multer errors and other unhandled errors)
const multer = require('multer');
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('Multer error:', err.code, err.field, err.message);
        return res.json({ status: false, message: `Upload error: ${err.message} (field: ${err.field})` });
    }
    if (err) {
        console.error('Server error:', err.message);
        return res.json({ status: false, message: err.message });
    }
    next();
});

// Start server
app.listen(PORT, () => {
    console.log(`\n  Server running on http://127.0.0.1:${PORT}\n`);
});
