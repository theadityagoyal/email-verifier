import axios from 'axios'

// Simple development check
const isDevelopment = () => {
  return import.meta.env.MODE === 'development'
}

// Create base API instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
})

// Request interceptor for logging and headers
api.interceptors.request.use(
  (config) => {
    // Log requests in development
    if (isDevelopment()) {
      console.debug(`[API Request] ${config.method.toUpperCase()} ${config.url}`, {
        params: config.params,
        data: config.data,
        headers: config.headers,
      })
    }

    // Add auth token if available
    const token = localStorage.getItem('accessToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for enhanced error handling
api.interceptors.response.use(
  (response) => {
    // Log successful responses in development
    if (isDevelopment()) {
      console.debug(`[API Response] ${response.config.method.toUpperCase()} ${response.config.url}`, {
        status: response.status,
        data: response.data,
      })
    }
    return response
  },
  (error) => {
    // Log error responses in development
    if (isDevelopment()) {
      console.error(`[API Error] ${error.config?.method?.toUpperCase() || 'UNKNOWN'} ${error.config?.url || 'unknown'}`, {
        status: error.response?.status,
        message: error.message,
        code: error.code,
      })
    }

    // Enhance error with more context
    if (error.response) {
      // Server responded with error status
      const message =
        error.response.data?.detail ||
        error.response.data?.message ||
        error.response.data?.error ||
        `HTTP ${error.response.status}: ${error.response.statusText}`

      // Create enhanced error with original info
      const enhancedError = new Error(message)
      enhancedError.status = error.response.status
      enhancedError.data = error.response.data
      enhancedError.originalError = error
      return Promise.reject(enhancedError)
    } else if (error.request) {
      // Request was made but no response received
      const enhancedError = new Error('Network error: No response received')
      enhancedError.code = 'NETWORK_ERROR'
      enhancedError.originalError = error
      return Promise.reject(enhancedError)
    } else {
      // Something happened in setting up the request
      const enhancedError = new Error(error.message || 'Request failed')
      enhancedError.code = 'REQUEST_ERROR'
      enhancedError.originalError = error
      return Promise.reject(enhancedError)
    }
  }
)

// Simple retry queue for deduplication of GET requests
const retryQueue = new Map()

const getRetryKey = (config) => {
  if ((config.method || 'get').toLowerCase() !== 'get') return null

  const base = config.baseURL
    ? new URL(config.baseURL, window.location.origin).href
    : window.location.origin

  const url = new URL(config.url, base)

  if (config.params) {
    Object.entries(config.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
  }

  url.searchParams.delete('_t')

  return `${config.method}:${url.toString()}`
}

// Create enhanced API instance with deduplication capabilities.
// IMPORTANT: this instance carries baseURL ('/api/v1') + the same
// interceptors as `api`. All requests MUST go through this instance
// (or a config that explicitly sets baseURL) — using the bare, unconfigured
// `axios` import here was the bug that sent every apiEnhanced.* call to a
// relative URL resolved against the current page instead of the backend,
// e.g. POST /bulk-upload instead of POST /api/v1/bulk-upload, which nginx's
// static SPA location then rejected with 405 for non-GET methods.
const apiEnhanced = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
})

apiEnhanced.interceptors.request.use(
  api.interceptors.request.handlers[0].fulfilled,
  api.interceptors.request.handlers[0].rejected
)
apiEnhanced.interceptors.response.use(
  api.interceptors.response.handlers[0].fulfilled,
  api.interceptors.response.handlers[0].rejected
)

const axiosRequest = async (config) => {
  const retryKey = getRetryKey({ ...config, baseURL: apiEnhanced.defaults.baseURL })

  // If we have a retry key and there's already a request in flight, return the existing promise
  if (retryKey && retryQueue.has(retryKey)) {
    return retryQueue.get(retryKey)
  }

  // Route through the configured apiEnhanced instance (baseURL + interceptors),
  // not the bare global `axios`.
  const promise = apiEnhanced.request(config)
    .then(response => {
      // Remove from queue when done
      if (retryKey) retryQueue.delete(retryKey)
      return response
    })
    .catch(error => {
      // Remove from queue when done
      if (retryKey) retryQueue.delete(retryKey)
      throw error
    })

  // Store promise for deduplication
  if (retryKey) {
    retryQueue.set(retryKey, promise)

    // Clean up after completion
    promise.finally(() => retryQueue.delete(retryKey))
  }

  return promise
}

// Override the public methods to go through the deduplicating wrapper,
// which itself now correctly delegates to the `apiEnhanced` axios instance.
apiEnhanced.get = (url, config) => axiosRequest({ ...config, method: 'get', url })
apiEnhanced.post = (url, data, config) => axiosRequest({ ...config, method: 'post', url, data })
apiEnhanced.put = (url, data, config) => axiosRequest({ ...config, method: 'put', url, data })
apiEnhanced.delete = (url, config) => axiosRequest({ ...config, method: 'delete', url })

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
  apiEnhanced.post('/verify-email', { email }).then((r) => normalizeVerifyResponse(r.data))

export const bulkUpload = (file) => {
  const form = new FormData()
  form.append('file', file)
  return apiEnhanced.post('/bulk-upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const getJobStatus = (jobId) =>
  apiEnhanced.get(`/jobs/${jobId}`).then((r) => r.data)

export const listJobs = () =>
  apiEnhanced.get('/jobs').then((r) => r.data)

export const exportJobResults = (jobId) =>
  `${apiEnhanced.defaults.baseURL}/jobs/${jobId}/export`

export const deleteJob = (jobId) =>
  apiEnhanced.delete(`/jobs/${jobId}`).then((r) => r.data)

// ── Dashboard ─────────────────────────────────────────────────────────────

export const getDashboardStats = (days = 7) =>
  apiEnhanced.get('/dashboard/stats', { params: { days }, }).then((r) => r.data)

export const getTrends = (days = 30) =>
  apiEnhanced.get('/dashboard/trends', { params: { days } }).then((r) => r.data)

// ── Emails ────────────────────────────────────────────────────────────────

export const listEmails = (params) =>
  apiEnhanced.get('/emails', { params }).then((r) => normalizeEmailList(r.data))

export const deleteEmail = (email) =>
  apiEnhanced.delete(`/emails/${encodeURIComponent(email)}`).then((r) => r.data)

export const exportEmails = (params) => {
  const qs = new URLSearchParams(params).toString()
  return `${apiEnhanced.defaults.baseURL}/emails/export?${qs}`
}

// ── Domains ───────────────────────────────────────────────────────────────
// Backend aggregates live from Email via bucket_case() — numbers here always
// match the dashboard's safe/risky/unsafe counts. listDomains supports
// { page, size, search, sort } where sort is one of:
// 'risk' (default, highest risk first), 'total', 'trust', 'domain', 'newest'.
// Response shape: { items, total, page, size, pages }.

export const listDomains = (params) =>
  apiEnhanced.get('/domains', { params }).then((r) => r.data)

export const getDomainOverview = () =>
  apiEnhanced.get('/domains/overview').then((r) => r.data)

// ── Admin — auth ──────────────────────────────────────────────────────────
// Admin endpoints use a separate X-Admin-Token header (stored in
// localStorage as 'adminToken'), not the Bearer accessToken the rest of the
// app uses — so headers are attached explicitly per-call here instead of
// via the shared request interceptor.

const getAdminHeaders = () => {
  const token = localStorage.getItem('adminToken')
  return token ? { 'X-Admin-Token': token } : {}
}

export const adminLogin = (password) =>
  apiEnhanced.post('/admin/login', { password }).then((r) => r.data)

// ── Admin — API key management ──────────────────────────────────────────

export const listApiKeys = () =>
  apiEnhanced.get('/admin/api-keys', { headers: getAdminHeaders() }).then((r) => r.data)

export const createApiKey = (payload) =>
  apiEnhanced.post('/admin/api-keys', payload, { headers: getAdminHeaders() }).then((r) => r.data)

export const activateApiKey = (prefix) =>
  apiEnhanced.post(`/admin/api-keys/${prefix}/activate`, {}, { headers: getAdminHeaders() }).then((r) => r.data)

export const revokeApiKey = (prefix) =>
  apiEnhanced.post(`/admin/api-keys/${prefix}/revoke`, {}, { headers: getAdminHeaders() }).then((r) => r.data)

export const getApiKeyUsage = (prefix, days = 30) =>
  apiEnhanced.get(`/admin/api-keys/${prefix}/usage`, {
    params: { days },
    headers: getAdminHeaders(),
  }).then((r) => r.data)
