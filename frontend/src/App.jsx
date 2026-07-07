import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './layouts/Layout';
import DashboardPage from './pages/DashboardPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import BulkUploadPage from './pages/BulkUploadPage';
import EmailListPage from './pages/EmailListPage';
import DomainsPage from './pages/DomainsPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/verify" element={<VerifyEmailPage />} />
            <Route path="/bulk" element={<BulkUploadPage />} />
            <Route path="/emails" element={<EmailListPage />} />
            <Route path="/domains" element={<DomainsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;