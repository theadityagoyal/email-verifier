import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  FileCode,
  Keyboard,
  LifeBuoy,
  Mail,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { APP_INFO } from '@/utils/appConfig';

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

export default function HelpMenu() {
  const [open, setOpen] = useState(false);

  useEscapeToClose(open, () => setOpen(false));

  const menuItems = [
    {
      label: 'Documentation',
      description: 'User guides and getting started',
      icon: BookOpen,
      href: '#', // Placeholder - no real docs yet
      disabled: true,
      badge: 'Available Soon',
    },
    {
      label: 'API Documentation',
      description: 'REST API reference and examples',
      icon: FileCode,
      href: '#', // Placeholder - no real API docs yet
      disabled: true,
      badge: 'Available Soon',
    },
    {
      label: 'Keyboard Shortcuts',
      description: 'Built-in shortcuts reference',
      icon: Keyboard,
      onClick: () => {
        // Toggle a modal or navigate - for now just show built-in shortcuts
        setOpen(false);
      },
      shortcuts: [
        { keys: 'Esc', description: 'Close dropdowns, modals, and dialogs' },
        { keys: 'Tab', description: 'Navigate forward through focusable elements' },
        { keys: 'Shift + Tab', description: 'Navigate backward through focusable elements' },
        { keys: 'Enter / Space', description: 'Activate buttons, links, and toggles' },
        { keys: 'Arrow keys', description: 'Navigate within composite widgets (menus, tabs, tables)' },
      ],
    },
    {
      label: 'Contact Support',
      description: 'Email our support team',
      icon: LifeBuoy,
      href: `mailto:${APP_INFO.name.toLowerCase()}@example.com`, // Placeholder email
      external: true,
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-2 text-[var(--foreground)]/60 hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        aria-label="Help & documentation"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <BookOpen className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--muted)] bg-[var(--card)] shadow-xl overflow-hidden"
            role="menu"
            aria-label="Help & documentation"
          >
            <div className="px-3.5 py-2.5 border-b border-[var(--muted)]">
              <p className="text-sm font-semibold text-[var(--foreground)]">{APP_INFO.name} Help</p>
              <p className="text-xs text-[var(--foreground)]/40 mt-0.5">Version {APP_INFO.version}</p>
            </div>

            <div className="py-1.5">
              {menuItems.map((item, index) => (
                <div key={item.label} className="relative">
                  {item.shortcuts && (
                    <>
                      <div
                        onClick={item.onClick}
                        className="flex items-center gap-3 px-3.5 py-2.5 text-sm text-[var(--foreground)]/80 hover:bg-[var(--muted)] cursor-pointer transition-colors"
                        role="menuitem"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            item.onClick();
                          }
                        }}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--foreground)]/60">
                          <item.icon className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.label}</p>
                          <p className="text-xs text-[var(--foreground)]/50 truncate">{item.description}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[var(--foreground)]/30 flex-shrink-0" />
                      </div>

                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="border-t border-[var(--muted)] bg-[var(--muted)]/30"
                      >
                        <div className="px-3.5 py-2 space-y-2 ml-11">
                          {item.shortcuts.map((s, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-[var(--foreground)]/70">
                              <kbd className="inline-flex items-center gap-1 rounded bg-[var(--card)] border border-[var(--muted)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--foreground)]/80">
                                {s.keys.split(' + ').map((k, ki) => (
                                  <span key={ki}>{k}</span>
                                ))}
                              </kbd>
                              <span>{s.description}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )} {!item.shortcuts && (
                    <a
                      href={item.href}
                      target={item.external ? '_blank' : undefined}
                      rel={item.external ? 'noopener noreferrer' : undefined}
                      onClick={(e) => {
                        if (item.disabled) {
                          e.preventDefault();
                        } else {
                          setOpen(false);
                        }
                      }}
                      className={`flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors ${
                        item.disabled
                          ? 'text-[var(--foreground)]/40 cursor-not-allowed'
                          : 'text-[var(--foreground)]/80 hover:bg-[var(--muted)] cursor-pointer'
                      }`}
                      role="menuitem"
                      tabIndex={0}
                      aria-disabled={item.disabled}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--foreground)]/60">
                        <item.icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.label}</p>
                        <p className="text-xs text-[var(--foreground)]/50 truncate">{item.description}</p>
                      </div>
                      {item.badge && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-[10px] font-medium px-2 py-0.5">
                          {item.badge}
                        </span>
                      )}
                      {item.external && !item.disabled && (
                        <ExternalLink className="h-3.5 w-3.5 text-[var(--foreground)]/30 flex-shrink-0" aria-hidden="true" />
                      )}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}