import { motion } from 'framer-motion';
import { UploadCloud, Mail, CheckCircle2, Activity } from 'lucide-react';
import AnimatedCounter from './AnimatedCounter';
import { isJobActive } from '@/utils/jobUtils';

function StatCard({ icon: Icon, iconBg, iconColor, label, value, caption, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -2 }}
      className="card !p-5 flex items-center gap-4 transition-shadow hover:shadow-md"
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-[var(--foreground)]/50">{label}</p>
        <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums">
          <AnimatedCounter value={value} />
        </p>
        {caption && <p className="text-xs text-[var(--foreground)]/40 mt-0.5">{caption}</p>}
      </div>
    </motion.div>
  );
}

/**
 * All four numbers here are derived directly from the already-loaded
 * `jobs` list (same data the history below renders) — nothing fake,
 * nothing that needs a new backend endpoint. When the backend eventually
 * exposes real "Accuracy" or "Credits" data, adding a 5th StatCard here
 * is a one-line addition.
 */
export default function TopStatsRow({ jobs }) {
  const list = Array.isArray(jobs) ? jobs : [];
  const totalUploads = list.length;
  const emailsProcessed = list.reduce((sum, j) => sum + (j.processed ?? j.total ?? 0), 0);
  const completedJobs = list.filter((j) => j.status === 'completed').length;
  const activeJobs = list.filter((j) => isJobActive(j)).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={UploadCloud}
        iconBg="bg-indigo-100 dark:bg-indigo-900/20"
        iconColor="text-indigo-600"
        label="Total Uploads"
        value={totalUploads}
        caption="All-time"
        delay={0}
      />
      <StatCard
        icon={Mail}
        iconBg="bg-emerald-100 dark:bg-emerald-900/20"
        iconColor="text-emerald-600"
        label="Emails Processed"
        value={emailsProcessed}
        caption="Across all uploads"
        delay={0.05}
      />
      <StatCard
        icon={CheckCircle2}
        iconBg="bg-blue-100 dark:bg-blue-900/20"
        iconColor="text-blue-600"
        label="Completed Jobs"
        value={completedJobs}
        caption="Finished successfully"
        delay={0.1}
      />
      <StatCard
        icon={Activity}
        iconBg="bg-amber-100 dark:bg-amber-900/20"
        iconColor="text-amber-600"
        label="Active Jobs"
        value={activeJobs}
        caption="Pending + processing"
        delay={0.15}
      />
    </div>
  );
}
