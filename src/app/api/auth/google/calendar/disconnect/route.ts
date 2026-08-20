import { NextResponse } from "next/server";
import { getCurrentHost } from "@/lib/auth.ts";
import { disconnectGoogleCalendar, getHostGoogleCalendarAuth } from "@/lib/hosts.ts";

// Revokes our refresh token with Google and stops syncing. Deliberately
// leaves the calendar and its events alone in the host's Google account —
// see disconnectGoogleCalendar's comment.
export async function POST() {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const auth = await getHostGoogleCalendarAuth(host.id);
  if (auth) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(auth.google_calendar_refresh_token)}`, {
        method: "POST",
      });
    } catch (err) {
      // Not fatal — we still clear our own record of it below either way.
      console.error("Google token revoke failed:", err);
    }
  }

  await disconnectGoogleCalendar(host.id);
  return NextResponse.json({ ok: true });
}
