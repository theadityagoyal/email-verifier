import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Clock, Download, RotateCcw, StopCircle, ChevronDown, Copy, Ban,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import BulkStatusBadge, { getBulkStatusMeta } from './BulkStatusBadge';
import JobActionsMenu from './JobActionsMenu';
import { calculateJobStats, isJobActive } from '@/utils/jobUtils';
import { formatDateTimeIST, formatDurationShort } from '@/utils/dateUtils';
import { getFileExt, getFileExtBadgeClass } from '@/utils/fileHelpers';
import { exportJobResults } from '@/services/api';

function StatTile({ label, value, colorClass }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-bold tabular-nums ${colorClass}`}>{value.toLocaleString()}</p>
      <p className="text-[11px] text-[var(--foreground)]/50">{label}</p>
    </div>
  );
}

export default function JobCard({
  job,
  index,
  expanded,
  onToggleExpand,
  onRetry,
  onDelete,
  onCancel,
  isCancelling,
}) {
  const { safeCount, riskyCount, unsafeCount, totalCount, processedCount, progressPct } = calculateJobStats(job);
  const active = isJobActive(job);
  const meta = getBulkStatusMeta(job.status);
  const ext = getFileExt(job.file_name);

  // started_at falls back to created_at (job may not have "started" yet in
  // the DB sense but was created either way); completed_at stays null while
  // still running, so formatDurationShort measures against "now" and keeps
  // ticking up naturally on every 2s poll re-render — no separate timer needed.
  const durationStart = job.started_at || job.created_at;
  const duration = formatDurationShort(durationStart, job.completed_at || null);

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(job.job_id);
    toast.success('Job ID copied');
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      className="card !p-0 overflow-hidden"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggleExpand(job.job_id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpand(job.job_id); } }}
        className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 cursor-pointer hover:bg-[var(--card-hover)]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
        aria-expanded={expanded}
      >
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${meta.avatarClasses}`}>
          <meta.icon className={`h-5 w-5 ${meta.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[var(--foreground)] truncate max-w-[240px]">
              {job.file_name || `Job ${job.job_id.slice(0, 8)}...`}
            </p>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${getFileExtBadgeClass(ext)}`}>{ext}</span>
            <BulkStatusBadge status={job.status} size="sm" />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--foreground)]/50 flex-wrap">
            <span className="flex items-center gap-1 font-mono">
              Job ID: {job.job_id.slice(0, 8)}...
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleCopyId(); }}
                className="text-[var(--foreground)]/30 hover:text-[var(--foreground)] transition-colors"
                aria-label="Copy Job ID"
              >
                <Copy className="h-3 w-3" />
              </button>
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden="true" /> {formatDateTimeIST(job.created_at)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" /> {duration}
            </span>
          </div>

          {/* Requirement: progress must be visible on the COLLAPSED card, not
              hidden behind an expand click. */}
          {active && (
            <div className="mt-2.5 max-w-md">
              <div className="flex items-center justify-between text-[11px] text-[var(--foreground)]/50 mb-1">
                <span>{processedCount.toLocaleString()} / {totalCount.toLocaleString()} processed</span>
                <span className="font-semibold text-[var(--foreground)]">{progressPct}%</span>
              </div>
              <div className="h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
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

        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          <div className="hidden md:flex items-center gap-4">
            <StatTile label="Safe" value={safeCount} colorClass="text-success" />
            <StatTile label="Risky" value={riskyCount} colorClass="text-warning" />
            <StatTile label="Unsafe" value={unsafeCount} colorClass="text-error" />
            <StatTile label="Total" value={totalCount} colorClass="text-[var(--foreground)]" />
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {job.status === 'completed' && (
              <a href={exportJobResults(job.job_id)}>
                <Button asChild variant="outline" size="sm">
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </a>
            )}
            {active && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCancel(job.job_id)}
                disabled={isCancelling || job.cancel_requested}
                loading={isCancelling}
                className="text-warning hover:text-warning hover:bg-warning/10"
                title={job.cancel_requested ? 'Cancellation in progress…' : 'Cancel this job'}
              >
                {!isCancelling && <StopCircle className="h-3.5 w-3.5" />}
                {job.cancel_requested ? 'Cancelling…' : 'Cancel'}
              </Button>
            )}
            {(job.status === 'failed' || job.status === 'pending') && (
              <Button variant="ghost" size="sm" onClick={() => onRetry(job.job_id)}>
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </Button>
            )}

            <JobActionsMenu jobId={job.job_id} onCopyId={handleCopyId} onDelete={onDelete} />

            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-[var(--foreground)]/40 pl-1"
              aria-hidden="true"
            >
              <ChevronDown className="h-4 w-4" />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Compact stat row for mobile, where the desktop inline columns are hidden */}
      <div className="md:hidden flex items-center justify-around px-4 pb-3 -mt-1">
        <StatTile label="Safe" value={safeCount} colorClass="text-success" />
        <StatTile label="Risky" value={riskyCount} colorClass="text-warning" />
        <StatTile label="Unsafe" value={unsafeCount} colorClass="text-error" />
        <StatTile label="Total" value={totalCount} colorClass="text-[var(--foreground)]" />
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-[var(--muted)] overflow-hidden"
          >
            <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-[var(--muted)]/30">
                <p className="text-xs text-[var(--foreground)]/50">Job ID</p>
                <p className="font-mono text-sm text-[var(--foreground)] break-all">{job.job_id}</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--muted)]/30">
                <p className="text-xs text-[var(--foreground)]/50">File Name</p>
                <p className="font-medium text-sm text-[var(--foreground)] truncate">{job.file_name || 'Unknown'}</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--muted)]/30">
                <p className="text-xs text-[var(--foreground)]/50">Created (IST)</p>
                <p className="font-medium text-sm text-[var(--foreground)]">{formatDateTimeIST(job.created_at)}</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--muted)]/30">
                <p className="text-xs text-[var(--foreground)]/50">Status</p>
                <BulkStatusBadge status={job.status} size="sm" />
              </div>
            </div>

            {job.status === 'cancelled' && (
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-3 py-2.5 text-sm text-warning">
                  <Ban className="h-4 w-4 shrink-0" />
                  Cancelled after processing {processedCount.toLocaleString()} of {totalCount.toLocaleString()} emails.
                  Results already processed are preserved and available above.
                </div>
              </div>
            )}

            {job.status === 'completed' && (
              <div className="px-4 pb-4">
                <a
                  href={exportJobResults(job.job_id)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg hover:bg-[var(--primary)]/20 transition-colors text-sm font-medium"
                >
                  <Download className="h-4 w-4" />
                  Download Full Results
                </a>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
