import { query, queryOne } from "./db.ts";
import { getHostGoogleCalendarAuth } from "./hosts.ts";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// Exchanges a stored refresh token for a fresh (short-lived) access token.
// We never cache the access token — always refreshing is a few extra HTTP
// calls but no expiry-tracking code, and this only runs on booking changes,
// not per-request.
async function getAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google token refresh failed: ${data.error ?? res.status}`);
  return data.access_token;
}

/** Creates the dedicated per-host calendar (scope calendar.app.created: this
 * app can only ever see/touch calendars it created, never the host's
 * personal one) and returns its id. Called once, right after OAuth consent. */
export async function createDedicatedCalendar(accessToken: string, hostName: string): Promise<string> {
  const res = await fetch(`${CALENDAR_API}/calendars`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ summary: `${hostName} — Prenotazioni` }),
  });
  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) throw new Error(`Could not create Google Calendar: ${data.error?.message ?? res.status}`);
  return data.id;
}

interface SyncRow {
  status: string;
  checkin: string;
  checkout: string;
  guest_name: string;
  property_name: string;
  host_id: string;
  google_event_id: string | null;
}

/** Push/update/delete the one Google Calendar event for `bookingId`, based
 * on its current status — a no-op if the host hasn't connected a calendar.
 * Called after every booking mutation (checkin.ts's wrappers) with the
 * booking's fresh DB state, so it's idempotent and self-correcting rather
 * than tracking deltas per call site. Never throws: a sync failure (e.g. a
 * revoked token) shouldn't break the booking action that triggered it. */
export async function syncBookingCalendar(bookingId: string): Promise<void> {
  try {
    const row = await queryOne<SyncRow>(
      `SELECT b.status, lower(b.date_range) AS checkin, upper(b.date_range) AS checkout, b.guest_name,
              p.name AS property_name, p.host_id, bce.google_event_id
       FROM bookings b
       JOIN properties p ON p.id = b.property_id
       LEFT JOIN booking_calendar_events bce ON bce.booking_id = b.id
       WHERE b.id = $1`,
      [bookingId],
    );
    if (!row) return;

    const auth = await getHostGoogleCalendarAuth(row.host_id);
    if (!auth) return; // host hasn't connected Google Calendar

    const accessToken = await getAccessToken(auth.google_calendar_refresh_token);
    const isLive = row.status === "confirmed" || row.status === "inquiry";

    if (!isLive) {
      if (row.google_event_id) await deleteEvent(accessToken, auth.google_calendar_id, row.google_event_id);
      await query("DELETE FROM booking_calendar_events WHERE booking_id = $1", [bookingId]);
      return;
    }

    const body = {
      summary: `${row.property_name} — ${row.guest_name || "Guest"}`,
      description: row.status === "inquiry" ? "In attesa di conferma" : "Confermata",
      start: { date: row.checkin },
      end: { date: row.checkout },
      status: row.status === "confirmed" ? "confirmed" : "tentative",
    };

    if (row.google_event_id) {
      await patchEvent(accessToken, auth.google_calendar_id, row.google_event_id, body);
    } else {
      const eventId = await createEvent(accessToken, auth.google_calendar_id, body);
      await query(
        `INSERT INTO booking_calendar_events (booking_id, google_event_id) VALUES ($1, $2)
         ON CONFLICT (booking_id) DO UPDATE SET google_event_id = EXCLUDED.google_event_id`,
        [bookingId, eventId],
      );
    }
  } catch (err) {
    console.error(`Google Calendar sync failed for booking ${bookingId}:`, err);
  }
}

async function createEvent(accessToken: string, calendarId: string, body: unknown): Promise<string> {
  const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) throw new Error(`Could not create calendar event: ${data.error?.message ?? res.status}`);
  return data.id;
}

async function patchEvent(accessToken: string, calendarId: string, eventId: string, body: unknown): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`Could not update calendar event: ${res.status}`);
}

async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  // 410/404 just means it's already gone — fine, that's the state we want.
  if (!res.ok && res.status !== 410 && res.status !== 404) throw new Error(`Could not delete calendar event: ${res.status}`);
}
