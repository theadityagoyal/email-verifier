import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './layouts/Layout';
import DashboardPage from './pages/DashboardPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import BulkUploadPage from './pages/BulkUploadPage';
import EmailListPage from './pages/EmailListPage';
import DomainsPage from './pages/DomainsPage';
import AdminLoginPage from './pages/AdminLoginPage';
import ApiKeysPage from './pages/ApiKeysPage';
import AdminRoute from './components/AdminRoute';

function App() {
  const location = useLocation();

  // Update page title based on route for accessibility and SEO
  useEffect(() => {
    const titleMap = {
      '/': 'Dashboard - EmailVerifier',
      '/verify': 'Verify Email - EmailVerifier',
      '/bulk': 'Bulk Upload - EmailVerifier',
      '/emails': 'Email List - EmailVerifier',
      '/domains': 'Domains - EmailVerifier',
      '/admin/login': 'Admin Login - EmailVerifier',
      '/admin/api-keys': 'API Keys - EmailVerifier',
    };

    const path = location.pathname;
    const title = titleMap[path] || 'EmailVerifier';
    document.title = title;
  }, [location]);

  return (
    <Routes>
      {/* Standalone — outside Layout/sidebar, like a typical auth screen */}
      <Route path="/admin/login" element={<AdminLoginPage />} />

      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/verify" element={<VerifyEmailPage />} />
        <Route path="/bulk" element={<BulkUploadPage />} />
        <Route path="/emails" element={<EmailListPage />} />
        <Route path="/domains" element={<DomainsPage />} />
        <Route
          path="/admin/api-keys"
          element={
            <AdminRoute>
              <ApiKeysPage />
            </AdminRoute>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
