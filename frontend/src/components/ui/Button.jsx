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
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50 hover:-translate-y-0.5';

  const variantMap = {
    primary:
      'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg hover:shadow-xl hover:from-indigo-600 hover:to-violet-700',

    secondary:
      'bg-slate-100 dark:bg-slate-800 text-[var(--foreground)] hover:bg-slate-200 dark:hover:bg-slate-700',

    outline:
      'border border-[var(--muted)] bg-transparent hover:bg-[var(--background)] text-[var(--foreground)]',

    accent:
      'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg hover:shadow-xl',

    danger:
      'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg hover:shadow-xl hover:from-red-600 hover:to-rose-700',

    ghost:
      'hover:bg-[var(--background)] text-[var(--foreground)]',

    link:
      'text-indigo-600 underline-offset-4 hover:underline',
  };

  const sizeMap = {
    sm: 'h-9 px-4 text-sm',
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
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" opacity="0.25" />
            <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
          </svg>

          Loading...
        </>
      ) : (
        children
      )}
    </Component>
  );
}