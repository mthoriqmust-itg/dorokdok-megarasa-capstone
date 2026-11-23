const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { verifyToken } = require('../middlewares/authMiddleware'); // Sesuaikan

router.get('/sessions', verifyToken, chatController.getSessions);
router.post('/sessions', verifyToken, chatController.createSession);
router.get('/sessions/:sessionId/messages', verifyToken, chatController.getMessages);
router.put('/sessions/:id', verifyToken, chatController.updateSession);
router.delete('/sessions/:id', verifyToken, chatController.deleteSession);
router.post('/message', verifyToken, chatController.sendMessage);

module.exports = router;