import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="group relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--muted)] bg-[var(--card)] shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:border-indigo-300 dark:hover:border-indigo-500"
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/10 to-violet-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {isDark ? (
        <Sun className="relative h-5 w-5 text-amber-500 transition-transform duration-300 group-hover:rotate-180" />
      ) : (
        <Moon className="relative h-5 w-5 text-slate-600 transition-transform duration-300 group-hover:-rotate-12 dark:text-slate-300" />
      )}
    </button>
  );
}