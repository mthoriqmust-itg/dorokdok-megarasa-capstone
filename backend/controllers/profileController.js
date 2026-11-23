const db = require('../config/db');

exports.getProfile = async (req, res) => {
    try {
        const [user] = await db.query('SELECT id, name, email, role, photo_url, motto FROM users WHERE id = ?', [req.user.id]);
        res.json(user[0]);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.updateProfile = async (req, res) => {
    const { name, motto } = req.body;
    const userId = req.user.id;
    try {
        let query = 'UPDATE users SET name = ?, motto = ? WHERE id = ?';
        let params = [name, motto, userId];

        // Jika ada upload foto baru
        if (req.file) {
            const photoUrl = `/uploads/${req.file.filename}`;
            query = 'UPDATE users SET name = ?, motto = ?, photo_url = ? WHERE id = ?';
            params = [name, motto, photoUrl, userId];
        }

        await db.query(query, params);
        res.json({ message: 'Profil berhasil diupdate' });
    } catch (error) { res.status(500).json({ message: error.message }); }
};