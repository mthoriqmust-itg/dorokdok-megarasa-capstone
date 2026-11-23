
---

# 🚀 Panduan Instalasi & Menjalankan Proyek Dorokdok Mega Rasa

Proyek ini menggunakan arsitektur **Microservices** (Frontend, Backend, dan AI Engine terpisah). Untuk menjalankannya, kamu harus menyalakan **3 Terminal** secara bersamaan. Jangan panik, ikuti saja langkahnya.

### 🛠️ Persiapan Awal (Wajib)
Pastikan laptop kamu sudah terinstall:
1. **Node.js** (versi 18+)
2. **Python** (versi 3.9+)
3. **XAMPP** (untuk MySQL)

---

### 📌 LANGKAH 1: Setup Database (XAMPP)
*Kita akan menyiapkan database MySQL dari file yang sudah disediakan.*

1. Buka **XAMPP**, lalu nyalakan modul **Apache** dan **MySQL**.
2. Ekstrak file **`dorokdok_megarasa.zip`** yang ada di folder proyek. Di dalamnya terdapat file **`dorokdok_megarasa.sql`**.
3. Buka browser, akses `http://localhost/phpmyadmin`.
4. Klik **"New"** (Baru) di panel kiri, buat database baru dengan nama **`dorokdok_megarasa`**.
5. Pilih database tersebut, lalu masuk ke tab **"Import"**.
6. Pilih file **`dorokdok_megarasa.sql`** yang sudah diekstrak tadi, lalu klik **"Import"** (Go).
7. *Tunggu hingga muncul tulisan hijau "Import has been successfully finished".*

---

### 🟢 TERMINAL 1: Setup Backend API (Node.js)
*Ini adalah server utama yang mengatur API, Login, dan Database.*

1. Buka Terminal, masuk ke folder backend:
   ```bash
   cd backend
   ```
2. Install semua library Node.js:
   ```bash
   npm install
   npm install axios
   ```
3. Buat file **`.env`** di dalam folder `backend` (jika belum ada), lalu isi persis seperti ini:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_USER=root
   DB_PASS=
   DB_NAME=dorokdok_megarasa
   JWT_SECRET=rahasia_super_aman
   GEMINI_API_KEY=isi_dengan_api_key_gemini_kamu
   ```
   *(Catatan: Jika XAMPP MySQL kamu pakai password, isi `DB_PASS` sesuai passwordmu. Kalau tidak ada, biarkan kosong).*
4. Jalankan server Node.js:
   ```bash
   npm run dev
   ```
   *(Biarkan terminal ini menyala. Kalau berhasil, akan muncul tulisan `Server berjalan di http://localhost:5000`)*.

---

### 🐍 TERMINAL 2: Setup AI & Data Science Engine (Python/FastAPI)
*Ini adalah "otak" yang menghitung data transaksi dan membuat gambar grafik.*

1. Buka Terminal **baru** (jangan tutup Terminal 1), masuk ke folder backend lagi:
   ```bash
   cd backend
   ```
2. Install library Python yang dibutuhkan:
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
2. Install library React:
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

Setelah ketiga terminal menyala dan web terbuka di browser:

1. **Login:** Masuk pakai akun admin (Email: `fajar@dorokdok.com` | Password: `password123`).
2. **Dashboard:** Kamu akan melihat halaman utama. Klik tombol **"Generate Analisis"** di kotak AI. 
   *(Di balik layar: Node.js mengambil data DB -> Mengirim ke FastAPI Python -> Python bikin JSON & Grafik -> Tampil di layar).*
3. **Transaksi:** Coba tambah transaksi baru. Pastikan muncul notifikasi hijau "Berhasil".
4. **AI Assistant:** Buka menu AI di sidebar.
   *   Ketik: *"Halo AI, gimana performa bisnis bulan ini?"*
   *   Tunggu animasi mengetik selesai, AI akan menjawab dengan data dari Python.
   *   Ketik: *"Tolong buatkan grafik tren 7 hari terakhir"*. AI akan memanggil Python dan menampilkan gambar grafiknya langsung di dalam chat!

---

### ⚠️ TROUBLESHOOTING (Kalau Ada Error)

*   **Error `Cannot find module 'axios'`**: Berarti kamu belum menjalankan `npm install axios` di folder backend.
*   **Gagal Login / Database Error**: Cek XAMPP, pastikan MySQL menyala dan nama database di `.env` sudah benar (`dorokdok_megarasa`).
*   **Tombol Generate Analisis Gagal (Merah)**: Pastikan **Terminal 2 (FastAPI/Python)** sedang menyala. Node.js butuh server Python untuk menghitung data.
*   **AI Chat Error / Tidak bisa membalas**: Cek `GEMINI_API_KEY` di file `.env`. Pastikan API Key masih aktif dan ada kuotanya.
*   **Grafik tidak muncul di chat**: Pastikan folder `backend/uploads/charts` ada di dalam folder proyek. Jika belum, buat folder tersebut secara manual.
