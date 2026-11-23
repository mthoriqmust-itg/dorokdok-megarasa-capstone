Siap! Biar temen-temen kamu (atau dosen penguji) bisa jalanin proyek ini di laptop mereka tanpa pusing, ini adalah **Panduan Instalasi (Step-by-Step)** yang bisa kamu kirim langsung ke grup chat atau kamu cetak jadi panduan.

Pastikan mereka sudah menginstall **Node.js**, **Python (versi 3.9+)**, dan **XAMPP/MySQL** ya.

---

# 🚀 Panduan Menjalankan Proyek Dorokdok Mega Rasa

Proyek ini menggunakan arsitektur **Microservices**, jadi kita harus menyalakan **3 Terminal** secara bersamaan. Jangan panik, ikuti saja langkahnya.

### 📌 Persiapan Awal
1. Buka folder proyek di VS Code.
2. Buka **XAMPP**, nyalakan **Apache** dan **MySQL**.
3. Buka `http://localhost/phpmyadmin`, buat database baru bernama `dorokdok_db` (atau sesuai `.env`), lalu **Import** file `.sql` yang ada di folder proyek.

---

### 🟢 TERMINAL 1: Setup Database & Backend (Node.js)
*Ini adalah server utama yang mengatur API, Login, dan Database.*

1. Buka Terminal, masuk ke folder backend:
   ```bash
   cd backend
   ```
2. Install semua library Node.js (cukup sekali):
   ```bash
   npm install
   ```
   *(Pastikan library `axios`, `fastapi` dependencies, dll sudah terinstall. Jika belum, jalankan `npm install axios`)*.
3. Buat file **`.env`** di dalam folder `backend` (jika belum ada), lalu isi:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_USER=root
   DB_PASS=
   DB_NAME=dorokdok_db
   JWT_SECRET=rahasia_super_aman
   GEMINI_API_KEY=isi_dengan_api_key_gemini_kamu
   ```
4. Jalankan server Node.js:
   ```bash
   npm run dev
   ```
   *(Biarkan terminal ini menyala. Kalau berhasil, akan muncul tulisan `Server berjalan di http://localhost:5000`)*.

---

### 🐍 TERMINAL 2: Setup AI & Data Science Engine (Python/FastAPI)
*Ini adalah "otak" yang menghitung data transaksi dan bikin grafik.*

1. Buka Terminal **baru** (jangan tutup Terminal 1), masuk ke folder backend lagi:
   ```bash
   cd backend
   ```
2. Install library Python yang dibutuhkan (cukup sekali):
   ```bash
   pip install fastapi uvicorn pandas numpy matplotlib
   ```
3. Jalankan server FastAPI:
   ```bash
   uvicorn api_ds:app --reload --port 8000
   ```
   *(Biarkan terminal ini menyala. Kalau berhasil, akan muncul tulisan `Application startup complete`)*.

---

### ⚛️ TERMINAL 3: Setup Frontend (React)
*Ini adalah tampilan website yang dilihat oleh pengguna.*

1. Buka Terminal **baru lagi**, masuk ke folder frontend:
   ```bash
   cd frontend
   ```
2. Install library React (cukup sekali):
   ```bash
   npm install
   ```
3. Jalankan server React:
   ```bash
   npm run dev
   ```
4. Buka browser, akses link yang muncul di terminal (biasanya `http://localhost:5173`).

---

### 🎯 CARA NGETES (Alur Penggunaan)

Setelah ketiga terminal menyala dan web terbuka:

1. **Login:** Masuk pakai email dan password (misal: `fajar@dorokdok.com` / `password123`).
2. **Dashboard:** Kamu akan melihat halaman utama. Klik tombol **"Generate Analisis"** di kotak AI. 
   *(Di balik layar: Node.js mengambil data DB -> Mengirim ke FastAPI Python -> Python bikin JSON & Grafik -> Tampil di layar).*
3. **Transaksi:** Coba tambah transaksi baru. Pastikan muncul notifikasi hijau "Berhasil".
4. **AI Assistant:** Buka menu AI di sidebar.
   *   Ketik: *"Halo AI, gimana performa bisnis bulan ini?"*
   *   Tunggu animasi mengetik selesai, AI akan menjawab dengan data dari Python.
   *   Ketik: *"Tolong buatkan grafik tren 7 hari terakhir"*. AI akan memanggil Python dan menampilkan gambar grafiknya langsung di dalam chat!

---

### ⚠️ TROUBLESHOOTING (Kalau Error)

*   **Error `Cannot find module 'axios'`**: Berarti kamu belum menjalankan `npm install axios` di folder backend.
*   **Gagal Login / Database Error**: Cek XAMPP, pastikan MySQL menyala dan nama database di `.env` sudah benar.
*   **Tombol Generate Analisis Gagal (Merah)**: Pastikan **Terminal 2 (FastAPI/Python)** sedang menyala. Node.js butuh server Python untuk menghitung data.
*   **AI Chat Error / Tidak bisa membalas**: Cek `GEMINI_API_KEY` di file `.env`. Pastikan API Key masih aktif dan ada kuotanya.
*   **Grafik tidak muncul di chat**: Pastikan folder `backend/uploads/charts` ada. Jika belum, buat folder tersebut secara manual.
