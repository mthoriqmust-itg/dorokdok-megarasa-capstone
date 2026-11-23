const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const profileController = require('../controllers/profileController');
const { verifyToken } = require('../middlewares/authMiddleware');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

router.get('/', verifyToken, profileController.getProfile);
router.put('/', verifyToken, upload.single('photo'), profileController.updateProfile);

// PASTIKAN BARIS INI ADA DI PALING BAWAH
module.exports = router; 