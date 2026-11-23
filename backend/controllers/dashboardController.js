const db = require('../config/db');

exports.getSummary = async (req, res) => {
    try {
        // Hitung total pemasukan
        const [income] = await db.query("SELECT SUM(amount) as total FROM transactions WHERE type = 'pemasukan'");
        // Hitung total pengeluaran
        const [expense] = await db.query("SELECT SUM(amount) as total FROM transactions WHERE type = 'pengeluaran'");

        const totalPemasukan = income[0].total || 0;
        const totalPengeluaran = expense[0].total || 0;
        const selisih = totalPemasukan - totalPengeluaran;

        res.json({
            total_pemasukan: totalPemasukan,
            total_pengeluaran: totalPengeluaran,
            selisih: selisih
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};