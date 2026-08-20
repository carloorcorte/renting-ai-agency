import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentHost } from "@/lib/auth.ts";
import { getBookingsForHost } from "@/lib/bookings.ts";
import { getProperty } from "@/lib/properties.ts";
import Calendar from "../../Calendar.tsx";
import PropertyBookings from "./PropertyBookings.tsx";

// A single property's own calendar + bookings — reuses the same Calendar and
// BookingsTable the all-properties Bookings page uses, just pre-filtered.
export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const host = await getCurrentHost();
  if (!host) return null;

  const property = await getProperty(id);
  if (!property || property.host_id !== host.id) notFound(); // spec: Access Restricted to Own Properties

  const allBookings = await getBookingsForHost(host.id);
  const bookings = allBookings.filter((b) => b.property_id === id);

  return (
    <>
      <p>
        <Link href="/dashboard/properties">← All properties</Link>
      </p>
      <h1>{property.name}</h1>
      <p className="muted">
        {property.price_per_night} {property.currency} / night · min {property.min_nights} nights · check-in{" "}
        {property.checkin_time}
      </p>

      <section>
        <h2>Calendar</h2>
        <Calendar bookings={bookings} properties={[property]} />
      </section>

      <PropertyBookings propertyId={id} property={property} bookings={bookings} />
    </>
  );
}
