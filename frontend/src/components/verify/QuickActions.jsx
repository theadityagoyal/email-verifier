import { useState } from 'react';
import { Copy, Check, FileDown, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';

/**
 * "Download PDF Report" uses the browser's native print-to-PDF (no new
 * dependency needed, genuinely produces a real PDF via the OS print
 * dialog) rather than a fake/disabled button — printing only the
 * `#verify-report` region via a print stylesheet injected here.
 */
function triggerPrintReport() {
  document.body.classList.add('print-verify-report');
  window.print();
  // Cleanup shortly after — afterprint fires inconsistently across
  // browsers when the dialog is cancelled, so a short timeout is more
  // reliable than relying on it alone.
  setTimeout(() => document.body.classList.remove('print-verify-report'), 1000);
}

export default function QuickActions({ email, result, onVerifyAnother }) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 1800);
  };

  const handleCopyResult = async () => {
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopiedResult(true);
    setTimeout(() => setCopiedResult(false), 1800);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleCopyEmail}>
        {copiedEmail ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        {copiedEmail ? 'Copied' : 'Copy Email'}
      </Button>
      <Button variant="outline" size="sm" onClick={handleCopyResult}>
        {copiedResult ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        {copiedResult ? 'Copied' : 'Copy Result'}
      </Button>
      <Button variant="outline" size="sm" onClick={triggerPrintReport}>
        <FileDown className="h-3.5 w-3.5" />
        Download PDF Report
      </Button>
      <Button variant="ghost" size="sm" onClick={onVerifyAnother}>
        <RotateCcw className="h-3.5 w-3.5" />
        Verify Another Email
      </Button>
    </div>
  );
}
