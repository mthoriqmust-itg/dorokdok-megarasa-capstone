import { useState, useEffect } from 'react';
import api from '../services/api';
import { Pencil, Trash2, Search, Filter, Calendar, Eye, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 
import toast from 'react-hot-toast'; // <-- IMPORT TOAST
import './Transactions.css';

export default function Transactions() {
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    
    // State Modal Utama
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [selectedTrx, setSelectedTrx] = useState(null);
    
    // State Modal Export
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState('excel');
    const [exportTimeframe, setExportTimeframe] = useState('all');
    const [exportStart, setExportStart] = useState('');
    const [exportEnd, setExportEnd] = useState('');
    const [exportType, setExportType] = useState('all');
    const [excludedCategories, setExcludedCategories] = useState([]);

    const [isLoading, setIsLoading] = useState(true);
    const [editId, setEditId] = useState(null);

    // State Filter Tabel
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const [formData, setFormData] = useState({
        type: 'pemasukan', category_id: '', date: new Date().toISOString().split('T')[0], 
        amount: '', payment_method: 'tunai', sales_channel: 'toko', note: ''
    });

    const currentUserRole = localStorage.getItem('role');
    const currentUserId = localStorage.getItem('id');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [trxRes, catRes] = await Promise.all([api.get('/transactions'), api.get('/categories')]);
            setTransactions(trxRes.data);
            setCategories(catRes.data);
        } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const loadingToast = toast.loading('Menyimpan data...');
        try {
            if (editId) await api.put(`/transactions/${editId}`, formData);
            else await api.post('/transactions', formData);
            
            toast.success(editId ? 'Transaksi berhasil diupdate!' : 'Transaksi berhasil ditambahkan!', { id: loadingToast });
            closeModal();
            fetchData();
        } catch (error) { 
            toast.error(error.response?.data?.message || 'Gagal menyimpan data', { id: loadingToast }); 
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Yakin ingin menghapus transaksi ini?")) {
            const loadingToast = toast.loading('Menghapus...');
            try { 
                await api.delete(`/transactions/${id}`); 
                toast.success('Transaksi dihapus', { id: loadingToast });
                fetchData(); 
            } catch (error) { 
                toast.error('Gagal menghapus: ' + (error.response?.data?.message || error.message), { id: loadingToast }); 
            }
        }
    };

    const openEditModal = (trx) => {
        setEditId(trx.id);
        setFormData({
            type: trx.type, category_id: trx.category_id,
            date: new Date(trx.date).toISOString().split('T')[0],
            amount: trx.amount, note: trx.note,
            payment_method: trx.payment_method || 'tunai',
            sales_channel: trx.sales_channel || 'toko'
        });
        setIsModalOpen(true);
    };

    const openAddModal = () => {
        setEditId(null);
        setFormData({ 
            type: 'pemasukan', category_id: '', date: new Date().toISOString().split('T')[0], 
            amount: '', payment_method: 'tunai', sales_channel: 'toko', note: '' 
        });
        setIsModalOpen(true);
    };

    const openDetailModal = (trx) => { setSelectedTrx(trx); setIsDetailOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setEditId(null); };
    const closeDetailModal = () => { setIsDetailOpen(false); setSelectedTrx(null); };

    // PERBAIKAN FORMAT RUPIAH (Menggunakan Math.abs agar tidak dobel minus)
    const formatRp = (angka, type) => {
        const absAngka = Math.abs(Number(angka) || 0);
        const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(absAngka);
        return type === 'pemasukan' ? `+ ${formatted}` : `- ${formatted}`;
    };

    // === LOGIKA FILTER TABEL UTAMA ===
    const filteredTrx = transactions.filter(trx => {
        const matchSearch = (trx.note || '').toLowerCase().includes(search.toLowerCase()) || 
                            (trx.category_name || '').toLowerCase().includes(search.toLowerCase());
        const matchType = filterType === 'all' ? true : trx.type === filterType;

        let matchDate = true;
        const trxDate = new Date(trx.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === 'today') matchDate = trxDate.getTime() === today.getTime();
        else if (dateFilter === 'week') {
            const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 7);
            matchDate = trxDate >= lastWeek && trxDate <= today;
        } else if (dateFilter === 'month') {
            matchDate = trxDate.getMonth() === today.getMonth() && trxDate.getFullYear() === today.getFullYear();
        } else if (dateFilter === 'year') matchDate = trxDate.getFullYear() === today.getFullYear();
        else if (dateFilter === 'custom' && customStart && customEnd) {
            const start = new Date(customStart); const end = new Date(customEnd);
            end.setHours(23, 59, 59);
            matchDate = trxDate >= start && trxDate <= end;
        }
        return matchSearch && matchType && matchDate;
    });

    const filteredCategories = categories.filter(c => c.type === formData.type);

    // === FUNGSI EXPORT ===
    const openExportModal = (format) => {
        setExportFormat(format);
        setIsExportModalOpen(true);
    };

    const handleToggleExcludeCategory = (catId) => {
        if (excludedCategories.includes(catId)) {
            setExcludedCategories(excludedCategories.filter(id => id !== catId));
        } else {
            setExcludedCategories([...excludedCategories, catId]);
        }
    };

    const executeExport = () => {
        let dataToExport = transactions;
        const now = new Date(); now.setHours(0,0,0,0);

        if (exportTimeframe === 'week') {
            const lastWeek = new Date(now); lastWeek.setDate(lastWeek.getDate() - 7);
            dataToExport = dataToExport.filter(t => new Date(t.date) >= lastWeek);
        } else if (exportTimeframe === 'month') {
            dataToExport = dataToExport.filter(t => {
                const d = new Date(t.date);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            });
        } else if (exportTimeframe === 'year') {
            dataToExport = dataToExport.filter(t => new Date(t.date).getFullYear() === now.getFullYear());
        } else if (exportTimeframe === 'custom' && exportStart && exportEnd) {
            const start = new Date(exportStart); const end = new Date(exportEnd); end.setHours(23,59,59);
            dataToExport = dataToExport.filter(t => new Date(t.date) >= start && new Date(t.date) <= end);
        }

        if (exportType !== 'all') {
            dataToExport = dataToExport.filter(t => t.type === exportType);
        }

        if (excludedCategories.length > 0) {
            dataToExport = dataToExport.filter(t => !excludedCategories.includes(t.category_id));
        }

        if (dataToExport.length === 0) {
            toast.error("Tidak ada data yang sesuai dengan filter export.");
            return;
        }

        const timeStr = exportTimeframe === 'all' ? 'semua_waktu' : exportTimeframe;
        const fileName = `laporan_pembukuan_${timeStr}_${new Date().toISOString().split('T')[0]}`;
        const loadingToast = toast.loading('Menyiapkan file...');

        if (exportFormat === 'excel') {
            const excelData = dataToExport.map(trx => ({
                Tanggal: new Date(trx.date).toLocaleDateString('id-ID'),
                Kategori: trx.category_name,
                Tipe: trx.type.toUpperCase(),
                Nominal: Number(trx.amount),
                Metode: trx.payment_method,
                Channel: trx.sales_channel || '-',
                Keterangan: trx.note,
                'Diinput Oleh': trx.user_name
            }));
            const worksheet = XLSX.utils.json_to_sheet(excelData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan");
            XLSX.writeFile(workbook, `${fileName}.xlsx`);
            toast.success('File Excel berhasil diunduh', { id: loadingToast });
        } else {
            const doc = new jsPDF();
            doc.text("Laporan Pembukuan Dorokdok Mega Rasa", 14, 15);
            doc.setFontSize(10);
            doc.text(`Periode: ${timeStr.toUpperCase()} | Total Data: ${dataToExport.length}`, 14, 22);

            const tableColumn = ["Tanggal", "Kategori", "Tipe", "Nominal", "Keterangan", "Oleh"];
            const tableRows = dataToExport.map(trx => [
                new Date(trx.date).toLocaleDateString('id-ID'),
                trx.category_name,
                trx.type.toUpperCase(),
                new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(trx.amount),
                trx.note,
                trx.user_name
            ]);

            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: 28,
                theme: 'striped',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [139, 92, 246] },
            });
            doc.save(`${fileName}.pdf`);
            toast.success('File PDF berhasil diunduh', { id: loadingToast });
        }
        
        setIsExportModalOpen(false);
    };

    return (
        <div className="trx-page">
            <div className="trx-header">
                <div>
                    <h1>Catatan Transaksi</h1>
                    <p>Kelola riwayat pemasukan dan pengeluaran</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-secondary" onClick={() => openExportModal('excel')} style={{ borderColor: '#10b981', color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Download size={16} /> Excel
                    </button>
                    <button className="btn-secondary" onClick={() => openExportModal('pdf')} style={{ borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Download size={16} /> PDF
                    </button>
                    <button className="btn-primary" onClick={openAddModal}>+ Tambah</button>
                </div>
            </div>

            {/* === PANEL FILTER UTAMA === */}
            <div className="filter-panel">
                <div className="filter-row">
                    <div className="search-box">
                        <Search size={18} />
                        <input type="text" placeholder="Cari keterangan atau kategori..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="filter-select">
                        <Filter size={18} />
                        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                            <option value="all">Semua Tipe</option>
                            <option value="pemasukan">Pemasukan</option>
                            <option value="pengeluaran">Pengeluaran</option>
                        </select>
                    </div>
                    <div className="filter-select">
                        <Calendar size={18} />
                        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                            <option value="all">Semua Waktu</option>
                            <option value="today">Hari Ini</option>
                            <option value="week">7 Hari Terakhir</option>
                            <option value="month">Bulan Ini</option>
                            <option value="year">Tahun Ini</option>
                            <option value="custom">Rentang Custom...</option>
                        </select>
                    </div>
                </div>
                {dateFilter === 'custom' && (
                    <div className="custom-date-row">
                        <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                        <span>s/d</span>
                        <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                    </div>
                )}
            </div>

            {isLoading ? <p>Memuat...</p> : (
                <div className="table-responsive">
                    <table className="trx-table">
                        <thead>
                            <tr>
                                <th>Tanggal</th>
                                <th>Kategori</th>
                                <th>Nominal</th>
                                <th>Channel</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTrx.length === 0 ? (
                                <tr><td colSpan="5" className="text-center">Tidak ada data ditemukan.</td></tr>
                            ) : filteredTrx.map((trx) => (
                                <tr key={trx.id}>
                                    <td>{new Date(trx.date).toLocaleDateString('id-ID')}</td>
                                    <td><span className={`badge-cat ${trx.type}`}>{trx.category_name}</span></td>
                                    <td className={trx.type === 'pemasukan' ? 'text-green' : 'text-red'}>
                                        {formatRp(trx.amount, trx.type)}
                                    </td>
                                    <td style={{textTransform:'capitalize'}}>{trx.sales_channel || 'Toko'}</td>
                                    <td>
                                        <div className="action-btns">
                                            <button className="btn-view" onClick={() => openDetailModal(trx)}><Eye size={16} /></button>
                                            {(currentUserRole === 'admin' || currentUserId == trx.user_id) && (
                                                <>
                                                    <button className="btn-edit" onClick={() => openEditModal(trx)}><Pencil size={16} /></button>
                                                    <button className="btn-delete" onClick={() => handleDelete(trx.id)}><Trash2 size={16} /></button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* === MODAL EXPORT === */}
            {isExportModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>Export Laporan ke {exportFormat.toUpperCase()}</h2>
                            <button className="btn-close" onClick={() => setIsExportModalOpen(false)}>×</button>
                        </div>
                        <div className="trx-form">
                            <div className="form-group">
                                <label>Rentang Waktu</label>
                                <select value={exportTimeframe} onChange={(e) => setExportTimeframe(e.target.value)}>
                                    <option value="all">Semua Waktu</option>
                                    <option value="week">7 Hari Terakhir</option>
                                    <option value="month">Bulan Ini</option>
                                    <option value="year">Tahun Ini</option>
                                    <option value="custom">Rentang Custom</option>
                                </select>
                            </div>
                            {exportTimeframe === 'custom' && (
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Dari Tanggal</label>
                                        <input type="date" value={exportStart} onChange={e => setExportStart(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Sampai Tanggal</label>
                                        <input type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)} />
                                    </div>
                                </div>
                            )}
                            
                            <div className="form-group">
                                <label>Tipe Transaksi</label>
                                <select value={exportType} onChange={(e) => setExportType(e.target.value)}>
                                    <option value="all">Pemasukan & Pengeluaran</option>
                                    <option value="pemasukan">Hanya Pemasukan</option>
                                    <option value="pengeluaran">Hanya Pengeluaran</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Kecualikan Kategori (Opsional)</label>
                                <div className="checkbox-list">
                                    {categories.map(cat => (
                                        <label key={cat.id} className="checkbox-item">
                                            <input 
                                                type="checkbox" 
                                                checked={excludedCategories.includes(cat.id)}
                                                onChange={() => handleToggleExcludeCategory(cat.id)}
                                            />
                                            {cat.name} ({cat.type})
                                        </label>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setIsExportModalOpen(false)}>Batal</button>
                                <button type="button" className="btn-primary" onClick={executeExport}>Download File</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* === MODAL FORM (TAMBAH / EDIT) === */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>{editId ? 'Edit Transaksi' : 'Tambah Transaksi Baru'}</h2>
                            <button className="btn-close" onClick={closeModal}>×</button>
                        </div>
                        <form onSubmit={handleSubmit} className="trx-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Tipe Transaksi</label>
                                    <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value, category_id: ''})}>
                                        <option value="pemasukan">Pemasukan</option>
                                        <option value="pengeluaran">Pengeluaran</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Kategori</label>
                                    <select required value={formData.category_id} onChange={(e) => setFormData({...formData, category_id: e.target.value})}>
                                        <option value="" disabled>-- Pilih --</option>
                                        {filteredCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Metode Bayar</label>
                                    <select value={formData.payment_method} onChange={(e) => setFormData({...formData, payment_method: e.target.value})}>
                                        <option value="tunai">Tunai</option>
                                        <option value="QRIS">QRIS</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Channel Penjualan</label>
                                    <select value={formData.sales_channel || ''} onChange={(e) => setFormData({...formData, sales_channel: e.target.value})}>
                                        <option value="toko">Toko (Offline)</option>
                                        <option value="WhatsApp">WhatsApp</option>
                                        <option value="media sosial">Media Sosial</option>
                                        <option value="reseller/toko oleh-oleh">Reseller</option>
                                        <option value="">Tidak Ada (Pengeluaran)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Tanggal</label>
                                    {/* KUNCI TANGGAL: Maksimal hari ini */}
                                    <input 
                                        type="date" 
                                        required 
                                        max={new Date().toISOString().split('T')[0]} 
                                        value={formData.date} 
                                        onChange={(e) => setFormData({...formData, date: e.target.value})} 
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Nominal (Rp)</label>
                                    {/* KUNCI NOMINAL: Minimal 1, dan blokir ketikan -, +, e */}
                                    <input 
                                        type="number" 
                                        required 
                                        min="1"
                                        onKeyDown={(e) => {
                                            if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                                        }}
                                        placeholder="50000" 
                                        value={formData.amount} 
                                        onChange={(e) => setFormData({...formData, amount: e.target.value})} 
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Keterangan</label>
                                <input type="text" required placeholder="Contoh: Beli minyak goreng" value={formData.note} onChange={(e) => setFormData({...formData, note: e.target.value})} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={closeModal}>Batal</button>
                                <button type="submit" className="btn-primary">Simpan Data</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* === MODAL DETAIL TRANSAKSI === */}
            {isDetailOpen && selectedTrx && (
                <div className="modal-overlay">
                    <div className="modal-content detail-modal">
                        <div className="modal-header">
                            <h2>Detail Transaksi</h2>
                            <button className="btn-close" onClick={closeDetailModal}>×</button>
                        </div>
                        <div className="detail-body">
                            <div className="detail-row">
                                <span>Tanggal</span>
                                <strong>{new Date(selectedTrx.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                            </div>
                            <div className="detail-row">
                                <span>Kategori</span>
                                <span className={`badge-cat ${selectedTrx.type}`}>{selectedTrx.category_name}</span>
                            </div>
                            <div className="detail-row">
                                <span>Tipe</span>
                                <strong style={{color: selectedTrx.type === 'pemasukan' ? '#10b981' : '#ef4444'}}>{selectedTrx.type.toUpperCase()}</strong>
                            </div>
                            <div className="detail-row">
                                <span>Nominal</span>
                                <h3 className={selectedTrx.type === 'pemasukan' ? 'text-green' : 'text-red'}>{formatRp(selectedTrx.amount, selectedTrx.type)}</h3>
                            </div>
                            <div className="detail-row">
                                <span>Metode Bayar</span>
                                <strong style={{textTransform:'capitalize'}}>{selectedTrx.payment_method || '-'}</strong>
                            </div>
                            <div className="detail-row">
                                <span>Channel Penjualan</span>
                                <strong style={{textTransform:'capitalize'}}>{selectedTrx.sales_channel || '-'}</strong>
                            </div>
                            <div className="detail-row">
                                <span>Keterangan</span>
                                <p>{selectedTrx.note}</p>
                            </div>
                            <div className="detail-row">
                                <span>Diinput Oleh</span>
                                <strong>{selectedTrx.user_name}</strong>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={closeDetailModal}>Tutup</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}