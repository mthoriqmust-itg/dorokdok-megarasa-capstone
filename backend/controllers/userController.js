const db = require('../config/db');
const bcrypt = require('bcryptjs');

exports.getAllUsers = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, name, email, role, is_active FROM users');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        await db.query(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, hashedPassword, role || 'karyawan']
        );
        res.status(201).json({ message: 'Karyawan berhasil ditambahkan' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Tambahkan di bawah exports.createUser

// PUT: Edit Data Karyawan
exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, password, role } = req.body;
    try {
        if (password && password.trim() !== "") {
            // Jika password diisi, hash password baru
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            await db.query(
                'UPDATE users SET name=?, email=?, password=?, role=? WHERE id=?',
                [name, email, hashedPassword, role, id]
            );
        } else {
            // Jika password kosong, jangan update password
            await db.query(
                'UPDATE users SET name=?, email=?, role=? WHERE id=?',
                [name, email, role, id]
            );
        }
        res.json({ message: 'Data karyawan berhasil diupdate' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE: Hapus Karyawan
exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        if (req.user.id == id) {
            return res.status(400).json({ message: 'Anda tidak bisa menghapus akun Anda sendiri!' });
        }
        await db.query('DELETE FROM users WHERE id=?', [id]);
        res.json({ message: 'Karyawan berhasil dihapus' });
    } catch (error) {
        // Jika error karena foreign key (karyawan punya riwayat transaksi), arahkan untuk nonaktifkan saja
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ message: 'Karyawan ini memiliki riwayat transaksi. Sebaiknya Nonaktifkan saja daripada dihapus.' });
        }
        res.status(500).json({ message: error.message });
    }
};

// PUT: Toggle Status Aktif/Nonaktif
exports.toggleUserStatus = async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;
    try {
        if (req.user.id == id) {
            return res.status(400).json({ message: 'Anda tidak bisa menonaktifkan akun Anda sendiri!' });
        }
        await db.query('UPDATE users SET is_active=? WHERE id=?', [is_active, id]);
        res.json({ message: `Status karyawan berhasil diubah menjadi ${is_active ? 'Aktif' : 'Nonaktif'}` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};