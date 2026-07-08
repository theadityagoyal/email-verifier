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
      // Persist the theme preference
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const gradientStyle = {
    background: `linear-gradient(to right, ${theme.primary}1A, ${theme.secondary}1A)`,
  };

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="group relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--muted)] bg-[var(--card)] shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:border-indigo-300 dark:hover:border-indigo-500"
    >
      <div
        className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={gradientStyle}
      />
      {isDark ? (
        <Sun
          className="relative h-5 w-5 transition-transform duration-300 group-hover:rotate-180"
          style={{ color: theme.warning }}
        />
      ) : (
        <Moon
          className="relative h-5 w-5 transition-transform duration-300 group-hover:-rotate-12"
          style={{ color: theme.foreground }}
        />
      )}
    </button>
  );
}