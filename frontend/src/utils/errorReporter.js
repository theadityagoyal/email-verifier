// Lightweight, centralized error reporting hook. Right now this just wraps
// console.error with a consistent [context] prefix, but having ONE place
// that all catch blocks call through means wiring up a real error-tracking
// service (Sentry, etc.) later is a one-line change here instead of
// hunting down every bare console.error(...) across the app.
export function reportError(context, error, extra) {
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, error, extra || '');
  // TODO: send to Sentry/LogRocket/etc. once a provider is chosen, e.g.:
  // Sentry.captureException(error, { tags: { context }, extra });
}
