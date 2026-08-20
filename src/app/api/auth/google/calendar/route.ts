import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentHost } from "@/lib/auth.ts";
import { CALENDAR_STATE_COOKIE, googleRedirectUri } from "@/lib/googleOAuth.ts";

// 1/2 of "Connect Google Calendar" — a separate consent from login (scope
// calendar.app.created), only reachable while already logged in since it
// attaches to an existing host, it doesn't authenticate one.
export async function GET(request: Request) {
  const host = await getCurrentHost();
  if (!host) return NextResponse.redirect(new URL("/login", request.url));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google sign-in is not configured" }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(CALENDAR_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri(request.url, "/api/auth/google/calendar/callback"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.app.created");
  url.searchParams.set("state", state);
  // access_type=offline + prompt=consent: we need a refresh token for
  // background sync, and force re-issuing one even for a host who already
  // granted this before (e.g. reconnecting after a disconnect).
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url);
}
