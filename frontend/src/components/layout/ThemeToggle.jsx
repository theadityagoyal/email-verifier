import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/styles/theme';

export default function ThemeToggle() {
  const theme = useTheme();
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  // Sync theme changes across tabs/windows
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'theme') {
        const isDark = e.newValue === 'dark';
        setIsDark(isDark);
        document.documentElement.classList.toggle('dark', isDark);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-lg p-2 text-[var(--foreground)]/60 hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {isDark ? (
        <Sun className="h-5 w-5" style={{ color: theme.warning }} aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" style={{ color: theme.foreground }} aria-hidden="true" />
      )}
    </button>
  );
}