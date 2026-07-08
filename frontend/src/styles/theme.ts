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

export const light: Theme = {
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

export const dark: Theme = {
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

export const useTheme = (): Theme => {
  // Assuming we use class 'dark' on <html> for dark mode via tailwind
  return document.documentElement.classList.contains('dark') ? dark : light;
};