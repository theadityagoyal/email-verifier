import { useState, useEffect } from 'react';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  asChild = false,
  disabled = false,
  loading = false,
  onClick,
  className = '',
  ...props
}) {
  const [isLoading, setIsLoading] = useState(loading);

  useEffect(() => {
    setIsLoading(loading);
  }, [loading]);

  const handleClick = (e) => {
    if (disabled || isLoading) return;
    onClick?.(e);
  };

  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]';

  const variantMap = {
    primary:
      'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30 hover:from-indigo-600 hover:to-violet-700 hover:-translate-y-0.5',

    secondary:
      'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--card-hover)]',

    outline:
      'border border-[var(--border)] bg-transparent hover:bg-[var(--card-hover)] hover:border-[var(--foreground-muted)] text-[var(--foreground)]',

    accent:
      'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 hover:-translate-y-0.5',

    danger:
      'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md shadow-red-500/20 hover:shadow-lg hover:shadow-red-500/30 hover:from-red-600 hover:to-rose-700 hover:-translate-y-0.5',

    ghost:
      'hover:bg-[var(--card-hover)] text-[var(--foreground)]',

    link:
      'text-[var(--foreground)] underline-offset-4 hover:underline hover:bg-[var(--card-hover)]',
  };

  const sizeMap = {
    sm: 'h-9 px-3.5 text-sm',
    md: 'h-11 px-6 text-sm',
    lg: 'h-12 px-8 text-base',
  };

  const Component = asChild ? 'span' : 'button';

  return (
    <Component
      className={`${base} ${variantMap[variant] || variantMap.primary} ${sizeMap[size] || sizeMap.md
        } ${className}`}
      disabled={disabled || isLoading}
      onClick={handleClick}
      aria-label={isLoading ? 'Loading...' : undefined}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="sr-only">Loading...</span>
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" opacity="0.25" />
            <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
          </svg>
        </>
      ) : (
        children
      )}
    </Component>
  );
}
