import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Mail,
  Upload,
  List,
  BarChart,
  LayoutGrid,
  Menu,
  X,
  Settings,
  ChevronDown,
  HelpCircle,
  Bell,
  KeyRound,
  LogOut,
} from 'lucide-react';
import ThemeToggle from '@/components/layout/ThemeToggle';

const baseNavItems = [
  { path: '/', label: 'Dashboard', icon: LayoutGrid },
  { path: '/verify', label: 'Verify Email', icon: Mail },
  { path: '/bulk', label: 'Bulk Upload', icon: Upload },
  { path: '/emails', label: 'Email List', icon: List },
  { path: '/domains', label: 'Domains', icon: BarChart },
];

// Static placeholder notifications — no backend wiring yet.
// Swap this array (or wire it to a real endpoint) whenever notifications
// become a real feature.
const dummyNotifications = [
  { id: 1, text: 'Bulk upload "ubiAttendance All Data" completed', time: '2 hours ago' },
  { id: 2, text: '39 unsafe emails flagged in your last upload', time: '2 hours ago' },
  { id: 3, text: 'Weekly deliverability report is ready', time: '1 day ago' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  // "API Keys" nav item is only visible to a logged-in admin. Presence
  // check is enough here — if the token is stale/expired, ApiKeysPage
  // itself redirects to /admin/login on the first 401 it gets.
  const isAdmin = !!localStorage.getItem('adminToken');

  const navItems = isAdmin
    ? [...baseNavItems, { path: '/admin/api-keys', label: 'API Keys', icon: KeyRound }]
    : baseNavItems;

  const handleAdminLogout = () => {
    localStorage.removeItem('adminToken');
    setProfileMenuOpen(false);
    navigate('/admin/login');
  };

  return (
    <>
      {/* Skip to main content link for screen readers */}
      <a href="#main-content" className="hidden sm:block">
        Skip to main content
      </a>

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
            className={`flex h-16 items-center border-b border-[var(--muted)] px-5 ${sidebarOpen ? 'justify-between' : 'justify-center'
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

                  ${active
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

          {/* User profile card — replaces the old plain Settings link.
              Settings is now reachable from the dropdown this button opens. */}
          <div className="border-t border-[var(--muted)] p-4 relative">
            <button
              onClick={() => setProfileMenuOpen((v) => !v)}
              className={`w-full flex items-center gap-3 rounded-xl p-2 transition hover:bg-[var(--muted)] ${!sidebarOpen ? 'justify-center' : ''}`}
              aria-haspopup="true"
              aria-expanded={profileMenuOpen}
            >
              <div className="h-9 w-9 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                AG
              </div>
              {sidebarOpen && (
                <>
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">Aditya Goyal</p>
                    <p className="text-xs text-[var(--foreground)]/50 truncate">admin@example.com</p>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`ml-auto text-[var(--foreground)]/40 flex-shrink-0 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`}
                  />
                </>
              )}
            </button>

            {profileMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileMenuOpen(false)} />
                <div className="absolute left-4 right-4 bottom-full z-50 mb-2 rounded-xl border border-[var(--muted)] bg-[var(--card)] shadow-xl py-1.5">
                  <Link
                    to="/settings"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-3.5 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--muted)]/50"
                  >
                    <Settings size={15} /> Settings
                  </Link>
                  {isAdmin && (
                    <button
                      onClick={handleAdminLogout}
                      className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-error hover:bg-error/10"
                    >
                      <LogOut size={15} /> Admin Logout
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

        </div>

      </aside>

      <main
        className={`min-h-screen flex flex-col transition-all duration-300 ${sidebarOpen ? 'ml-72' : 'ml-24'
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

            <div className="ml-auto flex items-center gap-1.5">
              <button
                className="rounded-lg p-2 hover:bg-[var(--muted)] transition text-[var(--foreground)]/60"
                aria-label="Help"
              >
                <HelpCircle size={20} />
              </button>

              <div className="relative">
                <button
                  onClick={() => setNotifOpen((v) => !v)}
                  className="relative rounded-lg p-2 hover:bg-[var(--muted)] transition text-[var(--foreground)]/60"
                  aria-label="Notifications"
                  aria-haspopup="true"
                  aria-expanded={notifOpen}
                >
                  <Bell size={20} />
                  {dummyNotifications.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-error text-white text-[10px] font-semibold flex items-center justify-center">
                      {dummyNotifications.length}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                    <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--muted)] bg-[var(--card)] shadow-xl py-1.5">
                      <div className="px-3.5 py-2 border-b border-[var(--muted)]">
                        <p className="text-sm font-medium text-[var(--foreground)]">Notifications</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {dummyNotifications.map((n) => (
                          <div key={n.id} className="px-3.5 py-2.5 hover:bg-[var(--muted)]/50 border-b border-[var(--muted)] last:border-0">
                            <p className="text-sm text-[var(--foreground)]">{n.text}</p>
                            <p className="text-xs text-[var(--foreground)]/40 mt-0.5">{n.time}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <ThemeToggle />

              <div className="relative">
                <button
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 transition hover:bg-[var(--muted)]"
                  aria-haspopup="true"
                  aria-expanded={profileMenuOpen}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-semibold">
                    AG
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-[var(--foreground)]/50 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {profileMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setProfileMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-[var(--muted)] bg-[var(--card)] shadow-xl py-1.5">
                      <div className="px-3.5 py-2 border-b border-[var(--muted)]">
                        <p className="text-sm font-medium text-[var(--foreground)]">Aditya Goyal</p>
                        <p className="text-xs text-[var(--foreground)]/50">Admin</p>
                      </div>
                      <Link
                        to="/settings"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2 px-3.5 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--muted)]/50"
                      >
                        <Settings size={15} /> Settings
                      </Link>
                      {isAdmin && (
                        <button
                          onClick={handleAdminLogout}
                          className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-error hover:bg-error/10"
                        >
                          <LogOut size={15} /> Admin Logout
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>

        </header>

        <div className="p-8 md:p-10 flex-1">
          <Outlet />
        </div>

        <footer className="text-center py-6 text-xs text-[var(--foreground)]/40">
          © 2026 EmailVerifier. All rights reserved.
        </footer>

      </main>

    </div>
  </>
);
}
