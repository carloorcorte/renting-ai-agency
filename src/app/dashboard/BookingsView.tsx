"use client";

import { useRouter } from "next/navigation";
import type { BookingWithProperty } from "@/lib/bookings.ts";
import type { Property } from "@/lib/types.ts";
import BookingsTable from "./BookingsTable.tsx";
import Calendar from "./Calendar.tsx";
import NewBookingForm from "./NewBookingForm.tsx";

export default function BookingsView({
  bookings,
  properties,
}: {
  bookings: BookingWithProperty[];
  properties: Property[];
}) {
  const router = useRouter();

  return (
    <>
      <h1>Bookings</h1>

      <section>
        <h2>Calendar</h2>
        <Calendar bookings={bookings} properties={properties} />
      </section>

      <NewBookingForm properties={properties} onCreated={() => router.refresh()} />

      <BookingsTable bookings={bookings} />
    </>
  );
}
