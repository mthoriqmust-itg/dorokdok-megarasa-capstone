import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Heart, MessageCircle, Image as ImageIcon, Send, X, Pin, Trash2, Edit, Megaphone, ChevronLeft, ChevronRight, MoreVertical, Bold } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import './Community.css';

const getRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return `${diffInSeconds} dtk lalu`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} mnt lalu`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} jam lalu`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays <= 3) return `${diffInDays} hari lalu`;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function Community() {
    const [posts, setPosts] = useState([]);
    const [chats, setChats] = useState([]);
    const [newPost, setNewPost] = useState('');
    const [postImages, setPostImages] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [postType, setPostType] = useState('normal');
    const [lightbox, setLightbox] = useState({ isOpen: false, images: [], index: 0 });
    
    const [commentText, setCommentText] = useState({});
    const [replyTo, setReplyTo] = useState(null); 
    
    // State Edit Post & Comment
    const [editPostId, setEditPostId] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [editCommentId, setEditCommentId] = useState(null);
    const [editCommentContent, setEditCommentContent] = useState('');
    
    const [chatMessage, setChatMessage] = useState('');

    const [commentLimits, setCommentLimits] = useState({}); 
    const [replyLimits, setReplyLimits] = useState({}); 
    const [expandedPosts, setExpandedPosts] = useState({}); // State untuk Lihat Selengkapnya Caption
    const [openMenuId, setOpenMenuId] = useState(null);

    const role = localStorage.getItem('role');
    const name = localStorage.getItem('name');
    const userId = localStorage.getItem('id');
    const savedPhoto = localStorage.getItem('photo_url');
    const hasValidPhoto = savedPhoto && savedPhoto !== 'undefined' && savedPhoto !== 'null';
    const currentUserPhoto = hasValidPhoto ? `http://localhost:5000${savedPhoto}` : `https://ui-avatars.com/api/?name=${name}`;
    
    const chatContainerRef = useRef(null);
    const prevChatLength = useRef(0);
    const commentInputRefs = useRef({});
    const textareaRef = useRef(null); // Ref untuk toolbar Bold

    const fetchPosts = async () => {
        try {
            const res = await api.get('/community/posts');
            setPosts(res.data);
        } catch (error) { console.error(error); }
    };

    const fetchChats = async () => {
        try {
            const res = await api.get('/community/chats');
            setChats(res.data);
        } catch (error) { console.error(error); }
    };

    useEffect(() => {
        fetchPosts();
        fetchChats();
        const interval = setInterval(fetchChats, 3000); 
        
        const handleClickOutside = (e) => {
            if (!e.target.closest('.post-menu-container')) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('click', handleClickOutside);

        return () => {
            clearInterval(interval);
            document.removeEventListener('click', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (chats.length > prevChatLength.current) {
            const container = chatContainerRef.current;
            if (container) {
                const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
                if (isAtBottom) {
                    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
                }
            }
            prevChatLength.current = chats.length;
        }
    }, [chats]);

    // --- FUNGSI TOOLBAR BOLD ---
    const insertBoldText = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const before = text.substring(0, start);
        const selected = text.substring(start, end);
        const after = text.substring(end, text.length);

        const newText = `${before}**${selected || 'teks tebal'}**${after}`;
        setNewPost(newText);
        
        // Fokus kembali ke textarea setelah di-klik
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 2, start + 2 + (selected.length || 10));
        }, 0);
    };

    // --- POSTINGAN ---
    const handleImageChange = (e) => {
        const files = Array.from(e.target.files);
        if (postImages.length + files.length > 10) return alert('Maksimal 10 foto!');
        const newPreviews = files.map(file => URL.createObjectURL(file));
        setPostImages([...postImages, ...files]);
        setImagePreviews([...imagePreviews, ...newPreviews]);
    };

    const removeImage = (index) => {
        setPostImages(postImages.filter((_, i) => i !== index));
        setImagePreviews(imagePreviews.filter((_, i) => i !== index));
    };

    const submitPost = async (e) => {
        e.preventDefault();
        if (!newPost.trim() && postImages.length === 0) return;
        const formData = new FormData();
        formData.append('content', newPost);
        formData.append('post_type', postType);
        postImages.forEach(img => formData.append('images', img));
        try {
            await api.post('/community/posts', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setNewPost(''); setPostImages([]); setImagePreviews([]); setPostType('normal');
            fetchPosts();
        } catch (error) { alert('Gagal posting'); }
    };

    const handleLike = async (postId) => {
        try {
            await api.put(`/community/posts/${postId}/like`);
            fetchPosts();
        } catch (error) { console.error(error); }
    };

    const handleDeletePost = async (id) => {
        setOpenMenuId(null);
        if(window.confirm('Hapus postingan ini?')) {
            await api.delete(`/community/posts/${id}`);
            fetchPosts();
        }
    };

    const handleEditPost = async (id) => {
        try {
            await api.put(`/community/posts/${id}`, { content: editContent });
            setEditPostId(null);
            fetchPosts();
        } catch (error) { alert(error.response?.data?.message || 'Gagal edit'); }
    };

    // --- KOMENTAR ---
    const scrollToComment = (postId) => {
        commentInputRefs.current[postId]?.focus();
        commentInputRefs.current[postId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const submitComment = async (postId) => {
        if (!commentText[postId]?.trim()) return;
        try {
            await api.post(`/community/posts/${postId}/comments`, { 
                content: commentText[postId],
                parent_id: replyTo?.id || null
            });
            setCommentText({ ...commentText, [postId]: '' });
            setReplyTo(null);
            fetchPosts();
        } catch (error) { alert('Gagal komentar'); }
    };

    const handleEditComment = async (commentId) => {
        try {
            await api.put(`/community/comments/${commentId}`, { content: editCommentContent });
            setEditCommentId(null);
            fetchPosts();
        } catch (error) { alert(error.response?.data?.message || 'Gagal edit komentar'); }
    };

    const handleDeleteComment = async (commentId) => {
        if(window.confirm('Hapus komentar ini?')) {
            await api.delete(`/community/comments/${commentId}`);
            fetchPosts();
        }
    };

    const handlePinComment = async (commentId, currentStatus) => {
        await api.put(`/community/comments/${commentId}/pin`, { is_pinned: !currentStatus });
        fetchPosts();
    };

    const handleLikeComment = async (commentId) => {
        await api.put(`/community/comments/${commentId}/like`);
        fetchPosts();
    };

    // --- CHAT ---
    const sendChat = async (e) => {
        e.preventDefault();
        if(!chatMessage.trim()) return;
        try {
            await api.post('/community/chats', { message: chatMessage });
            setChatMessage('');
            fetchChats();
        } catch (error) { console.error(error); }
    };

    const getRepliesForRoot = (rootId, allComments) => {
        const descendants = [];
        const queue = [rootId];
        while (queue.length > 0) {
            const currentId = queue.shift();
            const children = allComments.filter(c => c.parent_id === currentId);
            children.forEach(child => {
                descendants.push(child);
                queue.push(child.id); 
            });
        }
        return descendants;
    };

    const renderComment = (comment, post, isReply = false) => {
        const isPostAuthor = comment.user_id == post.user_id;
        const isOwner = userId == comment.user_id;
        
        // Cek waktu (5 menit = 300000 ms)
        const isEditable = isOwner && (new Date() - new Date(comment.created_at)) < 300000;
        const isEdited = new Date(comment.updated_at).getTime() > new Date(comment.created_at).getTime() + 1000;
        
        return (
            <div key={comment.id} className={`comment-wrapper ${isReply ? 'is-reply' : ''}`}>
                {comment.is_pinned === 1 && !isReply && <div className="pinned-badge"><Pin size={12}/> Disematkan</div>}
                
                <div className="comment-main">
                    <img src={comment.photo_url ? `http://localhost:5000${comment.photo_url}` : `https://ui-avatars.com/api/?name=${comment.name}`} alt="avatar" className={isReply ? "avatar-xs" : "avatar-sm"} />
                    <div className="comment-content">
                        {editCommentId === comment.id ? (
                            <div className="edit-comment-area">
                                <input 
                                    type="text" 
                                    value={editCommentContent} 
                                    onChange={(e) => setEditCommentContent(e.target.value)}
                                    autoFocus
                                />
                                <div className="edit-comment-actions">
                                    <button className="btn-secondary" onClick={() => setEditCommentId(null)}>Batal</button>
                                    <button className="btn-primary" onClick={() => handleEditComment(comment.id)}>Simpan</button>
                                </div>
                            </div>
                        ) : (
                            <div className="comment-bubble">
                                <div className="comment-header">
                                    <strong>{comment.name}</strong>
                                    {isPostAuthor && <span className="badge-label pemosting">PEMOSTING</span>}
                                    {comment.role === 'admin' && <span className="badge-label admin">ADMIN</span>}
                                    {isEdited && <span className="comment-edited">(Diedit)</span>}
                                </div>
                                <p>
                                    {comment.reply_to_name && <span className="mention-tag">@{comment.reply_to_name} </span>}
                                    {comment.content}
                                </p>
                            </div>
                        )}
                        <div className="comment-actions">
                            <button onClick={() => handleLikeComment(comment.id)} className={comment.is_liked ? 'liked' : ''}>
                                <Heart size={12} fill={comment.is_liked ? "currentColor" : "none"} /> {comment.like_count || 0}
                            </button>
                            <button onClick={() => {
                                setReplyTo({ id: comment.id, name: comment.name });
                                scrollToComment(post.id);
                            }}>Balas</button>
                            
                            {isEditable && editCommentId !== comment.id && (
                                <button onClick={() => { setEditCommentId(comment.id); setEditCommentContent(comment.content); }}>Edit</button>
                            )}

                            {!isReply && (userId == post.user_id || role === 'admin') && (
                                <button onClick={() => handlePinComment(comment.id, comment.is_pinned)}>
                                    {comment.is_pinned ? 'Lepas Pin' : 'Pin'}
                                </button>
                            )}
                            
                            {(role === 'admin' || isOwner || userId == post.user_id) && (
                                <button onClick={() => handleDeleteComment(comment.id)} className="text-red">Hapus</button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="community-layout">
            {lightbox.isOpen && (
                <div className="lightbox" onClick={() => setLightbox({ ...lightbox, isOpen: false })}>
                    <button className="lightbox-close" onClick={() => setLightbox({ ...lightbox, isOpen: false })}><X size={32}/></button>
                    {lightbox.images.length > 1 && (
                        <button className="lightbox-nav prev" onClick={(e) => { e.stopPropagation(); setLightbox({...lightbox, index: (lightbox.index - 1 + lightbox.images.length) % lightbox.images.length})}}>
                            <ChevronLeft size={48} />
                        </button>
                    )}
                    <motion.img 
                        key={lightbox.index} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}
                        src={`http://localhost:5000${lightbox.images[lightbox.index]}`} alt="Full" className="lightbox-img" onClick={(e) => e.stopPropagation()} 
                    />
                    {lightbox.images.length > 1 && (
                        <button className="lightbox-nav next" onClick={(e) => { e.stopPropagation(); setLightbox({...lightbox, index: (lightbox.index + 1) % lightbox.images.length})}}>
                            <ChevronRight size={48} />
                        </button>
                    )}
                    {lightbox.images.length > 1 && <div className="lightbox-counter">{lightbox.index + 1} / {lightbox.images.length}</div>}
                </div>
            )}

            <div className="community-feed">
                {/* CREATE POST */}
                <div className="create-post-card">
                    <div className="post-header">
                        <img src={currentUserPhoto} alt="avatar" className="avatar" />
                        <textarea 
                            ref={textareaRef}
                            placeholder={`Apa yang kamu pikirkan hari ini, ${name}? (Mendukung format **bold** atau *italic*)`} 
                            value={newPost} onChange={(e) => setNewPost(e.target.value)} 
                        />
                    </div>
                    {imagePreviews.length > 0 && (
                        <div className={`image-preview-grid count-${Math.min(imagePreviews.length, 4)}`}>
                            {imagePreviews.slice(0, 4).map((img, idx) => (
                                <div key={idx} className="preview-item">
                                    <img src={img} alt="preview" />
                                    <button onClick={() => removeImage(idx)} className="btn-remove-img"><X size={14}/></button>
                                    {idx === 3 && imagePreviews.length > 4 && <div className="more-overlay">+{imagePreviews.length - 4}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="post-actions">
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <label className="btn-upload-image">
                                <ImageIcon size={20} /> <span>Upload ({imagePreviews.length}/10)</span>
                                <input type="file" accept="image/*" multiple onChange={handleImageChange} hidden />
                            </label>
                            {/* TOOLBAR BOLD */}
                           <button type="button" className="btn-toolbar" onClick={insertBoldText} title="Bold">
                               <strong>  <Bold size={18} /></strong>
                            </button>
                        </div>
                        {role === 'admin' && (
                            <select className="type-select" value={postType} onChange={(e) => setPostType(e.target.value)}>
                                <option value="normal">Postingan Biasa</option>
                                <option value="announcement">📢 Pengumuman</option>
                            </select>
                        )}
                        <button onClick={submitPost} className="btn-primary"><Send size={16}/> Posting</button>
                    </div>
                </div>

                {/* FEED POSTS */}
                <div className="posts-feed">
                    {posts.map(post => {
                        const rootComments = post.comments.filter(c => !c.parent_id);
                        const currentLimit = commentLimits[post.id] || 5;
                        const visibleComments = rootComments.slice(0, currentLimit);
                        const isEdited = new Date(post.updated_at).getTime() !== new Date(post.created_at).getTime();
                        
                        // TRUNCATE CAPTION (250 KARAKTER)
                        const isContentLong = post.content.length > 250;
                        const displayContent = expandedPosts[post.id] ? post.content : post.content.substring(0, 250) + (isContentLong ? '...' : '');

                        return (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={post.id} className={`post-card ${post.post_type === 'announcement' ? 'is-announcement' : ''}`}>
                                
                                {post.post_type === 'announcement' && (
                                    <div className="announcement-banner">
                                        <Megaphone size={18} className="megaphone-icon" /> PENGUMUMAN PENTING
                                    </div>
                                )}

                                <div className="post-header">
                                    <img src={post.photo_url ? `http://localhost:5000${post.photo_url}` : `https://ui-avatars.com/api/?name=${post.name}`} alt="avatar" className="avatar" />
                                    <div className="post-info">
                                        <div className="name-role">
                                            <strong>{post.name}</strong>
                                            {post.role === 'admin' && <span className="badge-label admin">Admin</span>}
                                        </div>
                                        <span className="post-motto">"{post.motto || 'Tidak ada moto'}"</span>
                                        <div className="post-time-wrapper">
                                            <span className="post-time">{getRelativeTime(post.created_at)}</span>
                                            {isEdited && <span className="post-edited">(Diedit)</span>}
                                        </div>
                                    </div>
                                    
                                    {/* MENU TITIK TIGA */}
                                    <div className="post-menu-container">
                                        {(userId == post.user_id || role === 'admin') && (
                                            <>
                                                <button className="btn-icon" onClick={() => setOpenMenuId(openMenuId === post.id ? null : post.id)}>
                                                    <MoreVertical size={20} />
                                                </button>
                                                <AnimatePresence>
                                                    {openMenuId === post.id && (
                                                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="dropdown-menu">
                                                            {userId == post.user_id && (new Date() - new Date(post.created_at)) < 86400000 && (
                                                                <button onClick={() => { setEditPostId(post.id); setEditContent(post.content); setOpenMenuId(null); }}>
                                                                    <Edit size={14}/> Edit Postingan
                                                                </button>
                                                            )}
                                                            <button className="text-red" onClick={() => handleDeletePost(post.id)}>
                                                                <Trash2 size={14}/> Hapus Postingan
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {editPostId === post.id ? (
                                    <div className="edit-post-area">
                                        <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                                        <div className="edit-actions">
                                            <button className="btn-secondary" onClick={() => setEditPostId(null)}>Batal</button>
                                            <button className="btn-primary" onClick={() => handleEditPost(post.id)}>Simpan</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="post-content markdown-body">
                                        <ReactMarkdown>
                                            {displayContent}
                                        </ReactMarkdown>
                                        {isContentLong && (
                                            <button 
                                                className="btn-see-more" 
                                                onClick={() => setExpandedPosts({...expandedPosts, [post.id]: !expandedPosts[post.id]})}
                                            >
                                                {expandedPosts[post.id] ? 'Lihat lebih sedikit' : 'Lihat selengkapnya'}
                                            </button>
                                        )}
                                    </div>
                                )}
                                
                                {post.images && post.images.length > 0 && (
                                    <div className={`image-preview-grid count-${Math.min(post.images.length, 4)}`}>
                                        {post.images.slice(0, 4).map((img, idx) => (
                                            <div key={idx} className="grid-item" onClick={() => setLightbox({ isOpen: true, images: post.images, index: idx })}>
                                                <img src={`http://localhost:5000${img}`} alt="post" />
                                                {idx === 3 && post.images.length > 4 && <div className="more-overlay">+{post.images.length - 4}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="post-stats">
                                    <span>{post.like_count} Suka</span>
                                    <span>{rootComments.length} Komentar</span>
                                </div>
                                <div className="post-buttons">
                                    <button className={`btn-action ${post.is_liked ? 'liked' : ''}`} onClick={() => handleLike(post.id)}>
                                        <Heart size={18} fill={post.is_liked ? "currentColor" : "none"} /> Suka
                                    </button>
                                    <button className="btn-action" onClick={() => scrollToComment(post.id)}>
                                        <MessageCircle size={18} /> Komentar
                                    </button>
                                </div>

                                <div className="comments-section">
                                    {visibleComments.map(rootComment => {
                                        const replies = getRepliesForRoot(rootComment.id, post.comments);
                                        const currentReplyLimit = replyLimits[rootComment.id] || 2;
                                        const visibleReplies = replies.slice(0, currentReplyLimit);

                                        return (
                                            <div key={rootComment.id} className="root-comment-block">
                                                {renderComment(rootComment, post, false)}
                                                {replies.length > 0 && (
                                                    <div className="replies-container">
                                                        {visibleReplies.map(reply => renderComment(reply, post, true))}
                                                        {replies.length > currentReplyLimit && (
                                                            <button className="btn-view-more" onClick={() => setReplyLimits({...replyLimits, [rootComment.id]: currentReplyLimit + 3})}>
                                                                Lihat balasan lainnya...
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {rootComments.length > currentLimit && (
                                        <button className="btn-view-more" onClick={() => setCommentLimits({...commentLimits, [post.id]: currentLimit + 5})}>
                                            Lihat semua komentar ({rootComments.length - currentLimit} lainnya)...
                                        </button>
                                    )}
                                    
                                    <div className="comment-input-wrapper">
                                        {replyTo && (
                                            <div className="reply-indicator">
                                                Membalas @{replyTo.name} <button onClick={() => setReplyTo(null)}><X size={12}/></button>
                                            </div>
                                        )}
                                        <div className="input-row">
                                            <img src={currentUserPhoto} alt="avatar" className="avatar-sm" />
                                            <input 
                                                type="text" 
                                                placeholder={replyTo ? `Balas @${replyTo.name}...` : "Tulis komentar..."} 
                                                value={commentText[post.id] || ''}
                                                onChange={(e) => setCommentText({ ...commentText, [post.id]: e.target.value })}
                                                onKeyDown={(e) => e.key === 'Enter' && submitComment(post.id)}
                                                ref={(el) => commentInputRefs.current[post.id] = el}
                                            />
                                            <button className="btn-send-comment" onClick={() => submitComment(post.id)}>
                                                <Send size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* KOLOM KANAN: OBROLAN UMUM */}
            <div className="community-chat">
                <div className="chat-header"><MessageCircle size={18} /> Obrolan Umum</div>
                <div className="chat-messages" ref={chatContainerRef}>
                    {chats.map(chat => {
                        const isOwn = chat.user_id == userId;
                        return (
                            <div key={chat.id} className={`chat-bubble-wrapper ${isOwn ? 'own' : ''}`}>
                                {!isOwn && <img src={chat.photo_url ? `http://localhost:5000${chat.photo_url}` : `https://ui-avatars.com/api/?name=${chat.name}`} alt="avatar" className="avatar-xs" />}
                                <div className="chat-bubble">
                                    {!isOwn && <span className="chat-name">{chat.name} {chat.role === 'admin' && '👑'}</span>}
                                    <div className="chat-text">{chat.message}</div>
                                    <span className="chat-time">{getRelativeTime(chat.created_at)}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <form onSubmit={sendChat} className="chat-input-area">
                    <input type="text" placeholder="Ketik pesan..." value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} />
                    <button type="submit"><Send size={16} /></button>
                </form>
            </div>
        </div>
    );
}