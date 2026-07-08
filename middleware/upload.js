const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Helper to create a multer instance for a given upload directory
const createUploader = (subDir) => {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', subDir);

    // Ensure the directory exists
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const uniqueName = Date.now() + path.extname(file.originalname);
            cb(null, uniqueName);
        }
    });

    const fileFilter = (req, file, cb) => {
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',

            'video/mp4',
            'video/mpeg',
            'video/quicktime',   // mov
            'video/x-msvideo',   // avi
            'video/x-matroska',  // mkv
            'video/webm'
        ];
        const allowedExtensions = [
            '.jpg',
            '.jpeg',
            '.png',
            '.gif',
            '.webp',
            '.mp4',
            '.mpeg',
            '.mov',
            '.avi',
            '.mkv',
            '.webm'
        ];

        const ext = path.extname(file.originalname).toLowerCase();

        if (
            allowedMimeTypes.includes(file.mimetype) &&
            allowedExtensions.includes(ext)
        ) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed.'));
        }
    };

   
    return multer({
        storage,
        fileFilter,
        limits: {
            fileSize: 100 * 1024 * 1024 // 100 MB
        }
        // limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
    });
};

// Pre-configured uploaders for different sections
const profileUpload = createUploader('profiles');
const placeUpload = createUploader('places');
const communityUpload = createUploader('community');

module.exports = { profileUpload, placeUpload, communityUpload };
