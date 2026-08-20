"use client";

import { useRouter } from "next/navigation";
import type { BookingWithProperty } from "@/lib/bookings.ts";
import type { Property } from "@/lib/types.ts";
import BookingsTable from "../../BookingsTable.tsx";
import NewBookingForm from "../../NewBookingForm.tsx";

/** New-booking form + table for one property, both needing router.refresh()
 * on change — same split BookingsView.tsx uses for the all-properties page. */
export default function PropertyBookings({
  propertyId,
  property,
  bookings,
}: {
  propertyId: string;
  property: Property;
  bookings: BookingWithProperty[];
}) {
  const router = useRouter();
  return (
    <>
      <NewBookingForm properties={[property]} lockedPropertyId={propertyId} onCreated={() => router.refresh()} />
      <BookingsTable bookings={bookings} showProperty={false} />
    </>
  );
}
