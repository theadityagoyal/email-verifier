import axios from 'axios'

const isDevelopment = () => {
  return import.meta.env.MODE === 'development'
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
})

// FIX (audit #32): removed dead `accessToken` Authorization-header logic.
// This is a confirmed single-tenant, no-login app — there was no login flow
// anywhere that ever set 'accessToken' in localStorage, so this branch was
// always a no-op and just confused anyone reading the code into thinking
// auth was implemented. Admin-only calls use X-Admin-Token explicitly
// (see getAdminHeaders() below) — unrelated to this.
api.interceptors.request.use(
  (config) => {
    if (isDevelopment()) {
      console.debug(`[API Request] ${config.method.toUpperCase()} ${config.url}`, {
        params: config.params,
        data: config.data,
        headers: config.headers,
      })
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    if (isDevelopment()) {
      console.debug(`[API Response] ${response.config.method.toUpperCase()} ${response.config.url}`, {
        status: response.status,
        data: response.data,
      })
    }
    return response
  },
  (error) => {
    if (isDevelopment()) {
      console.error(`[API Error] ${error.config?.method?.toUpperCase() || 'UNKNOWN'} ${error.config?.url || 'unknown'}`, {
        status: error.response?.status,
        message: error.message,
        code: error.code,
      })
    }

    if (error.response) {
      const message =
        error.response.data?.detail ||
        error.response.data?.message ||
        error.response.data?.error ||
        `HTTP ${error.response.status}: ${error.response.statusText}`

      const enhancedError = new Error(message)
      enhancedError.status = error.response.status
      enhancedError.data = error.response.data
      enhancedError.originalError = error
      return Promise.reject(enhancedError)
    } else if (error.request) {
      const enhancedError = new Error('Network error: No response received')
      enhancedError.code = 'NETWORK_ERROR'
      enhancedError.originalError = error
      return Promise.reject(enhancedError)
    } else {
      const enhancedError = new Error(error.message || 'Request failed')
      enhancedError.code = 'REQUEST_ERROR'
      enhancedError.originalError = error
      return Promise.reject(enhancedError)
    }
  }
)

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

  if (retryKey && retryQueue.has(retryKey)) {
    return retryQueue.get(retryKey)
  }

  const promise = apiEnhanced.request(config)
    .then(response => {
      if (retryKey) retryQueue.delete(retryKey)
      return response
    })
    .catch(error => {
      if (retryKey) retryQueue.delete(retryKey)
      throw error
    })

  if (retryKey) {
    retryQueue.set(retryKey, promise)
    promise.finally(() => retryQueue.delete(retryKey))
  }

  return promise
}

apiEnhanced.get = (url, config) => axiosRequest({ ...config, method: 'get', url })
apiEnhanced.post = (url, data, config) => axiosRequest({ ...config, method: 'post', url, data })
apiEnhanced.put = (url, data, config) => axiosRequest({ ...config, method: 'put', url, data })
apiEnhanced.delete = (url, config) => axiosRequest({ ...config, method: 'delete', url })

const normalizeStatus = (status) => {
  const positive = ['verified', 'trusted', 'deliverable', 'probably_valid']
  const negative = ['invalid', 'undeliverable']
  const caution = ['risky', 'unconfirmed', 'uncertain']

  if (positive.includes(status)) return 'verified'
  if (negative.includes(status)) return 'invalid'
  if (caution.includes(status)) return 'risky'
  return status
}

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
  apiEnhanced.get('/dashboard/stats', { params: { days } }).then((r) => r.data)

export const getTrends = (days = 30) =>
  apiEnhanced.get('/dashboard/trends', { params: { days } }).then((r) => r.data)

// ── Emails ────────────────────────────────────────────────────────────────
// FIX (audit #7): `params` is forwarded as-is to axios, so sort_by/sort_order
// just need to be included by the caller (EmailListPage) — no change needed
// here, listEmails already passes through whatever params object it's given.

export const listEmails = (params) =>
  apiEnhanced.get('/emails', { params }).then((r) => normalizeEmailList(r.data))

export const deleteEmail = (email) =>
  apiEnhanced.delete(`/emails/${encodeURIComponent(email)}`).then((r) => r.data)

export const exportEmails = (params) => {
  const qs = new URLSearchParams(params).toString()
  return `${apiEnhanced.defaults.baseURL}/emails/export?${qs}`
}

// FIX (audit #31): fetch+blob download with real error handling instead of
// a bare window.open() on a GET URL, which silently fails with a blank tab
// on server errors.
export const downloadEmailsExport = async (params) => {
  const url = exportEmails(params)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Export failed (HTTP ${response.status})`)
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = 'emails-export.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

// ── Domains ───────────────────────────────────────────────────────────────
// listDomains forwards whatever params object it's given (page, size,
// search, sort_by, sort_order, and now risk_filter/mx_status/flags/
// min_emails for server-side filtering — fixes audit #2).

export const listDomains = (params) =>
  apiEnhanced.get('/domains', { params }).then((r) => r.data)

export const getDomainOverview = () =>
  apiEnhanced.get('/domains/overview').then((r) => r.data)

// FIX (audit #3): real bulk-delete wiring — previously this button called an
// empty function. Deletes the domain(s) and every email under them.
export const bulkDeleteDomains = (domains) =>
  apiEnhanced.post('/domains/delete', { domains }).then((r) => r.data)

// FIX (audit #8): full server-side export (not just the current page),
// respecting the same search/filter params as the table.
export const exportDomainsUrl = (params) => {
  const qs = new URLSearchParams(params).toString()
  return `${apiEnhanced.defaults.baseURL}/domains/export?${qs}`
}

export const downloadDomainsExport = async (params) => {
  const url = exportDomainsUrl(params)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Export failed (HTTP ${response.status})`)
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = 'domains-export.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

// ── Admin — auth ──────────────────────────────────────────────────────────

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
