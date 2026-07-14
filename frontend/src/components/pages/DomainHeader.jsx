import { motion } from 'framer-motion';
import {
  Download,
  Trash2,
} from 'lucide-react';
import Button from '@/components/ui/Button';

// FIX (audit #23): removed the legacy single-value sort <select>. It could
// only represent 5 of the now much larger set of sortable columns
// (SORTABLE_DOMAIN_FIELDS on the backend) — sorting by e.g. mx_status, trend,
// safe, risky, or unsafe left this dropdown showing a blank/mismatched state
// while the table (via per-column SortHeader) was correctly sorted. Rather
// than maintain two competing sort controls, this dropdown is gone —
// SortHeader on each column is the one source of truth for sort state.
export default function DomainHeader({ selected, selectedLength, onExport, onDeleteSelected, isExporting, isDeleting, openMenu, setOpenMenu }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
      onClick={() => openMenu && setOpenMenu(null)}
    >
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-1">Domains</h1>
        <p className="text-[var(--foreground)]/60">Domain analytics and deliverability insights</p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onExport} loading={isExporting} disabled={isExporting}>
          {!isExporting && <Download className="h-4 w-4" />}
          Export
        </Button>
        <Button
          variant="danger"
          disabled={selectedLength === 0 || isDeleting}
          loading={isDeleting}
          onClick={onDeleteSelected}
        >
          {!isDeleting && <Trash2 className="h-4 w-4" />}
          Delete Selected ({selectedLength})
        </Button>
      </div>
    </motion.div>
  );
}
