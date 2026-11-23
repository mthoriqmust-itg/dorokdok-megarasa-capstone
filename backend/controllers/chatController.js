const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // <-- Import Axios

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash'; // ganti lewat .env jika Google memensiunkan model
const DS_API_URL = 'http://localhost:8000/api/ds'; // URL FastAPI

// ==========================================
// 1. DEFINISI TOOLS
// ==========================================
const JENIS_GRAFIK = [
    'trend', 'gabungan', 'bar', 'laba', 'kumulatif', 'donut_pemasukan', 'donut_pengeluaran', 'pareto', 'channel', 'pembayaran',
    'margin', 'distribusi', 'karyawan', 'perbandingan', 'heatmap', 'heatmap_kategori', 'waterfall', 'forecast',
    'hari', 'kategori', 'dashboard'
];

const tools = [{
    functionDeclarations: [
        {
            name: "get_keuangan_summary",
            description: "Mengambil data ringkasan total pemasukan, total pengeluaran, dan laba bersih secara real-time dari database.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "get_top_karyawan",
            description: "Mengambil nama karyawan yang paling banyak mencatat transaksi.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "get_barang_terlaris",
            description: "Mengambil data 3 kategori dengan penjualan tertinggi.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "buat_grafik",
            description: "Membuat grafik dari data transaksi. Pilih 'jenis' yang sesuai.",
            parameters: {
                type: "OBJECT",
                properties: {
                    jenis: { type: "STRING", format: "enum", enum: JENIS_GRAFIK, description: "Jenis grafik." },
                    days_back: { type: "INTEGER", description: "Jumlah hari ke belakang." },
                    kategori: { type: "STRING", description: "Filter kategori." },
                    channel: { type: "STRING", description: "Filter channel." },
                    tipe: { type: "STRING", format: "enum", enum: ["semua", "pemasukan", "pengeluaran"], description: "Filter tipe." },
                    granularitas: { type: "STRING", format: "enum", enum: ["harian", "mingguan", "bulanan"], description: "Satuan waktu." },
                    periode: { type: "STRING", format: "enum", enum: ["bulan", "minggu", "custom"], description: "Khusus jenis 'perbandingan'." },
                    horizon_hari: { type: "INTEGER", description: "Khusus jenis 'forecast'." }
                },
                required: ["jenis"]
            }
        },
        {
            name: "bandingkan_periode",
            description: "Membandingkan angka dua periode (bulan ini vs bulan lalu, dll).",
            parameters: {
                type: "OBJECT",
                properties: {
                    periode: { type: "STRING", format: "enum", enum: ["bulan", "minggu", "custom"] },
                    days_back: { type: "INTEGER" }
                },
                required: ["periode"]
            }
        },
        {
            name: "prediksi_pendapatan",
            description: "Memprediksi pemasukan, pengeluaran, dan laba N hari ke depan.",
            parameters: { type: "OBJECT", properties: { horizon_hari: { type: "INTEGER" } } }
        },
        {
            name: "deteksi_anomali",
            description: "Mencari transaksi yang tidak wajar (outlier) dan hari pengeluaran yang melonjak.",
            parameters: { type: "OBJECT", properties: { top: { type: "INTEGER" }, days_back: { type: "INTEGER" } } }
        },
        {
            name: "skor_kesehatan_bisnis",
            description: "Menghitung skor kesehatan bisnis 0-100.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "analisis_break_even",
            description: "Menghitung titik impas (omzet minimal).",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "analisis_kategori",
            description: "Detail satu kategori (total, kontribusi, tren per bulan).",
            parameters: { type: "OBJECT", properties: { nama: { type: "STRING" } }, required: ["nama"] }
        },
        {
            name: "kinerja_karyawan",
            description: "Ranking lengkap semua karyawan.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "cari_transaksi",
            description: "Mencari daftar transaksi dengan filter.",
            parameters: {
                type: "OBJECT",
                properties: {
                    days_back: { type: "INTEGER" }, kategori: { type: "STRING" }, channel: { type: "STRING" }, user: { type: "STRING" },
                    tipe: { type: "STRING", format: "enum", enum: ["semua", "pemasukan", "pengeluaran"] },
                    min_nominal: { type: "NUMBER" }, max_nominal: { type: "NUMBER" },
                    urut: { type: "STRING", format: "enum", enum: ["terbesar", "terkecil", "terbaru"] }, limit: { type: "INTEGER" }
                }
            }
        }
    ]
}];

// ==========================================
// 2. FUNGSI EKSEKUSI API/DB & FASTAPI
// ==========================================
async function executeTool(toolName, args = {}) {
    try {
        // ---- Tool real-time dari database ----
        if (toolName === "get_keuangan_summary") {
            const [income] = await db.query("SELECT SUM(amount) as total FROM transactions WHERE type = 'pemasukan'");
            const [expense] = await db.query("SELECT SUM(amount) as total FROM transactions WHERE type = 'pengeluaran'");
            return JSON.stringify({ pemasukan: income[0].total || 0, pengeluaran: expense[0].total || 0, laba_bersih: (income[0].total || 0) - (expense[0].total || 0) });
        }
        if (toolName === "get_top_karyawan") {
            const [rows] = await db.query(`SELECT u.name, COUNT(t.id) as total_trx FROM transactions t JOIN users u ON t.user_id = u.id WHERE u.role = 'karyawan' GROUP BY u.id ORDER BY total_trx DESC LIMIT 1`);
            return JSON.stringify(rows[0] || { name: "Belum ada", total_trx: 0 });
        }
        if (toolName === "get_barang_terlaris") {
            const [rows] = await db.query(`SELECT c.name, SUM(t.amount) as total_pendapatan FROM transactions t JOIN categories c ON t.category_id = c.id WHERE t.type = 'pemasukan' GROUP BY c.id ORDER BY total_pendapatan DESC LIMIT 3`);
            return JSON.stringify(rows);
        }

        // ---- Tool analitik (Memanggil FastAPI) ----
        if (toolName === "buat_grafik" || toolName === "buat_grafik_custom") {
            const res = await axios.get(`${DS_API_URL}/grafik`, {
                params: {
                    jenis: args.jenis || 'trend',
                    days: args.days_back,
                    kategori: args.kategori,
                    channel: args.channel,
                    tipe: args.tipe
                }
            });
            return JSON.stringify(res.data);
        }
        if (toolName === "bandingkan_periode") {
            const res = await axios.get(`${DS_API_URL}/bandingkan`, { params: { periode: args.periode || 'bulan', days: args.days_back } });
            return JSON.stringify(res.data);
        }
        if (toolName === "prediksi_pendapatan") {
            const res = await axios.get(`${DS_API_URL}/forecast`, { params: { horizon: args.horizon_hari || 14 } });
            return JSON.stringify(res.data);
        }
        if (toolName === "deteksi_anomali") {
            const res = await axios.get(`${DS_API_URL}/anomali`, { params: { top: args.top || 10, days: args.days_back } });
            return JSON.stringify(res.data);
        }
        if (toolName === "skor_kesehatan_bisnis") {
            const res = await axios.get(`${DS_API_URL}/kesehatan`);
            return JSON.stringify(res.data);
        }
        if (toolName === "analisis_break_even") {
            const res = await axios.get(`${DS_API_URL}/breakeven`);
            return JSON.stringify(res.data);
        }
        if (toolName === "kinerja_karyawan") {
            const res = await axios.get(`${DS_API_URL}/karyawan`);
            return JSON.stringify(res.data);
        }
        if (toolName === "analisis_kategori") {
            const res = await axios.get(`${DS_API_URL}/kategori`, { params: { nama: args.nama } });
            return JSON.stringify(res.data);
        }
        if (toolName === "cari_transaksi") {
            const res = await axios.get(`${DS_API_URL}/cari`, {
                params: {
                    days: args.days_back, kategori: args.kategori, channel: args.channel, user: args.user,
                    tipe: args.tipe, min_nominal: args.min_nominal, max_nominal: args.max_nominal,
                    urut: args.urut, limit: args.limit || 10
                }
            });
            return JSON.stringify(res.data);
        }

        return JSON.stringify({ error: `Tool '${toolName}' tidak dikenal.` });
    } catch (error) {
        console.error("Error executing tool:", error.message);
        return JSON.stringify({ error: "Gagal mengambil data dari FastAPI." });
    }
}

// ==========================================
// 3. CRUD SESSION
// ==========================================
exports.getSessions = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC', [req.user.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.createSession = async (req, res) => {
    try {
        const [result] = await db.query('INSERT INTO chat_sessions (user_id) VALUES (?)', [req.user.id]);
        const [newSession] = await db.query('SELECT * FROM chat_sessions WHERE id = ?', [result.insertId]);
        res.json(newSession[0]);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getMessages = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [req.params.sessionId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateSession = async (req, res) => {
    const { title, is_pinned } = req.body;
    try {
        await db.query('UPDATE chat_sessions SET title = COALESCE(?, title), is_pinned = COALESCE(?, is_pinned) WHERE id = ? AND user_id = ?', [title, is_pinned, req.params.id, req.user.id]);
        res.json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteSession = async (req, res) => {
    try {
        await db.query('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

// ==========================================
// 3b. HELPER AI AGENT (kompatibel Gemini 3.x)
// ==========================================
// Gemini 3.x MENOLAK role "function" (error 400: Role 'function' is not supported).
// Hasil tool harus dikirim sebagai giliran role "user" berisi functionResponse.
// SDK lama (@google/generative-ai) otomatis memakai role "function" di chat.sendMessage(),
// jadi loop tool dibuat manual lewat model.generateContent({ contents }).

// Rapikan riwayat dari DB: diawali "user", role bergantian, pesan beruntun sejenis digabung
// (mis. pesan user yatim sisa error sebelumnya) supaya riwayat selalu valid.
function buildHistory(rows) {
    const out = [];
    for (const r of rows) {
        const role = r.role === 'user' ? 'user' : 'model';
        const text = (r.content || '').trim();
        if (!text) continue;
        const last = out[out.length - 1];
        if (last && last.role === role) last.parts.push({ text });
        else out.push({ role, parts: [{ text }] });
    }
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
}

// Loop agent: model minta tool -> jalankan (boleh beberapa sekaligus) -> kirim balik -> ulangi sampai jadi teks.
async function runAgent(model, history, message, maxRounds = 5) {
    const contents = history.map(c => ({ role: c.role, parts: [...c.parts] }));
    const last = contents[contents.length - 1];
    if (last && last.role === 'user') last.parts.push({ text: message });
    else contents.push({ role: 'user', parts: [{ text: message }] });

    for (let round = 1; round <= maxRounds; round++) {
        const result = await model.generateContent({ contents });
        const response = result.response;
        const calls = response.functionCalls();

        if (!calls || calls.length === 0) {
            return response.text() || 'Maaf, aku belum bisa menjawab itu. Coba tanyakan dengan cara lain ya.';
        }

        console.log(`\n🤖 [AI AGENT] Putaran ${round}, meminta fungsi: ${calls.map(c => c.name).join(', ')}`);

        // 1) Simpan giliran model APA ADANYA (termasuk thoughtSignature milik Gemini 3.x, jangan dibuang)
        contents.push({ role: 'model', parts: response.candidates[0].content.parts });

        // 2) Jalankan semua tool, kirim hasilnya dalam SATU giliran role "user"
        const responseParts = await Promise.all(calls.map(async (call) => {
            const raw = await executeTool(call.name, call.args || {});
            let parsed;
            try { parsed = JSON.parse(raw); } catch (e) { parsed = { result: raw }; }
            return { functionResponse: { name: call.name, response: { result: parsed } } };
        }));
        contents.push({ role: 'user', parts: responseParts });
    }
    return 'Maaf, aku butuh terlalu banyak langkah untuk menjawab ini. Coba pecah pertanyaannya jadi lebih spesifik ya 🙏';
}

// ==========================================
// 4. ENDPOINT UTAMA CHAT
// ==========================================
exports.sendMessage = async (req, res) => {
    const { sessionId, message, userName } = req.body;
    try {
        await db.query('INSERT INTO chat_messages (session_id, role, content) VALUES (?, "user", ?)', [sessionId, message]);

        const [history] = await db.query('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
        const formattedHistory = buildHistory(history.slice(0, -1));

        const JSON_FILE = path.join(__dirname, '..', 'insights.json');
        let dataBisnis = "Belum ada data analisis.";
        let waktuUpdate = "Belum pernah";

        if (fs.existsSync(JSON_FILE)) {
            const rawData = fs.readFileSync(JSON_FILE, 'utf-8');
            const json = JSON.parse(rawData);
            
            dataBisnis = json.rag_text ? json.rag_text : `
=== RINGKASAN ALL-TIME ===
- Total Laba Bersih: Rp ${json.laba_bersih?.toLocaleString('id-ID')}
- Margin: ${json.margin_persen}%
=== KINERJA BULAN INI ===
- Pendapatan: Rp ${json.data_mendalam?.bulan_ini?.pendapatan?.toLocaleString('id-ID')}
- Pengeluaran: Rp ${json.data_mendalam?.bulan_ini?.pengeluaran?.toLocaleString('id-ID')}
- Laba: Rp ${json.data_mendalam?.bulan_ini?.laba_bersih?.toLocaleString('id-ID')}
            `;
            const stats = fs.statSync(JSON_FILE);
            waktuUpdate = stats.mtime.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
        }

        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL,
            systemInstruction: `Kamu adalah "Asisten Bisnis Dorokdok". Kamu adalah Konsultan Bisnis UMKM yang sangat jenius, sekaligus teman ngobrol yang asik.

            Panggil user dengan sebutan: "${userName || 'Bos'}". 
            Gaya bahasa: Profesional, santai, kadang tegas.

            DATA BISNIS SAAT INI (Terakhir di-generate pada: ${waktuUpdate}):
            ${dataBisnis}
            
            ATURAN KETAT:
            1. GUARDRAILS: Tolak halus jika user bertanya di luar topik UMKM/makanan.
            2. TOOLS: Panggil fungsi (tools) jika butuh data real-time.
            3. GAMBAR/GRAFIK: 
               - Untuk grafik all-time:
                 ![Grafik Tren](http://localhost:5000/uploads/charts/trend_all.png)
               - Jika user minta grafik (jenis apa pun / rentang waktu tertentu), panggil tool "buat_grafik". Setelah selesai, WAJIB tampilkan gambar dengan menyalin PERSIS isi field "markdown" dari hasil tool (jangan ubah URL-nya). Gunakan angka di "ringkasan_data" untuk analisis.
               - Jika user minta pemasukan + pengeluaran + laba sekaligus, pakai jenis "gabungan".
            4. DATA: Pakai HANYA angka dari DATA BISNIS atau hasil tool, jangan mengarang. Jika hasil tool berstatus "data_kosong", "data_kurang", atau "error", jelaskan apa adanya.
            `,
            tools: tools 
        });

        const aiResponse = await runAgent(model, formattedHistory, message);
        await db.query('INSERT INTO chat_messages (session_id, role, content) VALUES (?, "assistant", ?)', [sessionId, aiResponse]);

        const [sessions] = await db.query('SELECT title FROM chat_sessions WHERE id = ?', [sessionId]);
        if (sessions[0].title === 'Percakapan Baru') {
            const autoTitle = message.split(' ').slice(0, 5).join(' ') + '...';
            await db.query('UPDATE chat_sessions SET title = ? WHERE id = ?', [autoTitle, sessionId]);
        }

        res.json({ response: aiResponse });
    } catch (err) {
        console.error(`Error pada AI [${err.status || '-'}]:`, err.message);
        res.status(500).json({ message: 'Gagal memproses pesan AI', error: err.message });
    }
};