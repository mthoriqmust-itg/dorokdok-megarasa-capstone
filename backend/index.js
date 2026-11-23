const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import Routes
const insightRoutes = require('./routes/insightRoutes');
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const categoryRoutes = require('./routes/categoryRoute'); // Sesuaikan jika namanya categoryRoutes
const userRoutes = require('./routes/userRoutes');
const communityRoutes = require('./routes/communityRoutes');
const profileRoutes = require('./routes/profileRoutes');
const chatRoutes = require('./routes/chatRoutes');


const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Folder Public untuk Uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================
// ROUTES (SEKARANG MENGGUNAKAN /api/v1/)
// ==========================================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/community', communityRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/insights', insightRoutes);
app.use('/api/v1/chat', chatRoutes);



// Base URL test
app.get('/', (req, res) => {
    res.send('API Dorokdok Mega Rasa Berjalan di v1!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});