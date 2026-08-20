// Shared between login and signup pages: both can land here via a failed
// /api/auth/google/callback redirect (?error=...).
export function googleErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "google_email") return "Your Google account has no verified email — can't sign you in.";
  return "Google sign-in failed. Please try again.";
}
