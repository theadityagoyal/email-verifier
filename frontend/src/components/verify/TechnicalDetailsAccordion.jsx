import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Terminal } from 'lucide-react';

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--muted)] last:border-0">
      <span className="text-xs font-mono text-[var(--foreground)]/50">{label}</span>
      <span className="text-xs font-mono text-[var(--foreground)]">
        {typeof value === 'boolean' ? String(value) : value === null || value === undefined ? '—' : String(value)}
      </span>
    </div>
  );
}

export default function TechnicalDetailsAccordion({ result, forceOpen = false }) {
  const [open, setOpen] = useState(forceOpen);

  if (!result) return null;

  const rawFields = [
    'email',
    'domain',
    'status',
    'score',
    'syntax_valid',
    'domain_exists',
    'mx_found',
    'smtp_valid',
    'disposable',
    'role_based',
    'catch_all',
    'username_quality',
    'verified_at',
  ];

  return (
    <div id="technical-details" className="card !p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--muted)]/20 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[var(--foreground)]/50" />
          <span className="font-medium text-[var(--foreground)]">Technical Details</span>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-[var(--foreground)]/50" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              <p className="text-xs text-[var(--foreground)]/40 mb-2">Raw response fields</p>
              {rawFields.map((field) => (
                <Row key={field} label={field} value={result[field]} />
              ))}

              {result.username_flags && result.username_flags.length > 0 && (
                <div className="pt-2">
                  <Row label="username_flags" value={`[${result.username_flags.join(', ')}]`} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
