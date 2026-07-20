import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Upload as UploadIcon } from 'lucide-react';

import { bulkUpload, getJobStatus, listJobs, deleteJob, cancelJob } from '@/services/api';
import { reportError } from '@/utils/errorReporter';
import { istDateKey, istMonthKey } from '@/utils/dateUtils';
import { previewUploadFile } from '@/utils/csvPreview';
import { getStatusOrder } from '@/utils/jobUtils';

import UploadZone from '@/components/bulk/UploadZone';
import TopStatsRow from '@/components/bulk/TopStatsRow';
import HistoryToolbar from '@/components/bulk/HistoryToolbar';
import HistoryPagination from '@/components/bulk/HistoryPagination';
import JobCard from '@/components/bulk/JobCard';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// FIX (audit #11, preserved from original): a single failed poll (transient
// wifi blip, one-off 502) used to immediately flip the job to status:
// 'failed' on the client, even though the job was still healthy
// server-side. We tolerate a few consecutive poll failures before giving up.
const MAX_CONSECUTIVE_POLL_FAILURES = 3;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

const isValidUploadFile = (file) =>
  file && (file.type === 'text/csv' || /\.(csv|xlsx|xls)$/i.test(file.name));

const normalizeJobsList = (data) => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.jobs)) return data.jobs;
  if (data && Array.isArray(data.results)) return data.results;
  if (data && Array.isArray(data.items)) return data.items;
  console.warn('listJobs() returned an unexpected shape, defaulting to empty list:', data);
  return [];
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

export default function BulkUploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [expandedJob, setExpandedJob] = useState(null);
  const [polling, setPolling] = useState({});

  // History toolbar state — additive, doesn't change any existing behaviour.
  const [dateFilter, setDateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('status'); // 'status' = same default ordering as the original page (active jobs bubble to top)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  // Best-effort client-side preview (row count / email column / duplicates /
  // est. time) for the selected-file card. Purely a UI convenience — never
  // sent to the backend, never affects the real upload. See utils/csvPreview.js.
  useEffect(() => {
    if (!selectedFile) {
      setFilePreview(null);
      return;
    }
    // File size check before reading file for preview
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 50 MB.');
      setFilePreview(null);
      return;
    }
    let cancelled = false;
    setFilePreview({ loading: true });
    previewUploadFile(selectedFile)
      .then((result) => {
        if (!cancelled) setFilePreview({ loading: false, ...result });
      })
      .catch((err) => {
        reportError('BulkUploadPage.filePreview', err);
        if (!cancelled) setFilePreview({ loading: false, supported: false });
      });
    return () => { cancelled = true; };
  }, [selectedFile]);

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

  // FIX (audit #11, preserved): retry-with-backoff. A single failed poll no
  // longer immediately marks the job as failed — only after
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

  // Reset to page 1 whenever a filter/search/sort changes, so the user
  // never lands on an empty out-of-range page.
  useEffect(() => {
    setPage(1);
  }, [dateFilter, statusFilter, search, sortBy]);

  const visibleJobs = useMemo(() => {
    const jobsArray = Array.isArray(jobs) ? jobs : [];
    let list = jobsArray.filter(job => matchesDateFilter(job, dateFilter));

    if (statusFilter !== 'all') {
      list = list.filter(job => job.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(job =>
        (job.file_name || '').toLowerCase().includes(q) ||
        (job.job_id || '').toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      // 'status' (default) — same ordering the original page always used:
      // active jobs bubble to the top, then newest first.
      const order = getStatusOrder();
      const sa = order[a.status] ?? 99;
      const sb = order[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [jobs, dateFilter, statusFilter, search, sortBy]);

  const paginatedJobs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visibleJobs.slice(start, start + pageSize);
  }, [visibleJobs, page, pageSize]);

  const hasActiveFilters = search || statusFilter !== 'all' || dateFilter !== 'all';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <UploadIcon className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">Bulk Upload</h1>
        </div>
        <p className="text-[var(--foreground)]/60">Upload CSV or Excel files to verify multiple emails at once</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}>
        <UploadZone
          dragActive={dragActive}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          fileInputRef={fileInputRef}
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile}
          preview={filePreview}
          onRemoveFile={handleRemoveFile}
          onUpload={handleUpload}
          uploadPending={uploadMutation.isPending}
          maxFileSizeMB={50}
        />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
        <TopStatsRow jobs={jobs} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">
          Upload History {!isLoadingJobs && `(${visibleJobs.length})`}
        </h2>

        <HistoryToolbar
          search={search}
          onSearchChange={setSearch}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          onClearAll={handleClearAll}
          hasJobs={jobs.length > 0}
        />

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
            <UploadIcon className="h-16 w-16 text-[var(--foreground)]/20 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">No uploads yet</h3>
            <p className="text-[var(--foreground)]/50">Upload a CSV or Excel file above to start bulk verification</p>
          </div>
        ) : visibleJobs.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--foreground)]/50">
              {hasActiveFilters ? 'No uploads match your filters' : 'No uploads in this date range'}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {paginatedJobs.map((job, i) => (
                <JobCard
                  key={job.job_id}
                  job={job}
                  index={i}
                  expanded={expandedJob === job.job_id}
                  onToggleExpand={handleToggleExpand}
                  onRetry={handleRetry}
                  onDelete={handleDelete}
                  onCancel={handleCancel}
                  isCancelling={!!cancellingIds[job.job_id]}
                />
              ))}
            </div>

            <div className="card !p-0">
              <HistoryPagination
                page={page}
                pageSize={pageSize}
                total={visibleJobs.length}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                sizeOptions={PAGE_SIZE_OPTIONS}
              />
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
