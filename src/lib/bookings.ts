import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "./db.ts";
import { type DateRange, nights, shiftRange, toPgRange, todayISO } from "./dates.ts";
import type { Booking, BookingStatus, PropertyMatch } from "./types.ts";

/** Thrown whenever confirming/creating/editing a booking would overlap an
 * already-confirmed booking on the same property (spec: Double-Booking
 * Prevention, Manual Booking Management by Host). */
export class BookingConflictError extends Error {
  readonly conflicts: { checkin: string; checkout: string }[];

  constructor(conflicts: { checkin: string; checkout: string }[]) {
    super(
      `Requested dates conflict with an existing confirmed booking: ${conflicts
        .map((c) => `${c.checkin}..${c.checkout}`)
        .join(", ")}`,
    );
    this.name = "BookingConflictError";
    this.conflicts = conflicts;
  }
}

// Postgres error code for an EXCLUDE constraint violation (the exclusion
// constraint on bookings.date_range) — the safety net for a race between two
// concurrent confirmations that both pass the app-level pre-check.
const PG_EXCLUSION_VIOLATION = "23P01";

const BOOKING_COLUMNS =
  "id, property_id, status, lower(date_range) AS checkin, upper(date_range) AS checkout, guest_name, guest_phone, price, source, conversation_id, created_at";

function mapBookingRow(row: Record<string, unknown>): Booking {
  return row as unknown as Booking;
}

/** Confirmed bookings on `propertyId` that overlap `range`, locked so a
 * concurrent confirm can't sneak in between the check and the write. Must be
 * called inside a transaction. */
async function findOverlaps(
  client: PoolClient,
  propertyId: string,
  range: DateRange,
  excludeBookingId?: string,
): Promise<{ checkin: string; checkout: string }[]> {
  const result = await client.query(
    `SELECT lower(date_range) AS checkin, upper(date_range) AS checkout
     FROM bookings
     WHERE property_id = $1 AND status = 'confirmed' AND date_range && $2::daterange
       AND ($3::uuid IS NULL OR id <> $3)
     FOR UPDATE`,
    [propertyId, toPgRange(range), excludeBookingId ?? null],
  );
  return result.rows;
}

// 4.1 booking creation (from an inbound WhatsApp inquiry) ------------------

export async function createInquiry(input: {
  propertyId: string;
  range: DateRange;
  guestName: string;
  guestPhone: string;
  conversationId?: string;
}): Promise<Booking> {
  const row = await queryOne(
    `INSERT INTO bookings (property_id, status, date_range, guest_name, guest_phone, source, conversation_id)
     VALUES ($1, 'inquiry', $2::daterange, $3, $4, 'whatsapp', $5)
     RETURNING ${BOOKING_COLUMNS}`,
    [input.propertyId, toPgRange(input.range), input.guestName, input.guestPhone, input.conversationId ?? null],
  );
  return mapBookingRow(row!);
}

// 4.1 / 4.3 confirm, with the double-booking check ---------------------------

export async function confirmBooking(bookingId: string): Promise<Booking> {
  return withTransaction(async (client) => {
    const current = await client.query(
      "SELECT property_id, lower(date_range) AS checkin, upper(date_range) AS checkout FROM bookings WHERE id = $1 FOR UPDATE",
      [bookingId],
    );
    const booking = current.rows[0];
    if (!booking) throw new Error(`Booking ${bookingId} not found`);
    const range: DateRange = { checkin: booking.checkin, checkout: booking.checkout };

    const conflicts = await findOverlaps(client, booking.property_id, range, bookingId);
    if (conflicts.length > 0) throw new BookingConflictError(conflicts);

    try {
      const result = await client.query(
        `UPDATE bookings SET status = 'confirmed', updated_at = now() WHERE id = $1 RETURNING ${BOOKING_COLUMNS}`,
        [bookingId],
      );
      return mapBookingRow(result.rows[0]);
    } catch (err) {
      if (isExclusionViolation(err)) {
        throw new BookingConflictError(await findOverlaps(client, booking.property_id, range, bookingId));
      }
      throw err;
    }
  });
}

// 4.1 decline ----------------------------------------------------------------

export async function declineBooking(bookingId: string): Promise<Booking> {
  const row = await queryOne(
    `UPDATE bookings SET status = 'declined', updated_at = now() WHERE id = $1 RETURNING ${BOOKING_COLUMNS}`,
    [bookingId],
  );
  if (!row) throw new Error(`Booking ${bookingId} not found`);
  return mapBookingRow(row);
}

// 4.4 cancel — releases availability simply by no longer being 'confirmed' --

export async function cancelBooking(bookingId: string): Promise<Booking> {
  const row = await queryOne(
    `UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING ${BOOKING_COLUMNS}`,
    [bookingId],
  );
  if (!row) throw new Error(`Booking ${bookingId} not found`);
  return mapBookingRow(row);
}

// 4.5 host edits a booking's dates -------------------------------------------

export async function editBookingDates(bookingId: string, newRange: DateRange): Promise<Booking> {
  return withTransaction(async (client) => {
    const current = await client.query("SELECT property_id, status FROM bookings WHERE id = $1 FOR UPDATE", [
      bookingId,
    ]);
    const booking = current.rows[0];
    if (!booking) throw new Error(`Booking ${bookingId} not found`);

    // Only a confirmed booking blocks anything, so only a confirmed booking
    // needs the conflict check — an inquiry's dates can move freely.
    if (booking.status === "confirmed") {
      const conflicts = await findOverlaps(client, booking.property_id, newRange, bookingId);
      if (conflicts.length > 0) throw new BookingConflictError(conflicts);
    }

    try {
      const result = await client.query(
        `UPDATE bookings SET date_range = $2::daterange, updated_at = now() WHERE id = $1 RETURNING ${BOOKING_COLUMNS}`,
        [bookingId, toPgRange(newRange)],
      );
      return mapBookingRow(result.rows[0]);
    } catch (err) {
      if (isExclusionViolation(err)) {
        throw new BookingConflictError(await findOverlaps(client, booking.property_id, newRange, bookingId));
      }
      throw err;
    }
  });
}

// 4.5 host creates a booking directly (not from a WhatsApp inquiry) --------

export async function createManualBooking(input: {
  propertyId: string;
  range: DateRange;
  guestName: string;
  guestPhone: string;
  /** Manual bookings default to confirmed: the point is blocking the dates now. */
  status?: Extract<BookingStatus, "confirmed" | "inquiry">;
}): Promise<Booking> {
  const status = input.status ?? "confirmed";
  return withTransaction(async (client) => {
    if (status === "confirmed") {
      const conflicts = await findOverlaps(client, input.propertyId, input.range);
      if (conflicts.length > 0) throw new BookingConflictError(conflicts);
    }
    try {
      const result = await client.query(
        `INSERT INTO bookings (property_id, status, date_range, guest_name, guest_phone, source)
         VALUES ($1, $2, $3::daterange, $4, $5, 'manual')
         RETURNING ${BOOKING_COLUMNS}`,
        [input.propertyId, status, toPgRange(input.range), input.guestName, input.guestPhone],
      );
      return mapBookingRow(result.rows[0]);
    } catch (err) {
      if (isExclusionViolation(err)) {
        throw new BookingConflictError(await findOverlaps(client, input.propertyId, input.range));
      }
      throw err;
    }
  });
}

function isExclusionViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === PG_EXCLUSION_VIOLATION;
}

// 4.2 availability check for a single property -------------------------------

export async function isPropertyAvailable(propertyId: string, range: DateRange): Promise<boolean> {
  const rows = await query(
    "SELECT 1 FROM bookings WHERE property_id = $1 AND status = 'confirmed' AND date_range && $2::daterange LIMIT 1",
    [propertyId, toPgRange(range)],
  );
  return rows.length === 0;
}

// 4.6 availability search across every property of a host -------------------

export async function searchAvailability(hostId: string, range: DateRange): Promise<PropertyMatch[]> {
  const rows = await query<{ id: string; name: string; price_per_night: string; currency: string }>(
    `SELECT p.id, p.name, p.price_per_night, p.currency
     FROM properties p
     WHERE p.host_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.property_id = p.id AND b.status = 'confirmed' AND b.date_range && $2::daterange
       )
     ORDER BY p.name`,
    [hostId, toPgRange(range)],
  );
  return rows.map((r) => ({ propertyId: r.id, name: r.name, pricePerNight: r.price_per_night, currency: r.currency }));
}

export interface AlternativeWindow {
  range: DateRange;
  matches: PropertyMatch[];
}

// 4.6 alternative date ranges when the exact request has no match -----------
//
// ponytail: walks candidate windows one at a time (up to a few dozen small
// queries at MVP volume) instead of one set-based query against a generated
// date series. Replace with the set-based version if this becomes a hot path.
export async function findAlternativeDateRanges(
  hostId: string,
  range: DateRange,
  lookaheadDays = 56,
): Promise<AlternativeWindow[]> {
  const tripLength = nights(range);
  if (tripLength <= 0) return [];
  const maxSteps = Math.floor(lookaheadDays / tripLength);
  const today = todayISO();
  const results: AlternativeWindow[] = [];

  for (let step = 1; step <= maxSteps && results.length < 3; step++) {
    for (const direction of [1, -1] as const) {
      const candidate = shiftRange(range, direction * step * tripLength);
      if (candidate.checkin < today) continue; // don't propose the past
      const matches = await searchAvailability(hostId, candidate);
      if (matches.length > 0) {
        results.push({ range: candidate, matches });
        if (results.length >= 3) break;
      }
    }
  }
  return results;
}

// Dashboard support: list + host-scoped ownership check ---------------------

export interface BookingWithProperty extends Booking {
  property_name: string;
}

export async function getBookingsForHost(hostId: string): Promise<BookingWithProperty[]> {
  return query<BookingWithProperty>(
    `SELECT b.id, b.property_id, b.status, lower(b.date_range) AS checkin, upper(b.date_range) AS checkout,
            b.guest_name, b.guest_phone, b.price, b.source, b.conversation_id, b.created_at,
            p.name AS property_name
     FROM bookings b
     JOIN properties p ON p.id = b.property_id
     WHERE p.host_id = $1
     ORDER BY lower(b.date_range)`,
    [hostId],
  );
}

export async function getBooking(bookingId: string): Promise<Booking | null> {
  const row = await queryOne(`SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = $1`, [bookingId]);
  return row ? mapBookingRow(row) : null;
}

/** Spec: Access Restricted to Own Properties — every dashboard booking action
 * must check this before acting on a booking id. */
export async function bookingBelongsToHost(bookingId: string, hostId: string): Promise<boolean> {
  const row = await queryOne(
    "SELECT 1 FROM bookings b JOIN properties p ON p.id = b.property_id WHERE b.id = $1 AND p.host_id = $2",
    [bookingId, hostId],
  );
  return row !== null;
}
