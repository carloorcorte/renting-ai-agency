import { NextResponse } from "next/server";
import { getCurrentHost } from "@/lib/auth.ts";
import { BookingConflictError, bookingBelongsToHost } from "@/lib/bookings.ts";
import {
  cancelBookingAndClearSchedule,
  confirmBookingAndScheduleCheckin,
  declineBookingAndSync,
  editBookingDatesAndReschedule,
} from "@/lib/checkin.ts";

// 6.6 host edits dates, or 6.6/4.1 host confirms/declines/cancels — same
// booking-management rules apply here as for any other booking (4.3, 4.4).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await bookingBelongsToHost(id, host.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { checkin, checkout, status } = (await request.json()) ?? {};

  try {
    if (checkin && checkout) {
      const booking = await editBookingDatesAndReschedule(id, { checkin, checkout });
      return NextResponse.json(booking);
    }
    if (status === "confirmed") return NextResponse.json(await confirmBookingAndScheduleCheckin(id));
    if (status === "declined") return NextResponse.json(await declineBookingAndSync(id));
    if (status === "cancelled") return NextResponse.json(await cancelBookingAndClearSchedule(id));

    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json({ error: err.message, conflicts: err.conflicts }, { status: 409 });
    }
    throw err;
  }
}
