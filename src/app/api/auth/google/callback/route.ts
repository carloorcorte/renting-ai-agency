import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth.ts";
import { googleRedirectUri, OAUTH_STATE_COOKIE } from "@/lib/googleOAuth.ts";
import { findOrCreateHostByGoogle } from "@/lib/hosts.ts";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleUserinfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

function failure(request: Request, reason: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
}

// 2/2: exchange the auth code for a token, fetch the profile, and
// find-or-create the host — same session cookie the password login sets.
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;
  store.delete(OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return failure(request, "google_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return failure(request, "google_config");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(request.url),
        grant_type: "authorization_code",
      }),
    });
    const token = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenRes.ok || !token.access_token) return failure(request, "google_token");

    const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = (await userRes.json()) as GoogleUserinfo;
    // Only Google-verified emails are safe to match/link an existing
    // password account by (see findOrCreateHostByGoogle).
    if (!userRes.ok || !profile.email || !profile.email_verified) return failure(request, "google_email");

    const host = await findOrCreateHostByGoogle({
      googleId: profile.sub,
      email: profile.email,
      name: profile.name || profile.email,
    });

    store.set(SESSION_COOKIE, createSessionToken(host.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (err) {
    console.error("Google sign-in failed:", err);
    return failure(request, "google_unknown");
  }
}
