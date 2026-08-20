import { query, queryOne } from "./db.ts";
import type { Host } from "./types.ts";

const HOST_COLUMNS = "id, email, name, whatsapp_number, notification_phone, calendar_token";

// Narrowed return type: this query's WHERE clause guarantees a match has a
// non-null whatsapp_number, so callers (the WhatsApp webhook path) don't
// need to null-check or assert it.
export async function getHostByWhatsAppNumber(
  whatsappNumber: string,
): Promise<(Host & { whatsapp_number: string }) | null> {
  return queryOne(`SELECT ${HOST_COLUMNS} FROM hosts WHERE whatsapp_number = $1`, [whatsappNumber]);
}

export async function getHostById(id: string): Promise<Host | null> {
  return queryOne<Host>(`SELECT ${HOST_COLUMNS} FROM hosts WHERE id = $1`, [id]);
}

export async function getHostByEmail(email: string): Promise<(Host & { password_hash: string | null }) | null> {
  return queryOne(`SELECT ${HOST_COLUMNS}, password_hash FROM hosts WHERE email = $1`, [email]);
}

export async function getHostByCalendarToken(token: string): Promise<Host | null> {
  return queryOne<Host>(`SELECT ${HOST_COLUMNS} FROM hosts WHERE calendar_token = $1`, [token]);
}

/** Shared by the public signup route and scripts/create-host.ts — the only
 * step that isn't a plain INSERT is hashing the password, done by the
 * caller so this stays free of a Next.js-only dependency (see auth.ts). */
export async function createHost(input: {
  email: string;
  passwordHash: string;
  name: string;
  whatsappNumber?: string | null;
  notificationPhone?: string | null;
}): Promise<Host> {
  const [host] = await query<Host>(
    `INSERT INTO hosts (email, password_hash, name, whatsapp_number, notification_phone)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${HOST_COLUMNS}`,
    [input.email, input.passwordHash, input.name, input.whatsappNumber ?? null, input.notificationPhone ?? null],
  );
  return host;
}

/** Sign in with Google: log in an already-linked host, link Google to an
 * existing password account with the same (Google-verified) email, or
 * create a brand new host with no password at all. Matching by email is
 * safe here specifically because the caller only ever passes an email
 * Google itself reports as verified (google/callback/route.ts). */
export async function findOrCreateHostByGoogle(profile: {
  googleId: string;
  email: string;
  name: string;
}): Promise<Host> {
  const byGoogleId = await queryOne<Host>(`SELECT ${HOST_COLUMNS} FROM hosts WHERE google_id = $1`, [
    profile.googleId,
  ]);
  if (byGoogleId) return byGoogleId;

  const byEmail = await queryOne<Host>(`SELECT ${HOST_COLUMNS} FROM hosts WHERE email = $1`, [profile.email]);
  if (byEmail) {
    const [linked] = await query<Host>(
      `UPDATE hosts SET google_id = $1 WHERE id = $2 RETURNING ${HOST_COLUMNS}`,
      [profile.googleId, byEmail.id],
    );
    return linked;
  }

  const [created] = await query<Host>(
    `INSERT INTO hosts (email, name, google_id) VALUES ($1, $2, $3) RETURNING ${HOST_COLUMNS}`,
    [profile.email, profile.name, profile.googleId],
  );
  return created;
}
