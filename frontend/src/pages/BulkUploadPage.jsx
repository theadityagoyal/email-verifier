import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Upload, FileText, CheckCircle, Clock, Download,
  Trash2, RefreshCw, Zap, BarChart2
} from 'lucide-react'
import { bulkUpload, getJobStatus } from '../services/api'

function JobCard({ jobId, fileName, onRemove }) {
  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJobStatus(jobId),
    refetchInterval: (data) =>
      data?.status === 'processing' || data?.status === 'pending' ? 1500 : false,
    enabled: !!jobId,
  })

  if (isLoading) return <div className="card animate-pulse h-32" />
  if (!job) return null

  const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0
  const isComplete = job.status === 'completed'
  const isFailed = job.status === 'failed'
  const isProcessing = job.status === 'processing' || job.status === 'pending'

  const statusColor = {
    completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    processing: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  }[job.status] || 'bg-slate-500/20 text-slate-400'

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-medium truncate text-sm">{job.file_name || fileName}</p>
            <p className="text-slate-500 text-xs font-mono truncate">{job.job_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={'text-xs font-medium px-2.5 py-1 rounded-full border ' + statusColor}>
            {job.status}
          </span>
          <button
            onClick={() => onRemove(jobId)}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
            aria-label="Remove job"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>{job.processed.toLocaleString()} / {job.total.toLocaleString()} emails</span>
          <span className="font-medium">{pct}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: pct + '%',
              background: isComplete ? '#10b981' : isFailed ? '#ef4444' : 'linear-gradient(90deg, #0ea5e9, #8b5cf6)',
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-center">
          <p className="text-emerald-400 text-lg font-bold tabular-nums">{job.verified.toLocaleString()}</p>
          <p className="text-emerald-600 text-xs">Verified</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
          <p className="text-red-400 text-lg font-bold tabular-nums">{job.invalid.toLocaleString()}</p>
          <p className="text-red-600 text-xs">Invalid</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-center">
          <p className="text-amber-400 text-lg font-bold tabular-nums">{job.risky.toLocaleString()}</p>
          <p className="text-amber-600 text-xs">Risky</p>
        </div>
      </div>

      {isProcessing && (
        <div className="flex items-center gap-2 text-sky-400 text-xs">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Processing — auto refreshing every 1.5s</span>
        </div>
      )}

      {isComplete && (
        <a
          href={`/api/v1/jobs/${job.job_id}/export`}
          download
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm font-medium transition-colors border border-emerald-500/30"
          aria-label="Download verification results"
        >
          <Download className="w-4 h-4" />
          Download Verified Results
        </a>
      )}

      {isFailed && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">Job failed — please try again</p>
        </div>
      )}
    </div>
  )
}

export default function BulkUploadPage() {
  const [dragOver, setDragOver] = useState(false)
  const [jobs, setJobs] = useState([])
  const [trackInput, setTrackInput] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: bulkUpload,
    onSuccess: (data, file) => {
      setJobs(prev => [{
        jobId: data.job_id,
        fileName: file.name,
        addedAt: new Date().toISOString(),
      }, ...prev])
      toast.success(data.total_emails.toLocaleString() + ' emails queued!')
    },
    onError: (err) => toast.error(err.message),
  })

  const handleFile = useCallback((file) => {
    if (!file) return
    const validTypes = ['.csv', '.xlsx', '.xls']
    const isValid = validTypes.some(ext => file.name.toLowerCase().endsWith(ext))
    if (!isValid) { toast.error('Only CSV and Excel files supported!'); return }
    if (file.size > 50 * 1024 * 1024) { toast.error('File too large! Max 50 MB'); return }
    mutate(file)
  }, [mutate])

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  const removeJob = (jobId) => setJobs(prev => prev.filter(j => j.jobId !== jobId))

  const handleTrack = () => {
    const id = trackInput.trim()
    if (!id) return
    if (jobs.find(j => j.jobId === id)) { toast('Job already in list!'); return }
    setJobs(prev => [{ jobId: id, fileName: 'Tracked Job', addedAt: new Date().toISOString() }, ...prev])
    setTrackInput('')
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Bulk Upload</h1>
        <p className="text-slate-400 text-sm mt-1">Upload CSV or Excel — emails auto-detected, results downloadable</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3 flex items-center gap-3">
          <Zap className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <p className="text-white font-semibold text-sm">20x Parallel</p>
            <p className="text-slate-500 text-xs">Concurrent workers</p>
          </div>
        </div>
        <div className="card py-3 flex items-center gap-3">
          <BarChart2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <p className="text-white font-semibold text-sm">~5K/min</p>
            <p className="text-slate-500 text-xs">Processing speed</p>
          </div>
        </div>
        <div className="card py-3 flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-violet-400 shrink-0" />
          <div>
            <p className="text-white font-semibold text-sm">Auto Export</p>
            <p className="text-slate-500 text-xs">Original + results</p>
          </div>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={'border-2 border-dashed rounded-xl p-10 text-center transition-all ' + (dragOver ? 'border-sky-500 bg-sky-500/5' : 'border-slate-700 hover:border-slate-500')}
      >
        {isPending ? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-10 h-10 text-sky-400 animate-spin" />
            <p className="text-sky-400 font-medium">Uploading and queuing...</p>
          </div>
        ) : (
          <div>
            <Upload className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-300 font-medium">Drop your file here</p>
            <p className="text-slate-500 text-sm mt-1">CSV or Excel (.csv, .xlsx, .xls)</p>
            <label className="mt-4 inline-block cursor-pointer btn-primary text-sm">
              Browse Files
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files[0])}
                disabled={isPending}
              />
            </label>
            <p className="text-slate-600 text-xs mt-3">Max 50 MB · Email column auto-detected</p>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          Track Existing Job
        </h2>
        <div className="flex gap-2">
          <input
            className="input text-sm"
            placeholder="Paste Job ID..."
            value={trackInput}
            onChange={(e) => setTrackInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
          />
          <button className="btn-secondary text-sm shrink-0" onClick={handleTrack} aria-label="Track job ID">
            Track
          </button>
        </div>
      </div>

      {jobs.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Jobs ({jobs.length})</h2>
            <button onClick={() => setJobs([])} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Clear All
            </button>
          </div>
          {jobs.map((j) => (
            <JobCard key={j.jobId} jobId={j.jobId} fileName={j.fileName} onRemove={removeJob} />
          ))}
        </div>
      ) : (
        <div className="text-slate-400 text-center py-8">
          No uploads yet. Drag & drop a CSV or Excel file to begin.
        </div>
      )}
    </div>
  )
}