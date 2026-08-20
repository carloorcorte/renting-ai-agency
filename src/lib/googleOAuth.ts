// Shared by both OAuth route handlers — split out because a Next.js route
// file may only export HTTP method handlers (GET/POST/...), nothing else.

// Short-lived cookie carrying the CSRF state between initiate and callback
// — sameSite=lax (not strict) on purpose: the browser must still send it on
// the top-level redirect back from accounts.google.com.
export const OAUTH_STATE_COOKIE = "google_oauth_state";

export function googleRedirectUri(requestUrl: string): string {
  return `${new URL(requestUrl).origin}/api/auth/google/callback`;
}
