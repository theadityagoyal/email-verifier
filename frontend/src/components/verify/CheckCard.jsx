import { motion } from 'framer-motion';
import { Loader2, Circle } from 'lucide-react';
import { STATUS_COLOR_CLASSES } from './statusConfig';

/**
 * One check in the horizontal verification row.
 *
 * phase: 'idle' | 'checking' | 'resolved'
 * resolved (from resolveCheckStatus) only needs to be provided once phase
 * is 'checking' or 'resolved' — this component never computes status
 * itself, it only renders what it's told.
 */
export default function CheckCard({ title, Icon, phase, resolved, compact = false }) {
  const colorClasses = resolved ? STATUS_COLOR_CLASSES[resolved.color] : STATUS_COLOR_CLASSES.neutral;
  const StatusIcon = resolved?.statusIcon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: phase === 'idle' ? 0.45 : 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 min-w-[92px] transition-colors duration-300 ${
        phase === 'resolved' ? `${colorClasses.bg} ${colorClasses.border}` : 'border-[var(--muted)] bg-[var(--muted)]/20'
      } ${compact ? 'px-2 py-2 min-w-[76px]' : ''}`}
    >
      <div className="relative h-7 w-7 flex items-center justify-center">
        {phase === 'idle' && <Circle className="h-4 w-4 text-[var(--foreground)]/25" />}
        {phase === 'checking' && <Loader2 className="h-5 w-5 text-[var(--primary)] animate-spin" />}
        {phase === 'resolved' && StatusIcon && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <StatusIcon className={`h-5 w-5 ${colorClasses.text}`} />
          </motion.div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Icon className="h-3 w-3 text-[var(--foreground)]/40" aria-hidden="true" />
        <span className="text-xs font-medium text-[var(--foreground)]">{title}</span>
      </div>

      <span
        className={`text-[10px] font-medium ${
          phase === 'resolved' ? colorClasses.text : 'text-[var(--foreground)]/35'
        }`}
      >
        {phase === 'idle' && 'Waiting'}
        {phase === 'checking' && 'Checking…'}
        {phase === 'resolved' && resolved?.label}
      </span>
    </motion.div>
  );
}
