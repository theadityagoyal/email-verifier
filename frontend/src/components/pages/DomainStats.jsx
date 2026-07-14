import { motion } from 'framer-motion';
import {
  Globe,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Mail as MailIcon,
  Ban,
} from 'lucide-react';

// FIX (audit #37): removed the unused bare `Mail` import — only `MailIcon`
// (aliased from the same lucide export) was ever actually used below.
export default function DomainStats({ overview, safePct, riskyUnsafePct }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
    >
      {/* Total Domains */}
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/20">
            <Globe className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm text-[var(--foreground)]/50">Total Domains</p>
            <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums">
              {(overview?.total_domains ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--foreground)]/50">Across all time</p>
      </div>

      {/* Total Emails */}
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/20">
            <MailIcon className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm text-[var(--foreground)]/50">Total Emails</p>
            <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums">
              {(overview?.total_emails ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--foreground)]/50">Across all domains</p>
      </div>

      {/* Safe */}
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/20">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-[var(--foreground)]/50">Safe</p>
            <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums">
              {(overview?.safe ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm font-medium text-emerald-600">{safePct}% of total</p>
      </div>

      {/* Risky + Unsafe */}
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm text-[var(--foreground)]/50">Risky + Unsafe</p>
            <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums">
              {((overview?.risky ?? 0) + (overview?.unsafe ?? 0)).toLocaleString()}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm font-medium text-amber-600">{riskyUnsafePct}% of total</p>
      </div>

      {/* Flagged Domains */}
      <div className="card">
        <p className="text-sm font-semibold text-[var(--foreground)] mb-3">Flagged Domains</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/10 px-2 py-2">
            <Trash2 className="h-4 w-4 text-red-500 shrink-0" />
            <div>
              <p className="text-[10px] text-[var(--foreground)]/50 leading-none">Disposable</p>
              <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">
                {overview?.disposable_domains ?? 0}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/10 px-2 py-2">
            <MailIcon className="h-4 w-4 text-indigo-500 shrink-0" />
            <div>
              <p className="text-[10px] text-[var(--foreground)]/50 leading-none">Catch-all</p>
              <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">
                {overview?.catch_all_domains ?? 0}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 px-2 py-2">
            <Ban className="h-4 w-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-[10px] text-[var(--foreground)]/50 leading-none">No MX</p>
              <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">
                {overview?.no_mx_domains ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
