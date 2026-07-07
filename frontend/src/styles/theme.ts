// Design tokens for light and dark modes
// Based on UI/UX Pro Max recommendations for EmailVerifier Pro Dashboard

export const light = {
  background: '#F5F3FF',
  foreground: '#1E1B4B',
  primary: '#6366F1',
  secondary: '#818CF8',
  accent: '#10B981',
  muted: '#E2E8F0',
  // Status colors (can be derived from primary/accent or use semantic)
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
};

export const dark = {
  background: '#0F172A',
  foreground: '#F8FAFC',
  primary: '#6366F1',
  secondary: '#1E293B',
  accent: '#22C55E',
  muted: '#1E293B',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
};

export type Theme = typeof light;

export const useTheme = (): Theme => {
  // Assuming we use class 'dark' on <html> for dark mode via tailwind
  return document.documentElement.classList.contains('dark') ? dark : light;
};