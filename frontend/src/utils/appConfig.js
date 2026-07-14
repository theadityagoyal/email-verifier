// Single-tenant deployment — one hardcoded "user" identity, but it now
// lives in exactly one place instead of being duplicated across
// Layout.jsx (x2) and DashboardPage.jsx. Change it here only.
export const APP_USER = {
  name: 'Aditya Goyal',
  email: 'admin@example.com',
  initials: 'AG',
};

export const APP_INFO = {
  name: 'EmailVerifier',
  edition: 'Enterprise Edition',
  version: 'v1.0.0',
};
