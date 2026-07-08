import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Upload, FileText, Loader2, CheckCircle, XCircle, AlertTriangle, Clock,
  Trash2, Download, RotateCcw, ChevronDown, MoreVertical, Mail, Users,
  ShieldAlert, Globe, Database, PieChart, TrendingUp, BarChart3, FolderOpen
} from 'lucide-react';
import { bulkUpload, getJobStatus, exportJobResults, listJobs, deleteJob } from '@/services/api';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';

const statusOrder = { pending: 0, processing: 1, completed: 2, failed: 3 };
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const DATE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'month', label: 'This Month' },
];

const isValidUploadFile = (file) =>
  file && (file.type === 'text/csv' || /\.(csv|xlsx|xls)$/i.test(file.name));

const getExt = (filename) => (filename ? filename.split('.').pop().toUpperCase() : 'FILE');

// Normalizes whatever listJobs()/mutation responses return into a plain array.
// Some backends return a bare array, others wrap it as { jobs: [...] },
// { results: [...] }, or { items: [...] }. Guarding here prevents jobs state
// from ever becoming a non-array, which previously crashed the page with
// "i.filter is not a function" inside the visibleJobs useMemo.
const normalizeJobsList = (data) => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.jobs)) return data.jobs;
  if (data && Array.isArray(data.results)) return data.results;
  if (data && Array.isArray(data.items)) return data.items;
  console.warn('listJobs() returned an unexpected shape, defaulting to empty list:', data);
  return [];
};

// IST-safe date helpers — all comparisons happen on the Asia/Kolkata calendar day,
// not the browser's local timezone.
const istDateKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
const istMonthKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(date);

const formatDateIST = (dateString) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
};

const matchesDateFilter = (job, filter) => {
  if (filter === 'all') return true;
  if (!job.created_at) return false;
  const jobDate = new Date(job.created_at);
  const now = new Date();

  if (filter === 'today') return istDateKey(jobDate) === istDateKey(now);

  if (filter === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return istDateKey(jobDate) === istDateKey(yesterday);
  }

  if (filter === 'last7') {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    return jobDate >= sevenDaysAgo;
  }

  if (filter === 'month') return istMonthKey(jobDate) === istMonthKey(now);

  return true;
};

// Extract reusable components for better organization

const FileUploadZone = ({ onDragEnter, onDragLeave, onDragOver, onDrop, dragActive, onFileSelect, fileInputRef }) => (
  <div
    className={`card relative border-2 border-dashed transition-colors ${dragActive ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--muted)] hover:border-[var(--muted)]/50'}`}
    onDragEnter={onDragEnter}
    onDragLeave={onDragLeave}
    onDragOver={onDragOver}
    onDrop={onDrop}
  >
    <input
      ref={fileInputRef}
      type="file"
      accept=".csv,.xlsx,.xls"
      onChange={onFileSelect}
      className="hidden"
      aria-label="Choose CSV or Excel file"
    />
    <div className="text-center py-14 px-6">
      <div className="h-16 w-16 rounded-full bg-[var(--primary)]/10 flex items-center justify-center mx-auto mb-4">
        <Upload className="h-7 w-7 text-[var(--primary)]" aria-hidden="true" />
      </div>
      <p className="text-lg font-medium text-[var(--foreground)] mb-1">
        Drag & drop a <span className="text-[var(--primary)]">CSV or Excel file</span> here, or click to browse
      </p>
      <p className="text-[var(--foreground)]/50 mb-5">Maximum file size: 50MB • Formats: .csv, .xlsx, .xls • Columns: email (required)</p>
      <Button type="button" variant="primary" onClick={() => fileInputRef.current?.click()}>
        <FolderOpen className="h-4 w-4" />
        Browse Files
      </Button>
    </div>
  </div>
);

const FileInfoDisplay = ({ selectedFile, onRemoveFile, onUpload, uploadPending }) => {
  if (!selectedFile) return null;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="p-3 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] flex-shrink-0">
            <FileText className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-[var(--foreground)] truncate">{selectedFile.name}</p>
            <p className="text-[var(--foreground)]/50">
              {(selectedFile.size / 1024).toFixed(1)} KB • {getExt(selectedFile.name)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" onClick={onRemoveFile}>
            <XCircle className="h-4 w-4" />
            Remove
          </Button>
          <Button variant="primary" onClick={onUpload} loading={uploadPending} disabled={uploadPending}>
            <Upload className="h-4 w-4" />
            Upload & Verify
          </Button>
        </div>
      </div>
    </div>
  );
};

const JobStats = ({ job }) => {
  const safeCount = job.safe ?? job.verified ?? 0;
  const riskyCount = job.risky ?? 0;
  const unsafeCount = job.unsafe ?? job.invalid ?? 0;
  const totalCount = job.total ?? 0;
  const processedCount = job.processed ?? 0;
  const progressPct = Math.min(100, Math.max(0, job.progress_percent ?? 0));
  const isActive = job.status === 'pending' || job.status === 'processing';

  return (
    <div className="flex items-center gap-4 mt-1 text-sm text-[var(--foreground)]/50 flex-wrap">
      <span>Total: <span className="text-[var(--foreground)] font-medium">{totalCount.toLocaleString()}</span></span>
      <span>Safe: <span className="text-success font-medium">{safeCount.toLocaleString()}</span></span>
      <span>Risky: <span className="text-warning font-medium">{riskyCount.toLocaleString()}</span></span>
      <span>Unsafe: <span className="text-error font-medium">{unsafeCount.toLocaleString()}</span></span>
      {isActive && (
        <>
          <span className="mx-2">|</span>
          <span>Processed: <span className="text-[var(--foreground)] font-medium">{processedCount.toLocaleString()}</span></span>
          <span className="mx-2">|</span>
          <span className="font-medium text-[var(--foreground)]">{progressPct}%</span>
        </>
      )}
    </div>
  );
};

// Note: no longer renders its own chevron — the caller already renders one
// (previously this duplicated it AND referenced an undefined `expandedJob`
// variable, since this component never received it as a prop).
const JobActions = ({ job, onRetry, onDelete }) => {
  const progressPct = Math.min(100, Math.max(0, job.progress_percent ?? 0));

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {job.status === 'processing' && (
        <div className="inline-flex items-center gap-2 rounded-full bg-info/10 border border-info/20 px-3 py-1.5">
          <Loader2 className="h-4 w-4 animate-spin text-info" />
          <span className="text-sm font-medium text-info">{progressPct}%</span>
        </div>
      )}
      {job.status === 'completed' && (
        <a
          href={exportJobResults(job.job_id)}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-[var(--muted)] rounded-lg transition-colors"
        >
          <Download className="h-4 w-4" />
          Export
        </a>
      )}
      {(job.status === 'failed' || job.status === 'pending') && (
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onRetry(job.job_id); }}>
          <RotateCcw className="h-4 w-4" />
          Retry
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => { e.stopPropagation(); onDelete(job.job_id); }}
        className="text-error hover:text-error hover:bg-error/10"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

const JobDetails = ({ job, expandedJob, onToggleExpand, formatDateIST }) => {
  const isActive = job.status === 'pending' || job.status === 'processing';
  const safeCount = job.safe ?? job.verified ?? 0;
  const riskyCount = job.risky ?? 0;
  const unsafeCount = job.unsafe ?? job.invalid ?? 0;
  const totalCount = job.total ?? 0;
  const processedCount = job.processed ?? 0;
  const progressPct = Math.min(100, Math.max(0, job.progress_percent ?? 0));

  if (expandedJob !== job.job_id) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
        className="border-t border-[var(--muted)] overflow-hidden"
      >
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-[var(--muted)]/30">
            <p className="text-sm text-[var(--foreground)]/50">Job ID</p>
            <p className="font-mono text-sm text-[var(--foreground)] break-all">{job.job_id}</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--muted)]/30">
            <p className="text-sm text-[var(--foreground)]/50">File Name</p>
            <p className="font-medium text-[var(--foreground)] truncate">{job.file_name || 'Unknown'}</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--muted)]/30">
            <p className="text-sm text-[var(--foreground)]/50">Created (IST)</p>
            <p className="font-medium text-[var(--foreground)]">{formatDateIST(job.created_at)}</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--muted)]/30">
            <p className="text-sm text-[var(--foreground)]/50">Status</p>
            <StatusBadge status={job.status} />
          </div>
        </div>

        {/* Bordered white cards (not tinted backgrounds) to match the target design */}
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-[var(--card)] border border-success/30 text-center">
            <p className="text-2xl font-bold text-success">{safeCount.toLocaleString()}</p>
            <p className="text-sm text-[var(--foreground)]/50">Safe</p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--card)] border border-warning/30 text-center">
            <p className="text-2xl font-bold text-warning">{riskyCount.toLocaleString()}</p>
            <p className="text-sm text-[var(--foreground)]/50">Risky</p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--card)] border border-error/30 text-center">
            <p className="text-2xl font-bold text-error">{unsafeCount.toLocaleString()}</p>
            <p className="text-sm text-[var(--foreground)]/50">Unsafe</p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--muted)] text-center">
            <p className="text-2xl font-bold text-[var(--foreground)]">{totalCount.toLocaleString()}</p>
            <p className="text-sm text-[var(--foreground)]/50">Total</p>
          </div>
        </div>

        {isActive && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between text-xs text-[var(--foreground)]/50 mb-1">
              <span>{processedCount} / {totalCount} processed</span>
              <span className="font-medium text-[var(--foreground)]">{progressPct}%</span>
            </div>
            <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="h-full rounded-full bg-[var(--primary)]"
              />
            </div>
          </div>
        )}

        {job.status === 'completed' && (
          <div className="px-4 pb-4 border-t border-[var(--muted)] pt-4">
            <a
              href={exportJobResults(job.job_id)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg hover:bg-[var(--primary)]/20 transition-colors"
            >
              <Download className="h-5 w-5" />
              Download Results
            </a>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default function BulkUploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [expandedJob, setExpandedJob] = useState(null);
  const [polling, setPolling] = useState({});
  const [dateFilter, setDateFilter] = useState('all');
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  // Refs so the polling interval (mounted once) always reads fresh state
  // without needing to be torn down and recreated every tick.
  const jobsRef = useRef(jobs);
  const pollingRef = useRef(polling);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);
  useEffect(() => { pollingRef.current = polling; }, [polling]);

  // Load existing jobs on initial mount
  useEffect(() => {
    let cancelled = false;
    async function loadExistingJobs() {
      try {
        const data = await listJobs();
        if (cancelled) return;
        const jobsArray = normalizeJobsList(data);
        setJobs(jobsArray);
        const pollingMap = {};
        jobsArray.forEach((job) => {
          if (job.status === 'pending' || job.status === 'processing') {
            pollingMap[job.job_id] = true;
          }
        });
        setPolling(pollingMap);
      } catch (err) {
        console.error('Failed to load jobs:', err);
        toast.error('Failed to load upload history');
      }
    }
    loadExistingJobs();
    return () => { cancelled = true; };
  }, []);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: bulkUpload,
    onSuccess: (data) => {
      // Upload response only carries job_id/status/total_emails initially —
      // full stats + progress arrive via polling.
      const newJob = {
        job_id: data.job_id,
        status: data.status || 'pending',
        file_name: selectedFile?.name || 'Unknown',
        created_at: data.created_at || new Date().toISOString(),
        total: data.total_emails ?? 0,
        processed: 0,
        safe: 0,
        risky: 0,
        unsafe: 0,
        progress_percent: 0,
      };
      setSelectedFile(null);
      setJobs((prev) => [newJob, ...(Array.isArray(prev) ? prev : [])]);
      setPolling((prev) => ({ ...prev, [newJob.job_id]: true }));
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('File uploaded successfully!');
    },
    onError: (error) => {
      console.error('Upload failed:', error);
      toast.error(`Upload failed: ${error.message}`);
      setSelectedFile(null);
    },
  });

  // Stable polling function across renders
  const pollJob = useCallback(async (jobId) => {
    try {
      const data = await getJobStatus(jobId);
      setJobs((prev) =>
        (Array.isArray(prev) ? prev : []).map((job) => (job.job_id === jobId ? { ...job, ...data } : job))
      );
      if (data.status === 'completed' || data.status === 'failed') {
        setPolling((prev) => ({ ...prev, [jobId]: false }));
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      }
    } catch (err) {
      console.error('Polling error for job:', jobId, err);
      // Mark job as failed if polling fails consistently
      setJobs((prev) =>
        (Array.isArray(prev) ? prev : []).map((job) =>
          job.job_id === jobId && job.status !== 'failed'
            ? { ...job, status: 'failed', error: 'Failed to update status' }
            : job
        )
      );
      setPolling((prev) => ({ ...prev, [jobId]: false }));
    }
  }, [queryClient]);

  // Set up polling interval
  useEffect(() => {
    const interval = setInterval(() => {
      jobsRef.current.forEach((job) => {
        if (pollingRef.current[job.job_id] && (job.status === 'pending' || job.status === 'processing')) {
          pollJob(job.job_id);
        }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [pollJob]);

  // File handling functions
  const validateAndSetFile = useCallback((file) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 50 MB.');
      return;
    }
    if (!isValidUploadFile(file)) {
      toast.error('Please upload a CSV or Excel (.xlsx/.xls) file');
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    validateAndSetFile(e.dataTransfer.files?.[0]);
  }, [validateAndSetFile]);

  const handleFileSelect = useCallback((e) => {
    validateAndSetFile(e.target.files?.[0]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [validateAndSetFile]);

  const handleUpload = useCallback(() => {
    if (selectedFile) uploadMutation.mutate(selectedFile);
  }, [selectedFile, uploadMutation]);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRetry = useCallback((jobId) => {
    setPolling((prev) => ({ ...prev, [jobId]: true }));
  }, []);

  const handleDelete = useCallback(async (jobId) => {
    if (!window.confirm('Delete this upload permanently? This removes the job, its email records, and the uploaded file.')) return;
    try {
      await deleteJob(jobId);
      setJobs((prev) => (Array.isArray(prev) ? prev : []).filter((job) => job.job_id !== jobId));
      setPolling((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Upload deleted successfully');
    } catch (err) {
      console.error('Failed to delete job:', err);
      toast.error('Failed to delete upload');
    }
  }, [queryClient]);

  const handleClearAll = useCallback(async () => {
    if (jobs.length === 0) return;
    if (!window.confirm(`Permanently delete all ${jobs.length} uploads? This cannot be undone.`)) return;
    try {
      await Promise.all(jobs.map((job) => deleteJob(job.job_id)));
      setJobs([]);
      setPolling({});
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('All uploads deleted successfully');
    } catch (err) {
      console.error('Failed to clear all uploads:', err);
      toast.error('Failed to clear uploads');
      try {
        setJobs(normalizeJobsList(await listJobs()));
      } catch (reloadErr) {
        console.error(reloadErr);
      }
    }
  }, [jobs, queryClient]);

  const handleToggleExpand = useCallback((jobId) => {
    setExpandedJob((prev) => (prev === jobId ? null : jobId));
  }, []);

  const getStatusIcon = useCallback((status) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-info" />;
      case 'processing': return <Loader2 className="h-4 w-4 text-info animate-spin" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed': return <XCircle className="h-4 w-4 text-error" />;
      default: return <AlertTriangle className="h-4 w-4 text-warning" />;
    }
  }, []);

  const visibleJobs = useMemo(() => {
    const jobsArray = Array.isArray(jobs) ? jobs : [];
    return jobsArray
      .filter((job) => matchesDateFilter(job, dateFilter))
      .sort((a, b) => {
        const statusA = statusOrder[a.status] ?? 99;
        const statusB = statusOrder[b.status] ?? 99;
        if (statusA !== statusB) return statusA - statusB;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [jobs, dateFilter]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Bulk Upload</h1>
        <p className="text-[var(--foreground)]/60">Upload CSV or Excel files to verify multiple emails at once</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
        {selectedFile ? (
          <FileInfoDisplay
            selectedFile={selectedFile}
            onRemoveFile={handleRemoveFile}
            onUpload={handleUpload}
            uploadPending={uploadMutation.isPending}
          />
        ) : (
          <FileUploadZone
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            dragActive={dragActive}
            onFileSelect={handleFileSelect}
            fileInputRef={fileInputRef}
          />
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Upload History ({visibleJobs.length})</h2>
          {jobs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="!border !border-error/30 !text-error hover:!bg-error/10"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>

        {jobs.length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {DATE_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateFilter(key)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${dateFilter === key
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--muted)]/40 text-[var(--foreground)]/60 hover:bg-[var(--muted)]/60'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {jobs.length === 0 ? (
          <div className="card text-center py-16">
            <Upload className="h-16 w-16 text-[var(--foreground)]/20 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">No uploads yet</h3>
            <p className="text-[var(--foreground)]/50">Upload a CSV or Excel file to start bulk verification</p>
          </div>
        ) : visibleJobs.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--foreground)]/50">No uploads in this date range</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleJobs.map((job) => {
              const processedCount = job.processed ?? 0;
              const totalCount = job.total ?? 0;
              const progressPct = Math.min(100, Math.max(0, job.progress_percent ?? 0));

              return (
                <motion.div key={job.job_id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="card group">
                  <button
                    onClick={() => handleToggleExpand(job.job_id)}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-[var(--muted)]/30 transition-colors"
                    aria-expanded={expandedJob === job.job_id}
                  >
                    <div className={`p-3 rounded-xl flex-shrink-0 min-w-[48px] ${job.status === 'completed' ? 'bg-success/20 text-success' :
                        job.status === 'failed' ? 'bg-error/20 text-error' :
                          job.status === 'processing' ? 'bg-info/20 text-info' : 'bg-warning/20 text-warning'
                      }`}>
                      {getStatusIcon(job.status)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap min-w-0">
                        <p className="font-medium text-[var(--foreground)] max-w-sm truncate">
                          {job.file_name || `Job ${job.job_id.slice(0, 8)}...`}
                        </p>
                        <StatusBadge status={job.status} />
                        <span className="text-sm text-[var(--foreground)]/50 font-mono">{job.job_id.slice(0, 8)}...</span>
                        <span className="text-sm text-[var(--foreground)]/50">{formatDateIST(job.created_at)}</span>
                      </div>

                      <JobStats job={job} />

                      {(job.status === 'pending' || job.status === 'processing') && (
                        <div className="mt-2 max-w-md">
                          <div className="flex items-center justify-between text-xs text-[var(--foreground)]/50 mb-1">
                            <span>{processedCount} / {totalCount} processed</span>
                            <span className="font-medium text-[var(--foreground)]">{progressPct}%</span>
                          </div>
                          <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${progressPct}%` }}
                              transition={{ duration: 0.4, ease: 'easeOut' }}
                              className="h-full rounded-full bg-[var(--primary)]"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <JobActions
                        job={job}
                        onRetry={handleRetry}
                        onDelete={handleDelete}
                      />
                      <motion.div animate={{ rotate: expandedJob === job.job_id ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-[var(--foreground)]/50">
                        <ChevronDown className="h-5 w-5" />
                      </motion.div>
                    </div>
                  </button>

                  <JobDetails
                    job={job}
                    expandedJob={expandedJob}
                    onToggleExpand={handleToggleExpand}
                    formatDateIST={formatDateIST}
                  />
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
