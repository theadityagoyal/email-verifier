import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import {
  Mail, CheckCircle, XCircle, AlertTriangle, Clock,
  Search, Loader2, ChevronDown, Copy,
  ExternalLink, AlertCircle, Info, Shield, Globe, Zap, Layers, Timer, ShieldCheck
} from 'lucide-react';
import { verifyEmail } from '@/services/api';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import CircularProgress from '@/components/ui/CircularProgress';

const defaultResult = {
  email: '', domain: '', status: 'processing',
  syntax_valid: false, domain_exists: false, mx_found: false, smtp_valid: false,
  disposable: false, role_based: false, catch_all: false,
  score: 0, username_quality: '', username_flags: [],
};

const detailItems = [
  { key: 'syntax_valid', label: 'Syntax Valid', icon: CheckCircle, description: 'Email format follows RFC standards' },
  { key: 'domain_exists', label: 'Domain Exists', icon: Globe, description: 'Domain has valid DNS records' },
  { key: 'mx_found', label: 'MX Records Found', icon: Mail, description: 'Mail exchange servers configured' },
  { key: 'smtp_valid', label: 'SMTP Valid', icon: Shield, description: 'Mail server accepts connections' },
  { key: 'disposable', label: 'Disposable', icon: AlertTriangle, description: 'Temporary/throwaway email detected', inverted: true },
  { key: 'role_based', label: 'Role-based', icon: Info, description: 'Generic role address (admin@, info@, etc.)', inverted: true },
  { key: 'catch_all', label: 'Catch-all', icon: AlertCircle, description: 'Domain accepts all emails', inverted: true },
];

const previewChecks = [
  { icon: CheckCircle, label: 'Syntax' },
  { icon: Mail, label: 'MX Records' },
  { icon: Shield, label: 'SMTP' },
  { icon: AlertTriangle, label: 'Disposable' },
];

export default function VerifyEmailPage() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const verifyMutation = useMutation({
    mutationFn: verifyEmail,
    onSuccess: (data) => { setResult(data); setExpanded(true); },
    onError: (error) => {
      setResult({ ...defaultResult, email, status: 'invalid', error: error.message });
      setExpanded(true);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    verifyMutation.mutate(email.trim().toLowerCase());
  };

  const handleCopy = async () => {
    if (result) {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'verified': return 'text-success';
      case 'invalid': return 'text-error';
      case 'risky': return 'text-warning';
      default: return 'text-info';
    }
  };

  const getRingColor = (status) => {
    switch (status) {
      case 'verified': return 'var(--success)';
      case 'invalid': return 'var(--error)';
      case 'risky': return 'var(--warning)';
      default: return 'var(--info)';
    }
  };

  // normalized_status is the bucket-mapped value (verified/invalid/risky) —
  // always use this for color/icon logic, never the raw granular
  // result.status (deliverable/trusted/etc.), or colors will mismatch.
  const displayStatus = result?.normalized_status || result?.status;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Verify Email</h1>
        <p className="text-[var(--foreground)]/60">Check deliverability and quality of any email address</p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="card">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--foreground)]/40" aria-hidden="true" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address (e.g., user@example.com)"
                  className="input pl-12 pr-4 py-3 text-lg !bg-[var(--card)] !border !border-[var(--muted)] !text-[var(--foreground)]"
                  disabled={verifyMutation.isPending}
                  aria-label="Email address to verify"
                  autoComplete="email"
                  autoFocus
                />
                {verifyMutation.isPending && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--foreground)]/40 animate-spin" aria-hidden="true" />
                )}
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={verifyMutation.isPending}
                className="w-full"
                disabled={!email.trim() || verifyMutation.isPending}
              >
                <Search className="h-5 w-5" aria-hidden="true" />
                Verify Email
              </Button>
              <p className="text-xs text-[var(--foreground)]/50 text-center">
                Checks syntax, domain, MX records, SMTP, and detects disposable/role-based/catch-all addresses
              </p>
            </form>
          </motion.div>

          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={result.email}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.98 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={`card border-l-4 ${displayStatus === 'verified' ? 'border-success' :
                  displayStatus === 'invalid' ? 'border-error' :
                    displayStatus === 'risky' ? 'border-warning' : 'border-info'
                  }`}
              >
                {/* Hero row: email + status left, score ring right */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-6">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`p-3 rounded-xl bg-[var(--muted)]/50 flex-shrink-0 ${getStatusColor(displayStatus)}`}>
                      {displayStatus === 'verified' && <CheckCircle className="h-6 w-6" />}
                      {displayStatus === 'invalid' && <XCircle className="h-6 w-6" />}
                      {displayStatus === 'risky' && <AlertTriangle className="h-6 w-6" />}
                      {displayStatus === 'processing' && <Clock className="h-6 w-6 animate-spin" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--foreground)]/50">Email</p>
                      <p className="text-xl font-mono font-semibold text-[var(--foreground)] break-all">{result.email}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <StatusBadge status={displayStatus} />
                        <Button variant="ghost" size="sm" onClick={handleCopy} aria-label={copied ? 'Copied to clipboard' : 'Copy result as JSON'}>
                          {copied ? <CheckCircle className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center flex-shrink-0">
                    <CircularProgress value={result.score} size={110} strokeWidth={9} color={getRingColor(displayStatus)}>
                      <span className={`text-2xl font-bold ${getStatusColor(displayStatus)}`}>{result.score}</span>
                      <span className="text-xs text-[var(--foreground)]/50">/100</span>
                    </CircularProgress>
                    <p className="text-xs text-[var(--foreground)]/50 mt-2 text-center max-w-[120px]">
                      {result.score >= 80 ? 'Excellent deliverability' :
                        result.score >= 50 ? 'Some risks detected' : 'Significant issues found'}
                    </p>
                  </div>
                </div>

                <div className="border-t border-[var(--muted)]">
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center justify-between w-full py-4 font-medium text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                    aria-expanded={expanded}
                  >
                    <span>Verification Details</span>
                    <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-[var(--foreground)]/50">
                      <ChevronDown className="h-5 w-5" />
                    </motion.div>
                  </button>

                  <AnimatePresence mode="wait">
                    {expanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                          {detailItems.map(({ key, label, icon: Icon, description, inverted }) => {
                            const value = result[key];
                            const isPass = inverted ? !value : value;
                            return (
                              <motion.div
                                key={key}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.3 }}
                                className="flex items-start gap-3 p-3 rounded-lg bg-[var(--muted)]/30"
                              >
                                <div className={`p-2 rounded-lg flex-shrink-0 ${isPass ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}>
                                  <Icon className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-[var(--foreground)]">{label}</p>
                                  <p className="text-sm text-[var(--foreground)]/50 mt-0.5">{description}</p>
                                  <p className={`text-sm font-medium mt-1 ${isPass ? 'text-success' : 'text-error'}`}>{isPass ? 'Pass' : 'Fail'}</p>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>

                        {(result.username_quality || result.username_flags?.length) && (
                          <div className="pt-4 border-t border-[var(--muted)]">
                            <h4 className="font-medium text-[var(--foreground)] mb-3">Username Analysis</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {result.username_quality && (
                                <div className="p-3 rounded-lg bg-[var(--muted)]/30">
                                  <p className="text-sm text-[var(--foreground)]/50">Quality</p>
                                  <p className="font-medium text-[var(--foreground)] capitalize">{result.username_quality}</p>
                                </div>
                              )}
                              {result.username_flags?.length && (
                                <div className="p-3 rounded-lg bg-[var(--muted)]/30">
                                  <p className="text-sm text-[var(--foreground)]/50">Flags</p>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {result.username_flags.map((flag, i) => (
                                      <span key={i} className="px-2 py-0.5 text-xs bg-[var(--muted)] text-[var(--foreground)]/70 rounded">{flag}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {result.domain && (
                          <div className="pt-4 border-t border-[var(--muted)]">
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--muted)]/30">
                              <Globe className="h-5 w-5 text-[var(--foreground)]/50" />
                              <div>
                                <p className="text-sm text-[var(--foreground)]/50">Domain</p>
                                <p className="font-mono text-[var(--foreground)]">{result.domain}</p>
                              </div>
                              <a href={`https://${result.domain}`} target="_blank" rel="noopener noreferrer" className="ml-auto text-sm text-[var(--primary)] hover:underline flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" /> Visit
                              </a>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!result && !verifyMutation.isPending && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="card py-12 px-6">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="p-4 rounded-2xl bg-[var(--primary)]/10 mb-4">
                  <Zap className="h-8 w-8 text-[var(--primary)]" />
                </div>
                <h3 className="text-lg font-medium text-[var(--foreground)] mb-1">Ready to verify</h3>
                <p className="text-[var(--foreground)]/50 max-w-sm">Enter an email address above — we'll check deliverability across 7 signals in seconds</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {previewChecks.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--muted)]/30">
                    <Icon className="h-5 w-5 text-[var(--foreground)]/40" />
                    <span className="text-xs font-medium text-[var(--foreground)]/60">{label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Right sidebar — explains what verification checks mean */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="card xl:sticky xl:top-6 space-y-5"
        >
          <div>
            <h3 className="font-semibold text-[var(--foreground)] mb-1">How verification works</h3>
            <p className="text-sm text-[var(--foreground)]/50">
              Every email runs through 7 checks before we assign a deliverability score out of 100.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: CheckCircle, title: 'Syntax & Domain', text: 'Format is validated against RFC standards and the domain is checked for valid DNS records.' },
              { icon: Mail, title: 'MX & SMTP', text: 'We confirm mail servers are configured and accepting connections — the strongest deliverability signal.' },
              { icon: AlertTriangle, title: 'Risk flags', text: 'Disposable, role-based (admin@, info@), and catch-all addresses are flagged since they hurt sender reputation.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[var(--muted)]/40 text-[var(--primary)] flex-shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
                  <p className="text-xs text-[var(--foreground)]/50 mt-0.5">{text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[var(--muted)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--foreground)]/50">Score 80–100</span>
              <span className="text-success font-medium">Safe to send</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--foreground)]/50">Score 50–79</span>
              <span className="text-warning font-medium">Risky</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--foreground)]/50">Score below 50</span>
              <span className="text-error font-medium">Unsafe</span>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        {[
          { icon: Layers, label: '7 verification signals', desc: 'Syntax to SMTP, checked in one pass' },
          { icon: Timer, label: '<2s average check time', desc: 'Real-time result, no queueing' },
          { icon: ShieldCheck, label: 'SMTP-level accuracy', desc: 'Not just pattern matching' },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="card flex items-center gap-3 py-4">
            <div className="p-2.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] flex-shrink-0">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">{label}</p>
              <p className="text-xs text-[var(--foreground)]/50">{desc}</p>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
