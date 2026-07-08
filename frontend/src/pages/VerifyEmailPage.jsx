import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Mail, CheckCircle, XCircle, AlertTriangle, Clock,
  Search, Loader2, ChevronDown, Copy, X as XIcon,
  ExternalLink, AlertCircle, Info, Shield, Globe, Zap, Layers, Timer, ShieldCheck,
  Server, Target as TargetIcon, Star, Sparkles, ArrowRight,
} from 'lucide-react';
import { verifyEmail, listEmails, getDashboardStats } from '@/services/api';
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

// Static strip of all 7 signals we check — shown under the input at all times
const checkPills = [
  { icon: CheckCircle, label: 'Syntax' },
  { icon: Mail, label: 'MX Records' },
  { icon: Server, label: 'SMTP' },
  { icon: AlertTriangle, label: 'Disposable' },
  { icon: TargetIcon, label: 'Catch-All' },
  { icon: Star, label: 'Reputation' },
  { icon: Shield, label: 'Score' },
];

// Idle placeholder grid shown inside the empty-state card before any check runs
const quickCheckItems = [
  { label: 'Syntax', icon: CheckCircle },
  { label: 'MX Records', icon: Mail },
  { label: 'SMTP', icon: Server },
  { label: 'Disposable', icon: AlertTriangle },
  { label: 'Catch-All', icon: TargetIcon },
  { label: 'Reputation', icon: Star },
  { label: 'Risk', icon: Shield },
];

const howItWorksItems = [
  { icon: CheckCircle, title: 'Syntax & Format', text: 'Format is validated against RFC standards and structure rules.' },
  { icon: Globe, title: 'Domain & MX Records', text: 'We check domain validity and MX records for mail routing.' },
  { icon: Server, title: 'SMTP Connection', text: 'We test SMTP servers to confirm real deliverability.' },
  { icon: AlertTriangle, title: 'Disposable Check', text: 'We detect disposable and temporary email addresses.' },
  { icon: TargetIcon, title: 'Catch-All Detection', text: 'We identify domains that accept all emails blindly.' },
  { icon: Star, title: 'Reputation & Risk', text: 'We evaluate sender reputation and overall risk factors.' },
];

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function scoreColor(score) {
  if (score >= 80) return 'text-success';
  if (score >= 50) return 'text-warning';
  return 'text-error';
}

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

  // Recent Verifications — last 4, most recent first.
  // NOTE: needs the backend /emails endpoint to support ?order=desc
  // (see dashboard.py patch) — without it this will show the oldest
  // records instead of the newest.
  const { data: recentData } = useQuery({
    queryKey: ['recent-verifications'],
    queryFn: () => listEmails({ page: 1, size: 4, order: 'desc' }),
    refetchInterval: 15000,
  });

  // Reuses the same dashboard aggregate for the stats row (avg processing
  // time + trust score), so numbers never drift from the Dashboard page.
  const { data: statsData } = useQuery({
    queryKey: ['verify-page-stats'],
    queryFn: () => getDashboardStats(1),
    refetchInterval: 30000,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    verifyMutation.mutate(email.trim().toLowerCase());
  };

  const handleClear = () => {
    setEmail('');
    setResult(null);
    setExpanded(false);
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

  const avgSeconds = statsData?.avg_processing_time_ms
    ? (statsData.avg_processing_time_ms / 1000).toFixed(1)
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <Zap className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">Verify Email</h1>
        </div>
        <p className="text-[var(--foreground)]/60">Check deliverability and quality of any email address</p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="card">
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--foreground)]/40" aria-hidden="true" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address (e.g., user@example.com)"
                  className="input pl-12 pr-10 py-3 text-lg w-full !bg-[var(--card)] !border !border-[var(--muted)] !text-[var(--foreground)]"
                  disabled={verifyMutation.isPending}
                  aria-label="Email address to verify"
                  autoComplete="email"
                  autoFocus
                />
                {email && !verifyMutation.isPending && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--foreground)]/40 hover:text-[var(--foreground)] transition-colors"
                    aria-label="Clear email"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
                {verifyMutation.isPending && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--foreground)]/40 animate-spin" aria-hidden="true" />
                )}
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={verifyMutation.isPending}
                className="sm:w-auto whitespace-nowrap"
                disabled={!email.trim() || verifyMutation.isPending}
              >
                <Search className="h-5 w-5" aria-hidden="true" />
                Verify Email
              </Button>
            </form>

            <div className="flex flex-wrap gap-2 mt-4">
              {checkPills.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--muted)]/40 text-[var(--foreground)]/60 border border-[var(--muted)]"
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                </span>
              ))}
            </div>

            <p className="text-xs text-[var(--foreground)]/50 text-center mt-3">
              Checks syntax, domain, MX records, SMTP, and detects disposable/role-based/catch-all addresses
            </p>
          </motion.div>

          <AnimatePresence mode="wait">
            {result ? (
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
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="card py-10 px-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr] gap-8 items-center">
                  <div className="text-center sm:text-left">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20 mb-4">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" /> Ready to verify
                    </span>
                    <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">Enter an email address</h3>
                    <p className="text-[var(--foreground)]/50 mb-6 max-w-xs mx-auto sm:mx-0">
                      We'll check 7 key signals to calculate a deliverability score.
                    </p>
                    <div className="relative w-28 h-28 mx-auto sm:mx-0">
                      <div className="absolute inset-0 rounded-2xl bg-[var(--primary)]/10 rotate-6" />
                      <div className="absolute inset-0 rounded-2xl bg-[var(--card)] border border-[var(--muted)] flex items-center justify-center">
                        <Mail className="h-9 w-9 text-[var(--primary)]" />
                      </div>
                      <div className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-success flex items-center justify-center text-white shadow-lg">
                        <CheckCircle className="h-5 w-5" />
                      </div>
                      <Sparkles className="absolute -top-2 -left-2 h-5 w-5 text-[var(--primary)]/40" />
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <p className="text-sm font-medium text-[var(--foreground)]/70 mb-3 flex items-center gap-1.5">
                      Email Quality Score
                      <Info className="h-3.5 w-3.5 text-[var(--foreground)]/30" />
                    </p>
                    <CircularProgress value={0} size={130} strokeWidth={10} color="var(--muted)">
                      <span className="text-2xl font-bold text-[var(--foreground)]/30">--</span>
                      <span className="text-xs text-[var(--foreground)]/40">/100</span>
                    </CircularProgress>
                    <p className="text-xs text-[var(--foreground)]/40 mt-3 text-center">No verification started yet</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-8 pt-6 border-t border-[var(--muted)]">
                  {quickCheckItems.map(({ label, icon: Icon }) => (
                    <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--muted)]/30">
                      <Icon className="h-5 w-5 text-[var(--foreground)]/40" aria-hidden="true" />
                      <span className="text-xs font-medium text-[var(--foreground)]/60 text-center">{label}</span>
                      <span className="text-xs text-[var(--foreground)]/30">--</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Recent Verifications + quick stats row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4"
          >
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-[var(--foreground)]">Recent Verifications</h3>
                <Link to="/emails" className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div>
                {recentData?.items?.length ? recentData.items.map((item) => (
                  <div key={item.email} className="flex items-center justify-between py-2.5 border-b border-[var(--muted)] last:border-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Mail className="h-4 w-4 text-[var(--foreground)]/30 flex-shrink-0" />
                      <span className="text-sm font-mono text-[var(--foreground)] truncate">{item.email}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-sm font-semibold ${scoreColor(item.score)}`}>{item.score}/100</span>
                      <span className="text-xs text-[var(--foreground)]/40 w-20 text-right">{timeAgo(item.created_at)}</span>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-[var(--foreground)]/40 py-6 text-center">No verifications yet</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card flex flex-col items-center justify-center py-5">
                <Layers className="h-5 w-5 text-[var(--primary)] mb-2" />
                <p className="text-xl font-bold text-[var(--foreground)]">7</p>
                <p className="text-xs text-[var(--foreground)]/50 text-center">Checks Performed</p>
              </div>
              <div className="card flex flex-col items-center justify-center py-5">
                <Timer className="h-5 w-5 text-[var(--primary)] mb-2" />
                <p className="text-xl font-bold text-[var(--foreground)]">{avgSeconds ? `${avgSeconds}s` : '<2s'}</p>
                <p className="text-xs text-[var(--foreground)]/50 text-center">Avg Check Time</p>
              </div>
              <div className="card flex flex-col items-center justify-center py-5">
                <ShieldCheck className="h-5 w-5 text-[var(--primary)] mb-2" />
                <p className="text-xl font-bold text-[var(--foreground)]">{statsData?.trust_score != null ? `${statsData.trust_score}%` : '--'}</p>
                <p className="text-xs text-[var(--foreground)]/50 text-center">Accuracy Rate</p>
              </div>
              <div className="card flex flex-col items-center justify-center py-5 !bg-success/5 !border-success/20">
                <CheckCircle className="h-5 w-5 text-success mb-2" />
                <p className="text-sm font-bold text-success">Safe to Send</p>
                <p className="text-xs text-[var(--foreground)]/50 text-center">Quality emails improve deliverability</p>
              </div>
            </div>
          </motion.div>
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
            {howItWorksItems.map(({ icon: Icon, title, text }) => (
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
            <div className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full bg-success flex-shrink-0" />
              <span className="text-[var(--foreground)]/50">80 - 100</span>
              <span className="ml-auto text-success font-medium">Excellent</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full bg-warning flex-shrink-0" />
              <span className="text-[var(--foreground)]/50">50 - 79</span>
              <span className="ml-auto text-warning font-medium">Moderate</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full bg-error flex-shrink-0" />
              <span className="text-[var(--foreground)]/50">Below 50</span>
              <span className="ml-auto text-error font-medium">Poor</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
