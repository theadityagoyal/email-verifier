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

// Map backend EmailStatus to frontend safe/risky/invalid bucket
// (kept in sync with the dashboard's safe/risky/unsafe logic —
// probably_valid counts as safe, not risky)
const normalizeStatus = (status) => {
  const positive = ['verified', 'trusted', 'deliverable', 'probably_valid']
  const negative = ['invalid', 'undeliverable']
  const caution = ['risky', 'unconfirmed', 'uncertain']

  if (positive.includes(status)) return 'verified'
  if (negative.includes(status)) return 'invalid'
  if (caution.includes(status)) return 'risky'
  return status // processing, etc.
}

// Normalize response data
const normalizeEmail = (email) => ({
  ...email,
  normalized_status: normalizeStatus(email.status),
})

const normalizeEmailList = (response) => ({
  ...response,
  items: response.items?.map(normalizeEmail) || [],
})

const normalizeVerifyResponse = (data) => normalizeEmail(data)

// ── Verification ─────────────────────────────────────────────────────────────

export const verifyEmail = (email) =>
  api.post('/verify-email', { email }).then((r) => normalizeVerifyResponse(r.data))

export const bulkUpload = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/bulk-upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const getJobStatus = (jobId) =>
  api.get(`/jobs/${jobId}`).then((r) => r.data)

export const listJobs = () =>
  api.get('/jobs').then((r) => r.data)

export const exportJobResults = (jobId) =>
  `${api.defaults.baseURL}/jobs/${jobId}/export`

export const deleteJob = (jobId) =>
  api.delete(`/jobs/${jobId}`).then((r) => r.data);

// ── Dashboard ─────────────────────────────────────────────────────────────

export const getDashboardStats = (days = 7) =>
  api.get('/dashboard/stats', {params: { days },}).then((r) => r.data)

export const getTrends = (days = 30) =>
  api.get('/dashboard/trends', { params: { days } }).then((r) => r.data)

// ── Emails ────────────────────────────────────────────────────────────────

export const listEmails = (params) =>
  api.get('/emails', { params }).then((r) => normalizeEmailList(r.data))

export const deleteEmail = (email) =>
  api.delete(`/emails/${encodeURIComponent(email)}`).then((r) => r.data)

export const exportEmails = (params) => {
  const qs = new URLSearchParams(params).toString()
  return `${api.defaults.baseURL}/emails/export?${qs}`
}

// ── Domains ───────────────────────────────────────────────────────────────
// Backend aggregates live from Email via bucket_case() — numbers here always
// match the dashboard's safe/risky/unsafe counts. listDomains supports
// { page, size, search, sort } where sort is one of:
// 'risk' (default, highest risk first), 'total', 'trust', 'domain', 'newest'.
// Response shape: { items, total, page, size, pages }.

export const listDomains = (params) =>
  api.get('/domains', { params }).then((r) => r.data)

export const getDomainOverview = () =>
  api.get('/domains/overview').then((r) => r.data)
