// Utility functions for job calculations
export const calculateJobStats = (job) => {
  const safeCount = job.safe ?? job.verified ?? 0;
  const riskyCount = job.risky ?? 0;
  const unsafeCount = job.unsafe ?? job.invalid ?? 0;
  const totalCount = job.total ?? 0;
  const processedCount = job.processed ?? 0;
  const progressPct = Math.min(100, Math.max(0, job.progress_percent ?? 0));

  return {
    safeCount,
    riskyCount,
    unsafeCount,
    totalCount,
    processedCount,
    progressPct
  };
};

export const getStatusOrder = () => ({
  pending: 0,
  processing: 1,
  completed: 2,
  failed: 3,
  cancelled: 4,
});

export const isJobActive = (job) => {
  const status = job.status ?? '';
  return status === 'pending' || status === 'processing';
};
