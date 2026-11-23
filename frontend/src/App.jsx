import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import AIAssistant from './pages/AIAssistant'; // Sesuaikan path-nya
import Users from './pages/Users'; // <-- IMPORT INI
import Layout from './components/Layout';
import Profile from './pages/Profile';

import Community from './pages/Community';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
};

// Proteksi Khusus Admin
const AdminRoute = ({ children }) => {
    const role = localStorage.getItem('role');
    if (role !== 'admin') return <Navigate to="/dashboard" replace />;
    return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
        <Route path="/ai-assistant" element={<Layout><AIAssistant /></Layout>} />

        {/* TAMBAHKAN RUTE INI DENGAN AdminRoute */}
        <Route path="/users" element={<ProtectedRoute><AdminRoute><Users /></AdminRoute></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}