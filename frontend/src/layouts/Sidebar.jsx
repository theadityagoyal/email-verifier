import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Mail,
  Globe,
  Upload,
  CheckCircle,
} from 'lucide-react';
import clsx from 'clsx';
import ThemeToggle from '@/components/layout/ThemeToggle';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/verify', icon: CheckCircle, label: 'Verify Email' },
  { to: '/emails', icon: Mail, label: 'Email List' },
  { to: '/domains', icon: Globe, label: 'Domains' },
  { to: '/bulk', icon: Upload, label: 'Bulk Upload' },
];

export default function Sidebar() {
  return (
    <aside
      className="w-72 shrink-0 min-h-screen border-r border-[var(--muted)] bg-[var(--card)] shadow-xl flex flex-col"
      aria-label="Sidebar"
    >

      {/* Logo */}
      <Link
        to="/"
        className="flex items-center gap-4 border-b border-[var(--muted)] px-6 py-5"
        aria-label="EmailVerifier Home"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 shadow-lg">
          <CheckCircle className="h-5 w-5 text-white" />
        </div>

        <div className="flex-1">
          <h2 className="text-lg font-bold tracking-tight text-[var(--foreground)]">
            EmailVerifier
          </h2>

          <p className="text-xs text-[var(--foreground)]/50">
            Enterprise Dashboard
          </p>
        </div>
      </Link>

      <ThemeToggle />

      {/* Navigation */}
      <nav className="flex-1 space-y-2 px-4 py-5">

        {links.map(({ to, icon: Icon, label }) => (

          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300',

                isActive
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg'
                  : 'text-[var(--foreground)]/65 hover:bg-indigo-50 hover:text-[var(--foreground)] dark:hover:bg-slate-700'
              )
            }
          >

            <Icon className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110" />

            <span>{label}</span>

          </NavLink>

        ))}

      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--muted)] p-5">

        <div className="rounded-xl bg-[var(--background)] p-4">

          <p className="text-sm font-semibold text-[var(--foreground)]">
            EmailVerifier
          </p>

          <p className="mt-1 text-xs text-[var(--foreground)]/50">
            Enterprise Edition
          </p>

          <div className="mt-4 flex items-center justify-between">

            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              ● Online
            </span>

            <span className="text-xs text-[var(--foreground)]/50">
              v1.0.0
            </span>

          </div>

        </div>

      </div>

    </aside>
  );
}