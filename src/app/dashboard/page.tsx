import { headers } from "next/headers";
import { getCurrentHost } from "@/lib/auth.ts";
import { getBookingsForHost } from "@/lib/bookings.ts";
import { getPropertiesForHost } from "@/lib/properties.ts";
import BookingsView from "./BookingsView.tsx";
import CalendarSyncPanel from "./CalendarSyncPanel.tsx";

const CALENDAR_ERROR_MESSAGES: Record<string, string> = {
  state: "Google sign-in expired before you finished — please try connecting again.",
  config: "Google Calendar isn't configured on this deployment yet.",
  token: "Google didn't return the access needed for background sync — try disconnecting in your Google account and reconnecting.",
  unknown: "Couldn't connect Google Calendar. Please try again.",
};

// 6.2 bookings + availability view, scoped to the logged-in host's own
// properties (the layout already redirects if there's no host).
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ calendarConnected?: string; calendarError?: string }>;
}) {
  const host = await getCurrentHost();
  if (!host) return null;

  const [bookings, properties, hdrs, params] = await Promise.all([
    getBookingsForHost(host.id),
    getPropertiesForHost(host.id),
    headers(),
    searchParams,
  ]);
  // Same production check the session cookie's `secure` flag already uses
  // (api/auth/login) — no separate PUBLIC_URL env var needed for this.
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const icsUrl = `${protocol}://${hdrs.get("host")}/api/calendar/${host.calendar_token}`;

  return (
    <>
      {params.calendarConnected && (
        <p className="success page-banner">Google Calendar connected — bookings are syncing.</p>
      )}
      {params.calendarError && (
        <p className="error page-banner">
          {CALENDAR_ERROR_MESSAGES[params.calendarError] ?? CALENDAR_ERROR_MESSAGES.unknown}
        </p>
      )}
      <BookingsView bookings={bookings} properties={properties} />
      <CalendarSyncPanel icsUrl={icsUrl} googleConnected={host.google_calendar_id !== null} />
    </>
  );
}
