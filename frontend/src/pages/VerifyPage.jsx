import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Search, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { verifyEmail } from '../services/api'
import StatusBadge from '../components/ui/StatusBadge'
import BoolIcon from '../components/ui/BoolIcon'

const checks = [
  { key: 'syntax_valid', label: 'Syntax Valid' },
  { key: 'domain_exists', label: 'Domain Exists' },
  { key: 'mx_found', label: 'MX Records Found' },
  { key: 'smtp_valid', label: 'SMTP Valid' },
  { key: 'disposable', label: 'Disposable', invert: true },
  { key: 'role_based', label: 'Role-Based', invert: true },
  { key: 'catch_all', label: 'Catch-All', invert: true },
]

const FLAG_LABELS = {
  keyboard_walk: 'Keyboard walk detected',
  no_vowels: 'No vowels in username',
  low_vowel_ratio: 'Very few vowels',
  grouped_vowels: 'Vowels grouped unnaturally',
  consonant_cluster: 'Too many consecutive consonants',
  high_entropy: 'Highly random characters',
  char_repetition: 'Repeated characters',
  all_digits: 'Username is all digits',
}

const QUALITY_CONFIG = {
  clean:       { color: 'text-emerald-400', icon: 'good',    label: 'Clean' },
  suspicious:  { color: 'text-yellow-400',  icon: 'warn',    label: 'Suspicious' },
  likely_fake: { color: 'text-orange-400',  icon: 'warn',    label: 'Likely Fake' },
  random:      { color: 'text-red-400',     icon: 'bad',     label: 'Random / Fake' },
}

export default function VerifyPage() {
  const [email, setEmail] = useState('')

  const { mutate, data: result, isPending, reset } = useMutation({
    mutationFn: verifyEmail,
    onError: (err) => toast.error(err.message),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email.trim()) return
    reset()
    mutate(email.trim())
  }

  const quality = result?.username_quality
  const qualityCfg = QUALITY_CONFIG[quality] || null

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">Verify Email</h1>
      <p className="text-slate-400 text-sm mb-6">
        Run a full verification check on a single email address.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-8">
        <input
          className="input"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoFocus
        />
        <button className="btn-primary flex items-center gap-2 shrink-0" disabled={isPending}>
          <Search className="w-4 h-4" />
          {isPending ? 'Checking…' : 'Verify'}
        </button>
      </form>

      {result && (
        <div className="card space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-white break-all">{result.email}</p>
              <p className="text-sm text-slate-400">{result.domain}</p>
            </div>
            <div className="text-right shrink-0">
              <StatusBadge status={result.status} />
              <p className="text-3xl font-bold text-white mt-1 tabular-nums">
                {result.score}<span className="text-sm text-slate-400 font-normal">/100</span>
              </p>
            </div>
          </div>

          {/* Score bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Score</span>
              <span>{result.score}/100</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${result.score}%`,
                  background: result.score >= 80
                    ? '#10b981'
                    : result.score >= 50
                    ? '#f59e0b'
                    : '#ef4444',
                }}
              />
            </div>
          </div>

          {/* Checks grid */}
          <div className="grid grid-cols-2 gap-3">
            {checks.map(({ key, label, invert }) => {
              const raw = result[key]
              const good = invert ? !raw : raw
              return (
                <div key={key} className="flex items-center gap-3 bg-slate-800/60 rounded-lg px-3 py-2.5">
                  {good
                    ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  <span className="text-sm text-slate-300">{label}</span>
                </div>
              )
            })}

            {/* Username Quality Card */}
            {qualityCfg && (
              <div className="flex items-center gap-3 bg-slate-800/60 rounded-lg px-3 py-2.5">
                {qualityCfg.icon === 'good'
                  ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  : <AlertTriangle className={`w-4 h-4 shrink-0 ${qualityCfg.color}`} />}
                <div className="flex flex-col">
                  <span className="text-sm text-slate-300">Username Quality</span>
                  <span className={`text-xs font-medium ${qualityCfg.color}`}>
                    {qualityCfg.label}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Username Flags */}
          {result.username_flags && result.username_flags.length > 0 && quality !== 'clean' && (
            <div className="bg-slate-800/40 rounded-lg px-3 py-3 space-y-2">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                Username Issues Detected
              </p>
              <div className="flex flex-wrap gap-2">
                {result.username_flags.map((flag) => (
                  <span
                    key={flag}
                    className="text-xs bg-slate-700 text-orange-300 rounded-full px-2.5 py-1"
                  >
                    ⚠ {FLAG_LABELS[flag] || flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.verified_at && (
            <p className="text-xs text-slate-500">
              Verified at {new Date(result.verified_at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}