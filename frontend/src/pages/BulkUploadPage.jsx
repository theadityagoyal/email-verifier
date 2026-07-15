import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Upload, FileText, Loader2, CheckCircle, XCircle, AlertTriangle, Clock,
  Trash2, Download, RotateCcw, ChevronDown, MoreVertical, Mail, Users,
  ShieldAlert, Globe, Database, PieChart, TrendingUp, BarChart3, FolderOpen,
  StopCircle, Ban,
} from 'lucide-react';
import { bulkUpload, getJobStatus, exportJobResults, listJobs, deleteJob, cancelJob } from '@/services/api';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import { calculateJobStats, getStatusOrder, isJobActive } from '@/utils/jobUtils';
import { reportError } from '@/utils/errorReporter';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const DATE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'month', label: 'This Month' },
];

// FIX (audit #11): a single failed poll (transient wifi blip, one-off 502)
// used to immediately flip the job to status: 'failed' on the client, even
// though the job was still healthy server-side. Now we tolerate a few
// consecutive poll failures before giving up.
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

const isValidUploadFile = (file) =>
  file && (file.type === 'text/csv' || /\.(csv|xlsx|xls)$/i.test(file.name));

const getExt = (filename) => (filename ? filename.split('.').pop().toUpperCase() : 'FILE');

const normalizeJobsList = (data) => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.jobs)) return data.jobs;
  if (data && Array.isArray(data.results)) return data.results;
  if (data && Array.isArray(data.items)) return data.items;
  console.warn('listJobs() returned an unexpected shape, defaulting to empty list:', data);
  return [];
};

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

const isValidStatus = (status) => {
  return ['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(status);
};

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
  const { safeCount, riskyCount, unsafeCount, totalCount, processedCount, progressPct } = calculateJobStats(job);
  const isActive = isJobActive(job);

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

const JobActions = ({ job, onRetry, onDelete, onCancel, isCancelling }) => {
  const { progressPct } = calculateJobStats(job);
  const isProcessing = job.status === 'processing';
  const isActive = isJobActive(job);

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {isProcessing && (
        <div className="inline-flex items-center gap-2 rounded-full bg-info/10 border border-info/20 px-3 py-1.5">
          <Loader2 className="h-4 w-4 animate-spin text-info" />
          <span className="text-sm font-medium text-info">{progressPct}%</span>
        </div>
      )}
      {isActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onCancel(job.job_id); }}
          disabled={isCancelling || job.cancel_requested}
          loading={isCancelling}
          className="text-warning hover:text-warning hover:bg-warning/10"
          title={job.cancel_requested ? 'Cancellation in progress…' : 'Cancel this job'}
        >
          {!isCancelling && <StopCircle className="h-4 w-4" />}
          {job.cancel_requested ? 'Cancelling…' : 'Cancel'}
        </Button>
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
  const { safeCount, riskyCount, unsafeCount, totalCount, processedCount, progressPct } = calculateJobStats(job);
  const isActive = isJobActive(job);

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

        {job.status === 'cancelled' && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-3 py-2.5 text-sm text-warning">
              <Ban className="h-4 w-4 shrink-0" />
              Cancelled after processing {processedCount.toLocaleString()} of {totalCount.toLocaleString()} emails.
              Results already processed are preserved and available in the counts above.
            </div>
          </div>
        )}

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
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [expandedJob, setExpandedJob] = useState(null);
  const [polling, setPolling] = useState({});
  const [dateFilter, setDateFilter] = useState('all');
  const [cancellingIds, setCancellingIds] = useState({});
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  const jobsRef = useRef(jobs);
  const pollingRef = useRef(polling);
  // FIX (audit #11): tracks consecutive poll failures per job_id, reset on
  // any successful poll.
  const pollFailuresRef = useRef({});
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);
  useEffect(() => { pollingRef.current = polling; }, [polling]);

  useEffect(() => {
    let cancelled = false;
    async function loadExistingJobs() {
      setIsLoadingJobs(true);
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
        reportError('BulkUploadPage.loadExistingJobs', err);
        toast.error('Failed to load upload history');
      } finally {
        if (!cancelled) setIsLoadingJobs(false);
      }
    }
    loadExistingJobs();
    return () => { cancelled = true; };
  }, []);

  const uploadMutation = useMutation({
    mutationFn: bulkUpload,
    onSuccess: (data) => {
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
        cancel_requested: false,
      };
      setSelectedFile(null);
      setJobs(prev => [newJob, ...prev]);
      setPolling(prev => ({ ...prev, [newJob.job_id]: true }));
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('File uploaded successfully!');
    },
    onError: (error) => {
      reportError('BulkUploadPage.upload', error);
      toast.error(`Upload failed: ${error.message}`);
      setSelectedFile(null);
    },
  });

  // FIX (audit #11): retry-with-backoff. A single failed poll no longer
  // immediately marks the job as failed — only after
  // MAX_CONSECUTIVE_POLL_FAILURES consecutive failures do we give up, and
  // even then we do one last direct getJobStatus() confirmation attempt
  // first in case the job actually did finish/fail server-side.
  const pollJob = useCallback(async (jobId) => {
    try {
      const data = await getJobStatus(jobId);
      pollFailuresRef.current[jobId] = 0;

      setJobs(prev =>
        prev.map(job => {
          if (job.job_id !== jobId) return job;

          let updatedJob = { ...job };

          if (data.status !== undefined && data.status !== null && isValidStatus(data.status)) {
            updatedJob.status = data.status;
          }

          if (data.created_at !== undefined && data.created_at !== null) {
            const testDate = new Date(data.created_at);
            if (!isNaN(testDate.getTime())) {
              updatedJob.created_at = data.created_at;
            }
          }

          const { status, created_at, ...otherData } = data;
          Object.keys(otherData).forEach(key => {
            if (otherData[key] !== undefined && otherData[key] !== null) {
              updatedJob[key] = otherData[key];
            }
          });

          return updatedJob;
        })
      );

      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        setPolling(prev => ({ ...prev, [jobId]: false }));
        setCancellingIds(prev => {
          if (!prev[jobId]) return prev;
          const next = { ...prev };
          delete next[jobId];
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      }
    } catch (err) {
      const failures = (pollFailuresRef.current[jobId] || 0) + 1;
      pollFailuresRef.current[jobId] = failures;
      reportError('BulkUploadPage.pollJob', err, { jobId, consecutiveFailures: failures });

      if (failures < MAX_CONSECUTIVE_POLL_FAILURES) {
        // Transient — keep polling, don't touch job status yet.
        return;
      }

      // Give it one last direct confirmation attempt before truly giving up.
      try {
        const confirmData = await getJobStatus(jobId);
        pollFailuresRef.current[jobId] = 0;
        setJobs(prev => prev.map(job => job.job_id === jobId ? { ...job, ...confirmData } : job));
        if (confirmData.status === 'completed' || confirmData.status === 'failed' || confirmData.status === 'cancelled') {
          setPolling(prev => ({ ...prev, [jobId]: false }));
        }
        return;
      } catch {
        // Genuinely unreachable after retries — now it's fair to mark failed.
        setJobs(prev =>
          prev.map(job =>
            job.job_id === jobId && job.status !== 'failed'
              ? { ...job, status: 'failed', error: 'Lost connection to server while checking status' }
              : job
          )
        );
        setPolling(prev => ({ ...prev, [jobId]: false }));
        pollFailuresRef.current[jobId] = 0;
      }
    }
  }, [queryClient]);

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
    pollFailuresRef.current[jobId] = 0;
    setPolling(prev => ({ ...prev, [jobId]: true }));
  }, []);

  const handleDelete = useCallback(async (jobId) => {
    if (!window.confirm('Delete this upload permanently? This removes the job, its email records, and the uploaded file.')) return;
    try {
      await deleteJob(jobId);
      setJobs(prev => prev.filter(job => job.job_id !== jobId));
      setPolling(prev => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Upload deleted successfully');
    } catch (err) {
      reportError('BulkUploadPage.deleteJob', err, { jobId });
      toast.error('Failed to delete upload');
    }
  }, [queryClient]);

  // Graceful cancellation — asks the backend to stop submitting new work.
  // The job's status flips to 'cancelled' asynchronously once the worker
  // notices (existing 2s poll picks that up); here we just mark it
  // "cancelling" locally so the button reflects that immediately, and
  // refresh dashboard stats right away per spec.
  const handleCancel = useCallback(async (jobId) => {
    if (!window.confirm('Cancel this upload? Emails already processed will be kept — only remaining, not-yet-started emails are skipped.')) return;

    setCancellingIds(prev => ({ ...prev, [jobId]: true }));
    try {
      await cancelJob(jobId);
      setJobs(prev => prev.map(job => job.job_id === jobId ? { ...job, cancel_requested: true } : job));
      pollFailuresRef.current[jobId] = 0;
      setPolling(prev => ({ ...prev, [jobId]: true })); // ensure polling stays on to catch the transition
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Cancellation requested — finishing in-flight emails…');
    } catch (err) {
      reportError('BulkUploadPage.cancelJob', err, { jobId });
      toast.error(err.message || 'Failed to cancel upload');
      setCancellingIds(prev => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }
  }, [queryClient]);

  const handleClearAll = useCallback(async () => {
    if (jobs.length === 0) return;
    if (!window.confirm(`Permanently delete all ${jobs.length} uploads? This cannot be undone.`)) return;
    try {
      await Promise.all(jobs.map(job => deleteJob(job.job_id)));
      setJobs([]);
      setPolling({});
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('All uploads deleted successfully');
    } catch (err) {
      reportError('BulkUploadPage.clearAll', err);
      toast.error('Failed to clear uploads');
    }
  }, [jobs, queryClient]);

  const handleToggleExpand = useCallback((jobId) => {
    setExpandedJob(prev => (prev === jobId ? null : jobId));
  }, []);

  const getStatusIcon = useCallback((status) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-info" />;
      case 'processing': return <Loader2 className="h-4 w-4 text-info animate-spin" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed': return <XCircle className="h-4 w-4 text-error" />;
      case 'cancelled': return <Ban className="h-4 w-4 text-warning" />;
      default: return <AlertTriangle className="h-4 w-4 text-warning" />;
    }
  }, []);

  const visibleJobs = useMemo(() => {
    const jobsArray = Array.isArray(jobs) ? jobs : [];
    return jobsArray
      .filter(job => matchesDateFilter(job, dateFilter))
      .sort((a, b) => {
        const statusA = getStatusOrder()[a.status] ?? 99;
        const statusB = getStatusOrder()[b.status] ?? 99;
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
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Upload History {!isLoadingJobs && `(${visibleJobs.length})`}
          </h2>
          {!isLoadingJobs && jobs.length > 0 && (
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

        {!isLoadingJobs && jobs.length > 0 && (
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

        {/* FIX (audit #16): explicit loading state instead of assuming
            jobs.length === 0 means "no data" — previously this flashed
            "No uploads yet" on every page load/refresh before the fetch
            resolved, jarring for anyone with existing uploads. */}
        {isLoadingJobs ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card h-20 animate-pulse">
                <div className="h-4 w-1/3 bg-[var(--foreground)]/10 rounded mb-3" />
                <div className="h-3 w-2/3 bg-[var(--foreground)]/10 rounded" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
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
            {visibleJobs.map((job) => (
              <motion.div key={job.job_id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="card group">
                <button
                  onClick={() => handleToggleExpand(job.job_id)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-[var(--muted)]/30 transition-colors"
                  aria-expanded={expandedJob === job.job_id}
                >
                  <div className={`p-3 rounded-xl flex-shrink-0 min-w-[48px] ${job.status === 'completed' ? 'bg-success/20 text-success' :
                      job.status === 'failed' ? 'bg-error/20 text-error' :
                        job.status === 'cancelled' ? 'bg-warning/20 text-warning' :
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
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <JobActions
                      job={job}
                      onRetry={handleRetry}
                      onDelete={handleDelete}
                      onCancel={handleCancel}
                      isCancelling={!!cancellingIds[job.job_id]}
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
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
