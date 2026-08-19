import { NextResponse } from "next/server";
import { BookingConflictError, getBookingsForHost } from "@/lib/bookings.ts";
import { getCurrentHost } from "@/lib/auth.ts";
import { createManualBookingAndScheduleCheckin } from "@/lib/checkin.ts";
import { propertyBelongsToHost } from "@/lib/properties.ts";

// 6.2 bookings list, scoped to the logged-in host's own properties (6.5).
export async function GET() {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json(await getBookingsForHost(host.id));
}

// 6.6 manual booking creation, reusing booking-management's conflict check (4.5).
export async function POST(request: Request) {
  const host = await getCurrentHost();
  if (!host) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const { propertyId, checkin, checkout, guestName, guestPhone, status } = body ?? {};
  if (!propertyId || !checkin || !checkout || !guestPhone) {
    return NextResponse.json({ error: "propertyId, checkin, checkout and guestPhone are required" }, { status: 400 });
  }
  if (!(await propertyBelongsToHost(propertyId, host.id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const booking = await createManualBookingAndScheduleCheckin({
      propertyId,
      range: { checkin, checkout },
      guestName: guestName ?? "",
      guestPhone,
      status: status === "inquiry" ? "inquiry" : "confirmed",
    });
    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return NextResponse.json({ error: err.message, conflicts: err.conflicts }, { status: 409 });
    }
    throw err;
  }
}
