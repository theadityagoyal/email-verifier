import { CheckCircle2, XCircle, MinusCircle, ListChecks } from 'lucide-react';

const LEGEND_ITEMS = [
  {
    Icon: CheckCircle2,
    color: 'text-success',
    label: 'Verified',
    description: 'Everything looks good.',
  },
  {
    Icon: XCircle,
    color: 'text-error',
    label: 'Issue Found',
    description: 'May impact deliverability.',
  },
  {
    Icon: MinusCircle,
    color: 'text-[var(--foreground)]/40',
    label: 'Not Applicable',
    description: 'Skipped because an earlier check did not pass.',
  },
];

export default function StatusLegend() {
  return (
    <div className="card space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ListChecks className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="font-semibold text-[var(--foreground)]">Status Legend</h3>
        </div>
        <p className="text-sm text-[var(--foreground)]/50">
          Every check below uses one of these three states.
        </p>
      </div>

      <div className="space-y-4">
        {LEGEND_ITEMS.map(({ Icon, color, label, description }) => (
          <div key={label} className="flex items-start gap-3">
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
              <p className="text-xs text-[var(--foreground)]/50 mt-0.5">{description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-[var(--muted)] space-y-2">
        <p className="text-xs font-medium text-[var(--foreground)]/60">Score bands</p>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full bg-success shrink-0" />
          <span className="text-[var(--foreground)]/50">80–100</span>
          <span className="ml-auto text-success font-medium">Safe to Send</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full bg-warning shrink-0" />
          <span className="text-[var(--foreground)]/50">60–79</span>
          <span className="ml-auto text-warning font-medium">Use with Caution</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full bg-error shrink-0" />
          <span className="text-[var(--foreground)]/50">Below 60</span>
          <span className="ml-auto text-error font-medium">Not Recommended</span>
        </div>
      </div>
    </div>
  );
}
