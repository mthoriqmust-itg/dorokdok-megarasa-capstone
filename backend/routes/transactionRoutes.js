const express = require('express');
const router = express.Router();
const trxController = require('../controllers/transactionController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { validateTransaction } = require('../middlewares/validation'); // <-- Import Satpam Joi

router.get('/', verifyToken, trxController.getAllTransactions);

// Tambahkan validateTransaction sebelum createTransaction
router.post('/', verifyToken, validateTransaction, trxController.createTransaction);

// Tambahkan validateTransaction sebelum updateTransaction
router.put('/:id', verifyToken, validateTransaction, trxController.updateTransaction);

router.delete('/:id', verifyToken, trxController.deleteTransaction);

module.exports = router;