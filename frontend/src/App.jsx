import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './layouts/Layout';
import DashboardPage from './pages/DashboardPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import BulkUploadPage from './pages/BulkUploadPage';
import EmailListPage from './pages/EmailListPage';
import DomainsPage from './pages/DomainsPage';

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
    };

    const path = location.pathname;
    const title = titleMap[path] || 'EmailVerifier';
    document.title = title;
  }, [location]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/verify" element={<VerifyEmailPage />} />
        <Route path="/bulk" element={<BulkUploadPage />} />
        <Route path="/emails" element={<EmailListPage />} />
        <Route path="/domains" element={<DomainsPage />} />
      </Route>
    </Routes>
  );
}

export default App;