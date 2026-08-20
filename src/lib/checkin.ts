import { cancelBooking, confirmBooking, createManualBooking, editBookingDates } from "./bookings.ts";
import { query, queryOne } from "./db.ts";
import type { DateRange } from "./dates.ts";
import { sendSms, sendWhatsAppMessage, sendWhatsAppTemplate } from "./twilio.ts";
import type { Booking, Property } from "./types.ts";

// 5.1 On booking confirmation, create the check-in appointment and the
// scheduled follow-up messages (guest reminder, host notification, guest
// check-in instructions), each timed by the property's configured offsets.
export async function scheduleCheckin(booking: Booking, property: Property): Promise<void> {
  const checkinAt = combineDateAndTime(booking.checkin, property.checkin_time);

  await query(
    `INSERT INTO checkin_appointments (booking_id, checkin_at) VALUES ($1, $2)
     ON CONFLICT (booking_id) DO UPDATE SET checkin_at = EXCLUDED.checkin_at`,
    [booking.id, checkinAt],
  );

  // Clear any not-yet-sent schedule first so editing a booking's dates
  // reschedules cleanly instead of leaving stale entries.
  await query("DELETE FROM scheduled_messages WHERE booking_id = $1 AND sent_at IS NULL", [booking.id]);

  await query(
    `INSERT INTO scheduled_messages (booking_id, type, recipient, send_at) VALUES
       ($1, 'pre_arrival_reminder', 'guest', $2),
       ($1, 'pre_arrival_reminder', 'host', $3),
       ($1, 'checkin_instructions', 'guest', $4)`,
    [
      booking.id,
      offsetBefore(checkinAt, property.reminder_days_before_checkin),
      offsetBefore(checkinAt, property.host_notify_days_before_checkin),
      offsetBefore(checkinAt, property.checkin_instructions_days_before),
    ],
  );
}

async function scheduleCheckinIfConfirmed(booking: Booking): Promise<void> {
  if (booking.status !== "confirmed") return;
  const property = await queryOne<Property>("SELECT * FROM properties WHERE id = $1", [booking.property_id]);
  if (property) await scheduleCheckin(booking, property);
}

async function clearSchedule(bookingId: string): Promise<void> {
  await query("DELETE FROM scheduled_messages WHERE booking_id = $1 AND sent_at IS NULL", [bookingId]);
  await query("DELETE FROM checkin_appointments WHERE booking_id = $1", [bookingId]);
}

// Wrappers that keep booking-management (bookings.ts) and checkin-scheduling
// in sync, so every call site (rule engine, dashboard routes) gets both
// behaviors for free instead of having to remember to call both.

export async function confirmBookingAndScheduleCheckin(bookingId: string): Promise<Booking> {
  const booking = await confirmBooking(bookingId);
  await scheduleCheckinIfConfirmed(booking);
  return booking;
}

export async function createManualBookingAndScheduleCheckin(
  input: Parameters<typeof createManualBooking>[0],
): Promise<Booking> {
  const booking = await createManualBooking(input);
  await scheduleCheckinIfConfirmed(booking);
  return booking;
}

export async function editBookingDatesAndReschedule(bookingId: string, newRange: DateRange): Promise<Booking> {
  const booking = await editBookingDates(bookingId, newRange);
  await scheduleCheckinIfConfirmed(booking);
  return booking;
}

// A cancelled booking must not still fire its reminders/instructions.
export async function cancelBookingAndClearSchedule(bookingId: string): Promise<Booking> {
  const booking = await cancelBooking(bookingId);
  await clearSchedule(bookingId);
  return booking;
}

// ponytail: treats property.checkin_time as a wall-clock time in UTC rather
// than the property's local (Europe/Madrid) timezone. Off by up to 2 hours
// against local time — fine for day-granularity reminders, tighten if a
// same-day precise send time is ever needed.
function combineDateAndTime(dateISO: string, time: string): Date {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  const [hh, mm] = match ? [Number(match[1]), Number(match[2])] : [15, 0];
  return new Date(`${dateISO}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
}

function offsetBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

// 5.2 / 5.4 periodic job: send whatever is due, mark it sent -----------------
//
// Guest-facing messages are usually outside the 24h free-form window, so
// they go via an approved WhatsApp template when one is configured for that
// type; host-facing ones go via SMS, since hosts.whatsapp_number has no
// consumer app attached to receive a WhatsApp message at all
// (design.md: "Messages outside the 24-hour session window...").

const TEMPLATE_CONTENT_SID: Record<DueMessageRow["type"], string | undefined> = {
  pre_arrival_reminder: process.env.TWILIO_TEMPLATE_PRE_ARRIVAL_REMINDER,
  checkin_instructions: process.env.TWILIO_TEMPLATE_CHECKIN_INSTRUCTIONS,
};

interface DueMessageRow {
  id: string;
  type: "pre_arrival_reminder" | "checkin_instructions";
  recipient: "guest" | "host";
  guest_phone: string;
  checkin: string;
  checkout: string;
  property_name: string;
  checkin_instructions: string;
  // Null for a host who signed up but has no dedicated WhatsApp number yet.
  host_whatsapp_number: string | null;
  host_notification_phone: string | null;
}

export async function sendDueScheduledMessages(): Promise<{ sent: number; skipped: number; failed: number }> {
  const due = await query<DueMessageRow>(
    `SELECT sm.id, sm.type, sm.recipient, b.guest_phone,
            lower(b.date_range) AS checkin, upper(b.date_range) AS checkout,
            p.name AS property_name, p.checkin_instructions,
            h.whatsapp_number AS host_whatsapp_number, h.notification_phone AS host_notification_phone
     FROM scheduled_messages sm
     JOIN bookings b ON b.id = sm.booking_id
     JOIN properties p ON p.id = b.property_id
     JOIN hosts h ON h.id = p.host_id
     WHERE sm.send_at <= now() AND sm.sent_at IS NULL
     ORDER BY sm.send_at`,
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of due) {
    try {
      if (row.recipient === "host") {
        if (!row.host_notification_phone) {
          console.warn(`Skipping scheduled message ${row.id}: host has no notification_phone set.`);
          skipped++;
        } else {
          await sendSms(row.host_notification_phone, formatHostNotification(row));
          sent++;
        }
      } else if (!row.host_whatsapp_number) {
        // Can't happen for a booking that came in over WhatsApp (the host
        // number that received it obviously exists), but a manually-created
        // booking for a self-signed-up host with no number yet can reach
        // here — same "skip and log" treatment as the host-notify branch.
        console.warn(`Skipping scheduled message ${row.id}: host has no whatsapp_number set.`);
        skipped++;
      } else {
        await sendGuestMessage(row as DueMessageRow & { host_whatsapp_number: string });
        sent++;
      }
      await query("UPDATE scheduled_messages SET sent_at = now() WHERE id = $1", [row.id]);
    } catch (err) {
      console.error(`Failed to send scheduled message ${row.id}:`, err);
      failed++;
    }
  }
  return { sent, skipped, failed };
}

async function sendGuestMessage(row: DueMessageRow & { host_whatsapp_number: string }): Promise<void> {
  const contentSid = TEMPLATE_CONTENT_SID[row.type];
  if (contentSid) {
    // ponytail: variable numbering ("1", "2", ...) must match whatever the
    // approved template body actually uses — fill in once it's known.
    await sendWhatsAppTemplate(
      row.guest_phone,
      contentSid,
      {
        "1": row.property_name,
        "2": row.checkin,
        "3": row.type === "checkin_instructions" ? row.checkin_instructions : row.checkout,
      },
      row.host_whatsapp_number,
    );
    return;
  }
  // No approved template configured yet: free-form text, only actually
  // deliverable within 24h of the guest's last message — fine for dev.
  await sendWhatsAppMessage(row.guest_phone, formatGuestMessageFallback(row), row.host_whatsapp_number);
}

// 5.3 check-in instructions content ------------------------------------------

function formatGuestMessageFallback(row: DueMessageRow): string {
  if (row.type === "checkin_instructions") {
    return `Check-in instructions for ${row.property_name}:\n${row.checkin_instructions}`;
  }
  return `Reminder: your stay at ${row.property_name} starts on ${row.checkin} (check-out ${row.checkout}). See you soon!`;
}

function formatHostNotification(row: DueMessageRow): string {
  return `Reminder: upcoming check-in at ${row.property_name} on ${row.checkin}.`;
}
