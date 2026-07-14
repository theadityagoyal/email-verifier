export type Theme = {
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  accent: string;
  muted: string;
  success: string;
  error: string;
  warning: string;
  info: string;
};

// FIX (audit #1 — theme color drift): previously this file kept a second,
// hand-written copy of every color value that index.css's --dark/--light
// CSS variables already define. The two drifted (e.g. dark.background was
// #0F172A here but #060419 in CSS), so anything reading color via
// var(--background) (Tailwind classes) vs useTheme().background (charts,
// CircularProgress, StatCard, ThemeToggle) rendered different colors.
//
// Fix: read the actual computed CSS custom properties at call time. index.css
// is now the ONLY place color values are defined — this file just exposes
// them in JS-friendly form for recharts/SVG props that can't take a
// `var(--x)` string directly in every context.
const CSS_VAR_KEYS: (keyof Theme)[] = [
  'background', 'foreground', 'primary', 'secondary',
  'accent', 'muted', 'success', 'error', 'warning', 'info',
];

function readThemeFromCSS(): Theme {
  const styles = getComputedStyle(document.documentElement);
  const theme = {} as Theme;
  for (const key of CSS_VAR_KEYS) {
    const value = styles.getPropertyValue(`--${key}`).trim();
    theme[key] = value || '#000000';
  }
  return theme;
}

export const useTheme = (): Theme => {
  return readThemeFromCSS();
};
