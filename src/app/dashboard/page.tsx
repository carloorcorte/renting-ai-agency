import { headers } from "next/headers";
import { getCurrentHost } from "@/lib/auth.ts";
import { getBookingsForHost } from "@/lib/bookings.ts";
import { getPropertiesForHost } from "@/lib/properties.ts";
import BookingsView from "./BookingsView.tsx";
import CalendarSyncPanel from "./CalendarSyncPanel.tsx";

// 6.2 bookings + availability view, scoped to the logged-in host's own
// properties (the layout already redirects if there's no host).
export default async function DashboardPage() {
  const host = await getCurrentHost();
  if (!host) return null;

  const [bookings, properties, hdrs] = await Promise.all([
    getBookingsForHost(host.id),
    getPropertiesForHost(host.id),
    headers(),
  ]);
  // Same production check the session cookie's `secure` flag already uses
  // (api/auth/login) — no separate PUBLIC_URL env var needed for this.
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const calendarUrl = `${protocol}://${hdrs.get("host")}/api/calendar/${host.calendar_token}`;

  return (
    <>
      <BookingsView bookings={bookings} properties={properties} />
      <CalendarSyncPanel url={calendarUrl} />
    </>
  );
}
