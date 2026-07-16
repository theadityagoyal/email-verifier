export type Theme = {
  background: string;
  surface: string;
  foreground: string;
  primary: string;
  secondary: string;
  accent: string;
  muted: string;
  border: string;
  success: string;
  error: string;
  warning: string;
  info: string;
};

// Reads the actual computed CSS custom properties (defined once in
// index.css) at call time, so JS (recharts/SVG props that can't take a
// `var(--x)` string in every context) always matches the CSS that's
// actually painted — no second hand-written copy to drift out of sync.
const CSS_VAR_KEYS: (keyof Theme)[] = [
  'background', 'surface', 'foreground', 'primary', 'secondary',
  'accent', 'muted', 'border', 'success', 'error', 'warning', 'info',
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
