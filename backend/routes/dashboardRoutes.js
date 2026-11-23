const express = require('express');
const router = express.Router();
const dashController = require('../controllers/dashboardController');
const { verifyToken, isAdmin } = require('../middlewares/authMiddleware');

router.get('/', verifyToken, isAdmin, dashController.getSummary);
module.exports = router;