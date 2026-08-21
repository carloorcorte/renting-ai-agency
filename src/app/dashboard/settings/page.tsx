import { getCurrentHost } from "@/lib/auth.ts";
import GoogleCalendarPanel from "./GoogleCalendarPanel.tsx";

const CALENDAR_ERROR_MESSAGES: Record<string, string> = {
  state: "Google sign-in expired before you finished — please try connecting again.",
  config: "Google Calendar isn't configured on this deployment yet.",
  token: "Google didn't return the access needed for background sync — try disconnecting in your Google account and reconnecting.",
  unknown: "Couldn't connect Google Calendar. Please try again.",
};

// Account-level settings — just Google Calendar sync for now. Future home
// for whatever else lands here (subscription/billing, profile, ...).
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendarConnected?: string; calendarError?: string }>;
}) {
  const [host, params] = await Promise.all([getCurrentHost(), searchParams]);
  if (!host) return null;

  return (
    <>
      <h1>Settings</h1>
      {params.calendarConnected && (
        <p className="success page-banner">Google Calendar connected — bookings are syncing.</p>
      )}
      {params.calendarError && (
        <p className="error page-banner">
          {CALENDAR_ERROR_MESSAGES[params.calendarError] ?? CALENDAR_ERROR_MESSAGES.unknown}
        </p>
      )}
      <GoogleCalendarPanel googleConnected={host.google_calendar_id !== null} />
    </>
  );
}
