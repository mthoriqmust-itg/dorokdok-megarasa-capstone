const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, isAdmin } = require('../middlewares/authMiddleware');

router.get('/', verifyToken, isAdmin, userController.getAllUsers);
router.post('/', verifyToken, isAdmin, userController.createUser);

// Pastikan 3 baris ini ada dan tersimpan:
router.put('/:id', verifyToken, isAdmin, userController.updateUser);
router.delete('/:id', verifyToken, isAdmin, userController.deleteUser);
router.put('/:id/toggle', verifyToken, isAdmin, userController.toggleUserStatus);

module.exports = router;