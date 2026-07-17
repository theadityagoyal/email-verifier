import { motion } from 'framer-motion';
import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { STATUS_COLOR_CLASSES } from './statusConfig';

const ICON_MAP = {
  success: ShieldCheck,
  warning: ShieldAlert,
  error: ShieldX,
};

export default function RecommendationBanner({ recommendation, reason }) {
  const colors = STATUS_COLOR_CLASSES[recommendation.color];
  const Icon = ICON_MAP[recommendation.color] || ShieldCheck;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`rounded-2xl border ${colors.border} ${colors.bg} p-5`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`p-2.5 rounded-xl ${colors.bg} ${colors.text} shrink-0`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className={`text-lg font-bold ${colors.text}`}>{recommendation.label}</p>
            <p className="text-sm text-[var(--foreground)]/60">{recommendation.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 pl-0 sm:pl-4 sm:border-l sm:border-[var(--muted)]">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--foreground)]/40">Confidence</p>
            <p className="text-sm font-semibold text-[var(--foreground)]">{recommendation.confidence}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--foreground)]/40">Risk</p>
            <p className="text-sm font-semibold text-[var(--foreground)]">{recommendation.risk}</p>
          </div>
        </div>
      </div>

      {reason && (
        <p className="mt-3 pt-3 border-t border-[var(--muted)]/60 text-xs text-[var(--foreground)]/60">
          {reason.text}
          {reason.issues.length > 0 && (
            <span> Issues found in: {reason.issues.join(', ')}.</span>
          )}
        </p>
      )}
    </motion.div>
  );
}
