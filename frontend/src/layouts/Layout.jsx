import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  Mail,
  Upload,
  List,
  BarChart,
  Menu,
  X,
  Settings,
} from 'lucide-react';
import ThemeToggle from '@/components/layout/ThemeToggle';

const navItems = [
  { path: '/', label: 'Dashboard', icon: BarChart },
  { path: '/verify', label: 'Verify Email', icon: Mail },
  { path: '/bulk', label: 'Bulk Upload', icon: Upload },
  { path: '/emails', label: 'Email List', icon: List },
  { path: '/domains', label: 'Domains', icon: BarChart },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const location = useLocation();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-screen border-r border-[var(--muted)] bg-[var(--card)] shadow-xl transition-all duration-300
        ${sidebarOpen ? 'w-72' : 'w-24'}
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >

        <div className="flex h-full flex-col">

          <div
            className={`flex h-16 items-center border-b border-[var(--muted)] px-5 ${
              sidebarOpen ? 'justify-between' : 'justify-center'
            }`}
          >
            <Link
              to="/"
              className="flex items-center gap-3"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg">
                <Mail size={20} />
              </div>

              {sidebarOpen && (
                <div>
                  <h2 className="font-bold text-lg">
                    EmailVerifier
                  </h2>

                  <p className="text-xs text-[var(--foreground)]/50">
                    Enterprise
                  </p>
                </div>
              )}
            </Link>

            {sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-2 transition hover:bg-[var(--muted)]"
              >
                <X size={18} />
              </button>
            )}

            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-2 transition hover:bg-[var(--muted)] hidden md:block"
              >
                <Menu size={18} />
              </button>
            )}
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto p-4">

            {navItems.map(({ path, label, icon: Icon }) => {

              const active = location.pathname === path;

              return (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300

                  ${
                    active
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg'
                      : 'text-[var(--foreground)]/65 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-[var(--foreground)]'
                  }

                  ${!sidebarOpen ? 'justify-center' : ''}
                  `}
                >
                  <Icon size={20} />

                  {sidebarOpen && (
                    <span className="font-medium">
                      {label}
                    </span>
                  )}
                </Link>
              );

            })}

          </nav>

          {sidebarOpen && (
            <div className="border-t border-[var(--muted)] p-4">

              <Link
                to="/settings"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-[var(--foreground)]/70 transition hover:bg-[var(--muted)]"
              >
                <Settings size={20} />
                <span>Settings</span>
              </Link>

            </div>
          )}

        </div>

      </aside>

      <main
        className={`min-h-screen transition-all duration-300 ${
          sidebarOpen ? 'ml-72' : 'ml-24'
        }`}
      >

        <header className="sticky top-0 z-30 border-b border-[var(--muted)] bg-[var(--card)]/90 backdrop-blur-xl">

          <div className="flex h-16 items-center justify-between px-8">

            <button
              className="rounded-lg p-2 hover:bg-[var(--muted)] md:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={22} />
            </button>

            <div className="ml-auto flex items-center gap-4">
              <ThemeToggle />
            </div>

          </div>

        </header>

        <div className="p-8 md:p-10">
          <Outlet />
        </div>

      </main>

    </div>
  );
}