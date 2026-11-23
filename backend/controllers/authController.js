const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ message: 'Email tidak ditemukan' });

        const user = users[0];
        if (!user.is_active) return res.status(403).json({ message: 'Akun dinonaktifkan' });

        // Cek password (karena data dummy dari CSV nanti mungkin belum di-hash, kita handle dua-duanya)
        const validPassword = await bcrypt.compare(password, user.password) || password === user.password;
        
        if (!validPassword) return res.status(401).json({ message: 'Password salah' });

        // Buat Token
        const token = jwt.sign(
            { id: user.id, role: user.role, name: user.name }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1d' }
        );

        res.json({ message: 'Login berhasil', token, role: user.role, name: user.name, id: user.id, photo_url: user.photo_url  });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};