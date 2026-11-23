import { useState, useEffect } from 'react';
import api from '../services/api';
import { Save, User, Quote } from 'lucide-react';
import './Profile.css';

export default function Profile() {
    const [profile, setProfile] = useState({ name: '', motto: '', photo_url: '' });
    const [photo, setPhoto] = useState(null);
    const [preview, setPreview] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/profile').then(res => {
            setProfile(res.data);
            setPreview(res.data.photo_url || 'https://ui-avatars.com/api/?name=' + res.data.name);
            setLoading(false);
        });
    }, []);

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        setPhoto(file);
        if (file) setPreview(URL.createObjectURL(file));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('name', profile.name);
        formData.append('motto', profile.motto);
        if (photo) formData.append('photo', photo);

        try {
            await api.put('/profile', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            alert('Profil berhasil diupdate!');
            localStorage.setItem('name', profile.name); // TAMBAHKAN BARIS INI: Agar localStorage langsung update fotonya
            if (response.data.photo_url) {
                localStorage.setItem('photo_url', response.data.photo_url);
            }
            
        } catch (error) {
            alert('Gagal update profil');
        }

    };

    if (loading) return <p>Memuat profil...</p>;

    return (
        <div className="profile-page">
            <h1>Pengaturan Profil</h1>
            <div className="profile-card">
                <div className="profile-avatar-section">
                    <img 
                        src={preview.startsWith('blob:') ? preview : `http://localhost:5000${preview.startsWith('/') ? '' : '/'}${preview}`} 
                        alt="Profile" 
                        className="profile-avatar" 
                    />
                    <label className="btn-upload">
                        Ganti Foto
                        <input type="file" accept="image/*" onChange={handlePhotoChange} hidden />
                    </label>
                </div>
                <form onSubmit={handleSubmit} className="profile-form">
                    <div className="form-group">
                        <label><User size={16}/> Nama Lengkap</label>
                        <input type="text" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} required />
                    </div>
                    <div className="form-group">
                        <label><Quote size={16}/> Moto Hidup / Bio</label>
                        <input type="text" placeholder="Tulis moto hidupmu..." value={profile.motto || ''} onChange={e => setProfile({...profile, motto: e.target.value})} />
                    </div>
                    <button type="submit" className="btn-primary"><Save size={18}/> Simpan Perubahan</button>
                </form>
            </div>
        </div>
    );
}