const jwt = require('jsonwebtoken');
require('dotenv').config();

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <token>

    if (!token) return res.status(401).json({ message: 'Akses ditolak, silakan login' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Token tidak valid' });
        req.user = decoded; // Menyimpan data user (id, role) ke request
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Akses ditolak, khusus Admin' });
    }
    next();
};

module.exports = { verifyToken, isAdmin };