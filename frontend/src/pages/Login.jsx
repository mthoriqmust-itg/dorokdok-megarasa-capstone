import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import dorokdokLogo from '../assets/dorokdok.png'; // Pastikan nama file & folder sesuai
import './Login.css';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true); // State untuk Preloader
    
    const navigate = useNavigate();

    // Efek Preloader: Akan hilang setelah 2 detik (2000ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 2000);

        return () => clearTimeout(timer); // Bersihkan timer jika komponen ditinggalkan
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(''); // Reset error
        try {
            const response = await api.post('/auth/login', { email, password });
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('role', response.data.role);
            localStorage.setItem('name', response.data.name);
            localStorage.setItem('id', response.data.id); // <-- TAMBAHKAN INI
            localStorage.setItem('photo_url', response.data.photo_url); // <-- TAMBAHKAN INI


            
            // Animasi transisi sebelum pindah halaman (opsional)
            setIsLoading(true); 
            setTimeout(() => {
                navigate('/dashboard');
            }, 1000);

        } catch (err) {
            setError(err.response?.data?.message || 'Login gagal, cek email/password');
        }
    };

    return (
        <>
            {/* === 1. PRELOADER SCREEN === */}
            <div className={`preloader-wrapper ${!isLoading ? 'fade-out' : ''}`}>
                <div className="preloader-content">
                    <img src={dorokdokLogo} alt="Dorokdok Logo" className="spinning-logo" />
                    <p className="loading-text">Menyiapkan Sistem...</p>
                </div>
            </div>

            {/* === 2. HALAMAN LOGIN UTAMA === */}
            <div className="login-page">
                {/* Ornamen Background */}
                <div className="bg-shape shape-1"></div>
                <div className="bg-shape shape-2"></div>
                
                <div className="login-card">
                    <div className="login-header">
                        <img src={dorokdokLogo} alt="Logo" className="small-logo" />
                        <h2>Selamat Datang</h2>
                        <p>Sistem Pembukuan Dorokdok Mega Rasa</p>
                    </div>

                    {error && <div className="error-alert">{error}</div>}
                    
                    <form onSubmit={handleLogin} className="login-form">
                        <div className="input-group">
                            <label>Email Address</label>
                            <input 
                                type="email" 
                                placeholder="nama@dorokdok.com" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)} 
                                required 
                            />
                        </div>
                        
                        <div className="input-group">
                            <label>Password</label>
                            <input 
                                type="password" 
                                placeholder="••••••••" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                            />
                        </div>

                        <button type="submit" className="btn-login">
                            Masuk ke Sistem
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}