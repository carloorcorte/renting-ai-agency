import { getCurrentHost } from "@/lib/auth.ts";
import { getBookingsForHost } from "@/lib/bookings.ts";
import { getPropertiesForHost } from "@/lib/properties.ts";
import BookingsView from "./BookingsView.tsx";

// 6.2 bookings + availability view, scoped to the logged-in host's own
// properties (the layout already redirects if there's no host).
export default async function DashboardPage() {
  const host = await getCurrentHost();
  if (!host) return null;

  const [bookings, properties] = await Promise.all([getBookingsForHost(host.id), getPropertiesForHost(host.id)]);

  return <BookingsView bookings={bookings} properties={properties} />;
}
