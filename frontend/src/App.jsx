import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import Layout from './layouts/Layout';
import AdminRoute from './components/AdminRoute';

// FIX (audit #35): route-level code splitting. Previously all 5 pages
// (including recharts + framer-motion heavy ones) were eagerly imported
// into one bundle. Each page now loads on-demand.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const BulkUploadPage = lazy(() => import('./pages/BulkUploadPage'));
const EmailListPage = lazy(() => import('./pages/EmailListPage'));
const DomainsPage = lazy(() => import('./pages/DomainsPage'));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage'));
// FIX (audit #5): /settings was linked from two places but had no route —
// clicking it rendered a blank page. Added a real (minimal) settings page,
// plus a catch-all 404 for any other unmatched path.
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="animate-spin h-8 w-8 border-3 border-[var(--accent)] border-t-transparent rounded-full" />
    </div>
  );
}

function App() {
  const location = useLocation();

  useEffect(() => {
    const titleMap = {
      '/': 'Dashboard - EmailVerifier',
      '/verify': 'Verify Email - EmailVerifier',
      '/bulk': 'Bulk Upload - EmailVerifier',
      '/emails': 'Email List - EmailVerifier',
      '/domains': 'Domains - EmailVerifier',
      '/settings': 'Settings - EmailVerifier',
      '/admin/login': 'Admin Login - EmailVerifier',
      '/admin/api-keys': 'API Keys - EmailVerifier',
    };

    const path = location.pathname;
    const title = titleMap[path] || 'EmailVerifier';
    document.title = title;
  }, [location]);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Standalone — outside Layout/sidebar, like a typical auth screen */}
        <Route path="/admin/login" element={<AdminLoginPage />} />

        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/verify" element={<VerifyEmailPage />} />
          <Route path="/bulk" element={<BulkUploadPage />} />
          <Route path="/emails" element={<EmailListPage />} />
          <Route path="/domains" element={<DomainsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/admin/api-keys"
            element={
              <AdminRoute>
                <ApiKeysPage />
              </AdminRoute>
            }
          />
          {/* FIX (audit #5): catch-all so unknown routes get a real 404
              instead of a blank Outlet. */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
