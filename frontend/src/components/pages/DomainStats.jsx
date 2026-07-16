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
//
// UI/UX FIX #4 (Flagged Domains cramped layout):
//   1. Grid changed from a rigid 5-equal-column layout (`lg:grid-cols-5`) to
//      a 6-track layout (`lg:grid-cols-6`) where the first four stat cards
//      each take 1 track and the Flagged Domains card takes 2 — giving it
//      genuinely more horizontal room instead of squeezing 3 flag rows into
//      the same width as a single number card.
//   2. Inside Flagged Domains, the three flag items now stack full-width on
//      mobile (clear vertical rhythm, no wrapping) and only switch to a
//      3-column row once there's actually room for it (`sm:grid-cols-3`),
//      with consistent icon sizing, padding, and truncation-safe labels.
export default function DomainStats({ overview, safePct, riskyUnsafePct }) {
  const flags = [
    {
      key: 'disposable',
      label: 'Disposable',
      value: overview?.disposable_domains ?? 0,
      icon: Trash2,
      iconBg: 'bg-red-100 dark:bg-red-900/20',
      iconColor: 'text-red-500',
    },
    {
      key: 'catch_all',
      label: 'Catch-all',
      value: overview?.catch_all_domains ?? 0,
      icon: MailIcon,
      iconBg: 'bg-indigo-100 dark:bg-indigo-900/20',
      iconColor: 'text-indigo-500',
    },
    {
      key: 'no_mx',
      label: 'No MX Records',
      value: overview?.no_mx_domains ?? 0,
      icon: Ban,
      iconBg: 'bg-amber-100 dark:bg-amber-900/20',
      iconColor: 'text-amber-500',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4"
    >
      {/* Total Domains */}
      <div className="card lg:col-span-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/20 transition-transform duration-200 hover:scale-105">
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
      <div className="card lg:col-span-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/20 transition-transform duration-200 hover:scale-105">
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
      <div className="card lg:col-span-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/20 transition-transform duration-200 hover:scale-105">
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
      <div className="card lg:col-span-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20 transition-transform duration-200 hover:scale-105">
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

      {/* Flagged Domains — now spans 2 tracks on desktop so its 3 flag
          rows have real breathing room instead of squeezing into a
          1/5-width card. */}
      <div className="card sm:col-span-2 lg:col-span-2 transition-all duration-200 hover:shadow-md">
        <p className="text-sm font-semibold text-[var(--foreground)] mb-4">Flagged Domains</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {flags.map(({ key, label, value, icon: Icon, iconBg, iconColor }) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-xl bg-[var(--muted)]/30 px-3.5 py-3 transition-all duration-200 hover:bg-[var(--muted)]/50 hover:-translate-y-0.5"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[var(--foreground)]/50 leading-tight truncate">{label}</p>
                <p className="text-lg font-bold text-[var(--foreground)] tabular-nums leading-tight">
                  {value.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
