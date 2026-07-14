import { motion } from 'framer-motion';
import { Settings as SettingsIcon, User, Moon, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_USER, APP_INFO } from '@/utils/appConfig';
import ThemeToggle from '@/components/layout/ThemeToggle';

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Settings</h1>
        </div>
        <p className="text-sm text-[var(--foreground)]/60">
          Basic preferences for this workspace.
        </p>
      </motion.div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <User className="h-4 w-4" /> Account
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[var(--muted)] p-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white flex items-center justify-center text-xs font-semibold">
            {APP_USER.initials}
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">{APP_USER.name}</p>
            <p className="text-xs text-[var(--foreground)]/50">{APP_USER.email}</p>
          </div>
        </div>
        <p className="text-xs text-[var(--foreground)]/40">
          This is a single-tenant internal tool — there's no multi-user account switching.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <Moon className="h-4 w-4" /> Appearance
        </div>
        <div className="flex items-center justify-between rounded-xl border border-[var(--muted)] p-3">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Theme</p>
            <p className="text-xs text-[var(--foreground)]/50">Switch between light and dark mode</p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <KeyRound className="h-4 w-4" /> Developer API
        </div>
        <p className="text-sm text-[var(--foreground)]/60">
          Manage external API keys for programmatic access.
        </p>
        <Link to="/admin/login" className="text-sm font-medium text-[var(--accent)] hover:underline">
          Go to API Keys admin →
        </Link>
      </div>

      <p className="text-xs text-[var(--foreground)]/40 text-center">{APP_INFO.name} {APP_INFO.version}</p>
    </div>
  );
}
