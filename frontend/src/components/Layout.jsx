import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, ArrowLeftRight, Bot, Users, MessagesSquare,
    UserCircle, LogOut, Moon, Sun, Menu, X
} from 'lucide-react';
import './Layout.css';

const NAV = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/transactions', label: 'Transaksi', icon: ArrowLeftRight },
    { to: '/ai-assistant', label: 'AI Assistant', icon: Bot, adminOnly: true },
    { to: '/users', label: 'Kelola Karyawan', icon: Users, adminOnly: true },
    { to: '/community', label: 'Komunitas', icon: MessagesSquare },
    { to: '/profile', label: 'Profil Saya', icon: UserCircle },
];

export default function Layout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();
    const role = localStorage.getItem('role');
    const name = localStorage.getItem('name') || 'Pengguna';
    
    // Ambil foto dari localStorage
    const savedPhoto = localStorage.getItem('photo_url');
    const hasValidPhoto = savedPhoto && savedPhoto !== 'undefined' && savedPhoto !== 'null';
    const currentUserPhoto = hasValidPhoto ? `http://localhost:5000${savedPhoto}` : null;

    const [imgError, setImgError] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // === DARK MODE ===
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);
    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

    // Tutup sidebar otomatis saat pindah halaman (mobile)
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/');
    };

    const items = NAV.filter(n => !n.adminOnly || role === 'admin');
    const current = NAV.find(n => location.pathname === n.to || location.pathname.startsWith(n.to + '/'));
    const pageTitle = current ? current.label : 'Dorokdok App';
    const todayLabel = new Date().toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

    return (
        <div className="layout-container">
            {/* Overlay untuk mobile saat sidebar terbuka */}
            {isSidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
            )}

            <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-bg" aria-hidden="true">
                    <span className="sb-orb sb-orb-1" />
                    <span className="sb-orb sb-orb-2" />
                    <span className="sb-orb sb-orb-3" />
                    <span className="sb-grid" />
                </div>

                <div className="sidebar-inner">
                    <div className="brand">
                        {/* LOGO DOROKDOK */}
                        <img src="/dorokdok.png" alt="Dorokdok" className="brand-img" />
                        <div className="brand-text">
                            <h2>Dorokdok<span>App</span></h2>
                            <small>Pembukuan UMKM</small>
                        </div>
                        {/* Tombol close khusus mobile di dalam sidebar */}
                        <button className="mobile-close-btn" onClick={() => setIsSidebarOpen(false)}>
                            <X size={20} />
                        </button>
                    </div>

                    <nav>
                        {items.map(({ to, label, icon: Icon }) => (
                            <NavLink
                                key={to}
                                to={to}
                                title={label}
                                className={({ isActive }) => (isActive ? 'active' : '')}
                            >
                                <Icon size={19} strokeWidth={2} />
                                <span>{label}</span>
                            </NavLink>
                        ))}
                    </nav>

                    <button onClick={handleLogout} className="btn-logout" title="Logout">
                        <LogOut size={18} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            <div className="main-wrapper">
                <header className="topbar">
                    <div className="topbar-left">
                        {/* HAMBURGER MENU (Tampil hanya di mobile) */}
                        <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
                            <Menu size={24} />
                        </button>
                        <div className="topbar-title">
                            <h3>{pageTitle}</h3>
                            <p>{todayLabel}</p>
                        </div>
                    </div>

                    <div className="user-profile">
                        <button onClick={toggleTheme} className="theme-toggle" title="Ubah Tema" aria-label="Ubah tema">
                            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                        </button>

                        <span className="topbar-divider" />

                        <NavLink to="/profile" className="profile-chip" title="Profil Saya">
                            <div className="profile-info">
                                <span className="profile-name">{name}</span>
                                <span className="badge">{role}</span>
                            </div>
                            <div className="avatar">
                                {currentUserPhoto && !imgError ? (
                                    <img src={currentUserPhoto} alt={name} onError={() => setImgError(true)} />
                                ) : (
                                    <span>{initials}</span>
                                )}
                                <i className="avatar-dot" />
                            </div>
                        </NavLink>
                    </div>
                </header>

                <main className="content-area">
                    {children}
                </main>
            </div>
        </div>
    );
}