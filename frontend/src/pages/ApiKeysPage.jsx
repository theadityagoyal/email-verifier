import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  KeyRound, Plus, Copy, Check, ShieldCheck, ShieldOff, X, AlertTriangle,
  BarChart3, Loader2, LogOut,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  listApiKeys, createApiKey, activateApiKey, revokeApiKey, getApiKeyUsage,
} from '@/services/api';
import Button from '@/components/ui/Button';
import { useTheme } from '@/styles/theme';

function formatDate(dateString) {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleString();
}

// ── Create Key modal ─────────────────────────────────────────────────────────

function CreateKeyModal({ onClose, onCreated, onAuthError }) {
  const [name, setName] = useState('');
  const [rateLimit, setRateLimit] = useState(60);
  const [bulkLimit, setBulkLimit] = useState(5);
  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (data) => {
      setCreatedKey(data);
      onCreated();
    },
    onError: (err) => {
      if (err.status === 401) {
        onAuthError();
      } else {
        toast.error(err.message || 'Failed to create key');
      }
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      rate_limit_per_min: Number(rateLimit) || 60,
      bulk_limit_per_hour: Number(bulkLimit) || 5,
    });
  };

  const handleCopy = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            {createdKey ? 'API Key Created' : 'Create API Key'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--foreground)]/50 hover:text-[var(--foreground)] transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {createdKey ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This key is shown only once. Copy and store it securely — you
                won't be able to see it again.
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-[var(--muted)] bg-[var(--background)] p-3">
              <code className="flex-1 text-sm font-mono text-[var(--foreground)] break-all">
                {createdKey.api_key}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 p-2 rounded-lg hover:bg-[var(--muted)] text-[var(--foreground)]/60 transition-colors"
                aria-label="Copy API key"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <Button variant="primary" className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)]/50 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="input w-full"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)]/50 mb-1">
                  Rate limit (req/min)
                </label>
                <input
                  type="number"
                  min="1"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)]/50 mb-1">
                  Bulk limit (uploads/hr)
                </label>
                <input
                  type="number"
                  min="1"
                  value={bulkLimit}
                  onChange={(e) => setBulkLimit(e.target.value)}
                  className="input w-full"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={createMutation.isPending}
                disabled={!name.trim()}
              >
                <Plus className="h-4 w-4" />
                Create Key
              </Button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

// ── Usage chart ───────────────────────────────────────────────────────────────

function UsageChart({ prefix, onAuthError }) {
  const theme = useTheme();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-api-key-usage', prefix],
    queryFn: () => getApiKeyUsage(prefix, 30),
    enabled: !!prefix,
  });

  useEffect(() => {
    if (error?.status === 401) onAuthError();
  }, [error, onAuthError]);

  if (!prefix) {
    return (
      <div className="card flex items-center justify-center h-64 text-[var(--foreground)]/40 text-sm">
        Select a key from the table above to view its usage
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  const chartData = (data?.daily || []).map((d) => ({
    date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    verify: d.verify,
    bulk: d.bulk,
  }));

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-[var(--accent)]" />
        <h3 className="font-semibold text-[var(--foreground)]">
          Usage — last 30 days ({prefix})
        </h3>
      </div>

      {chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-[var(--foreground)]/40">
          No usage recorded yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--foreground)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--foreground)', fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: 'var(--background)',
                border: '1px solid var(--muted)',
                borderRadius: 8,
                padding: '8px 12px',
              }}
              labelStyle={{ color: 'var(--foreground)', fontSize: '0.875rem' }}
            />
            <Legend
              verticalAlign="top"
              height={36}
              wrapperStyle={{ display: 'flex', justifyContent: 'center', marginTop: '-10px' }}
            />
            <Bar dataKey="verify" name="Verify" fill={theme.primary} radius={4} />
            <Bar dataKey="bulk" name="Bulk" fill={theme.accent} radius={4} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPrefix, setSelectedPrefix] = useState(null);

  const handleAuthError = () => {
    localStorage.removeItem('adminToken');
    toast.error('Admin session expired. Please log in again.');
    navigate('/admin/login');
  };

  const { data: keys, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-api-keys'],
    queryFn: listApiKeys,
  });

  useEffect(() => {
    if (error?.status === 401) handleAuthError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const activateMutation = useMutation({
    mutationFn: activateApiKey,
    onSuccess: () => {
      toast.success('Key activated');
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
    },
    onError: (err) => {
      if (err.status === 401) handleAuthError();
      else toast.error(err.message || 'Failed to activate key');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      toast.success('Key revoked');
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
    },
    onError: (err) => {
      if (err.status === 401) handleAuthError();
      else toast.error(err.message || 'Failed to revoke key');
    },
  });

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    toast.success('Logged out');
    navigate('/admin/login');
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-1">API Keys</h1>
          <p className="text-sm text-[var(--foreground)]/60">
            Manage external developer API access
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            Create Key
          </Button>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="card overflow-hidden p-0"
      >
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-3 border-[var(--accent)] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-[var(--foreground)]/60">Loading API keys...</p>
          </div>
        ) : error && error.status !== 401 ? (
          <div className="p-8 text-center text-error">
            <p>Failed to load API keys: {error.message}</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-2">
              Retry
            </Button>
          </div>
        ) : !keys || keys.length === 0 ? (
          <div className="p-12 text-center">
            <KeyRound className="h-16 w-16 text-[var(--foreground)]/20 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">No API keys yet</h3>
            <p className="text-[var(--foreground)]/60">
              Create one to give developers access to the external API
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" role="grid">
              <thead>
                <tr className="border-b border-[var(--muted)] bg-[var(--muted)]/40">
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider">
                    Prefix
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider">
                    Rate Limits
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider">
                    Total Calls
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider">
                    Last Used
                  </th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--muted)]">
                {keys.map((k, rowIndex) => (
                  <motion.tr
                    key={k.prefix}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: rowIndex * 0.02 }}
                    className={`transition-colors hover:bg-[var(--accent)]/5 cursor-pointer ${
                      selectedPrefix === k.prefix ? 'bg-[var(--accent)]/5' : ''
                    }`}
                    onClick={() => setSelectedPrefix(k.prefix)}
                  >
                    <td className="px-4 py-3.5 font-medium text-[var(--foreground)]">
                      {k.name || '\u2014'}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-sm text-[var(--foreground)]/70">
                      {k.prefix}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          k.is_active
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                        }`}
                      >
                        {k.is_active ? (
                          <ShieldCheck className="h-3 w-3" />
                        ) : (
                          <ShieldOff className="h-3 w-3" />
                        )}
                        {k.is_active ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[var(--foreground)]/70">
                      {k.rate_limit_per_min}/min &middot; {k.bulk_limit_per_hour}/hr
                    </td>
                    <td className="px-4 py-3.5 text-sm font-mono text-[var(--foreground)]">
                      {k.total_calls.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[var(--foreground)]/50">
                      {formatDate(k.last_used_at)}
                    </td>
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {k.is_active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeMutation.mutate(k.prefix)}
                            className="text-error hover:text-error hover:bg-error/10"
                          >
                            Revoke
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => activateMutation.mutate(k.prefix)}
                          >
                            Activate
                          </Button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <UsageChart prefix={selectedPrefix} onAuthError={handleAuthError} />

      <AnimatePresence>
        {showCreateModal && (
          <CreateKeyModal
            onClose={() => setShowCreateModal(false)}
            onCreated={() => queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] })}
            onAuthError={handleAuthError}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
