import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getHostByEmail, getHostById } from "./hosts.ts";
import { verifyPassword } from "./password.ts";
import type { Host } from "./types.ts";

// 6.1 host login. No public signup, no roles beyond "owns these properties"
// — a signed session cookie is enough, no session table/framework needed.
// hashPassword/verifyPassword live in password.ts, not here — this file
// pulls in next/headers (getCurrentHost), which breaks under plain Node
// (see scripts/create-host.ts, which needs hashing but not sessions).
export { hashPassword, verifyPassword } from "./password.ts";

export const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(hostId: string): string {
  const payload = Buffer.from(JSON.stringify({ hostId, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.hostId !== "string" || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return data.hostId;
  } catch {
    return null;
  }
}

/** Every dashboard API route calls this first (spec: Access Restricted to
 * Own Properties) — null means "not logged in", not "logged in as nobody". */
export async function getCurrentHost(): Promise<Host | null> {
  const store = await cookies();
  const hostId = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!hostId) return null;
  return getHostById(hostId);
}

export async function verifyLogin(email: string, password: string): Promise<Host | null> {
  const host = await getHostByEmail(email);
  if (!host) return null;
  const valid = await verifyPassword(password, host.password_hash);
  return valid ? host : null;
}
