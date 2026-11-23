import { useState, useEffect, useRef, useCallback, useContext, useMemo, createContext, memo } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import { Send, Pin, Edit, Trash2, Plus, Download, Copy, Check, Maximize2, ZoomIn, ZoomOut, X, ArrowDown, Sparkles, ImageOff, RotateCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './AIAssistant.css';

/* ==========================================================================
   KONSTANTA & HELPER
   ========================================================================== */
const SUGGESTIONS = [
    { label: 'Performa', text: 'Ringkasan performa bisnis bulan ini' },
    { label: 'Grafik', text: 'Grafik pemasukan, pengeluaran & laba 10 hari terakhir' },
    { label: 'Prediksi', text: 'Prediksi pendapatan 2 minggu ke depan' },
    { label: 'Kesehatan', text: 'Bisnis saya sehat nggak? Ada risiko apa?' },
    { label: 'Produk', text: 'Produk apa yang paling laku?' },
    { label: 'Audit', text: 'Ada transaksi yang janggal nggak?' },
];

const IMG_REGEX = /!\[[^\]]*\]\([^)]+\)/;
const IMG_SPLIT = /(!\[[^\]]*\]\([^)]*\))/g;
const IMG_FULL = /^!\[[^\]]*\]\([^)]*\)$/;

const hasMedia = (text = '') => IMG_REGEX.test(text);

// Pecah teks jadi "unit" ketikan. Sintaks gambar dijadikan 1 unit utuh supaya
// tidak ada kode markdown setengah jadi yang berkedip saat efek mengetik.
const buildUnits = (text) =>
    text.split(IMG_SPLIT).flatMap((part) => (IMG_FULL.test(part) ? [part] : Array.from(part)));

const slugify = (s) =>
    String(s || 'grafik')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'grafik';

const makeFileName = (title, src) => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    const ext = (String(src).split('?')[0].match(/\.(png|jpe?g|webp|gif|svg)$/i) || [, 'png'])[1].toLowerCase();
    return `Dorokdok_${slugify(title)}_${stamp}.${ext}`;
};

// Unduh gambar. Jika browser memblokir fetch (CORS), fallback membuka gambar di tab baru.
async function downloadImage(src, title) {
    try {
        const res = await fetch(src, { mode: 'cors' });
        if (!res.ok) throw new Error('Gagal mengambil gambar');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = makeFileName(title, src);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        return true;
    } catch (err) {
        window.open(src, '_blank', 'noopener,noreferrer');
        return false;
    }
}

const formatTime = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

/* ==========================================================================
   KONTEKS MEDIA (supaya komponen gambar stabil & tidak remount saat mengetik)
   ========================================================================== */
const MediaContext = createContext({ openLightbox: () => {}, onMediaLoad: () => {} });

/* ==========================================================================
   KARTU GRAFIK
   ========================================================================== */
function ChartImage({ src, alt }) {
    const { openLightbox, onMediaLoad } = useContext(MediaContext);
    const [status, setStatus] = useState('loading'); // loading | loaded | error
    const [size, setSize] = useState(null);
    const [dl, setDl] = useState('idle'); // idle | loading | done
    const [attempt, setAttempt] = useState(0);

    if (!src) return null;

    const title = (alt || 'Grafik').trim();
    const url = attempt ? `${src}${src.includes('?') ? '&' : '?'}r=${attempt}` : src;
    const isWide = size && size.w / size.h > 1.55;

    const handleLoad = (e) => {
        setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
        setStatus('loaded');
        onMediaLoad();
    };

    const handleDownload = async (e) => {
        e.stopPropagation();
        if (dl === 'loading') return;
        setDl('loading');
        const ok = await downloadImage(url, title);
        setDl(ok ? 'done' : 'idle');
        if (ok) setTimeout(() => setDl('idle'), 2000);
    };

    const open = () => status === 'loaded' && openLightbox({ src: url, title, size });

    const cls = ['chart-card', status === 'loaded' ? 'is-loaded' : '', status === 'error' ? 'is-error' : '', isWide ? 'is-wide' : '']
        .filter(Boolean).join(' ');

    return (
        <span className={cls}>
            <span className="chart-card__bar">
                <span className="chart-card__title">
                    <i className="chart-card__dot" />
                    <span>{title}</span>
                </span>
                {status === 'loaded' && (
                    <span className="chart-card__actions">
                        <button type="button" className="chart-btn chart-btn--icon" onClick={open} title="Perbesar" aria-label="Perbesar gambar">
                            <Maximize2 size={14} />
                        </button>
                        <button
                            type="button"
                            className={`chart-btn chart-btn--primary ${dl === 'done' ? 'is-done' : ''}`}
                            onClick={handleDownload}
                            disabled={dl === 'loading'}
                            title="Unduh gambar"
                            aria-label="Unduh gambar"
                        >
                            {dl === 'done' ? <Check size={14} /> : <Download size={14} className={dl === 'loading' ? 'spin' : ''} />}
                            <span>{dl === 'done' ? 'Tersimpan' : 'Unduh'}</span>
                        </button>
                    </span>
                )}
            </span>

            {status === 'error' ? (
                <span className="chart-card__frame">
                    <ImageOff size={26} />
                    <span>Grafik tidak dapat dimuat</span>
                    <button
                        type="button"
                        className="chart-btn"
                        onClick={() => { setStatus('loading'); setAttempt((n) => n + 1); }}
                    >
                        <RotateCw size={13} /> <span>Coba lagi</span>
                    </button>
                </span>
            ) : (
                <span className="chart-card__frame" onClick={open}>
                    {status === 'loading' && <span className="chart-skeleton" />}
                    <img
                        className="chart-card__img"
                        src={url}
                        alt={title}
                        loading="lazy"
                        decoding="async"
                        onLoad={handleLoad}
                        onError={() => setStatus('error')}
                    />
                    {status === 'loaded' && (
                        <span className="chart-card__hint"><Maximize2 size={12} /> Perbesar</span>
                    )}
                </span>
            )}

            {status === 'loaded' && size && (
                <span className="chart-card__foot">
                    <span><b>{size.w} × {size.h}</b> px</span>
                    <span className="chart-card__chip">{(url.split('?')[0].split('.').pop() || 'png').toUpperCase()}</span>
                </span>
            )}
        </span>
    );
}

// Komponen markdown dibuat di luar komponen utama agar identitasnya stabil.
const mdComponents = {
    img: ChartImage,
    // eslint-disable-next-line no-unused-vars
    a: ({ node, children, ...props }) => (
        <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
    ),
    // eslint-disable-next-line no-unused-vars
    table: ({ node, ...props }) => (
        <div className="md-table-wrap"><table {...props} /></div>
    ),
};

/* ==========================================================================
   LIGHTBOX
   ========================================================================== */
function Lightbox({ item, onClose }) {
    const [zoomed, setZoomed] = useState(false);
    const [dl, setDl] = useState('idle');

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [onClose]);

    const handleDownload = async () => {
        if (dl === 'loading') return;
        setDl('loading');
        const ok = await downloadImage(item.src, item.title);
        setDl(ok ? 'done' : 'idle');
        if (ok) setTimeout(() => setDl('idle'), 2000);
    };

    return createPortal(
        <div className="ai-lightbox" role="dialog" aria-modal="true" aria-label={item.title} onClick={onClose}>
            <div className="ai-lightbox__bar" onClick={(e) => e.stopPropagation()}>
                <div className="ai-lightbox__title">
                    <i className="chart-card__dot" />
                    <span>{item.title}{item.size ? `  ·  ${item.size.w} × ${item.size.h} px` : ''}</span>
                </div>
                <div className="ai-lightbox__actions">
                    <button type="button" className="ai-lb-btn ai-lb-btn--icon" onClick={() => setZoomed((z) => !z)} title={zoomed ? 'Perkecil' : 'Ukuran asli'} aria-label="Zoom">
                        {zoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
                    </button>
                    <button type="button" className="ai-lb-btn ai-lb-btn--primary" onClick={handleDownload} disabled={dl === 'loading'}>
                        {dl === 'done' ? <Check size={15} /> : <Download size={15} />}
                        {dl === 'done' ? 'Tersimpan' : 'Unduh'}
                    </button>
                    <button type="button" className="ai-lb-btn ai-lb-btn--icon" onClick={onClose} title="Tutup (Esc)" aria-label="Tutup">
                        <X size={17} />
                    </button>
                </div>
            </div>

            <div className={`ai-lightbox__stage ${zoomed ? 'is-zoomed' : ''}`}>
                <img
                    className="ai-lightbox__img"
                    src={item.src}
                    alt={item.title}
                    onClick={(e) => { e.stopPropagation(); setZoomed((z) => !z); }}
                />
            </div>
            <p className="ai-lightbox__hint">Klik gambar untuk zoom · Esc untuk menutup</p>
        </div>,
        document.body
    );
}

/* ==========================================================================
   ITEM PESAN (memo: saat mengetik hanya pesan terakhir yang dirender ulang)
   ========================================================================== */
const MessageItem = memo(function MessageItem({ msg, isLast, isLiveTyping, userAvatar, aiAvatar }) {
    const isAssistant = msg.role === 'assistant';
    const [copied, setCopied] = useState(false);
    const typingNow = isAssistant && isLast && isLiveTyping;
    const media = isAssistant && hasMedia(msg.content);
    const time = formatTime(msg.created_at);

    const handleCopy = async () => {
        try {
            const clean = (msg.content || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim();
            await navigator.clipboard.writeText(clean);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch (e) { /* clipboard bisa diblokir, abaikan */ }
    };

    return (
        <div className={`ai-msg-wrapper ${msg.role} ${media ? 'has-media' : ''}`}>
            <img src={isAssistant ? aiAvatar : userAvatar} alt="avatar" className="ai-avatar-img" />
            <div className="ai-msg-col">
                <div className={`ai-bubble ${msg.role}`}>
                    {isAssistant ? (
                        <div className="markdown-body">
                            <ReactMarkdown components={mdComponents}>{msg.content}</ReactMarkdown>
                            {typingNow && <span className="cursor-blink" />}
                        </div>
                    ) : (
                        msg.content
                    )}
                </div>
                {!typingNow && (time || isAssistant) && (
                    <div className="ai-msg-meta">
                        {time && <span>{time}</span>}
                        {isAssistant && msg.content && (
                            <button type="button" className={`ai-msg-meta__btn ${copied ? 'is-done' : ''}`} onClick={handleCopy}>
                                {copied ? <Check size={12} /> : <Copy size={12} />}
                                {copied ? 'Tersalin' : 'Salin'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

/* ==========================================================================
   KOMPONEN UTAMA
   ========================================================================== */
export default function AIAssistant() {
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isLiveTyping, setIsLiveTyping] = useState(false);
    const [lightbox, setLightbox] = useState(null);
    const [showJump, setShowJump] = useState(false);

    const listRef = useRef(null);
    const inputRef = useRef(null);
    const typingRef = useRef(null);
    const stickRef = useRef(true);        // true = auto-scroll mengikuti pesan terbaru
    const skipLoadRef = useRef(false);    // lewati fetch pesan saat sesi baru dibuat otomatis
    const activeIdRef = useRef(null);

    // Ambil data user dari localStorage
    const name = localStorage.getItem('name');
    const photo = localStorage.getItem('photo_url');
    const userAvatar = photo && photo !== 'NULL' && photo !== 'undefined'
        ? `http://localhost:5000${photo}`
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}`;

    const aiAvatar = 'http://localhost:5000/uploads/lol.png';
    const busy = isTyping || isLiveTyping;

    /* ---------- scroll ---------- */
    const scrollToBottom = useCallback((smooth = true) => {
        const el = listRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }, []);

    const handleScroll = () => {
        const el = listRef.current;
        if (!el) return;
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickRef.current = dist < 120;
        setShowJump(dist > 260);
    };

    const closeLightbox = useCallback(() => setLightbox(null), []);

    const mediaCtx = useMemo(() => ({
        openLightbox: setLightbox,
        onMediaLoad: () => { if (stickRef.current) scrollToBottom(false); },
    }), [scrollToBottom]);

    /* ---------- data ---------- */
    const fetchSessions = async () => {
        try {
            const res = await api.get('/chat/sessions');
            setSessions(res.data);
        } catch (e) { /* biarkan sidebar tetap */ }
    };

    useEffect(() => { fetchSessions(); }, []);
    useEffect(() => () => clearInterval(typingRef.current), []);

    useEffect(() => {
        activeIdRef.current = activeSession?.id ?? null;
        clearInterval(typingRef.current);

        if (skipLoadRef.current) { // sesi baru dibuat saat kirim pesan: jangan timpa pesan optimistis
            skipLoadRef.current = false;
            return;
        }
        setIsLiveTyping(false);

        if (activeSession) {
            api.get(`/chat/sessions/${activeSession.id}/messages`).then((res) => {
                setMessages(res.data);
                stickRef.current = true;
                requestAnimationFrame(() => scrollToBottom(false));
            });
        } else {
            setMessages([]);
        }
    }, [activeSession, scrollToBottom]);

    useEffect(() => {
        if (stickRef.current) scrollToBottom(!isLiveTyping);
    }, [messages, isTyping, isLiveTyping, scrollToBottom]);

    useEffect(() => { // fokus kembali ke input setelah AI selesai menjawab
        if (!busy) inputRef.current?.focus();
    }, [busy]);

    /* ---------- efek mengetik ---------- */
    const startTypewriter = (fullText) => {
        const units = buildUnits(fullText);
        const step = units.length > 900 ? 4 : units.length > 450 ? 2 : 1;
        let i = 0;
        let acc = '';

        setIsLiveTyping(true);
        setMessages((prev) => [...prev, { role: 'assistant', content: '', created_at: new Date().toISOString() }]);

        clearInterval(typingRef.current);
        typingRef.current = setInterval(() => {
            acc += units.slice(i, i + step).join('');
            i += step;
            const snapshot = acc;
            setMessages((prev) => {
                const copy = prev.slice();
                const last = copy.length - 1;
                if (last >= 0 && copy[last].role === 'assistant') copy[last] = { ...copy[last], content: snapshot };
                return copy;
            });
            if (i >= units.length) {
                clearInterval(typingRef.current);
                setIsLiveTyping(false);
                fetchSessions(); // refresh sidebar untuk dapat judul baru
            }
        }, 12);
    };

    /* ---------- kirim pesan ---------- */
    const submitMessage = async (rawText) => {
        const userMsg = (rawText || '').trim();
        if (!userMsg || busy) return;

        setInput('');
        stickRef.current = true;

        let currentSessionId = activeSession?.id;

        // JIKA BELUM ADA SESI, BUAT OTOMATIS
        if (!currentSessionId) {
            try {
                const res = await api.post('/chat/sessions');
                const newSession = res.data;
                skipLoadRef.current = true;
                activeIdRef.current = newSession.id;
                setSessions((prev) => [newSession, ...prev]);
                setActiveSession(newSession);
                currentSessionId = newSession.id;
            } catch (error) {
                alert('Gagal membuat sesi baru');
                return;
            }
        }

        // Tampilkan pesan user
        setMessages((prev) => [...prev, { role: 'user', content: userMsg, created_at: new Date().toISOString() }]);
        setIsTyping(true);

        try {
            const res = await api.post('/chat/message', {
                sessionId: currentSessionId,
                message: userMsg,
                userName: name,
            });
            setIsTyping(false);

            // User sudah pindah sesi saat menunggu: jawaban tetap tersimpan di DB, tidak perlu diketik di layar
            if (activeIdRef.current !== currentSessionId) { fetchSessions(); return; }

            startTypewriter(res.data.response || '');
        } catch (error) {
            setIsTyping(false);
            setIsLiveTyping(false);
            setMessages((prev) => [...prev, { role: 'assistant', content: 'Maaf, sistem AI sedang sibuk.', created_at: new Date().toISOString() }]);
        }
    };

    const handleSend = (e) => { e.preventDefault(); submitMessage(input); };

    /* ---------- sesi ---------- */
    const handleNewChat = () => {
        clearInterval(typingRef.current);
        setIsLiveTyping(false);
        setActiveSession(null);
        setMessages([]);
    };
    const handleRename = async (id, oldTitle) => {
        const newTitle = prompt('Ubah judul obrolan:', oldTitle);
        if (newTitle) { await api.put(`/chat/sessions/${id}`, { title: newTitle }); fetchSessions(); }
    };
    const handlePin = async (id, currentPin) => { await api.put(`/chat/sessions/${id}`, { is_pinned: !currentPin }); fetchSessions(); };
    const handleDelete = async (id) => {
        if (window.confirm('Hapus obrolan ini?')) {
            await api.delete(`/chat/sessions/${id}`);
            if (activeSession?.id === id) setActiveSession(null);
            fetchSessions();
        }
    };

    /* ---------- render ---------- */
    return (
        <MediaContext.Provider value={mediaCtx}>
            <div className="ai-layout">
                {/* KIRI: AREA CHAT */}
                <div className="ai-chat-area">
                    <div className="ai-chat-header">
                        <div className="ai-chat-header__avatar">
                            <img src={aiAvatar} alt="AI" />
                            <span className="ai-status-dot" />
                        </div>
                        <div className="ai-chat-header__text">
                            <h2>Asisten Bisnis Dorokdok</h2>
                            <p>Analisis keuangan & saran bisnis berbasis data</p>
                        </div>
                        <span className="ai-chat-header__badge"><Sparkles size={12} /> Berbasis Data</span>
                    </div>

                    <div className="ai-chat-messages" ref={listRef} onScroll={handleScroll}>
                        {messages.length === 0 && !isTyping && (
                            <div className="ai-empty-state">
                                <div className="ai-empty-avatar">
                                    <img src={aiAvatar} alt="AI" />
                                </div>
                                <h3>Ada yang bisa dibantu, {name || 'Bos'}?</h3>
                                <p>Tanya apa saja soal keuangan, produk, dan performa bisnismu</p>
                                <div className="ai-suggestions">
                                    {SUGGESTIONS.map((s, i) => (
                                        <button
                                            key={s.label}
                                            type="button"
                                            className="ai-suggestion"
                                            style={{ '--i': i }}
                                            disabled={busy}
                                            onClick={() => submitMessage(s.text)}
                                        >
                                            <span className="ai-suggestion__label">{s.label}</span>
                                            <span className="ai-suggestion__text">{s.text}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <MessageItem
                                key={msg.id ?? `${msg.role}-${idx}`}
                                msg={msg}
                                isLast={idx === messages.length - 1}
                                isLiveTyping={isLiveTyping}
                                userAvatar={userAvatar}
                                aiAvatar={aiAvatar}
                            />
                        ))}

                        {isTyping && (
                            <div className="ai-msg-wrapper assistant">
                                <img src={aiAvatar} alt="AI" className="ai-avatar-img" />
                                <div className="ai-bubble assistant typing">
                                    <span className="typing-dots"><i /><i /><i /></span>
                                    <span className="typing-label">Menganalisis data bisnis…</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {showJump && (
                        <button type="button" className="ai-jump-btn" onClick={() => { stickRef.current = true; scrollToBottom(true); }}>
                            <ArrowDown size={14} /> Pesan terbaru
                        </button>
                    )}

                    <form onSubmit={handleSend} className="ai-input-area">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Tanya sesuatu tentang bisnis Anda..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={busy}
                        />
                        <button type="submit" disabled={busy || !input.trim()} aria-label="Kirim pesan"><Send size={20} /></button>
                    </form>
                </div>

                {/* KANAN: SUB-SIDEBAR RIWAYAT */}
                <div className="ai-sidebar">
                    <div className="ai-sidebar-header">
                        <h3>Riwayat Obrolan</h3>
                        <button onClick={handleNewChat} className="btn-new-chat"><Plus size={16} /> Baru</button>
                    </div>
                    <div className="ai-sessions-list">
                        {sessions.length === 0 && (
                            <div className="ai-sessions-empty">Belum ada obrolan.<br />Mulai percakapan pertamamu.</div>
                        )}
                        {sessions.map((s) => (
                            <div
                                key={s.id}
                                className={`ai-session-item ${activeSession?.id === s.id ? 'active' : ''}`}
                                onClick={() => setActiveSession(s)}
                            >
                                <div className="session-title">
                                    {s.is_pinned ? <Pin size={12} className="text-gold" style={{ display: 'inline', marginRight: 4 }} /> : null}
                                    {s.title}
                                </div>
                                <div className="session-actions">
                                    <button title="Sematkan" onClick={(e) => { e.stopPropagation(); handlePin(s.id, s.is_pinned); }}><Pin size={14} /></button>
                                    <button title="Ubah judul" onClick={(e) => { e.stopPropagation(); handleRename(s.id, s.title); }}><Edit size={14} /></button>
                                    <button title="Hapus" onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {lightbox && <Lightbox item={lightbox} onClose={closeLightbox} />}
        </MediaContext.Provider>
    );
}