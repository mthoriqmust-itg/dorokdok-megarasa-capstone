const path = require('path');
const fs = require('fs');
const axios = require('axios'); // <-- Gunakan Axios
const db = require('../config/db');

const BACKEND_DIR = path.join(__dirname, '..');
const CSV_FILE = path.join(BACKEND_DIR, 'transactions.csv');
const JSON_FILE = path.join(BACKEND_DIR, 'insights.json');
const DS_API_URL = 'http://localhost:8000/api/ds'; // URL FastAPI

function buildCSV(rows) {
    if (!rows || rows.length === 0) return 'date,type,amount,sales_channel,payment_method,category_name,user_name,role';
    const header = 'date,type,amount,sales_channel,payment_method,category_name,user_name,role';
    const body = rows.map(t => {
        const date = new Date(t.date).toISOString().split('T')[0];
        return `${date},${t.type || ''},${Number(t.amount) || 0},${t.sales_channel || 'NULL'},${t.payment_method || 'NULL'},${t.category_name || 'NULL'},${t.user_name || 'NULL'},${t.role || 'NULL'}`;
    });
    return [header, ...body].join('\n');
}

exports.getInsights = (req, res) => {
    try {
        if (!fs.existsSync(JSON_FILE)) {
            return res.status(404).json({ message: 'Insight belum dibuat' });
        }
        const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
        res.json(data);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.generateInsights = async (req, res) => {
    try {
        // 1. Ambil data dari DB
        const [rows] = await db.query(`
            SELECT t.date, t.type, t.amount, t.sales_channel, t.payment_method, 
                   c.name as category_name, u.name as user_name, u.role 
            FROM transactions t 
            LEFT JOIN categories c ON t.category_id = c.id 
            LEFT JOIN users u ON t.user_id = u.id
        `);
        
        if (!rows || rows.length === 0) {
            return res.status(400).json({ message: 'Database transaksi masih kosong.' });
        }

        // 2. Tulis ke CSV
        fs.writeFileSync(CSV_FILE, buildCSV(rows), 'utf-8');

        // 3. Tembak API FastAPI (Python)
        console.log("⏳ Meminta FastAPI menjalankan Data Science...");
        const response = await axios.get(`${DS_API_URL}/insights`);
        
        console.log("✅ [SUKSES] Data Science berhasil diolah via FastAPI.");
        res.json({ message: 'OK', data: response.data });
    } catch (err) {
        console.error("❌ Gagal memanggil FastAPI:", err.message);
        res.status(500).json({ message: 'Gagal mengambil data dari AI Engine', error: err.message });
    }
};