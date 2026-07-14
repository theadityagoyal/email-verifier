import { useState, useEffect, useRef } from 'react';
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
import { APP_USER, APP_INFO } from '@/utils/appConfig';

const baseNavItems = [
  { path: '/', label: 'Dashboard', icon: LayoutGrid },
  { path: '/verify', label: 'Verify Email', icon: Mail },
  { path: '/bulk', label: 'Bulk Upload', icon: Upload },
  { path: '/emails', label: 'Email List', icon: List },
  { path: '/domains', label: 'Domains', icon: BarChart },
];

// FIX (audit #29): shared Escape-key-closes-dropdown hook. Click-outside was
// already handled via a fixed overlay; this adds keyboard support so
// keyboard-only users can dismiss these menus too.
function useEscapeToClose(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // FIX (audit #6): sidebar-footer and header profile buttons previously
  // shared one `profileMenuOpen` boolean, so clicking either could pop open
  // BOTH dropdowns in two different corners of the screen. Split into two
  // independent states.
  const [sidebarProfileOpen, setSidebarProfileOpen] = useState(false);
  const [headerProfileOpen, setHeaderProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  useEscapeToClose(sidebarProfileOpen, () => setSidebarProfileOpen(false));
  useEscapeToClose(headerProfileOpen, () => setHeaderProfileOpen(false));
  useEscapeToClose(notifOpen, () => setNotifOpen(false));

  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = !!localStorage.getItem('adminToken');

  const navItems = isAdmin
    ? [...baseNavItems, { path: '/admin/api-keys', label: 'API Keys', icon: KeyRound }]
    : baseNavItems;

  const handleAdminLogout = () => {
    localStorage.removeItem('adminToken');
    setSidebarProfileOpen(false);
    setHeaderProfileOpen(false);
    navigate('/admin/login');
  };

  return (
    <>
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
              <Link to="/" className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg">
                  <Mail size={20} />
                </div>

                {sidebarOpen && (
                  <div>
                    <h2 className="font-bold text-lg">{APP_INFO.name}</h2>
                    <p className="text-xs text-[var(--foreground)]/50">Enterprise</p>
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
                    {sidebarOpen && <span className="font-medium">{label}</span>}
                  </Link>
                );
              })}
            </nav>

            {/* Sidebar-footer profile — now uses its own independent state */}
            <div className="border-t border-[var(--muted)] p-4 relative">
              <button
                onClick={() => setSidebarProfileOpen((v) => !v)}
                className={`w-full flex items-center gap-3 rounded-xl p-2 transition hover:bg-[var(--muted)] ${!sidebarOpen ? 'justify-center' : ''}`}
                aria-haspopup="true"
                aria-expanded={sidebarProfileOpen}
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {APP_USER.initials}
                </div>
                {sidebarOpen && (
                  <>
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{APP_USER.name}</p>
                      <p className="text-xs text-[var(--foreground)]/50 truncate">{APP_USER.email}</p>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`ml-auto text-[var(--foreground)]/40 flex-shrink-0 transition-transform ${sidebarProfileOpen ? 'rotate-180' : ''}`}
                    />
                  </>
                )}
              </button>

              {sidebarProfileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSidebarProfileOpen(false)} />
                  <div className="absolute left-4 right-4 bottom-full z-50 mb-2 rounded-xl border border-[var(--muted)] bg-[var(--card)] shadow-xl py-1.5">
                    <Link
                      to="/settings"
                      onClick={() => setSidebarProfileOpen(false)}
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

        {/* FIX (audit #4): margin now responsive — 0 on mobile (sidebar is
            translate-x-full/hidden there), matching md: breakpoint the
            sidebar itself uses. Previously ml-72/ml-24 applied unconditionally,
            leaving a huge blank gutter on phones while the invisible sidebar
            still pushed content over. */}
        <main
          className={`min-h-screen flex flex-col transition-all duration-300 ml-0 ${sidebarOpen ? 'md:ml-72' : 'md:ml-24'
            }`}
        >

          <header className="sticky top-0 z-30 border-b border-[var(--muted)] bg-[var(--card)]/90 backdrop-blur-xl">

            <div className="flex h-16 items-center justify-between px-4 sm:px-8">

              <button
                className="rounded-lg p-2 hover:bg-[var(--muted)] md:hidden"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open menu"
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
                  </button>

                  {notifOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                      <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--muted)] bg-[var(--card)] shadow-xl py-1.5">
                        <div className="px-3.5 py-2 border-b border-[var(--muted)]">
                          <p className="text-sm font-medium text-[var(--foreground)]">Notifications</p>
                        </div>
                        {/* FIX (audit #27): this used to render a hardcoded
                            fake list with fabricated "2 hours ago" timestamps
                            as if it were live data — misleading in production.
                            Real notifications backend is a separate, larger
                            piece of work (Notification model + migration +
                            router). Until that lands, show an honest empty
                            state instead of fake data. */}
                        <div className="px-3.5 py-6 text-center">
                          <p className="text-sm text-[var(--foreground)]/50">No notifications yet</p>
                          <p className="text-xs text-[var(--foreground)]/30 mt-1">
                            Live notifications are coming soon
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <ThemeToggle />

                <div className="relative">
                  <button
                    onClick={() => setHeaderProfileOpen((v) => !v)}
                    className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 transition hover:bg-[var(--muted)]"
                    aria-haspopup="true"
                    aria-expanded={headerProfileOpen}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-semibold">
                      {APP_USER.initials}
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-[var(--foreground)]/50 transition-transform ${headerProfileOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {headerProfileOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setHeaderProfileOpen(false)} />
                      <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-[var(--muted)] bg-[var(--card)] shadow-xl py-1.5">
                        <div className="px-3.5 py-2 border-b border-[var(--muted)]">
                          <p className="text-sm font-medium text-[var(--foreground)]">{APP_USER.name}</p>
                          <p className="text-xs text-[var(--foreground)]/50">Admin</p>
                        </div>
                        <Link
                          to="/settings"
                          onClick={() => setHeaderProfileOpen(false)}
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

          <div className="p-4 sm:p-8 md:p-10 flex-1">
            <Outlet />
          </div>

          <footer className="text-center py-6 text-xs text-[var(--foreground)]/40">
            © 2026 {APP_INFO.name}. All rights reserved.
          </footer>

        </main>

      </div>
    </>
  );
}
