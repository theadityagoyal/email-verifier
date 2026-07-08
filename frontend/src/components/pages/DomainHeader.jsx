import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Download,
  Trash2,
} from 'lucide-react';
import Button from '@/components/ui/Button';

export default function DomainHeader({ selected, selectedLength, onExport, onDeleteSelected, openMenu, setOpenMenu, sort, setSort, SORT_OPTIONS }) {
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
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
            }}
            className="rounded-full border border-[var(--muted)] bg-[var(--background)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)]"
            aria-label="Sort domains"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" onClick={onExport}>
          <Download className="h-4 w-4" />
          Export
        </Button>
        <Button variant="danger" disabled={selectedLength === 0} onClick={onDeleteSelected}>
          <Trash2 className="h-4 w-4" />
          Delete Selected ({selectedLength})
        </Button>
      </div>
    </motion.div>
  );
}