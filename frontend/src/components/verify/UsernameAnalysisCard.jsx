import { motion } from 'framer-motion';
import { UserCircle2, CheckCircle2 } from 'lucide-react';
import {
  getFlagInfo,
  getVerdictInfo,
  buildUsernameSummary,
  CLEAN_USERNAME_HIGHLIGHTS,
} from './usernameFlags';
import { STATUS_COLOR_CLASSES } from './statusConfig';

export default function UsernameAnalysisCard({ usernameQuality, usernameFlags }) {
  if (!usernameQuality && (!usernameFlags || usernameFlags.length === 0)) {
    return null;
  }

  const verdictInfo = getVerdictInfo(usernameQuality);
  const colors = STATUS_COLOR_CLASSES[verdictInfo.color] || STATUS_COLOR_CLASSES.neutral;
  const summary = buildUsernameSummary(usernameQuality, usernameFlags);
  const hasFlags = usernameFlags && usernameFlags.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
      className="card"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <UserCircle2 className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="font-semibold text-[var(--foreground)]">Username Analysis</h3>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors.bg} ${colors.text}`}>
          {verdictInfo.title}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-start">
        <div className={`hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${colors.bg}`}>
          <UserCircle2 className={`h-9 w-9 ${colors.text}`} />
        </div>

        <div className="space-y-3">
          {hasFlags ? (
            <ul className="space-y-2">
              {usernameFlags.map((flagName) => {
                const info = getFlagInfo(flagName);
                const FlagIcon = info.icon;
                return (
                  <li key={flagName} className="flex items-start gap-2.5 text-sm">
                    <FlagIcon className="h-4 w-4 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                    <span>
                      <span className="font-medium text-[var(--foreground)]">{info.title}</span>
                      <span className="text-[var(--foreground)]/60"> — {info.description}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="space-y-2">
              {CLEAN_USERNAME_HIGHLIGHTS.map((line) => (
                <li key={line} className="flex items-center gap-2.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  <span className="text-[var(--foreground)]/80">{line}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-[var(--foreground)]/50 pt-2 border-t border-[var(--muted)]">
            {summary}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
