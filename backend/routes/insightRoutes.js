const express = require('express');
const router = express.Router();
const insightController = require('../controllers/insightController');
const { verifyToken, isAdmin } = require('../middlewares/authMiddleware');

router.get('/', verifyToken, insightController.getInsights);
router.post('/generate', verifyToken, isAdmin, insightController.generateInsights);

module.exports = router;