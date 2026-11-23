import axios from 'axios';

// Membuat instance axios dengan base URL ke backend Node.js kita
const api = axios.create({
    // Tambahkan /v1 di belakangnya
    baseURL: 'http://localhost:5000/api/v1', 
});

// Interceptor: Otomatis menyisipkan Token JWT ke setiap request (kalau user sudah login)
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;