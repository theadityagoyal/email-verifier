import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FolderOpen, FileText, X, Check, Hash, Mail as MailIcon, Copy as DuplicateIcon, Clock3 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { getFileExt, getFileExtBadgeClass, formatFileSize } from '@/utils/fileHelpers';

function formatPreviewValue(preview, field) {
  if (!preview || !preview.supported) return field === 'estimate' || field === 'duplicates' ? '—' : 'After upload';
  if (field === 'totalRows') {
    return typeof preview.totalRows === 'number' ? preview.totalRows.toLocaleString() : '—';
  }
  if (field === 'emailColumn') return preview.emailColumn || '—';
  if (field === 'duplicates') {
    return typeof preview.duplicates === 'number' ? preview.duplicates.toLocaleString() : '0';
  }
  if (field === 'estimate') return preview.estimate || '—';
  return '—';
}

function PreviewStat({ icon: Icon, label, loading, value }) {
  return (
    <div className="rounded-xl bg-[var(--muted)]/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--foreground)]/50 mb-1">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </div>
      {loading ? (
        <div className="skeleton h-4 w-14" />
      ) : (
        <p className="text-sm font-semibold text-[var(--foreground)] truncate">{value}</p>
      )}
    </div>
  );
}

/**
 * Always-mounted upload card. Left side (drag & drop / browse) never
 * disappears; the right side simply grows in once a file is selected —
 * matches the "keep upload card persistent" requirement. Nothing here
 * touches upload/business logic, that all still lives in BulkUploadPage.
 */
export default function UploadZone({
  dragActive,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  fileInputRef,
  onFileSelect,
  selectedFile,
  preview,
  onRemoveFile,
  onUpload,
  uploadPending,
}) {
  const hasFile = !!selectedFile;
  const ext = hasFile ? getFileExt(selectedFile.name) : null;
  const loading = !!preview?.loading;

  return (
    <motion.div
      layout
      className={`card !p-0 overflow-hidden border-2 border-dashed transition-colors duration-200 ${
        dragActive ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--muted)]'
      }`}
    >
      <div className={`grid grid-cols-1 ${hasFile ? 'md:grid-cols-2 md:divide-x md:divide-[var(--muted)]' : ''}`}>
        {/* LEFT — always-present drop zone, replacing a file just drops a new one in */}
        <div
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className="relative text-center px-6 py-10 md:py-14"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onFileSelect}
            className="hidden"
            aria-label="Choose CSV or Excel file"
          />
          <div className="h-14 w-14 rounded-full bg-[var(--primary)]/10 flex items-center justify-center mx-auto mb-4">
            <Upload className="h-6 w-6 text-[var(--primary)]" aria-hidden="true" />
          </div>
          <p className="font-medium text-[var(--foreground)] mb-1">
            Drag &amp; drop your <span className="text-[var(--primary)]">CSV or Excel</span> file here
          </p>
          <p className="text-sm text-[var(--foreground)]/50 mb-5">or click to browse</p>
          <p className="text-xs text-[var(--foreground)]/40 mb-5">
            Max file size: 50MB &middot; Formats: .csv, .xlsx, .xls &middot; Column: email (required)
          </p>
          <Button type="button" variant="primary" onClick={() => fileInputRef.current?.click()}>
            <FolderOpen className="h-4 w-4" />
            Browse Files
          </Button>
        </div>

        {/* RIGHT — selected file preview. Only ever ADDS to the card, never replaces the left side. */}
        <AnimatePresence>
          {hasFile && (
            <motion.div
              key={selectedFile.name + selectedFile.size}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="p-6 flex flex-col justify-center bg-[var(--card)]"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <FileText className="h-9 w-9 text-[var(--foreground)]/30" aria-hidden="true" />
                    <span
                      className={`absolute -bottom-1 -right-2 rounded px-1 text-[9px] font-bold ${getFileExtBadgeClass(ext)}`}
                    >
                      {ext}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--foreground)] truncate">{selectedFile.name}</p>
                    <p className="text-xs text-[var(--foreground)]/50">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <button
                    type="button"
                    onClick={onRemoveFile}
                    disabled={uploadPending}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--foreground)]/40 hover:text-error hover:bg-error/10 transition-colors disabled:opacity-40"
                    aria-label="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                <PreviewStat icon={Hash} label="Total Rows" loading={loading} value={formatPreviewValue(preview, 'totalRows')} />
                <PreviewStat icon={MailIcon} label="Email Column" loading={loading} value={formatPreviewValue(preview, 'emailColumn')} />
                <PreviewStat icon={DuplicateIcon} label="Duplicates" loading={loading} value={formatPreviewValue(preview, 'duplicates')} />
                <PreviewStat icon={Clock3} label="Est. Time" loading={loading} value={formatPreviewValue(preview, 'estimate')} />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={onUpload}
                  loading={uploadPending}
                  disabled={uploadPending}
                  className="flex-1"
                >
                  {!uploadPending && <Upload className="h-4 w-4" />}
                  Upload &amp; Verify
                </Button>
                <Button variant="outline" onClick={onRemoveFile} disabled={uploadPending}>
                  Remove File
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
