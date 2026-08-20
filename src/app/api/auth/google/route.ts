import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleRedirectUri, LOGIN_STATE_COOKIE } from "@/lib/googleOAuth.ts";

// 1/2 of Sign in with Google: send the browser to Google's consent screen.
// See README.md "Login con Google" for the one-time Cloud Console setup.
export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google sign-in is not configured" }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(LOGIN_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri(request.url, "/api/auth/google/callback"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(url);
}
