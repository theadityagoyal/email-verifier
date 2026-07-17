import { motion } from 'framer-motion';
import { HelpCircle, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';

const LINE_ICON = {
  verified: { Icon: CheckCircle2, className: 'text-success' },
  issue: { Icon: XCircle, className: 'text-error' },
  not_applicable: { Icon: MinusCircle, className: 'text-[var(--foreground)]/30' },
};

export default function WhyThisScore({ resolvedChecks, recommendationLabel }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="card"
    >
      <div className="flex items-center gap-2 mb-4">
        <HelpCircle className="h-4 w-4 text-[var(--primary)]" />
        <h3 className="font-semibold text-[var(--foreground)]">Why this score?</h3>
      </div>

      <ul className="space-y-2.5">
        {resolvedChecks.map((check) => {
          const { Icon, className } = LINE_ICON[check.status] || LINE_ICON.not_applicable;
          return (
            <li key={check.key} className="flex items-start gap-2.5 text-sm">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${className}`} aria-hidden="true" />
              <span className="text-[var(--foreground)]/80">
                <span className="font-medium text-[var(--foreground)]">{check.title}</span>
                {' — '}
                {check.description}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 pt-4 border-t border-[var(--muted)] flex items-center gap-2">
        <span className="text-sm text-[var(--foreground)]/60">Therefore:</span>
        <span className="text-sm font-semibold text-[var(--foreground)]">{recommendationLabel}</span>
      </div>
    </motion.div>
  );
}
