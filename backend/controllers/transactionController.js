const db = require('../config/db');

// GET: Ambil semua transaksi (Bisa difilter by date)
exports.getAllTransactions = async (req, res) => {
    const { startDate, endDate } = req.query;
    let query = 'SELECT t.*, c.name as category_name, u.name as user_name FROM transactions t JOIN categories c ON t.category_id = c.id JOIN users u ON t.user_id = u.id';
    let params = [];

    if (startDate && endDate) {
        query += ' WHERE t.date BETWEEN ? AND ?';
        params = [startDate, endDate];
    }
    query += ' ORDER BY t.date DESC, t.id DESC';

    try {
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST: Tambah transaksi baru
exports.createTransaction = async (req, res) => {
    const { category_id, date, type, amount, note, payment_method, sales_channel } = req.body;
    const user_id = req.user.id;

    try {
        const [result] = await db.query(
            'INSERT INTO transactions (user_id, category_id, date, type, amount, note, payment_method, sales_channel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [user_id, category_id, date, type, amount, note, payment_method || 'tunai', sales_channel || null]
        );
        res.status(201).json({ message: 'Transaksi berhasil ditambahkan', id: result.insertId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT: Edit transaksi
exports.updateTransaction = async (req, res) => {
    const { id } = req.params;
    const { category_id, date, type, amount, note, payment_method, sales_channel } = req.body;
    
    try {
        const [trx] = await db.query('SELECT user_id FROM transactions WHERE id = ?', [id]);
        if (trx.length === 0) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });

        if (req.user.role !== 'admin' && req.user.id !== trx[0].user_id) {
            return res.status(403).json({ message: 'Akses ditolak. Anda hanya bisa mengedit transaksi Anda sendiri.' });
        }

        await db.query(
            'UPDATE transactions SET category_id=?, date=?, type=?, amount=?, note=?, payment_method=?, sales_channel=? WHERE id=?',
            [category_id, date, type, amount, note, payment_method, sales_channel, id]
        );
        res.json({ message: 'Transaksi berhasil diupdate' });
    } catch (error) { 
        res.status(500).json({ message: error.message }); 
    }
};

// DELETE: Hapus transaksi
exports.deleteTransaction = async (req, res) => {
    const { id } = req.params;
    try {
        const [trx] = await db.query('SELECT user_id FROM transactions WHERE id = ?', [id]);
        if (trx.length === 0) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });

        if (req.user.role !== 'admin' && req.user.id !== trx[0].user_id) {
            return res.status(403).json({ message: 'Akses ditolak. Anda hanya bisa menghapus transaksi Anda sendiri.' });
        }

        await db.query('DELETE FROM transactions WHERE id=?', [id]);
        res.json({ message: 'Transaksi berhasil dihapus' });
    } catch (error) { 
        res.status(500).json({ message: error.message }); 
    }
};