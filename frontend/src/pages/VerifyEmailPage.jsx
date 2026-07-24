import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Mail, Search, Loader2, X as XIcon, Sparkles, CheckCircle, Globe, ExternalLink,
} from 'lucide-react';
import { verifyEmail, listEmails, getDashboardStats } from '@/services/api';
import { reportError } from '@/utils/errorReporter';

import { CHECK_DEFS, resolveAllChecks, resolveRecommendation, buildScoreReason } from '@/components/verify/statusConfig';
import CheckCard from '@/components/verify/CheckCard';
import ScoreRing from '@/components/verify/ScoreRing';
import RecommendationBanner from '@/components/verify/RecommendationBanner';
import WhyThisScore from '@/components/verify/WhyThisScore';
import UsernameAnalysisCard from '@/components/verify/UsernameAnalysisCard';
import StatusLegend from '@/components/verify/StatusLegend';
import QuickActions from '@/components/verify/QuickActions';
import RecentVerificationsList from '@/components/verify/RecentVerificationsList';

// ── Animation timing ────────────────────────────────────────────────────────
// Checks reveal one-by-one for a "live scanning" feel. The moment the LAST
// check resolves, score + recommendation + details reveal IMMEDIATELY — no
// extra pause/spinner sitting between "7/7 done" and the actual result.
// (Old code had POST_CHECKS_PAUSE_MS + SCORE_COUNT_MS + POST_SCORE_PAUSE_MS
// as blocking delays here — ~1050ms of "looks stuck" after the last check
// already went green. That block is gone; ScoreRing still animates its own
// count-up internally, but that's a visual flourish, not a wait.)
const CHECK_STEP_MS = 300; // time between each check starting
const CHECKING_SPINNER_MS = 200; // how long the spinner shows before resolving

function formatSeconds(ms) {
  if (ms == null) return null;
  return (ms / 1000).toFixed(2) + 's';
}

export default function VerifyEmailPage() {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | verifying | complete
  const [result, setResult] = useState(null);
  const [checkPhases, setCheckPhases] = useState(() => Object.fromEntries(CHECK_DEFS.map((c) => [c.key, 'idle'])));
  const [scoreRevealed, setScoreRevealed] = useState(false);
  const [detailsRevealed, setDetailsRevealed] = useState(false);
  const [verifyDurationMs, setVerifyDurationMs] = useState(null);

  const timeoutsRef = useRef([]);
  const startTimeRef = useRef(null);
  const inputRef = useRef(null);

  const clearAllTimeouts = () => {
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];
  };

  useEffect(() => () => clearAllTimeouts(), []);

  const verifyMutation = useMutation({
    mutationFn: verifyEmail,
    onSuccess: (data) => {
      runRevealSequence(data);
    },
    onError: (error) => {
      reportError('VerifyEmailPage.verify', error);
      // Even on error, run the same sequence with a synthetic invalid
      // result so the user gets the same progressive experience instead
      // of an abrupt error dump.
      runRevealSequence({
        email,
        domain: null,
        status: 'invalid',
        syntax_valid: false,
        domain_exists: false,
        mx_found: false,
        smtp_valid: false,
        disposable: false,
        role_based: false,
        catch_all: false,
        score: 0,
        username_quality: null,
        username_flags: [],
        verified_at: null,
        error: error.message,
      });
    },
  });

  const runRevealSequence = useCallback((data) => {
    clearAllTimeouts();
    setResult(data);
    setCheckPhases(Object.fromEntries(CHECK_DEFS.map((c) => [c.key, 'idle'])));
    setScoreRevealed(false);
    setDetailsRevealed(false);
    setPhase('verifying');
    setVerifyDurationMs(startTimeRef.current ? performance.now() - startTimeRef.current : null);

    CHECK_DEFS.forEach((def, i) => {
      const startAt = i * CHECK_STEP_MS;
      const resolveAt = startAt + CHECKING_SPINNER_MS;
      const isLast = i === CHECK_DEFS.length - 1;

      timeoutsRef.current.push(
        setTimeout(() => {
          setCheckPhases((prev) => ({ ...prev, [def.key]: 'checking' }));
        }, startAt)
      );
      timeoutsRef.current.push(
        setTimeout(() => {
          setCheckPhases((prev) => ({ ...prev, [def.key]: 'resolved' }));
          // FIX (Issue 3): reveal everything the instant the last check
          // resolves. No artificial gap, no second loading state.
          if (isLast) {
            setScoreRevealed(true);
            setDetailsRevealed(true);
            setPhase('complete');
          }
        }, resolveAt)
      );
    });
  }, []);

  const { data: recentData } = useQuery({
    queryKey: ['recent-verifications'],
    queryFn: () => listEmails({ page: 1, size: 5, order: 'desc' }),
    refetchInterval: 15000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['verify-page-stats'],
    queryFn: () => getDashboardStats(1),
    refetchInterval: 30000,
  });

  // Covers BOTH the real network wait (verifyMutation.isPending) AND the
  // staged check-reveal animation (phase === 'verifying'). Using only
  // `phase` here would leave a gap during the actual API call — before
  // runRevealSequence() ever fires — where a fast double-click/double-Enter
  // could fire two verifications at once.
  const isBusy = verifyMutation.isPending || phase === 'verifying';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || isBusy) return;
    startTimeRef.current = performance.now();
    verifyMutation.mutate(email.trim().toLowerCase());
  };

  // FIX (Issue 1): the input never unmounts anymore, so this is no longer
  // required to "get back" to a usable search bar — it's just a convenience
  // clear+focus, wired to the existing "Verify Another Email" button in
  // QuickActions so that button still works but nothing depends on it.
  const handleReset = () => {
    clearAllTimeouts();
    setPhase('idle');
    setResult(null);
    setEmail('');
    setScoreRevealed(false);
    setDetailsRevealed(false);
    inputRef.current?.focus();
  };

  const handleVerifyAnother = () => {
    handleReset();
  };

  const resolvedChecks = result ? resolveAllChecks(result) : [];
  const recommendation = result ? resolveRecommendation(result.score) : null;
  const scoreReason = resolvedChecks.length ? buildScoreReason(resolvedChecks) : null;

  const avgSeconds = statsData?.avg_processing_time_ms
    ? (statsData.avg_processing_time_ms / 1000).toFixed(1)
    : null;

  return (
    <div id="verify-report" className="space-y-6">
      {/* Print-only stylesheet for "Download PDF Report" — only #verify-report
          content is visible when printing, everything else (nav, sidebar,
          quick actions) is hidden. */}
      <style>{`
        @media print {
          body.print-verify-report * { visibility: hidden; }
          body.print-verify-report #verify-report, body.print-verify-report #verify-report * { visibility: visible; }
          body.print-verify-report #verify-report { position: absolute; left: 0; top: 0; width: 100%; }
          body.print-verify-report .no-print { display: none !important; }
        }
      `}</style>

      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">Verify Email</h1>
        </div>
        <p className="text-[var(--foreground)]/60">Check deliverability and quality of any email address</p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          {/* ── PERSISTENT CARD ──────────────────────────────────────────────
              FIX (Issue 1): the input form is now ALWAYS rendered — it never
              gets swapped out by an idle/verifying/complete AnimatePresence
              transform like before. Results simply grow underneath it in
              the same card. User can replace the email and hit Verify again
              without ever losing the search bar or scrolling to a button. */}
          <motion.div layout className="card overflow-hidden">
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--foreground)]/40" aria-hidden="true" />
                <label htmlFor="verify-email-input" className="sr-only">Email address to verify</label>
                <input
                  ref={inputRef}
                  id="verify-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address (e.g., user@example.com)"
                  className="input pl-12 pr-10 py-3 text-lg w-full !bg-[var(--card)] !border !border-[var(--muted)] !text-[var(--foreground)] disabled:opacity-60"
                  autoComplete="email"
                  autoFocus
                  disabled={isBusy}
                />
                {email && !isBusy && (
                  <button
                    type="button"
                    onClick={() => setEmail('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--foreground)]/40 hover:text-[var(--foreground)] transition-colors"
                    aria-label="Clear email"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={!email.trim() || isBusy}
                className="btn-primary sm:w-auto whitespace-nowrap flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBusy ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-5 w-5" aria-hidden="true" />
                )}
                {isBusy ? 'Verifying…' : 'Verify Email'}
              </button>
            </form>

            {!result && (
              <>
                <p className="text-sm text-[var(--foreground)]/50 mt-4">
                  We'll check 7 key signals to calculate a deliverability score.
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {CHECK_DEFS.map(({ key, title, icon: Icon }) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--muted)] text-[var(--foreground)]/60"
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {title}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Results grow inside the SAME card, below the input — no card
                swap, no unmount. On a re-verify, this block stays mounted
                (result was already truthy) and just updates in place, so
                "previous result updates with the new verification" instead
                of flashing/resetting. */}
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="pt-5 mt-5 border-t border-[var(--muted)] space-y-5">
                    {/* Header row — email + status */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--foreground)]/50">Email</p>
                        <p className="text-xl font-mono font-semibold text-[var(--foreground)] break-all">{result.email}</p>
                      </div>
                      {phase === 'verifying' && (
                        <div className="flex items-center gap-2 text-sm text-[var(--primary)] shrink-0">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Checking {Object.values(checkPhases).filter((p) => p !== 'idle').length} of {CHECK_DEFS.length}
                        </div>
                      )}
                      {phase === 'complete' && (
                        <div className="flex items-center gap-2 text-sm text-success shrink-0">
                          <CheckCircle className="h-4 w-4" />
                          Verification Completed
                          {verifyDurationMs != null && (
                            <span className="text-[var(--foreground)]/40">· {formatSeconds(verifyDurationMs)}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Progress bar during verifying */}
                    {phase === 'verifying' && (
                      <div className="h-1.5 w-full rounded-full bg-[var(--muted)] overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-[var(--primary)]"
                          initial={{ width: '0%' }}
                          animate={{
                            width: `${(Object.values(checkPhases).filter((p) => p === 'resolved').length / CHECK_DEFS.length) * 100}%`,
                          }}
                          transition={{ duration: 0.25 }}
                        />
                      </div>
                    )}

                    {/* Recommendation banner + score — reveal instantly once
                        the last check resolves (see runRevealSequence). */}
                    {detailsRevealed && recommendation && (
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
                        <RecommendationBanner recommendation={recommendation} reason={scoreReason} />
                        <div className="flex justify-center sm:justify-end">
                          <ScoreRing value={result.score} animate={scoreRevealed} color={recommendation.color} />
                        </div>
                      </div>
                    )}

                    {/* Horizontal checks row — always visible, animates left to right */}
                    <div className="flex flex-wrap gap-2.5">
                      {CHECK_DEFS.map((def) => {
                        const phaseForCheck = checkPhases[def.key];
                        const resolved = phaseForCheck === 'resolved' ? resolvedChecks.find((c) => c.key === def.key) : null;
                        return (
                          <CheckCard
                            key={def.key}
                            title={def.title}
                            Icon={def.icon}
                            phase={phaseForCheck}
                            resolved={resolved}
                          />
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── Rest of the completed result — Why this score / Username / Domain / Quick Actions ──
              FIX (Issue 2): Technical Details accordion is completely gone —
              no import, no render, no raw-fields mapping. */}
          <AnimatePresence>
            {detailsRevealed && result && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <WhyThisScore resolvedChecks={resolvedChecks} recommendationLabel={recommendation.label} />
                  <UsernameAnalysisCard
                    usernameQuality={result.username_quality}
                    usernameFlags={result.username_flags}
                  />
                </div>

                {result.domain && (
                  <div className="card flex items-center gap-3">
                    <Globe className="h-5 w-5 text-[var(--foreground)]/50" />
                    <div>
                      <p className="text-sm text-[var(--foreground)]/50">Domain</p>
                      <p className="font-mono text-[var(--foreground)]">{result.domain}</p>
                    </div>
                    <a
                      href={`https://${result.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-sm text-[var(--primary)] hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Visit
                    </a>
                  </div>
                )}

                <div className="no-print">
                  <QuickActions email={result.email} result={result} onVerifyAnother={handleVerifyAnother} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="no-print">
            <RecentVerificationsList items={recentData?.items || []} />
          </div>
        </div>

        {/* ── Right sidebar — Status Legend + quick stats ── */}
        <div className="no-print space-y-6 xl:sticky xl:top-6">
          <StatusLegend />

          <div className="grid grid-cols-2 gap-3">
            <div className="card flex flex-col items-center justify-center py-5">
              <div className="p-2 rounded-full bg-primary/10 mb-2">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xl font-bold text-[var(--foreground)]">{CHECK_DEFS.length}</p>
              <p className="text-xs text-[var(--foreground)]/50 text-center">Checks Performed</p>
            </div>
            <div className="card flex flex-col items-center justify-center py-5">
              <div className="p-2 rounded-full bg-success/10 mb-2">
                <Loader2 className="h-5 w-5 text-success" />
              </div>
              <p className="text-xl font-bold text-[var(--foreground)]">{avgSeconds ? `${avgSeconds}s` : '—'}</p>
              <p className="text-xs text-[var(--foreground)]/50 text-center">Avg Check Time</p>
            </div>
            <div className="card col-span-2 flex items-center justify-between px-4">
              <span className="text-sm text-[var(--foreground)]/60">Platform Safe Rate</span>
              <span className="text-lg font-bold text-[var(--foreground)]">
                {statsData?.trust_score != null ? `${statsData.trust_score}%` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
