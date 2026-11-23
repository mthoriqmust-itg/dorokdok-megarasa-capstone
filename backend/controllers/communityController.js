const db = require('../config/db');

exports.getPosts = async (req, res) => {
    const userId = req.user.id;
    try {
        const query = `
            SELECT p.*, u.name, u.photo_url, u.motto, u.role,
            (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
            (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) as is_liked
            FROM posts p JOIN users u ON p.user_id = u.id 
            ORDER BY p.post_type = 'announcement' DESC, p.created_at DESC
        `;
        const [posts] = await db.query(query, [userId]);

        for (let post of posts) {
            post.images = post.images ? JSON.parse(post.images) : [];
            if (post.image_url) post.images.push(post.image_url);

            const [comments] = await db.query(
                `SELECT c.*, u.name, u.photo_url, u.role,
                (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) as like_count,
                (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = ?) as is_liked,
                pu.name as reply_to_name
                 FROM comments c 
                 JOIN users u ON c.user_id = u.id 
                 LEFT JOIN comments pc ON c.parent_id = pc.id
                 LEFT JOIN users pu ON pc.user_id = pu.id
                 WHERE c.post_id = ? 
                 ORDER BY c.is_pinned DESC, c.created_at ASC`, [userId, post.id]
            );
            post.comments = comments;
        }
        res.json(posts);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.createPost = async (req, res) => {
    const { content, post_type } = req.body;
    const userId = req.user.id;
    
    let imagesArr = [];
    if (req.files && req.files.length > 0) {
        imagesArr = req.files.map(file => `/uploads/${file.filename}`);
    }
    const imagesJson = JSON.stringify(imagesArr);
    const type = (req.user.role === 'admin' && post_type === 'announcement') ? 'announcement' : 'normal';
    
    try {
        await db.query('INSERT INTO posts (user_id, content, images, post_type) VALUES (?, ?, ?, ?)', [userId, content, imagesJson, type]);
        res.status(201).json({ message: 'Postingan berhasil dibuat' });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// FUNGSI BARU UNTUK LIKE POSTINGAN
exports.likePost = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        const [existing] = await db.query('SELECT * FROM likes WHERE post_id = ? AND user_id = ?', [id, userId]);
        if (existing.length > 0) {
            await db.query('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [id, userId]);
        } else {
            await db.query('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [id, userId]);
        }
        res.json({ message: 'Like berhasil' });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.editPost = async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    try {
        const [post] = await db.query('SELECT user_id, created_at FROM posts WHERE id = ?', [id]);
        if (post[0].user_id !== req.user.id) return res.status(403).json({ message: 'Akses ditolak' });
        const hoursDiff = Math.abs(new Date() - new Date(post[0].created_at)) / 36e5;
        if (hoursDiff > 24) return res.status(403).json({ message: 'Waktu edit (24 jam) sudah habis' });
        await db.query('UPDATE posts SET content = ? WHERE id = ?', [content, id]);
        res.json({ message: 'Postingan diupdate' });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.deletePost = async (req, res) => {
    const { id } = req.params;
    try {
        const [post] = await db.query('SELECT user_id FROM posts WHERE id = ?', [id]);
        if (req.user.role !== 'admin' && post[0].user_id !== req.user.id) {
            return res.status(403).json({ message: 'Akses ditolak' });
        }
        await db.query('DELETE FROM posts WHERE id = ?', [id]);
        res.json({ message: 'Postingan dihapus' });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.addComment = async (req, res) => {
    const { id } = req.params;
    const { content, parent_id } = req.body;
    try {
        await db.query('INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)', [id, req.user.id, content, parent_id || null]);
        res.status(201).json({ message: 'Komentar ditambahkan' });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.deleteComment = async (req, res) => {
    const { commentId } = req.params;
    try {
        const [comment] = await db.query('SELECT c.user_id, p.user_id as post_owner FROM comments c JOIN posts p ON c.post_id = p.id WHERE c.id = ?', [commentId]);
        if (req.user.role !== 'admin' && comment[0].user_id !== req.user.id && comment[0].post_owner !== req.user.id) {
            return res.status(403).json({ message: 'Akses ditolak' });
        }
        await db.query('DELETE FROM comments WHERE id = ?', [commentId]);
        res.json({ message: 'Komentar dihapus' });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.pinComment = async (req, res) => {
    const { commentId } = req.params;
    const { is_pinned } = req.body;
    try {
        const [comment] = await db.query('SELECT p.user_id as post_owner FROM comments c JOIN posts p ON c.post_id = p.id WHERE c.id = ?', [commentId]);
        if (comment[0].post_owner !== req.user.id) return res.status(403).json({ message: 'Hanya pemilik post yang bisa pin' });
        await db.query('UPDATE comments SET is_pinned = ? WHERE id = ?', [is_pinned, commentId]);
        res.json({ message: 'Status pin diubah' });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.likeComment = async (req, res) => {
    const { commentId } = req.params;
    try {
        const [existing] = await db.query('SELECT * FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, req.user.id]);
        if (existing.length > 0) {
            await db.query('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, req.user.id]);
        } else {
            await db.query('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)', [commentId, req.user.id]);
        }
        res.json({ message: 'Like berhasil' });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.getChats = async (req, res) => {
    try {
        const [chats] = await db.query('SELECT c.*, u.name, u.photo_url, u.role FROM general_chats c JOIN users u ON c.user_id = u.id ORDER BY c.created_at ASC LIMIT 50');
        res.json(chats);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.sendChat = async (req, res) => {
    try {
        await db.query('INSERT INTO general_chats (user_id, message) VALUES (?, ?)', [req.user.id, req.body.message]);
        res.status(201).json({ message: 'Pesan terkirim' });
    } catch (error) { res.status(500).json({ message: error.message }); }

};

// TAMBAHKAN FUNGSI INI
exports.editComment = async (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;
    try {
        const [comment] = await db.query('SELECT user_id, created_at FROM comments WHERE id = ?', [commentId]);
        if (comment.length === 0) return res.status(404).json({ message: 'Komentar tidak ditemukan' });
        
        // Cek apakah dia pemilik komentar
        if (comment[0].user_id !== req.user.id) {
            return res.status(403).json({ message: 'Akses ditolak. Anda hanya bisa mengedit komentar Anda sendiri.' });
        }

        // Cek batas waktu 5 menit (5 * 60 * 1000 = 300000 ms)
        const timeDiff = new Date() - new Date(comment[0].created_at);
        if (timeDiff > 300000) {
            return res.status(403).json({ message: 'Waktu edit (5 menit) sudah habis.' });
        }

        await db.query('UPDATE comments SET content = ? WHERE id = ?', [content, commentId]);
        res.json({ message: 'Komentar berhasil diedit' });
    } catch (error) { res.status(500).json({ message: error.message }); }
};
