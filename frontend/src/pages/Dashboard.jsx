import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp, TrendingDown, Wallet, Calendar, ShoppingBag, // <-- ShoppingBag DITAMBAHKAN LAGI
    PlusCircle, CheckCircle, BrainCircuit, Award, RefreshCw, User, Clock, Info
} from 'lucide-react';
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import toast from 'react-hot-toast';
import './Dashboard.css';

const PERIOD_LABEL = {
    all: 'seluruh waktu',
    today: 'hari ini',
    week: '7 hari terakhir',
    month: 'bulan ini',
    year: 'tahun ini',
};

const COLOR_IN = '#10b981';
const COLOR_OUT = '#ef4444';
const COLORS = [COLOR_IN, COLOR_OUT];

const tooltipProps = {
    contentStyle: {
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 10, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
    },
    itemStyle: { color: 'var(--text-main)' },
    labelStyle: { color: 'var(--text-muted)', fontWeight: 600 },
};

const shortRp = (v) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(1).replace('.0', '')} M`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(1).replace('.0', '')} jt`;
    if (a >= 1e3) return `${Math.round(v / 1e3)} rb`;
    return `${v}`;
};

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } };

function HeroBackground() {
    return (
        <div className="hero-bg" aria-hidden="true">
            <span className="hero-orb o1" />
            <span className="hero-orb o2" />
            <span className="hero-orb o3" />
            <span className="hero-dots" />
        </div>
    );
}

export default function Dashboard() {
    const [transactions, setTransactions] = useState([]);
    const [insights, setInsights] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(false);
    const [timeframe, setTimeframe] = useState('all');

    const role = localStorage.getItem('role');
    const name = localStorage.getItem('name');
    const userId = localStorage.getItem('id');
    const navigate = useNavigate();
    const firstName = (name || '').split(' ')[0];

    useEffect(() => {
        const fetchData = async () => {
            try {
                const trxRes = await api.get('/transactions');
                setTransactions(trxRes.data);

                if (role === 'admin') {
                    try {
                        const insightRes = await api.get('/insights');
                        setInsights(insightRes.data);
                    } catch (err) {
                        console.log('Insights belum dibuat');
                    }
                }
            } catch (error) {
                console.error('Gagal mengambil data', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();

        const today = new Date().toDateString();
        const lastLogin = localStorage.getItem(`lastLogin_${name}`);
        if (lastLogin !== today) {
            setShowWelcome(true);
            localStorage.setItem(`lastLogin_${name}`, today);
        }
    }, [name, role]);

    const handleGenerateInsight = async () => {
        setIsGenerating(true);
        const loadingToast = toast.loading('AI sedang membaca data terbaru...');
        try {
            await api.post('/insights/generate');
            const res = await api.get('/insights');
            setInsights(res.data);
            toast.success('Analisis Data Science berhasil diperbarui!', { id: loadingToast });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Gagal menjalankan AI. Pastikan Python menyala.', { id: loadingToast });
        } finally {
            setIsGenerating(false);
        }
    };

    const dashboardData = useMemo(() => {
        if (role !== 'admin') return null;

        let filtered = transactions;
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (timeframe === 'today') {
            filtered = transactions.filter(t => new Date(t.date).getTime() === now.getTime());
        } else if (timeframe === 'week') {
            const lastWeek = new Date(now); lastWeek.setDate(lastWeek.getDate() - 7);
            filtered = transactions.filter(t => new Date(t.date) >= lastWeek);
        } else if (timeframe === 'month') {
            filtered = transactions.filter(t => {
                const d = new Date(t.date);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            });
        } else if (timeframe === 'year') {
            filtered = transactions.filter(t => new Date(t.date).getFullYear() === now.getFullYear());
        }

        let pemasukan = 0, pengeluaran = 0, countIn = 0, countOut = 0;
        let onlineSales = 0, offlineSales = 0;
        const incomeCategoryMap = {};
        const expenseCategoryMap = {};

        filtered.forEach(t => {
            const amt = Number(t.amount);
            if (t.type === 'pemasukan') {
                pemasukan += amt; countIn++;
                const channel = (t.sales_channel || '').toLowerCase();
                if (channel.includes('toko') || channel === '' || channel === 'offline') offlineSales += amt;
                else onlineSales += amt;
                incomeCategoryMap[t.category_name] = (incomeCategoryMap[t.category_name] || 0) + amt;
            } else {
                pengeluaran += amt; countOut++;
                expenseCategoryMap[t.category_name] = (expenseCategoryMap[t.category_name] || 0) + amt;
            }
        });

        const toChart = (map) => Object.keys(map)
            .map(key => ({ name: key, total: map[key] }))
            .sort((a, b) => b.total - a.total);

        const selisih = pemasukan - pengeluaran;
        const totalChannel = offlineSales + onlineSales;
        const offlinePct = totalChannel > 0 ? (offlineSales / totalChannel) * 100 : 0;
        const onlinePct = totalChannel > 0 ? (onlineSales / totalChannel) * 100 : 0;

        return {
            totalPemasukan: pemasukan,
            totalPengeluaran: pengeluaran,
            selisih,
            margin: pemasukan > 0 ? (selisih / pemasukan) * 100 : 0,
            countIn, countOut,
            onlineSales, offlineSales, offlinePct, onlinePct,
            chartPie: [
                { name: 'Pemasukan', value: pemasukan },
                { name: 'Pengeluaran', value: pengeluaran }
            ],
            chartBarChannel: [
                { name: 'Toko (Offline)', total: offlineSales, color: '#3b82f6', pct: offlinePct },
                { name: 'Online/Sosmed', total: onlineSales, color: '#14b8a6', pct: onlinePct }
            ],
            chartIncomeCategory: toChart(incomeCategoryMap),
            chartExpenseCategory: toChart(expenseCategoryMap)
        };
    }, [transactions, timeframe, role]);

    const employeeData = useMemo(() => {
        if (role !== 'karyawan') return null;
        const todayStr = new Date().toISOString().split('T')[0];
        const myTodayTrx = transactions.filter(t =>
            t.user_id == userId && new Date(t.date).toISOString().split('T')[0] === todayStr
        );
        const totalAmount = myTodayTrx.reduce((sum, t) => sum + Number(t.amount), 0);
        return { count: myTodayTrx.length, totalAmount };
    }, [transactions, role, userId]);

    const formatRp = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(angka || 0);

    if (loading) return <div className="loading-spinner">Memuat data...</div>;

    const prep = insights?.preprocessing?.ringkasan;
    const pieTotal = dashboardData ? dashboardData.totalPemasukan + dashboardData.totalPengeluaran : 0;
    const pct = (v) => (pieTotal > 0 ? ((v / pieTotal) * 100).toFixed(1) : '0.0');
    const barHeight = (n) => Math.max(170, n * 42 + 30);

    return (
        <div className="dashboard-page">
            <AnimatePresence>
                {showWelcome && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="welcome-overlay">
                        <motion.div initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }} className="welcome-card">
                            <div className="welcome-icon">{role === 'admin' ? '👑' : '💪'}</div>
                            <h2>Selamat Datang, {name}!</h2>
                            <p>
                                {role === 'admin'
                                    ? 'Mari kembangkan bisnis Dorokdok Mega Rasa hari ini. Setiap catatan adalah langkah menuju kesuksesan yang lebih besar.'
                                    : 'Terima kasih sudah siap bekerja hari ini! Akurasi catatanmu sangat berharga bagi kemajuan usaha kita. Mari kita berikan yang terbaik hari ini!'}
                            </p>
                            <button onClick={() => setShowWelcome(false)} className="btn-primary">Siap Bekerja! 🚀</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {role !== 'admin' && (
                <motion.div className="employee-dash" variants={container} initial="hidden" animate="show">
                    <motion.section variants={item} className="dash-hero">
                        <HeroBackground />
                        <div className="hero-text">
                            <p className="hero-greet">Semangat bekerja hari ini</p>
                            <h1>Halo, {firstName}! 👋</h1>
                            <p className="hero-sub">Jangan lupa catat setiap transaksi dengan teliti ya.</p>
                        </div>
                        <button className="hero-btn" onClick={() => navigate('/transactions')}>
                            <PlusCircle size={18} /> Catat Transaksi Baru
                        </button>
                    </motion.section>

                    <motion.h2 variants={item} className="section-title">Aktivitas Kamu Hari Ini</motion.h2>
                    <motion.div variants={item} className="cards-grid">
                        <div className="card-item">
                            <div className="card-icon blue"><CheckCircle size={22} /></div>
                            <div>
                                <p>Transaksi Dicatat</p>
                                <h2>{employeeData.count} <span className="unit">Transaksi</span></h2>
                            </div>
                        </div>
                        <div className="card-item">
                            <div className="card-icon purple"><Wallet size={22} /></div>
                            <div>
                                <p>Total Nominal Diinput</p>
                                <h2>{formatRp(employeeData.totalAmount)}</h2>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}

            {role === 'admin' && dashboardData && (
                <motion.div className="admin-stack" variants={container} initial="hidden" animate="show">
                    <motion.section variants={item} className="dash-hero">
                        <HeroBackground />
                        <div className="hero-text">
                            <p className="hero-greet">Halo, {firstName}</p>
                            <h1>Analytics Dashboard</h1>
                            <p className="hero-sub">Ringkasan keuangan untuk {PERIOD_LABEL[timeframe]}</p>
                        </div>
                        <div className="timeframe-filter">
                            <Calendar size={16} />
                            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} aria-label="Pilih periode">
                                <option value="all">Semua Waktu</option>
                                <option value="today">Hari Ini</option>
                                <option value="week">7 Hari Terakhir</option>
                                <option value="month">Bulan Ini</option>
                                <option value="year">Tahun Ini</option>
                            </select>
                        </div>
                    </motion.section>

                    <motion.div variants={item} className="insight-card">
                        <div className="insight-header">
                            <div className="insight-title">
                                <BrainCircuit size={22} className="icon-pulse" />
                                <div>
                                    <h3>AI & Data Science Insights</h3>
                                    <span>Dihitung dari seluruh data valid, tidak mengikuti filter periode</span>
                                </div>
                            </div>
                            <button onClick={handleGenerateInsight} className="btn-generate" disabled={isGenerating}>
                                <RefreshCw size={14} className={isGenerating ? 'spin' : ''} />
                                {isGenerating ? 'Menganalisis...' : (insights ? 'Generate Ulang' : 'Generate Analisis')}
                            </button>
                        </div>

                        <div className="insight-body-grid">
                            {insights ? (
                                <>
                                    <div className="insight-item-box">
                                        <div className="icon-wrapper text-green"><TrendingUp size={18} /></div>
                                        <div>
                                            <p>Laba Bersih (Semua Waktu)</p>
                                            <h4>{formatRp(insights.laba_bersih)}</h4>
                                            <span className="insight-badge">Margin {insights.margin_persen}%</span>
                                        </div>
                                    </div>

                                    <div className="insight-item-box">
                                        <div className="icon-wrapper text-blue"><Wallet size={18} /></div>
                                        <div>
                                            <p>Rata-rata Transaksi</p>
                                            <h4>{formatRp(insights.rata_rata_transaksi)}</h4>
                                            <span className="insight-badge">Dari {insights.total_transaksi_valid} Trx</span>
                                        </div>
                                    </div>

                                    <div className="insight-item-box">
                                        <div className="icon-wrapper text-purple"><Award size={18} /></div>
                                        <div>
                                            <p>Channel Terbaik</p>
                                            <h4 className="clamp-2">{insights.top_channel}</h4>
                                            <span className="insight-badge">Favorit Pelanggan</span>
                                        </div>
                                    </div>

                                    <div className="insight-item-box">
                                        <div className="icon-wrapper text-gold"><Clock size={18} /></div>
                                        <div>
                                            <p>Waktu Paling Ramai</p>
                                            <h4>{insights.hari_tersibuk}, {insights.bulan_tersibuk}</h4>
                                            <span className="insight-badge">Siapkan Stok Ekstra!</span>
                                        </div>
                                    </div>

                                    <div className="insight-item-box">
                                        <div className="icon-wrapper text-red"><ShoppingBag size={18} /></div>
                                        <div>
                                            <p>Pengeluaran Terbesar</p>
                                            <h4 className="clamp-2">{insights.top_expense_cat}</h4>
                                            <span className="insight-badge">{formatRp(insights.top_expense_amount)}</span>
                                        </div>
                                    </div>

                                    <div className="insight-item-box">
                                        <div className="icon-wrapper text-teal"><User size={18} /></div>
                                        <div>
                                            <p>Paling Rajin Mencatat</p>
                                            <h4 className="clamp-2">{insights.top_user}</h4>
                                            <span className="insight-badge">{insights.top_user_count || 0} Kali Input</span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <p className="insight-empty">
                                    📊 Belum ada analisis. Klik <strong>"Generate Analisis"</strong> untuk menjalankan AI pertama kali.
                                </p>
                            )}
                        </div>

                        {prep && (
                            <p className="insight-note">
                                <Info size={13} />
                                <span>
                                    Dianalisis dari {prep.baris_valid} dari {prep.baris_awal} baris data.
                                    {prep.baris_dibuang > 0 && ` ${prep.baris_dibuang} baris tidak dipakai (tanggal masa depan: ${prep.dibuang_masa_depan}, duplikat: ${prep.duplikat}, dan data tidak valid lainnya).`}
                                    {' '}
                                </span>
                            </p>
                        )}

                        {insights?.narasi_ai && (
                            <div className="ai-narrative-box">
                                <div className="ai-narrative-icon">✨</div>
                                <div>
                                    <h4>Rekomendasi & Kesimpulan AI</h4>
                                    <p>{insights.narasi_ai}</p>
                                </div>
                            </div>
                        )}
                    </motion.div>

                    <motion.div variants={item} className="cards-grid">
                        <div className="card-item">
                            <div className="card-icon green"><TrendingUp size={22} /></div>
                            <div>
                                <p>Total Pemasukan</p>
                                <h2 className="text-green">{formatRp(dashboardData.totalPemasukan)}</h2>
                                <span className="card-chip">{dashboardData.countIn} transaksi</span>
                            </div>
                        </div>
                        <div className="card-item">
                            <div className="card-icon red"><TrendingDown size={22} /></div>
                            <div>
                                <p>Total Pengeluaran</p>
                                <h2 className="text-red">{formatRp(dashboardData.totalPengeluaran)}</h2>
                                <span className="card-chip">{dashboardData.countOut} transaksi</span>
                            </div>
                        </div>
                        <div className="card-item">
                            <div className="card-icon purple"><Wallet size={22} /></div>
                            <div>
                                <p>Keuntungan Bersih ({PERIOD_LABEL[timeframe]})</p>
                                <h2 className={dashboardData.selisih >= 0 ? 'text-purple' : 'text-red'}>{formatRp(dashboardData.selisih)}</h2>
                                <span className="card-chip">Margin {dashboardData.margin.toFixed(1)}%</span>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div variants={item} className="charts-wrapper">
                        <div className="chart-box">
                            <h3>Proporsi Keuangan</h3>
                            {pieTotal > 0 ? (
                                <div className="pie-layout">
                                    <div className="donut-wrap">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={dashboardData.chartPie} innerRadius={58} outerRadius={84} paddingAngle={4} dataKey="value" stroke="none">
                                                    {dashboardData.chartPie.map((entry, index) => <Cell key={index} fill={COLORS[index]} />)}
                                                </Pie>
                                                <RechartsTooltip formatter={(val) => formatRp(val)} {...tooltipProps} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="donut-center">
                                            <small>Margin</small>
                                            <strong>{dashboardData.margin.toFixed(1)}%</strong>
                                        </div>
                                    </div>

                                    <ul className="pie-legend">
                                        <li>
                                            <span className="dot" style={{ background: COLOR_IN }} />
                                            <div>
                                                <b>Hijau = Pemasukan</b>
                                                <small>{formatRp(dashboardData.totalPemasukan)} ({pct(dashboardData.totalPemasukan)}%)</small>
                                            </div>
                                        </li>
                                        <li>
                                            <span className="dot" style={{ background: COLOR_OUT }} />
                                            <div>
                                                <b>Merah = Pengeluaran</b>
                                                <small>{formatRp(dashboardData.totalPengeluaran)} ({pct(dashboardData.totalPengeluaran)}%)</small>
                                            </div>
                                        </li>
                                    </ul>
                                </div>
                            ) : (
                                <p className="chart-empty">Belum ada transaksi pada periode ini.</p>
                            )}
                        </div>

                        <div className="chart-box">
                            <h3>Statistik Channel Penjualan</h3>
                            <div className="chart-subtitle">
                                <span style={{color: '#3b82f6'}}>● Offline: {dashboardData.offlinePct.toFixed(0)}% ({shortRp(dashboardData.offlineSales)})</span>
                                <span style={{color: '#14b8a6'}}>● Online: {dashboardData.onlinePct.toFixed(0)}% ({shortRp(dashboardData.onlineSales)})</span>
                            </div>
                            <div style={{ height: 180 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dashboardData.chartBarChannel} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.12} />
                                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                        <YAxis tickFormatter={shortRp} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={52} />
                                        <RechartsTooltip formatter={(val) => formatRp(val)} cursor={{ fill: 'rgba(139, 92, 246, 0.06)' }} {...tooltipProps} />
                                        <Bar dataKey="total" radius={[8, 8, 0, 0]} barSize={46}>
                                            {dashboardData.chartBarChannel.map((e, i) => <Cell key={i} fill={e.color} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="chart-box">
                            <h3><i className="title-dot" style={{ background: COLOR_IN }} />Pemasukan per Kategori</h3>
                            {dashboardData.chartIncomeCategory.length > 0 ? (
                                <div style={{ height: barHeight(dashboardData.chartIncomeCategory.length) }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={dashboardData.chartIncomeCategory} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.12} />
                                            <XAxis type="number" tickFormatter={shortRp} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: 'var(--text-main)' }} axisLine={false} tickLine={false} />
                                            <RechartsTooltip formatter={(val) => formatRp(val)} cursor={{ fill: 'rgba(16, 185, 129, 0.06)' }} {...tooltipProps} />
                                            <Bar dataKey="total" fill={COLOR_IN} radius={[0, 8, 8, 0]} barSize={20} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : <p className="chart-empty">Belum ada pemasukan.</p>}
                        </div>

                        <div className="chart-box">
                            <h3><i className="title-dot" style={{ background: COLOR_OUT }} />Pengeluaran per Kategori</h3>
                            {dashboardData.chartExpenseCategory.length > 0 ? (
                                <div style={{ height: barHeight(dashboardData.chartExpenseCategory.length) }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={dashboardData.chartExpenseCategory} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.12} />
                                            <XAxis type="number" tickFormatter={shortRp} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                                            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: 'var(--text-main)' }} axisLine={false} tickLine={false} />
                                            <RechartsTooltip formatter={(val) => formatRp(val)} cursor={{ fill: 'rgba(239, 68, 68, 0.06)' }} {...tooltipProps} />
                                            <Bar dataKey="total" fill={COLOR_OUT} radius={[0, 8, 8, 0]} barSize={20} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : <p className="chart-empty">Belum ada pengeluaran.</p>}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
}