const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.get('/', verifyToken, categoryController.getAllCategories);
module.exports = router;