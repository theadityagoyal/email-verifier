import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './layouts/Sidebar'
import DashboardPage from './pages/DashboardPage'
import VerifyPage from './pages/VerifyPage'
import EmailListPage from './pages/EmailListPage'
import DomainsPage from './pages/DomainsPage'
import BulkUploadPage from './pages/BulkUploadPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/emails" element={<EmailListPage />} />
            <Route path="/domains" element={<DomainsPage />} />
            <Route path="/bulk" element={<BulkUploadPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
