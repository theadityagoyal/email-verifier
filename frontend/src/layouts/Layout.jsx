import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  KeyRound,
  LogOut,
} from 'lucide-react';
import ThemeToggle from '@/components/layout/ThemeToggle';
import NotificationBell from '@/components/notifications/NotificationBell';
import HelpMenu from '@/components/layout/HelpMenu';
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

  useEscapeToClose(sidebarProfileOpen, () => setSidebarProfileOpen(false));
  useEscapeToClose(headerProfileOpen, () => setHeaderProfileOpen(false));

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
      {/*
        FIX (UI/UX #1 — stray white/blurred strip on scroll-to-top):
        This link previously used `className="hidden sm:block"`, which meant
        from the `sm` breakpoint upward it rendered as a real, visible,
        unstyled block-level element at the very top of the page — sitting
        in normal document flow, above/overlapping the fixed sidebar and
        sticky header. That unstyled block was exactly the "unwanted
        element" flashing near the top on scroll.

        Fixed with the standard accessible "skip link" pattern: invisible by
        default (`sr-only`), and only becomes visible + properly positioned
        when it actually receives keyboard focus (`focus:not-sr-only`).
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
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
          className={`fixed top-0 left-0 z-50 h-screen border-r border-[var(--border)] bg-[var(--surface)] shadow-xl transition-all duration-300
          ${sidebarOpen ? 'w-72' : 'w-24'}
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        >

          <div className="flex h-full flex-col">

            <div
              className={`flex h-16 items-center border-b border-[var(--border)] px-5 ${sidebarOpen ? 'justify-between' : 'justify-center'
                }`}
            >
              <Link to="/" className="flex items-center gap-3 group">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
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
                  className="rounded-lg p-2 transition-all duration-200 cursor-pointer hover:bg-[var(--card-hover)] hover:scale-105 active:scale-95"
                >
                  <X size={18} />
                </button>
              )}

              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-lg p-2 transition-all duration-200 cursor-pointer hover:bg-[var(--card-hover)] hover:scale-105 active:scale-95 hidden md:block"
                >
                  <Menu size={18} />
                </button>
              )}
            </div>

            <nav className="flex-1 space-y-1.5 overflow-y-auto p-4">
              {navItems.map(({ path, label, icon: Icon }) => {
                const active = location.pathname === path;

                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`relative flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer
                    ${active
                        ? 'text-white'
                        : 'text-[var(--foreground)]/65 hover:bg-[var(--card-hover)] hover:text-[var(--foreground)] hover:translate-x-0.5'
                      }
                    ${!sidebarOpen ? 'justify-center' : ''}
                    `}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-pill"
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <Icon size={20} className="relative z-10 transition-transform duration-200" />
                    {sidebarOpen && <span className="relative z-10 font-medium">{label}</span>}
                  </Link>
                );
              })}
            </nav>

            {/* Sidebar-footer profile — now uses its own independent state */}
            <div className="border-t border-[var(--border)] p-4 relative">
              <button
                onClick={() => setSidebarProfileOpen((v) => !v)}
                className={`w-full flex items-center gap-3 rounded-xl p-2 transition-colors cursor-pointer hover:bg-[var(--card-hover)] ${!sidebarOpen ? 'justify-center' : ''}`}
                aria-haspopup="true"
                aria-expanded={sidebarProfileOpen}
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0 shadow-md shadow-indigo-500/20">
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
                      className={`ml-auto text-[var(--foreground)]/40 flex-shrink-0 transition-transform duration-200 ${sidebarProfileOpen ? 'rotate-180' : ''}`}
                    />
                  </>
                )}
              </button>

              <AnimatePresence>
                {sidebarProfileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setSidebarProfileOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-4 right-4 bottom-full z-50 mb-2 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl py-1.5"
                    >
                      <Link
                        to="/settings"
                        onClick={() => setSidebarProfileOpen(false)}
                        className="flex items-center gap-2 px-3.5 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--card-hover)] cursor-pointer transition-colors"
                      >
                        <Settings size={15} /> Settings
                      </Link>
                      {isAdmin && (
                        <button
                          onClick={handleAdminLogout}
                          className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-error hover:bg-error/10 cursor-pointer transition-colors"
                        >
                          <LogOut size={15} /> Admin Logout
                        </button>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
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

          {/*
            FIX (UI/UX #1): `isolate` creates a fresh stacking context for
            the header, so any absolutely-positioned child (now or in the
            future) is contained to the header's own layer and can never
            visually bleed above/behind other page content while scrolling.
          */}
          <header className="isolate sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur-xl">

            <div className="flex h-16 items-center justify-between px-4 sm:px-8">

              <button
                className="rounded-lg p-2 cursor-pointer hover:bg-[var(--card-hover)] transition-all duration-200 hover:scale-105 active:scale-95 md:hidden"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>

              <div className="ml-auto flex items-center gap-1.5">
                <HelpMenu />

                {/* Live notification bell — see components/notifications/.
                    Replaces the old inline "coming soon" placeholder. */}
                <NotificationBell />

                <ThemeToggle />

                <div className="relative">
                  <button
                    onClick={() => setHeaderProfileOpen((v) => !v)}
                    className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 transition-all duration-200 cursor-pointer hover:bg-[var(--card-hover)]"
                    aria-haspopup="true"
                    aria-expanded={headerProfileOpen}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-xs font-semibold shadow-sm">
                      {APP_USER.initials}
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-[var(--foreground)]/50 transition-transform duration-200 ${headerProfileOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <AnimatePresence>
                    {headerProfileOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setHeaderProfileOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.97 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl py-1.5"
                        >
                          <div className="px-3.5 py-2 border-b border-[var(--border)]">
                            <p className="text-sm font-medium text-[var(--foreground)]">{APP_USER.name}</p>
                            <p className="text-xs text-[var(--foreground)]/50">Admin</p>
                          </div>
                          <Link
                            to="/settings"
                            onClick={() => setHeaderProfileOpen(false)}
                            className="flex items-center gap-2 px-3.5 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--card-hover)] cursor-pointer transition-colors"
                          >
                            <Settings size={15} /> Settings
                          </Link>
                          {isAdmin && (
                            <button
                              onClick={handleAdminLogout}
                              className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-error hover:bg-error/10 cursor-pointer transition-colors"
                            >
                              <LogOut size={15} /> Admin Logout
                            </button>
                          )}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

            </div>

          </header>

          <div id="main-content" className="p-4 sm:p-8 md:p-10 flex-1">
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
