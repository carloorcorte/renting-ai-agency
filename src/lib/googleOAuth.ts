// Shared by all Google OAuth route handlers — split out because a Next.js
// route file may only export HTTP method handlers (GET/POST/...), nothing
// else. Two independent flows share this: login (openid email profile) and
// the separate "Connect Google Calendar" consent (calendar.app.created) —
// each has its own state cookie and redirect path so they can't collide.

export const LOGIN_STATE_COOKIE = "google_oauth_state";
export const CALENDAR_STATE_COOKIE = "google_calendar_oauth_state";

export function googleRedirectUri(requestUrl: string, path: string): string {
  return `${new URL(requestUrl).origin}${path}`;
}
