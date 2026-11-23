const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const ctrl = require('../controllers/communityController');
const { verifyToken } = require('../middlewares/authMiddleware');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Postingan
router.get('/posts', verifyToken, ctrl.getPosts);
router.post('/posts', verifyToken, upload.array('images', 10), ctrl.createPost);
router.put('/posts/:id', verifyToken, ctrl.editPost);
router.delete('/posts/:id', verifyToken, ctrl.deletePost);

// TAMBAHKAN RUTE LIKE POST INI
router.put('/posts/:id/like', verifyToken, ctrl.likePost);

// Komentar
router.post('/posts/:id/comments', verifyToken, ctrl.addComment);
router.delete('/comments/:commentId', verifyToken, ctrl.deleteComment);
router.put('/comments/:commentId/pin', verifyToken, ctrl.pinComment);
router.put('/comments/:commentId/like', verifyToken, ctrl.likeComment);
router.put('/comments/:commentId', verifyToken, ctrl.editComment);

// Chat
router.get('/chats', verifyToken, ctrl.getChats);
router.post('/chats', verifyToken, ctrl.sendChat);

module.exports = router;