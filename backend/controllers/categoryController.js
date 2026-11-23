const db = require('../config/db');

exports.getAllCategories = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM categories ORDER BY type, name');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};