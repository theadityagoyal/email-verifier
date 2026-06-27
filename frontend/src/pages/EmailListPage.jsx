import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Download, Filter, Trash2 } from 'lucide-react'
import StatusBadge from '../components/ui/StatusBadge'
import BoolIcon from '../components/ui/BoolIcon'
import { listEmails, exportEmails, deleteEmail } from '../services/api'

const STATUSES = ['', 'verified', 'invalid', 'risky', 'processing', 'deliverable', 'trusted', 'probably_valid', 'unconfirmed', 'uncertain', 'undeliverable']
const SIZE = 20

export default function EmailListPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['emails', page, search, status],
    queryFn: () => listEmails({ page, size: SIZE, search: search || undefined, status: status || undefined }),
    keepPreviousData: true,
  })

  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: deleteEmail,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['emails'] }),
  })

  const handleDelete = (email) => {
    if (window.confirm(`Delete ${email}?`)) {
      deleteMutation.mutate(email)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const emails = data?.items ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Email List</h1>
          <p className="text-slate-400 text-sm mt-0.5">{total.toLocaleString()} total records</p>
        </div>
        <a
          href={exportEmails({ status: status || undefined })}
          className="btn-secondary flex items-center gap-2 text-sm"
          download
        >
          <Download className="w-4 h-4" />
          Export CSV
        </a>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-60">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Search emails..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <button className="btn-secondary text-sm">Search</button>
        </form>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <select
            className="input pl-9 w-auto pr-8 appearance-none"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          >
            <option value="">All statuses</option>
            {STATUSES.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left">
                {['Email', 'Domain', 'Status', 'MX', 'SMTP', 'Disp.', 'Role', 'Catch-all', 'Score', 'Verified', 'Action'].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="text-center py-12 text-slate-600">Loading…</td></tr>
              ) : emails.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-slate-600">No emails found</td></tr>
              ) : emails.map((e) => (
                <tr key={e.email} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-300 max-w-xs truncate">{e.email}</td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{e.domain}</td>
                  <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                  <td className="px-4 py-3"><BoolIcon value={e.mx_found} /></td>
                  <td className="px-4 py-3"><BoolIcon value={e.smtp_valid} /></td>
                  <td className="px-4 py-3"><BoolIcon value={!e.disposable} /></td>
                  <td className="px-4 py-3"><BoolIcon value={!e.role_based} /></td>
                  <td className="px-4 py-3"><BoolIcon value={!e.catch_all} /></td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold tabular-nums ${e.score >= 80 ? 'text-emerald-400' : e.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                      {e.score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {e.verified_at ? new Date(e.verified_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(e.email)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
          <p className="text-xs text-slate-500">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            <button
              className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>
            <button
              className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
              disabled={page >= pages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}