import { Link } from 'react-router-dom';
import { Mail, ArrowRight } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { scoreColorClass } from '@/utils/scoreThresholds';
import { relativeTime } from '@/utils/dateUtils';

export default function RecentVerificationsList({ items = [] }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[var(--foreground)]">Recent Verifications</h3>
        <Link to="/emails" className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1">
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--foreground)]/40 py-6 text-center">No verifications yet</p>
      ) : (
        <div>
          {items.map((item) => (
            <div
              key={item.email}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--muted)] last:border-0"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Mail className="h-4 w-4 text-[var(--foreground)]/30 shrink-0" />
                <span className="text-sm font-mono text-[var(--foreground)] truncate">{item.email}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge email={item} showIcon={false} />
                <span className={`text-sm font-semibold tabular-nums px-1.5 rounded ${scoreColorClass(item.score)}`}>
                  {item.score}
                </span>
                <span className="text-xs text-[var(--foreground)]/40 w-20 text-right">
                  {relativeTime(item.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
