import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSessionToken, hashPassword, SESSION_COOKIE } from "@/lib/auth.ts";
import { createHost, getHostByEmail } from "@/lib/hosts.ts";

// Public self-signup: email + password + name only. No whatsapp_number here
// — that still needs the manual Twilio onboarding in README.md, so it's left
// null and attached later. See db/schema.sql for why that's nullable.
export async function POST(request: Request) {
  const { email, password, name } = (await request.json()) ?? {};
  if (typeof email !== "string" || typeof password !== "string" || typeof name !== "string") {
    return NextResponse.json({ error: "email, password and name are required" }, { status: 400 });
  }
  if (!email.trim() || !name.trim()) {
    return NextResponse.json({ error: "email and name can't be empty" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }
  if (await getHostByEmail(email)) {
    return NextResponse.json({ error: "an account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  let host;
  try {
    host = await createHost({ email, passwordHash, name });
  } catch (err) {
    // Race with a concurrent signup for the same email — the check above is
    // just a fast path, this UNIQUE constraint is the actual guarantee.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "an account with this email already exists" }, { status: 409 });
    }
    throw err;
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(host.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  return NextResponse.json({ id: host.id, name: host.name, email: host.email }, { status: 201 });
}
