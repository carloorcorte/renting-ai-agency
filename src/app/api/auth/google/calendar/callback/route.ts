import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentHost } from "@/lib/auth.ts";
import { getBookingsForHost } from "@/lib/bookings.ts";
import { createDedicatedCalendar, syncBookingCalendar } from "@/lib/googleCalendarSync.ts";
import { CALENDAR_STATE_COOKIE, googleRedirectUri } from "@/lib/googleOAuth.ts";
import { connectGoogleCalendar } from "@/lib/hosts.ts";

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  error?: string;
}

function failure(request: Request, reason: string): NextResponse {
  return NextResponse.redirect(new URL(`/dashboard?calendarError=${reason}`, request.url));
}

// 2/2: exchange the code for a refresh token, create the dedicated calendar,
// store both on the host, then push every existing live booking into it so
// it isn't empty on first connect.
export async function GET(request: Request): Promise<NextResponse> {
  const host = await getCurrentHost();
  if (!host) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get(CALENDAR_STATE_COOKIE)?.value;
  store.delete(CALENDAR_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) return failure(request, "state");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return failure(request, "config");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(request.url, "/api/auth/google/calendar/callback"),
        grant_type: "authorization_code",
      }),
    });
    const token = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenRes.ok || !token.access_token || !token.refresh_token) {
      // No refresh_token usually means the host had already consented and
      // Google didn't reissue one — shouldn't happen with prompt=consent,
      // but if it does there's nothing usable to store.
      return failure(request, "token");
    }

    const calendarId = await createDedicatedCalendar(token.access_token, host.name);
    await connectGoogleCalendar(host.id, calendarId, token.refresh_token);

    // Backfill: push every booking that should currently be visible.
    const bookings = await getBookingsForHost(host.id);
    for (const b of bookings) {
      if (b.status === "confirmed" || b.status === "inquiry") await syncBookingCalendar(b.id);
    }

    return NextResponse.redirect(new URL("/dashboard?calendarConnected=1", request.url));
  } catch (err) {
    console.error("Google Calendar connect failed:", err);
    return failure(request, "unknown");
  }
}
