import { useState, useEffect } from 'react';
import api from '../services/api';
import { Pencil, Trash2, Search, UserPlus, Power } from 'lucide-react';
import './Users.css';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    
    // State Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editId, setEditId] = useState(null);
    
    const [formData, setFormData] = useState({
        name: '', email: '', password: '', role: 'karyawan'
    });

    const currentUserId = localStorage.getItem('id');

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/users');
            setUsers(response.data);
        } catch (error) {
            console.error(error);
            alert('Gagal mengambil data karyawan');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editId) {
                await api.put(`/users/${editId}`, formData);
                alert('Data karyawan berhasil diupdate');
            } else {
                await api.post('/users', formData);
                alert('Karyawan baru berhasil ditambahkan');
            }
            closeModal();
            fetchUsers();
        } catch (error) {
            alert("Gagal menyimpan data: " + (error.response?.data?.message || error.message));
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Yakin ingin menghapus karyawan ini secara permanen?")) {
            try {
                await api.delete(`/users/${id}`);
                fetchUsers();
            } catch (error) {
                alert("Gagal menghapus: " + (error.response?.data?.message || error.message));
            }
        }
    };

    const handleToggleStatus = async (user) => {
        const newStatus = !user.is_active;
        const actionText = newStatus ? 'mengaktifkan' : 'menonaktifkan';
        if (window.confirm(`Yakin ingin ${actionText} akun ${user.name}?`)) {
            try {
                await api.put(`/users/${user.id}/toggle`, { is_active: newStatus });
                fetchUsers();
            } catch (error) {
                alert("Gagal mengubah status: " + (error.response?.data?.message || error.message));
            }
        }
    };

    const openEditModal = (user) => {
        setEditId(user.id);
        setFormData({
            name: user.name,
            email: user.email,
            password: '', // Kosongkan password saat edit
            role: user.role
        });
        setIsModalOpen(true);
    };

    const openAddModal = () => {
        setEditId(null);
        setFormData({ name: '', email: '', password: '', role: 'karyawan' });
        setIsModalOpen(true);
    };

    const closeModal = () => setIsModalOpen(false);

    // Filter Pencarian
    const filteredUsers = users.filter(u => 
        u.name.toLowerCase().includes(search.toLowerCase()) || 
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="users-page">
            <div className="users-header">
                <div>
                    <h1>Kelola Karyawan</h1>
                    <p>Manajemen akun dan hak akses sistem</p>
                </div>
                <button className="btn-primary" onClick={openAddModal}>
                    <UserPlus size={18} /> Tambah Karyawan
                </button>
            </div>

            <div className="filter-panel" style={{ padding: '15px' }}>
                <div className="search-box" style={{ width: '100%' }}>
                    <Search size={18} />
                    <input 
                        type="text" 
                        placeholder="Cari nama atau email karyawan..." 
                        value={search} 
                        onChange={(e) => setSearch(e.target.value)} 
                    />
                </div>
            </div>

            {isLoading ? <p>Memuat data...</p> : (
                <div className="table-responsive">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>Nama Lengkap</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.length === 0 ? (
                                <tr><td colSpan="5" className="text-center">Tidak ada data karyawan.</td></tr>
                            ) : filteredUsers.map(user => (
                                <tr key={user.id} className={!user.is_active ? 'row-inactive' : ''}>
                                    <td><strong>{user.name}</strong></td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`badge-role ${user.role}`}>
                                            {user.role.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <button 
                                            className={`status-toggle ${user.is_active ? 'active' : 'inactive'}`}
                                            onClick={() => handleToggleStatus(user)}
                                            disabled={user.id == currentUserId}
                                            title={user.id == currentUserId ? "Tidak bisa menonaktifkan diri sendiri" : "Ubah Status"}
                                        >
                                            <Power size={14} /> {user.is_active ? 'Aktif' : 'Nonaktif'}
                                        </button>
                                    </td>
                                    <td>
                                        <div className="action-btns">
                                            <button className="btn-edit" onClick={() => openEditModal(user)}><Pencil size={16} /></button>
                                            
                                            {/* Sembunyikan tombol hapus jika itu akun sendiri */}
                                            {user.id != currentUserId && (
                                                <button className="btn-delete" onClick={() => handleDelete(user.id)}><Trash2 size={16} /></button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* MODAL FORM */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h2>{editId ? 'Edit Data Karyawan' : 'Tambah Karyawan Baru'}</h2>
                            <button className="btn-close" onClick={closeModal}>×</button>
                        </div>
                        <form onSubmit={handleSubmit} className="trx-form">
                            <div className="form-group">
                                <label>Nama Lengkap</label>
                                <input type="text" required placeholder="Nama Karyawan" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label>Email Address</label>
                                <input type="email" required placeholder="email@dorokdok.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label>{editId ? 'Password Baru (Kosongkan jika tidak diubah)' : 'Password'}</label>
                                <input type="password" required={!editId} placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label>Role Akses</label>
                                <select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})}>
                                    <option value="karyawan">Karyawan (Hanya bisa input transaksi)</option>
                                    <option value="admin">Admin (Akses penuh)</option>
                                </select>
                            </div>
                            <div className="modal-actions" style={{ marginTop: '30px' }}>
                                <button type="button" className="btn-secondary" onClick={closeModal}>Batal</button>
                                <button type="submit" className="btn-primary">Simpan Data</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}