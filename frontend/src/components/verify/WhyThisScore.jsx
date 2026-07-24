import { motion } from 'framer-motion';
import { HelpCircle, CheckCircle2, XCircle, MinusCircle, Info } from 'lucide-react';
import { getSubStatusInfo, CONFIDENCE_LABELS } from './statusConfig';

const LINE_ICON = {
  verified: { Icon: CheckCircle2, className: 'text-success' },
  issue: { Icon: XCircle, className: 'text-error' },
  not_applicable: { Icon: MinusCircle, className: 'text-[var(--foreground)]/30' },
  couldnt_verify: { Icon: Info, className: 'text-warning' },
};

export default function WhyThisScore({ resolvedChecks, recommendationLabel, subStatus, confidence }) {
  const subStatusInfo = getSubStatusInfo(subStatus);
  const confidenceInfo = CONFIDENCE_LABELS[confidence] || { label: confidence || 'Unknown', color: 'neutral', description: '' };

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

      {subStatus && (
        <div className="mt-4 pt-4 border-t border-[var(--muted)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Details:</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full bg-[var(--${subStatusInfo.color})]/10 text-[var(--${subStatusInfo.color})] border border-[var(--${subStatusInfo.color})]/30`}
            >
              {subStatusInfo.label}
            </span>
          </div>
          <p className="text-sm text-[var(--foreground)]/70">{subStatusInfo.summary}</p>
        </div>
      )}

      {confidence && (
        <div className="mt-4 pt-4 border-t border-[var(--muted)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Confidence:</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full bg-[var(--${confidenceInfo.color})]/10 text-[var(--${confidenceInfo.color})] border border-[var(--${confidenceInfo.color})]/30`}
            >
              {confidenceInfo.label}
            </span>
          </div>
          <p className="text-sm text-[var(--foreground)]/70">{confidenceInfo.description}</p>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-[var(--muted)] flex items-center gap-2">
        <span className="text-sm text-[var(--foreground)]/60">Therefore:</span>
        <span className="text-sm font-semibold text-[var(--foreground)]">{recommendationLabel}</span>
      </div>
    </motion.div>
  );
}
