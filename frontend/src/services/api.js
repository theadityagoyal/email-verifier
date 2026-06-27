import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30_000,
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.detail || err.message || 'Request failed'
    return Promise.reject(new Error(message))
  }
)

// ── Verification ─────────────────────────────────────────────────────────────

export const verifyEmail = (email) =>
  api.post('/verify-email', { email }).then((r) => r.data)

export const bulkUpload = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/bulk-upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const getJobStatus = (jobId) =>
  api.get(`/jobs/${jobId}`).then((r) => r.data)

export const exportJobResults = (jobId) =>
  `${api.defaults.baseURL}/jobs/${jobId}/export`

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboardStats = () =>
  api.get('/dashboard/stats').then((r) => r.data)

export const getTrends = (days = 30) =>
  api.get('/dashboard/trends', { params: { days } }).then((r) => r.data)

// ── Emails ────────────────────────────────────────────────────────────────────

export const listEmails = (params) =>
  api.get('/emails', { params }).then((r) => r.data)

export const deleteEmail = (email) =>
  api.delete(`/emails/${encodeURIComponent(email)}`).then((r) => r.data)

export const exportEmails = (params) => {
  const qs = new URLSearchParams(params).toString()
  return `${api.defaults.baseURL}/emails/export?${qs}`
}

// ── Domains ───────────────────────────────────────────────────────────────────

export const listDomains = (params) =>
  api.get('/domains', { params }).then((r) => r.data)
